import { and, eq, sql } from "drizzle-orm";
import { withUserDb } from "@/lib/db";
import {
  aiDailyMemories,
  asceticismLogs,
  creationEntries,
  learningEntries,
  leisureEntries,
  nutritionEntries,
  thoughts,
  trainingActivities,
  type AsceticismLog,
  type CreationEntry,
  type LearningEntry,
  type LeisureEntry,
  type NutritionEntry,
  type Thought,
  type TrainingActivity,
} from "@/lib/db/schema";

/**
 * Слой данных дня: сводка для «Сегодня», полный день для истории,
 * список дней для истории. Отдельной таблицы «день с контентом» нет —
 * агрегируем по entry_date.
 */

export interface DayEntries {
  entryDate: string;
  thoughts: Thought[];
  training: TrainingActivity[];
  nutrition: NutritionEntry | null;
  learning: LearningEntry[];
  creation: CreationEntry[];
  leisure: LeisureEntry[];
  asceticismLogs: AsceticismLog[];
}

/** Все записи конкретного дня — для страницы истории дня. */
export async function getDayEntries(userId: string, entryDate: string): Promise<DayEntries> {
  // Каждая выборка — отдельная транзакция на своём соединении из пула (max 3).
  // Держать 8 запросов в одной транзакции нельзя: в плохой фазе канала
  // соединение умирает после ~4-6 round-trip'ов (см. diagnostics-2026-09-13.md)
  // и страница не грузится вовсе. Параллельные запросы между РАЗНЫМИ
  // соединениями безопасны — запрет касался конвейера в одном соединении.
  // Снимок кросс-таблицной консистентности здесь не нужен: страница только
  // читает, записи почти не меняются задним числом.
  const [thoughtList, trainingList, nutritionList, learningList, creationList, leisureList, asceticismLogList] =
    await Promise.all([
      withUserDb(userId, (tx) =>
        tx.select().from(thoughts).where(and(eq(thoughts.userId, userId), eq(thoughts.entryDate, entryDate))),
      ),
      withUserDb(userId, (tx) =>
        tx
          .select()
          .from(trainingActivities)
          .where(and(eq(trainingActivities.userId, userId), eq(trainingActivities.entryDate, entryDate))),
      ),
      withUserDb(userId, (tx) =>
        tx
          .select()
          .from(nutritionEntries)
          .where(and(eq(nutritionEntries.userId, userId), eq(nutritionEntries.entryDate, entryDate))),
      ),
      withUserDb(userId, (tx) =>
        tx
          .select()
          .from(learningEntries)
          .where(and(eq(learningEntries.userId, userId), eq(learningEntries.entryDate, entryDate))),
      ),
      withUserDb(userId, (tx) =>
        tx
          .select()
          .from(creationEntries)
          .where(and(eq(creationEntries.userId, userId), eq(creationEntries.entryDate, entryDate))),
      ),
      withUserDb(userId, (tx) =>
        tx
          .select()
          .from(leisureEntries)
          .where(and(eq(leisureEntries.userId, userId), eq(leisureEntries.entryDate, entryDate))),
      ),
      withUserDb(userId, (tx) =>
        tx
          .select()
          .from(asceticismLogs)
          .where(and(eq(asceticismLogs.userId, userId), eq(asceticismLogs.entryDate, entryDate))),
      ),
    ]);

  return {
    entryDate,
    thoughts: thoughtList,
    training: trainingList,
    nutrition: nutritionList[0] ?? null,
    learning: learningList,
    creation: creationList,
    leisure: leisureList,
    asceticismLogs: asceticismLogList,
  };
}

export interface DaySummary {
  entryDate: string;
  /** Общее количество записей за день (мысли + путь + развлечения). */
  totalEntries: number;
  /** Путь заполнен, если есть хотя бы одна запись в любой из четырёх стихий. */
  pathFilled: boolean;
  /** Аскезы: сколько выполнено / сколько всего отметок за день. */
  asceticismDone: number;
  asceticismTotal: number;
}

/**
 * Список дней с активностью (для истории): объединяет даты всех разделов.
 *
 * Один UNION-запрос вместо семи отдельных select: страница /history открылась
 * бы 7 round-trip'ов подряд на одном соединении, а в плохой фазе канала
 * (см. diagnostics-2026-09-13.md) соединение умирает после ~4-6 обменов —
 * страница не грузилась вовсе. Один запрос проходит и в плохой фазе, и в
 * хорошей работает заметно быстрее (~400 мс вместо ~1 с).
 */
export async function listDaySummaries(userId: string, limit = 60): Promise<DaySummary[]> {
  return withUserDb(userId, async (tx) => {
    const result = await tx.execute(sql`
      select entry_date::text as entry_date, src, status from (
        select entry_date, 'thought' as src, null::text as status
          from thoughts where user_id = ${userId}
        union all
        select entry_date, 'training' as src, null::text as status
          from training_activities where user_id = ${userId}
        union all
        select entry_date, 'nutrition' as src, null::text as status
          from nutrition_entries where user_id = ${userId}
        union all
        select entry_date, 'learning' as src, null::text as status
          from learning_entries where user_id = ${userId}
        union all
        select entry_date, 'creation' as src, null::text as status
          from creation_entries where user_id = ${userId}
        union all
        select entry_date, 'leisure' as src, null::text as status
          from leisure_entries where user_id = ${userId}
        union all
        select entry_date, 'asceticism' as src, status
          from asceticism_logs where user_id = ${userId}
      ) d
    `);
    const raw = result as unknown;
    const rows = (
      Array.isArray(raw) ? raw : (raw as { rows: unknown[] }).rows
    ) as Array<{ entry_date: string; src: string; status: string | null }>;

    const byDate = new Map<string, DaySummary>();
    const touch = (date: string): DaySummary => {
      let summary = byDate.get(date);
      if (!summary) {
        summary = { entryDate: date, totalEntries: 0, pathFilled: false, asceticismDone: 0, asceticismTotal: 0 };
        byDate.set(date, summary);
      }
      return summary;
    };

    for (const { entry_date: date, src, status } of rows) {
      const summary = touch(date);
      if (src === "asceticism") {
        summary.asceticismTotal += 1;
        if (status === "done") summary.asceticismDone += 1;
      } else {
        summary.totalEntries += 1;
        if (src !== "thought" && src !== "leisure") summary.pathFilled = true;
      }
    }

    return [...byDate.values()].sort((a, b) => b.entryDate.localeCompare(a.entryDate)).slice(0, limit);
  });
}

/** Сохраняет дневную AI-память (выжимка дня). Одна на user+день. */
export async function upsertAiDailyMemory(
  userId: string,
  entryDate: string,
  content: unknown,
  generatedBy: string | null,
): Promise<void> {
  await withUserDb(userId, async (tx) => {
    await tx
      .insert(aiDailyMemories)
      .values({ userId, entryDate, content, generatedBy })
      .onConflictDoUpdate({
        target: [aiDailyMemories.userId, aiDailyMemories.entryDate],
        set: { content, generatedBy },
      });
  });
}
