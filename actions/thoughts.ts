"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/supabase/server";
import type { Thought } from "@/lib/db/schema";
import {
  createThought as dbCreateThought,
  deleteThought as dbDeleteThought,
  updateThought as dbUpdateThought,
} from "@/lib/thoughts";
import { listThoughts as dbListThoughts, listThoughtsForDay as dbListThoughtsForDay } from "@/lib/thoughts";
import { syncDayStreak } from "@/lib/day-streak";
import { todayLocalDate } from "@/lib/format";
import { entryDateSchema, formatZodError, nonEmptyText, uuidSchema } from "@/lib/validation";
import type { Action } from "@/lib/types";

/**
 * Server actions раздела «Мысли»:
 * 1) пользователь из сессии Supabase, 2) zod-валидация, 3) lib-слой
 * (withUserDb + RLS), 4) результат { ok, data | error }.
 */

const contentSchema = nonEmptyText("Текст мысли", 10000);

/** Лента мыслей, новые сверху (группировку по датам делает клиент). */
export async function listThoughts(): Promise<Action<Thought[]>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Требуется авторизация" };

  const data = await dbListThoughts(user.id);
  return { ok: true, data };
}

/** Мысли конкретного дня. */
export async function listThoughtsForDay(entryDate: string): Promise<Action<Thought[]>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Требуется авторизация" };

  const parsed = entryDateSchema.safeParse(entryDate);
  if (!parsed.success) return { ok: false, error: formatZodError(parsed.error) };

  const data = await dbListThoughtsForDay(user.id, parsed.data);
  return { ok: true, data };
}

const createSchema = z.object({
  entryDate: entryDateSchema,
  content: contentSchema,
});

export async function createThought(
  entryDate: string,
  content: string,
): Promise<Action<void>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Требуется авторизация" };

  const parsed = createSchema.safeParse({ entryDate, content });
  if (!parsed.success) return { ok: false, error: formatZodError(parsed.error) };

  await dbCreateThought(user.id, parsed.data.entryDate, parsed.data.content);
  await syncDayStreak(user.id, parsed.data.entryDate);
  revalidatePath("/thoughts");
  revalidatePath("/today");
  revalidatePath("/history");
  return { ok: true, data: undefined };
}

const updateSchema = z.object({
  id: uuidSchema,
  content: contentSchema,
});

export async function updateThought(id: string, content: string): Promise<Action<void>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Требуется авторизация" };

  const parsed = updateSchema.safeParse({ id, content });
  if (!parsed.success) return { ok: false, error: formatZodError(parsed.error) };

  const updated = await dbUpdateThought(user.id, parsed.data.id, parsed.data.content);
  if (!updated) return { ok: false, error: "Запись не найдена" };

  revalidatePath("/thoughts");
  revalidatePath("/today");
  revalidatePath("/history");
  return { ok: true, data: undefined };
}

export async function deleteThought(id: string): Promise<Action<void>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Требуется авторизация" };

  const parsed = uuidSchema.safeParse(id);
  if (!parsed.success) return { ok: false, error: "Некорректный идентификатор" };

  // День удаления не известен — серия пересчитывается по «сегодня»:
  // удаление последней записи пустого дня корректно обрывает серию.
  await dbDeleteThought(user.id, parsed.data);
  await syncDayStreak(user.id, todayLocalDate());
  revalidatePath("/thoughts");
  revalidatePath("/today");
  revalidatePath("/history");
  return { ok: true, data: undefined };
}
