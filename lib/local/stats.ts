"use client";

import { localDb, type LocalDb } from "@/lib/local/db";

/**
 * «Статистика пути» (полностью локальное приложение): только существующие
 * таблицы Dexie, без новых сущностей. Счётчики — дешёвые подсчёты по
 * индексам; дорогая часть (объединение дат активных дней) вычисляется не на
 * каждый вызов, а только когда изменился отпечаток — набор счётчиков всех
 * журнальных таблиц (любое создание, удаление или смена статуса отметки
 * аскезы меняет хотя бы один из них). Переключение вкладок возвращает
 * готовый результат.
 */

export interface PathStatsView {
  thoughts: number;
  trainings: number;
  nutrition: number;
  learning: number;
  creations: number;
  /** Выполненные отметки аскез. */
  asceticismsDone: number;
  /** Дни с хотя бы одной записью (те же разделы, что у дневного бонуса). */
  activeDays: number;
}

/** Таблицы, задающие активный день (зеркало dayHasEntries из mutations). */
const ACTIVE_DAY_TABLES = [
  "thoughts",
  "training",
  "nutrition",
  "learning",
  "creation",
  "leisure",
  "asceticismLogs",
] as const;

/** Активные дни: число различных дат с записью хоть в одной из таблиц. */
async function countActiveDays(db: LocalDb): Promise<number> {
  const keyGroups = await Promise.all(
    ACTIVE_DAY_TABLES.map((name) => db[name].orderBy("entryDate").keys()),
  );
  const dates = new Set<string>();
  for (const group of keyGroups) {
    for (const key of group) {
      if (typeof key === "string") dates.add(key);
    }
  }
  return dates.size;
}

interface PathStatsCache {
  fingerprint: string;
  view: PathStatsView;
}

let cache: PathStatsCache | null = null;

export async function readPathStats(): Promise<PathStatsView | null> {
  const db = localDb();
  if (!db) return null;
  try {
    const [thoughts, trainings, nutrition, learning, creations, leisure, logsTotal, asceticismsDone] =
      await Promise.all([
        db.thoughts.count(),
        db.training.count(),
        db.nutrition.count(),
        db.learning.count(),
        db.creation.count(),
        db.leisure.count(),
        db.asceticismLogs.count(),
        db.asceticismLogs.filter((log) => log.status === "done").count(),
      ]);
    const fingerprint = `${thoughts}:${trainings}:${nutrition}:${learning}:${creations}:${leisure}:${logsTotal}:${asceticismsDone}`;
    if (cache && cache.fingerprint === fingerprint) return cache.view;

    const view: PathStatsView = {
      thoughts,
      trainings,
      nutrition,
      learning,
      creations,
      asceticismsDone,
      activeDays: await countActiveDays(db),
    };
    cache = { fingerprint, view };
    return view;
  } catch {
    return null;
  }
}
