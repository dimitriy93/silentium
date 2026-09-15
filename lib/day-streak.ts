import { eq, sql } from "drizzle-orm";
import { withUserDb } from "@/lib/db";
import { dayStreaks, type DayStreak } from "@/lib/db/schema";
import {
  ASCETICISM_MILESTONES,
  milestoneForStreak,
  prevDay,
} from "@/lib/asceticism-streak";
import { dayRowsUnionSql, rowsOf } from "@/lib/day";

/**
 * Серия ведения дневника (Day Streak).
 *
 * Правила:
 * - день «осмысленный», если в нём есть хотя бы одна запись любого раздела
 *   (мысль, тренировка, обучение, созидание, питание, досуг, отметка аскезы);
 *   источник дат — тот же UNION, что и у истории (dayRowsUnionSql);
 * - серия — дни подряд по календарю назад от сегодня (сегодня без записей
 *   серию ещё не обрывает — день можно наполнить позже);
 * - полностью пустой день обрывает серию; открытие приложения серию не трогает;
 * - пороги достижений — общие с аскезами; best_milestone хранится навсегда.
 */

export const DAY_STREAK_MILESTONES = ASCETICISM_MILESTONES;

/** Текущая серия по отсортированному списку «осмысленных» дат. */
export function currentStreakFromDates(dates: string[], today: string): number {
  const set = new Set(dates);
  let cursor = set.has(today) ? today : prevDay(today);
  let streak = 0;
  while (set.has(cursor)) {
    streak += 1;
    cursor = prevDay(cursor);
  }
  return streak;
}

/** Самая длинная серия подряд по отсортированному списку дат. */
export function longestStreakFromDates(dates: string[]): number {
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of dates) {
    run = prev !== null && prevDay(d) === prev ? run + 1 : 1;
    if (run > best) best = run;
    prev = d;
  }
  return best;
}

/**
 * Дата, когда серия впервые достигла порога milestone (для хроники).
 * Возвращает null, если порог не достигнут.
 */
export function firstMilestoneDate(dates: string[], milestone: number): string | null {
  let run = 0;
  let prev: string | null = null;
  for (const d of dates) {
    run = prev !== null && prevDay(d) === prev ? run + 1 : 1;
    prev = d;
    if (run >= milestone) return d;
  }
  return null;
}

/**
 * Пересчитать и сохранить серию дневника. Якорь — дата, в которую случилось
 * изменение контента (обычно сегодня): она определяет «сейчас» при подсчёте.
 * Вызывается после каждой записи/удаления во всех разделах.
 */
export async function syncDayStreak(userId: string, anchorDate: string): Promise<DayStreak> {
  return withUserDb(userId, async (tx) => {
    const result = await tx.execute(sql`
      select distinct entry_date::text as entry_date from ${dayRowsUnionSql(userId)}
      order by entry_date
    `);
    const dates = (rowsOf(result) as Array<{ entry_date: string }>).map((r) => r.entry_date);

    const [existing] = await tx.select().from(dayStreaks).where(eq(dayStreaks.userId, userId));

    const current = currentStreakFromDates(dates, anchorDate);
    const longestRun = longestStreakFromDates(dates);
    const longest = Math.max(existing?.longestStreak ?? 0, current, longestRun);
    const bestMilestone = Math.max(existing?.bestMilestone ?? 0, milestoneForStreak(longest));
    const lastActiveDate = dates.length > 0 ? dates[dates.length - 1] : null;

    const [row] = await tx
      .insert(dayStreaks)
      .values({
        userId,
        currentStreak: current,
        longestStreak: longest,
        bestMilestone,
        lastActiveDate,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: dayStreaks.userId,
        set: { currentStreak: current, longestStreak: longest, bestMilestone, lastActiveDate, updatedAt: new Date() },
      })
      .returning();
    return row;
  });
}

export interface DayStreakView {
  /** Живая серия для отображения (0 — серии нет). */
  currentStreak: number;
  longestStreak: number;
  bestMilestone: number;
  lastActiveDate: string | null;
}

/**
 * Серия для отображения. Серия «жива», пока последний осмысленный день —
 * сегодня или вчера (та же логика, что у серий аскез). Строка создаётся
 * лениво: при первом чтении вся история пересчитывается (backfill).
 */
export async function getDayStreakView(userId: string, today: string): Promise<DayStreakView> {
  let [row] = await withUserDb(userId, (tx) => tx.select().from(dayStreaks).where(eq(dayStreaks.userId, userId)));
  if (!row) row = await syncDayStreak(userId, today);

  const alive =
    row.currentStreak > 0 && row.lastActiveDate !== null && row.lastActiveDate >= prevDay(today);
  return {
    currentStreak: alive ? row.currentStreak : 0,
    longestStreak: row.longestStreak,
    bestMilestone: row.bestMilestone,
    lastActiveDate: row.lastActiveDate,
  };
}
