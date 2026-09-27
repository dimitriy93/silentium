"use client";

import { HISTORY_PAGE_SIZE } from "@/lib/local/constants";
import { localDb } from "@/lib/local/db";
import { readLocalDayStreakView } from "@/lib/local/streaks";
import { todayLocalDate } from "@/lib/format";
import type {
  LocalAchievement,
  LocalAsceticismDay,
  LocalHistoryDay,
  LocalHistoryPage,
  LocalLeisure,
  LocalPathDay,
  LocalThought,
} from "@/lib/local/types";

/**
 * Чтение из локальной базы — единственного источника истины. Читатель
 * возвращает null, только если локальное хранилище недоступно (SSR или
 * приватный режим); пустые массивы — валидные данные («за день ничего нет»).
 *
 * Порядки строк прежние: внутри дня — createdAt desc; аскезы — активные
 * сверху, затем по created_at.
 */

/** ISO-строки сортируются лексикографически = хронологически. */
function byNewestFirst(a: { createdAt: string }, b: { createdAt: string }): number {
  return b.createdAt.localeCompare(a.createdAt);
}

export async function readThoughtsForDay(entryDate: string): Promise<LocalThought[] | null> {
  const db = localDb();
  if (!db) return null;
  try {
    const rows = await db.thoughts.where("entryDate").equals(entryDate).toArray();
    return rows.sort(byNewestFirst);
  } catch {
    return null;
  }
}

/** Вся лента мыслей, новые сверху. */
export async function readAllThoughts(limit = 200): Promise<LocalThought[] | null> {
  const db = localDb();
  if (!db) return null;
  try {
    const rows = await db.thoughts.toArray();
    return rows.sort(byNewestFirst).slice(0, limit);
  } catch {
    return null;
  }
}

export async function readPathDay(entryDate: string): Promise<LocalPathDay | null> {
  const db = localDb();
  if (!db) return null;
  try {
    return await db.transaction(
      "r",
      [db.training, db.nutrition, db.learning, db.creation],
      async () => {
        const [training, nutrition, learning, creation] = await Promise.all([
          db.training.where("entryDate").equals(entryDate).toArray(),
          db.nutrition.where("entryDate").equals(entryDate).toArray(),
          db.learning.where("entryDate").equals(entryDate).toArray(),
          db.creation.where("entryDate").equals(entryDate).toArray(),
        ]);
        return {
          training: training.sort(byNewestFirst),
          nutrition: nutrition[0] ?? null,
          learning: learning.sort(byNewestFirst),
          creation: creation.sort(byNewestFirst),
        };
      },
    );
  } catch {
    return null;
  }
}

export async function readLeisureForDay(entryDate: string): Promise<LocalLeisure[] | null> {
  const db = localDb();
  if (!db) return null;
  try {
    const rows = await db.leisure.where("entryDate").equals(entryDate).toArray();
    return rows.sort(byNewestFirst);
  } catch {
    return null;
  }
}

export async function readAsceticismDay(entryDate: string): Promise<LocalAsceticismDay | null> {
  const db = localDb();
  if (!db) return null;
  try {
    return await db.transaction(
      "r",
      [db.asceticisms, db.asceticismLogs, db.asceticismStreaks],
      async () => {
        const [list, logs, streaks] = await Promise.all([
          db.asceticisms.toArray(),
          db.asceticismLogs.where("entryDate").equals(entryDate).toArray(),
          db.asceticismStreaks.toArray(),
        ]);
        return {
          list: list.sort((a, b) => Number(a.isActive) - Number(b.isActive) || a.createdAt.localeCompare(b.createdAt)),
          logs,
          streaks,
        };
      },
    );
  } catch {
    return null;
  }
}

/** Достижения аскез: bestMilestone каждой аскезы. */
export async function readAsceticismAchievements(): Promise<LocalAchievement[] | null> {
  const db = localDb();
  if (!db) return null;
  try {
    return await db.transaction("r", [db.asceticisms, db.asceticismStreaks], async () => {
      const [list, streaks] = await Promise.all([db.asceticisms.toArray(), db.asceticismStreaks.toArray()]);
      const titles = new Map(list.map((a) => [a.id, a.title]));
      return streaks
        .filter((s) => s.bestMilestone > 0 && titles.has(s.asceticismId))
        .map((s) => ({ asceticismId: s.asceticismId, title: titles.get(s.asceticismId) ?? "", milestone: s.bestMilestone }))
        .sort((a, b) => b.milestone - a.milestone || a.title.localeCompare(b.title));
    });
  } catch {
    return null;
  }
}

