import { and, desc, eq } from "drizzle-orm";
import { withUserDb } from "@/lib/db";
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

/**
 * Слой данных «Путь» — четыре стихии.
 *
 * ОГОНЬ  → training_activities (журнал физической активности)
 * ВОДА   → nutrition_entries   (КБЖУ + заметка, одна строка на день)
 * ВОЗДУХ → learning_entries    («я изучил»)
 * ЗЕМЛЯ  → creation_entries    («я создал»)
 */

// ---------- ОГОНЬ: физическая активность ----------

export async function createTrainingActivity(
  userId: string,
  entryDate: string,
  values: { title: string; detail?: string | null; durationMinutes?: number | null; notes?: string | null },
): Promise<TrainingActivity> {
  return withUserDb(userId, async (tx) => {
    const [row] = await tx
      .insert(trainingActivities)
      .values({ userId, entryDate, ...values })
      .returning();
    return row;
  });
}

export async function deleteTrainingActivity(userId: string, id: string): Promise<boolean> {
  return withUserDb(userId, async (tx) => {
    const rows = await tx
      .delete(trainingActivities)
      .where(and(eq(trainingActivities.id, id), eq(trainingActivities.userId, userId)))
      .returning({ id: trainingActivities.id });
    return rows.length > 0;
  });
}

export async function listTrainingForDay(
  userId: string,
  entryDate: string,
): Promise<TrainingActivity[]> {
  return withUserDb(userId, (tx) =>
    tx
      .select()
      .from(trainingActivities)
      .where(and(eq(trainingActivities.userId, userId), eq(trainingActivities.entryDate, entryDate)))
      .orderBy(desc(trainingActivities.createdAt)),
  );
}

// ---------- ВОДА: питание ----------

export interface NutritionInput {
  calories?: number | null;
  proteinGrams?: number | null;
  fatGrams?: number | null;
  carbsGrams?: number | null;
  note?: string | null;
}

/**
 * Питание — одна строка на день: повторный ввод обновляет значения.
 * (onConflictDoUpdate по unique (user_id, entry_date).)
 */
export async function upsertNutrition(
  userId: string,
  entryDate: string,
  values: NutritionInput,
): Promise<NutritionEntry> {
  return withUserDb(userId, async (tx) => {
    const [row] = await tx
      .insert(nutritionEntries)
      .values({ userId, entryDate, ...values })
      .onConflictDoUpdate({
        target: [nutritionEntries.userId, nutritionEntries.entryDate],
        set: { ...values, updatedAt: new Date() },
      })
      .returning();
    return row;
  });
}

export async function getNutritionForDay(
  userId: string,
  entryDate: string,
): Promise<NutritionEntry | null> {
  return withUserDb(userId, async (tx) => {
    const rows = await tx
      .select()
      .from(nutritionEntries)
      .where(and(eq(nutritionEntries.userId, userId), eq(nutritionEntries.entryDate, entryDate)))
      .limit(1);
    return rows[0] ?? null;
  });
}

// ---------- ВОЗДУХ: умственное развитие ----------

export async function createLearningEntry(
  userId: string,
  entryDate: string,
  content: string,
): Promise<LearningEntry> {
  return withUserDb(userId, async (tx) => {
    const [row] = await tx
      .insert(learningEntries)
      .values({ userId, entryDate, content })
      .returning();
    return row;
  });
}

export async function deleteLearningEntry(userId: string, id: string): Promise<boolean> {
  return withUserDb(userId, async (tx) => {
    const rows = await tx
      .delete(learningEntries)
      .where(and(eq(learningEntries.id, id), eq(learningEntries.userId, userId)))
      .returning({ id: learningEntries.id });
    return rows.length > 0;
  });
}

export async function listLearningForDay(
  userId: string,
  entryDate: string,
): Promise<LearningEntry[]> {
  return withUserDb(userId, (tx) =>
    tx
      .select()
      .from(learningEntries)
      .where(and(eq(learningEntries.userId, userId), eq(learningEntries.entryDate, entryDate)))
      .orderBy(desc(learningEntries.createdAt)),
  );
}

// ---------- ЗЕМЛЯ: созидание ----------

export async function createCreationEntry(
  userId: string,
  entryDate: string,
  content: string,
): Promise<CreationEntry> {
  return withUserDb(userId, async (tx) => {
    const [row] = await tx
      .insert(creationEntries)
      .values({ userId, entryDate, content })
      .returning();
    return row;
  });
}

export async function deleteCreationEntry(userId: string, id: string): Promise<boolean> {
  return withUserDb(userId, async (tx) => {
    const rows = await tx
      .delete(creationEntries)
      .where(and(eq(creationEntries.id, id), eq(creationEntries.userId, userId)))
      .returning({ id: creationEntries.id });
    return rows.length > 0;
  });
}

export async function listCreationForDay(
  userId: string,
  entryDate: string,
): Promise<CreationEntry[]> {
  return withUserDb(userId, (tx) =>
    tx
      .select()
      .from(creationEntries)
      .where(and(eq(creationEntries.userId, userId), eq(creationEntries.entryDate, entryDate)))
      .orderBy(desc(creationEntries.createdAt)),
  );
}
