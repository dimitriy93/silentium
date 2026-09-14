import "server-only";

/**
 * Серверный клиент Google Gemini (REST, без SDK — зависимость не нужна).
 * Ключ читается только на сервере из GEMINI_API_KEY и никогда не попадает
 * в браузер: этот модуль импортируется исключительно server actions'ами.
 */

const TIMEOUT_MS = 45_000;

// «flash-latest» — стабильный алиас: имена конкретных версий меняются
// (старые закрываются для новых ключей), алиас остаётся рабочим.
// Резервные версии — на случай, если алиас недоступен конкретному ключу:
// модель выбирается по фактическому ответу API (404 → пробуем следующую).
const GEMINI_MODELS = [
  "gemini-flash-latest",
  "gemini-3.5-flash",
  "gemini-2.5-flash",
] as const;

export class GeminiError extends Error {
  /** Пользовательская формулировка без технических деталей и секретов. */
  readonly userMessage: string;

  constructor(userMessage: string, cause?: unknown) {
    super(userMessage, { cause });
    this.userMessage = userMessage;
    this.name = "GeminiError";
  }
}

export function getGeminiApiKey(): string | null {
  const key = process.env.GEMINI_API_KEY;
  return key && key.trim().length > 0 ? key.trim() : null;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
  error?: { message?: string };
}

/** Результат одного запроса к конкретной модели. */
interface GeminiAttempt {
  ok: boolean;
  status: number;
  payload?: GeminiResponse;
}

async function requestModel(
  model: string,
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<GeminiAttempt> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          generationConfig: {
            temperature: 0.7,
            // В budget входят и «thinking»-токены flash-моделей: 1024 обрезало
            // ответ посреди предложения (finishReason MAX_TOKENS). 4096 —
            // запас для компактного, но законченного разбора дня.
            maxOutputTokens: 4096,
          },
        }),
        signal: controller.signal,
      },
    );
    if (!response.ok) {
      return { ok: false, status: response.status };
    }
    return { ok: true, status: response.status, payload: (await response.json()) as GeminiResponse };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Отправляет system prompt + user prompt, возвращает текст ответа.
 * Все ошибки сводятся к GeminiError с безопасным для показа сообщением;
 * в серверный лог попадает только код статуса — не тело ответа и не ключ.
 */
export async function generateMentorText(systemPrompt: string, userPrompt: string): Promise<string> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new GeminiError(
      "Наставник пока не настроен: на сервере не задан ключ Gemini. Добавь GEMINI_API_KEY в настройках окружения и передеплой.",
    );
  }

  let lastStatus = 0;
  let networkFailure: unknown = null;
  for (const model of GEMINI_MODELS) {
    let attempt: GeminiAttempt;
    try {
      attempt = await requestModel(model, apiKey, systemPrompt, userPrompt);
    } catch (error) {
      const aborted = error instanceof Error && error.name === "AbortError";
      networkFailure = error;
      if (aborted) {
        throw new GeminiError(
          "Наставник не успел ответить — канал слишком долог. Попробуй ещё раз через минуту.",
          error,
        );
      }
      // Сетевой сбой не зависит от модели — ретраить список версий бессмысленно.
      throw new GeminiError(
        "Наставник недоступен: не удалось связаться с сервером AI. Попробуй позже.",
        error,
      );
    }
    if (attempt.ok) {
      return extractText(attempt.payload);
    }
    lastStatus = attempt.status;
    // 404 — модель недоступна этому ключу; пробуем следующую версию.
    // Любой другой статус — проблема не в имени модели, сразу наружу.
    if (attempt.status !== 404) break;
  }

  if (lastStatus === 429) {
    throw new GeminiError("Наставник перегружен запросами. Попробуй через несколько минут.");
  }
  if (networkFailure !== null) {
    throw new GeminiError(
      "Наставник недоступен: не удалось связаться с сервером AI. Попробуй позже.",
      networkFailure,
    );
  }
  console.error(`[mentor] Gemini request failed with status ${lastStatus}`);
  throw new GeminiError("Наставник не смог прочитать хронику. Попробуй позже.");
}

function extractText(payload: GeminiResponse | undefined): string {
  if (payload?.promptFeedback?.blockReason) {
    throw new GeminiError("Наставник воздержался от ответа на эти записи.");
  }
  const candidate = payload?.candidates?.[0];
  const text = (candidate?.content?.parts ?? [])
    .map((part) => part.text ?? "")
    .join("")
    .trim();
  if (text.length === 0) {
    throw new GeminiError("Наставник ответил пустотой. Попробуй ещё раз.");
  }
  // Обрыв по лимиту не показываем пользователю: незаконченное предложение —
  // хуже ошибки, которую можно повторить. Лимит поднят, так что это редкость.
  if (candidate?.finishReason === "MAX_TOKENS") {
    throw new GeminiError(
      "Наставник не успел закончить разбор. Попробуй запросить наставление ещё раз.",
    );
  }
  return sanitizeMentorText(text);
}

/**
 * Защита от случайного Markdown в ответе модели: убираем **, __, ###-маркеры
 * и строку-заголовок «Выжимка дня», если модель её всё же вернула. Текст
 * остаётся обычным читаемым текстом — без HTML-рендера.
 */
export function sanitizeMentorText(raw: string): string {
  const lines = raw
    .split("\n")
    .map((line) =>
      line
        .replace(/\*\*(.+?)\*\*/g, "$1")
        .replace(/__(.+?)__/g, "$1")
        .replace(/^\s*#{1,6}\s+/, ""),
    )
    .filter((line) => !/^\s*\**\s*выжимка дня\s*\**\s*:?\s*$/i.test(line));
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
