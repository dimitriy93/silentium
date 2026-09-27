"use client";

import {
  milestoneForStreak,
  computeCurrentStreak,
  computeLongestStreak,
} from "@/lib/asceticism-streak";
import {
  currentStreakFromDates,
  longestStreakFromDates,
} from "@/lib/streak-math";
import { DAY_STREAK_KEY, LOCAL_USER_ID, type LocalDb } from "@/lib/local/db";

/**
 * Локальный пересчёт серий — клиентский перенос серверной логики
 * (syncDayStreak из lib/day-streak.ts и syncStreakTx из lib/asceticism.ts,
 * которые жили на сервере и возвращались со снапшотом). После удаления
 * сервера серии обязаны пересчитываться на устройстве — иначе они
 * остановились бы на моменте последней синхронизации.
 *
 * Все функции вызываются внутри транзакции мутации (lib/local/mutations.ts)
 * или импорта backup (lib/local/backup.ts) — транзакция включает
 * соответствующие таблицы.
 */

/** «Осмысленные» даты — зеркало dayRowsUnionSql: мысли, путь, развлечения, отметки аскез. */
export async function meaningfulDates(db: LocalDb): Promise<string[]> {
  const dates = new Set<string>();
  const groups = await Promise.all([
    db.thoughts.orderBy("entryDate").keys(),
    db.training.orderBy("entryDate").keys(),
    db.nutrition.orderBy("entryDate").keys(),
    db.learning.orderBy("entryDate").keys(),
    db.creation.orderBy("entryDate").keys(),
    db.leisure.orderBy("entryDate").keys(),
    db.asceticismLogs.orderBy("entryDate").keys(),
  ]);
  for (const group of groups) {
    for (const key of group) {
      if (typeof key === "string") dates.add(key);
    }
  }
  return [...dates].sort();
}

/**
 * Пересчитать и сохранить серию дневника. anchorDate — дата изменения
 * контента (обычно сегодня): она определяет «сейчас» при подсчёте.
 * Пороги достижений — общие с аскезами; bestMilestone хранится навсегда.
 */
export async function syncLocalDayStreak(db: LocalDb, anchorDate: string): Promise<void> {
  const dates = await meaningfulDates(db);
  const existing = await db.dayStreak.get(DAY_STREAK_KEY);

  const current = currentStreakFromDates(dates, anchorDate);
  const longestRun = longestStreakFromDates(dates);
  const longest = Math.max(existing?.view.longestStreak ?? 0, current, longestRun);
  const bestMilestone = Math.max(existing?.view.bestMilestone ?? 0, milestoneForStreak(longest));
  const lastActiveDate = dates.length > 0 ? dates[dates.length - 1] : null;

  await db.dayStreak.put({
    key: DAY_STREAK_KEY,
    view: { currentStreak: current, longestStreak: longest, bestMilestone, lastActiveDate },
  });
}

/**
 * Серия дневника для отображения. Серия «жива», пока последний
 * осмысленный день — сегодня или вчера (та же логика, что у серий аскез).
 * Строки нет (первый запуск) — серия считается по текущим данным.
 */
export async function readLocalDayStreakView(
  db: LocalDb,
  today: string,
): Promise<{ currentStreak: number; longestStreak: number; bestMilestone: number; lastActiveDate: string | null }> {
  const row = await db.dayStreak.get(DAY_STREAK_KEY);
  const dates = await meaningfulDates(db);
  if (!row) {
    const current = currentStreakFromDates(dates, today);
    const longest = Math.max(current, longestStreakFromDates(dates));
    return {
      currentStreak: current,
      longestStreak: longest,
      bestMilestone: milestoneForStreak(longest),
      lastActiveDate: dates.length > 0 ? dates[dates.length - 1] : null,
    };
  }
  const alive = row.view.currentStreak > 0 && row.view.lastActiveDate !== null && row.view.lastActiveDate >= prevDayOf(today);
  return {
    currentStreak: alive ? row.view.currentStreak : 0,
    longestStreak: row.view.longestStreak,
    bestMilestone: row.view.bestMilestone,
    lastActiveDate: row.view.lastActiveDate,
  };
}

function prevDayOf(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Пересчитать и сохранить серию одной аскезы (после отметки, в т.ч.
 * задним числом). Серия считается по отметкам 'done' подряд назад от
 * today; дни раньше startDate (или streak_since при повторном запуске)
 * не учитываются. Рекорд и достижение — по всей истории отметок.
 */
export async function syncLocalAsceticismStreak(
  db: LocalDb,
  asceticismId: string,
  today: string,
): Promise<void> {
  const a = await db.asceticisms.get(asceticismId);
  if (!a) return;
  const existing = await db.asceticismStreaks.where("asceticismId").equals(asceticismId).first();

  const since =
    existing?.streakSince && existing.streakSince > a.startDate ? existing.streakSince : a.startDate;

  const logs = (await db.asceticismLogs.where("asceticismId").equals(asceticismId).toArray())
    .filter((l) => l.entryDate >= since)
    .map((l) => ({ entryDate: l.entryDate, status: l.status }));

  const streak = computeCurrentStreak(logs, since, today);
  const longestRun = computeLongestStreak(logs);
  const longest = Math.max(existing?.longestStreak ?? 0, streak, longestRun);
  const bestMilestone = Math.max(existing?.bestMilestone ?? 0, milestoneForStreak(longest));
  const lastDoneDate =
    logs.reduce<string | null>(
      (max, l) => (l.status === "done" && (max === null || l.entryDate > max) ? l.entryDate : max),
      null,
    ) ?? null;

  const row = {
    id: existing?.id ?? crypto.randomUUID(),
    asceticismId,
    userId: LOCAL_USER_ID,
    currentStreak: streak,
    longestStreak: longest,
    bestMilestone,
    lastDoneDate,
    streakSince: existing?.streakSince ?? null,
    updatedAt: new Date().toISOString(),
  };
  await db.asceticismStreaks.put(row);
}
