/**
 * Чистая математика серии дневника — без обращений к БД, чтобы её можно
 * было использовать в клиентских модулях (lib/local/streaks.ts).
 *
 * Правила:
 * - день «осмысленный», если в нём есть хотя бы одна запись любого раздела
 *   (мысль, тренировка, обучение, созидание, питание, досуг, отметка аскезы);
 * - серия — дни подряд по календарю назад от сегодня (сегодня без записей
 *   серию ещё не обрывает — день можно наполнить позже);
 * - полностью пустой день обрывает серию; открытие приложения серию не трогает.
 */
import { prevDay } from "@/lib/asceticism-streak";

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
