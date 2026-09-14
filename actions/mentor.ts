"use server";

import { z } from "zod";
import { getCurrentUser } from "@/lib/supabase/server";
import { getDayEntries } from "@/lib/day";
import { listAsceticisms } from "@/lib/asceticism";
import {
  getLatestMentorMessage,
  getMentorSystemPrompt,
  saveMentorMessage,
} from "@/lib/mentor";
import { DEFAULT_MENTOR_SYSTEM_PROMPT } from "@/lib/mentor/default-system-prompt";
import { buildMentorDayContext, buildMentorUserPrompt } from "@/lib/mentor/day-context";
import { generateMentorText, GeminiError } from "@/lib/mentor/gemini";
import { entryDateSchema, formatZodError } from "@/lib/validation";
import type { Action } from "@/lib/types";

/**
 * Наставник: разбор дня. Всё серверно — данные дня собираются здесь,
 * Gemini вызывается здесь, ключ не покидает сервер. Браузер общается
 * только с этим server action.
 *
 * Повторный вызов за тот же день возвращает сохранённое наставление —
 * модель не перезапускается без нужды.
 */

export interface MentorReading {
  /** Текст наставления (может быть из кеша за сегодня). */
  content: string;
  cached: boolean;
}

const readingSchema = z.object({ entryDate: entryDateSchema });

export async function requestMentorReading(entryDate: string): Promise<Action<MentorReading>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Требуется авторизация" };

  const parsed = readingSchema.safeParse({ entryDate });
  if (!parsed.success) return { ok: false, error: formatZodError(parsed.error) };
  const date = parsed.data.entryDate;

  // Уже разобрано — отдаём сохранённое наставление.
  const cached = await getLatestMentorMessage(user.id, date);
  if (cached) return { ok: true, data: { content: cached, cached: true } };

  const data = await generateAndSave(user.id, date);
  return data.ok ? { ok: true, data: { content: data.content, cached: false } } : data;
}

/**
 * Принудительно новый разбор дня (только по явному действию пользователя).
 * История append-only: старое наставление не удаляется и не перезаписывается —
 * новая запись добавляется в mentor_messages, а последняя становится текущей.
 * Пока модель не ответила, старое сообщение остаётся в базе нетронутым.
 */
export async function regenerateMentorReading(entryDate: string): Promise<Action<MentorReading>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Требуется авторизация" };

  const parsed = readingSchema.safeParse({ entryDate });
  if (!parsed.success) return { ok: false, error: formatZodError(parsed.error) };

  const data = await generateAndSave(user.id, parsed.data.entryDate);
  return data.ok ? { ok: true, data: { content: data.content, cached: false } } : data;
}

async function generateAndSave(
  userId: string,
  date: string,
): Promise<{ ok: true; content: string } | { ok: false; error: string }> {
  // Записи дня — тот же слой данных, что читают экраны Today/истории.
  const [entries, asceticisms, systemPrompt] = await Promise.all([
    getDayEntries(userId, date),
    listAsceticisms(userId),
    getMentorSystemPrompt(userId),
  ]);

  const titleMap = new Map(asceticisms.map((a) => [a.id, a.title]));
  const context = buildMentorDayContext(entries, titleMap);
  const userPrompt = buildMentorUserPrompt(context);

  try {
    const content = await generateMentorText(systemPrompt ?? DEFAULT_MENTOR_SYSTEM_PROMPT, userPrompt);
    await saveMentorMessage(userId, date, content);
    return { ok: true, content };
  } catch (error) {
    if (error instanceof GeminiError) {
      return { ok: false, error: error.userMessage };
    }
    // Неизвестная ошибка: лог без деталей секрета, пользователю — общая формулировка.
    console.error(`[mentor] unexpected failure while composing reading for ${date}`);
    return {
      ok: false,
      error: "Наставник не смог разобрать день. Записи целы — попробуй ещё раз позже.",
    };
  }
}