/** Серия дневника: хранимая строка + проверка «живости» на локальную дату. */
export async function readDayStreakView(): Promise<
  { currentStreak: number; longestStreak: number; bestMilestone: number; lastActiveDate: string | null } | null
> {
  const db = localDb();
  if (!db) return null;
  try {
    return await readLocalDayStreakView(db, todayLocalDate());
  } catch {
    return null;
  }
}

/**
 * Страница истории, собранная из локальной базы: группировка по entry_date,
 * пагинация в памяти — данные пользователя малы.
 */
export async function readHistoryPage(
  page: number,
  pageSize: number = HISTORY_PAGE_SIZE,
): Promise<LocalHistoryPage | null> {
  const db = localDb();
  if (!db) return null;
  try {
    return await db.transaction(
      "r",
      [db.thoughts, db.training, db.nutrition, db.learning, db.creation, db.leisure, db.asceticismLogs],
      async () => {
        const [thoughts, training, nutrition, learning, creation, leisure, logs] = await Promise.all([
          db.thoughts.toArray(),
          db.training.toArray(),
          db.nutrition.toArray(),
          db.learning.toArray(),
          db.creation.toArray(),
          db.leisure.toArray(),
          db.asceticismLogs.toArray(),
        ]);

        type Summary = LocalHistoryPage["days"][number];
        const byDate = new Map<string, Summary>();
        const touch = (date: string): Summary => {
          let summary = byDate.get(date);
          if (!summary) {
            summary = { entryDate: date, totalEntries: 0, pathFilled: false, asceticismDone: 0, asceticismTotal: 0 };
            byDate.set(date, summary);
          }
          return summary;
        };

        for (const row of thoughts) touch(row.entryDate).totalEntries += 1;
        for (const row of training) {
          const s = touch(row.entryDate);
          s.totalEntries += 1;
          s.pathFilled = true;
        }
        for (const row of nutrition) {
          const s = touch(row.entryDate);
          s.totalEntries += 1;
          s.pathFilled = true;
        }
        for (const row of learning) {
          const s = touch(row.entryDate);
          s.totalEntries += 1;
          s.pathFilled = true;
        }
        for (const row of creation) {
          const s = touch(row.entryDate);
          s.totalEntries += 1;
          s.pathFilled = true;
        }
        for (const row of leisure) touch(row.entryDate).totalEntries += 1;
        for (const row of logs) {
          const s = touch(row.entryDate);
          s.asceticismTotal += 1;
          if (row.status === "done") s.asceticismDone += 1;
        }

        const all = [...byDate.values()].sort((a, b) => b.entryDate.localeCompare(a.entryDate));
        const totalDays = all.length;
        const pageCount = Math.max(1, Math.ceil(totalDays / pageSize));
        const clamped = Math.min(Math.max(1, page), pageCount);
        const days = all.slice((clamped - 1) * pageSize, clamped * pageSize);
        return { days, page: clamped, pageCount, totalDays };
      },
    );
  } catch {
    return null;
  }
}

/** Один день истории из локальной базы (для страницы дня истории). */
export async function readHistoryDay(entryDate: string): Promise<LocalHistoryDay | null> {
  const db = localDb();
  if (!db) return null;
  try {
    return await db.transaction(
      "r",
      [db.thoughts, db.training, db.nutrition, db.learning, db.creation, db.leisure, db.asceticismLogs, db.asceticisms],
      async () => {
        const [thoughts, training, nutrition, learning, creation, leisure, logs, ascList] =
          await Promise.all([
            db.thoughts.where("entryDate").equals(entryDate).toArray(),
            db.training.where("entryDate").equals(entryDate).toArray(),
            db.nutrition.where("entryDate").equals(entryDate).toArray(),
            db.learning.where("entryDate").equals(entryDate).toArray(),
            db.creation.where("entryDate").equals(entryDate).toArray(),
            db.leisure.where("entryDate").equals(entryDate).toArray(),
            db.asceticismLogs.where("entryDate").equals(entryDate).toArray(),
            db.asceticisms.toArray(),
          ]);
        const titles: Record<string, string> = {};
        for (const a of ascList) titles[a.id] = a.title;
        return {
          entryDate,
          thoughts: thoughts.sort(byNewestFirst),
          training: training.sort(byNewestFirst),
          nutrition: nutrition[0] ?? null,
          learning: learning.sort(byNewestFirst),
          creation: creation.sort(byNewestFirst),
          leisure: leisure.sort(byNewestFirst),
          asceticismLogs: logs,
          asceticismTitles: titles,
        };
      },
    );
  } catch {
    return null;
  }
}
