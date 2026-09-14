import "server-only";

/**
 * Серверный клиент Google Gemini (REST, без SDK — зависимость не нужна).
 * Ключ читается только на сервере из GEMINI_API_KEY и никогда не попадает
 * в браузер: этот модуль импортируется исключительно server actions'ами.
 */

// «flash-latest» — стабильный алиас: имя конкретной версии меняется,
// алиас остаётся рабочим для новых ключей (старые версии закрываются).
const GEMINI_MODEL = "gemini-flash-latest";
const TIMEOUT_MS = 45_000;

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

/**
 * Отправляет system prompt + user prompt, возвращает текст ответа.
 * Все ошибки сводятся к GeminiError с безопасным для показа сообщением.
 */
export async function generateMentorText(systemPrompt: string, userPrompt: string): Promise<string> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new GeminiError(
      "Наставник пока не настроен: на сервере не задан ключ Gemini. Добавь GEMINI_API_KEY в настройках окружения.",
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
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
            maxOutputTokens: 1024,
          },
        }),
        signal: controller.signal,
      },
    );
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    throw new GeminiError(
      aborted
        ? "Наставник не успел ответить — канал слишком долог. Попробуй ещё раз через минуту."
        : "Наставник недоступен: не удалось связаться с сервером AI. Попробуй позже.",
      error,
    );
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 429) {
    throw new GeminiError("Наставник перегружен запросами. Попробуй через несколько минут.");
  }
  if (!response.ok) {
    // Детали (включая ключ) не показываем и не логируем вместе с телом ответа.
    console.error(`[mentor] Gemini request failed with status ${response.status}`);
    throw new GeminiError("Наставник не смог прочитать хронику. Попробуй позже.");
  }

  let payload: GeminiResponse;
  try {
    payload = (await response.json()) as GeminiResponse;
  } catch (error) {
    throw new GeminiError("Ответ наставника пришёл повреждённым. Попробуй ещё раз.", error);
  }

  if (payload.promptFeedback?.blockReason) {
    throw new GeminiError("Наставник воздержался от ответа на эти записи.");
  }

  const text = (payload.candidates?.[0]?.content?.parts ?? [])
    .map((part) => part.text ?? "")
    .join("")
    .trim();

  if (text.length === 0) {
    throw new GeminiError("Наставник ответил пустотой. Попробуй ещё раз.");
  }
  return text;
}
