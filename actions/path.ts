"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withUserDb } from "@/lib/db";
import { getCurrentUser } from "@/lib/supabase/server";
import {
  creationEntries,
  learningEntries,
  nutritionEntries,
  trainingActivities,
  type CreationEntry,
  type LearningEntry,
  type NutritionEntry,
  type TrainingActivity,
} from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import {
  createCreationEntry as dbCreateCreation,
  createLearningEntry as dbCreateLearning,
  createTrainingActivity as dbCreateTraining,
  deleteCreationEntry as dbDeleteCreation,
  deleteLearningEntry as dbDeleteLearning,
  deleteTrainingActivity as dbDeleteTraining,
  upsertNutrition as dbUpsertNutrition,
} from "@/lib/path";
import { entryDateSchema, formatZodError, nonEmptyText, uuidSchema } from "@/lib/validation";
import type { Action } from "@/lib/types";

/**
 * Server actions раздела «Путь» (Огонь / Вода / Воздух / Земля).
 * Порядок: пользователь из сессии → zod-валидация → lib-слой → { ok, data | error }.
 */

function revalidateDay() {
  revalidatePath("/path");
  revalidatePath("/today");
  revalidatePath("/history");
}

export interface PathDay {
  training: TrainingActivity[];
  nutrition: NutritionEntry | null;
  learning: LearningEntry[];
  creation: CreationEntry[];
}

/** Все записи Пути за день — для клиентских экранов. */
export async function getPathDay(entryDate: string): Promise<Action<PathDay>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Требуется авторизация" };

  const parsed = entryDateSchema.safeParse(entryDate);
  if (!parsed.success) return { ok: false, error: formatZodError(parsed.error) };

  const date = parsed.data;
  // Каждая выборка — отдельная транзакция на своём соединении (пул max 3):
  // в плохой фазе канала соединение умирает после ~4-6 round-trip'ов
  // (см. diagnostics-2026-09-13.md), поэтому длинные транзакции из нескольких
  // запросов ненадёжны. Параллель между РАЗНЫМИ соединениями безопасна;
  // запрет касался конвейера нескольких запросов в одном соединении.
  const [training, nutritionList, learning, creation] = await Promise.all([
    withUserDb(user.id, (tx) =>
      tx
        .select()
        .from(trainingActivities)
        .where(and(eq(trainingActivities.userId, user.id), eq(trainingActivities.entryDate, date))),
    ),
    withUserDb(user.id, (tx) =>
      tx
        .select()
        .from(nutritionEntries)
        .where(and(eq(nutritionEntries.userId, user.id), eq(nutritionEntries.entryDate, date))),
    ),
    withUserDb(user.id, (tx) =>
      tx
        .select()
        .from(learningEntries)
        .where(and(eq(learningEntries.userId, user.id), eq(learningEntries.entryDate, date))),
    ),
    withUserDb(user.id, (tx) =>
      tx
        .select()
        .from(creationEntries)
        .where(and(eq(creationEntries.userId, user.id), eq(creationEntries.entryDate, date))),
    ),
  ]);
  return { ok: true, data: { training, nutrition: nutritionList[0] ?? null, learning, creation } };
}

// ---------- ОГОНЬ ----------

const trainingSchema = z.object({
  entryDate: entryDateSchema,
  title: nonEmptyText("Название", 200),
  detail: z.string().trim().max(500).nullish().transform((v) => v || null),
  durationMinutes: z.number().int().positive("Минуты должны быть больше нуля").max(1440).nullish(),
});

export async function createTrainingActivity(
  entryDate: string,
  title: string,
  detail?: string | null,
  durationMinutes?: number | null,
): Promise<Action<void>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Требуется авторизация" };

  const parsed = trainingSchema.safeParse({ entryDate, title, detail, durationMinutes: durationMinutes ?? null });
  if (!parsed.success) return { ok: false, error: formatZodError(parsed.error) };

  await dbCreateTraining(user.id, parsed.data.entryDate, {
    title: parsed.data.title,
    detail: parsed.data.detail,
    durationMinutes: parsed.data.durationMinutes ?? null,
  });
  revalidateDay();
  return { ok: true, data: undefined };
}

export async function deleteTrainingActivity(id: string): Promise<Action<void>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Требуется авторизация" };

  const parsed = uuidSchema.safeParse(id);
  if (!parsed.success) return { ok: false, error: "Некорректный идентификатор" };

  await dbDeleteTraining(user.id, parsed.data);
  revalidateDay();
  return { ok: true, data: undefined };
}

// ---------- ВОДА ----------

const macro = z.number().min(0, "Значение не может быть отрицательным").max(100000).nullish();

const nutritionSchema = z.object({
  entryDate: entryDateSchema,
  calories: macro,
  proteinGrams: macro,
  fatGrams: macro,
  carbsGrams: macro,
  note: z.string().trim().max(2000).nullish().transform((v) => v || null),
});

export async function saveNutrition(
  entryDate: string,
  values: {
    calories?: number | null;
    proteinGrams?: number | null;
    fatGrams?: number | null;
    carbsGrams?: number | null;
    note?: string | null;
  },
): Promise<Action<void>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Требуется авторизация" };

  const parsed = nutritionSchema.safeParse({ entryDate, ...values });
  if (!parsed.success) return { ok: false, error: formatZodError(parsed.error) };

  await dbUpsertNutrition(user.id, parsed.data.entryDate, {
    calories: parsed.data.calories ?? null,
    proteinGrams: parsed.data.proteinGrams ?? null,
    fatGrams: parsed.data.fatGrams ?? null,
    carbsGrams: parsed.data.carbsGrams ?? null,
    note: parsed.data.note,
  });
  revalidateDay();
  return { ok: true, data: undefined };
}

// ---------- ВОЗДУХ / ЗЕМЛЯ ----------

const contentSchema = nonEmptyText("Текст записи", 5000);

const datedContentSchema = z.object({
  entryDate: entryDateSchema,
  content: contentSchema,
});

export async function createLearningEntry(entryDate: string, content: string): Promise<Action<void>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Требуется авторизация" };

  const parsed = datedContentSchema.safeParse({ entryDate, content });
  if (!parsed.success) return { ok: false, error: formatZodError(parsed.error) };

  await dbCreateLearning(user.id, parsed.data.entryDate, parsed.data.content);
  revalidateDay();
  return { ok: true, data: undefined };
}

export async function deleteLearningEntry(id: string): Promise<Action<void>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Требуется авторизация" };

  const parsed = uuidSchema.safeParse(id);
  if (!parsed.success) return { ok: false, error: "Некорректный идентификатор" };

  await dbDeleteLearning(user.id, parsed.data);
  revalidateDay();
  return { ok: true, data: undefined };
}

export async function createCreationEntry(entryDate: string, content: string): Promise<Action<void>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Требуется авторизация" };

  const parsed = datedContentSchema.safeParse({ entryDate, content });
  if (!parsed.success) return { ok: false, error: formatZodError(parsed.error) };

  await dbCreateCreation(user.id, parsed.data.entryDate, parsed.data.content);
  revalidateDay();
  return { ok: true, data: undefined };
}

export async function deleteCreationEntry(id: string): Promise<Action<void>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Требуется авторизация" };

  const parsed = uuidSchema.safeParse(id);
  if (!parsed.success) return { ok: false, error: "Некорректный идентификатор" };

  await dbDeleteCreation(user.id, parsed.data);
  revalidateDay();
  return { ok: true, data: undefined };
}
