/**
 * Чистая математика серий аскез — без обращений к БД, чтобы её можно было
 * использовать и на сервере (lib/asceticism.ts), и в клиентских компонентах.
 *
 * Правила серии:
 * - день считается только со статусом 'done';
 * - 'failed' или пропущенный день (нет отметки) обрывает серию;
 * - сегодня без отметки серию ещё не обрывает — её можно отметить позже.
 */

/** Пороги достижений серии. */
export const ASCETICISM_MILESTONES = [
  1, 3, 7, 10, 14, 21, 30, 50, 75, 100, 150, 200, 365, 500, 1000,
] as const;

/** Предыдущий день для даты YYYY-MM-DD (календарная арифметика в UTC). */
export function prevDay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Текущая серия: сколько дней 'done' подряд идёт назад от today
 * (сегодня без отметки — стартуем со вчера). Дни раньше startDate
 * не учитываются.
 */
export function computeCurrentStreak(
  logs: { entryDate: string; status: string }[],
  startDate: string,
  today: string,
): number {
  const byDate = new Map(logs.map((l) => [l.entryDate, l.status]));
  let cursor = byDate.get(today) === "done" ? today : prevDay(today);
  let streak = 0;
  while (cursor >= startDate) {
    if (byDate.get(cursor) !== "done") break;
    streak += 1;
    cursor = prevDay(cursor);
  }
  return streak;
}

/** Наибольший достигнутый порог серии, 0 — порогов ещё нет. */
export function milestoneForStreak(streak: number): number {
  let milestone = 0;
  for (const m of ASCETICISM_MILESTONES) {
    if (m <= streak) milestone = m;
    else break;
  }
  return milestone;
}

/**
 * Самая длинная серия 'done' подряд в истории отметок (дни должны быть
 * соседними по календарю). Нужна для backfill: достижение считается по
 * всему прошлому, а не только по текущей серии.
 */
export function computeLongestStreak(
  logs: { entryDate: string; status: string }[],
): number {
  const done = [...new Set(logs.filter((l) => l.status === "done").map((l) => l.entryDate))].sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of done) {
    run = prev !== null && prevDay(d) === prev ? run + 1 : 1;
    if (run > best) best = run;
    prev = d;
  }
  return best;
}

/**
 * Серия для отображения: сохранённая серия «жива», только пока последний
 * 'done' — сегодня или вчера (иначе серия уже прервана пропусками).
 */
export function displayStreak(
  streak: { currentStreak: number; lastDoneDate: string | null },
  today: string,
): number {
  if (streak.currentStreak <= 0 || streak.lastDoneDate === null) return 0;
  return streak.lastDoneDate >= prevDay(today) ? streak.currentStreak : 0;
}

/** «1 день» / «3 дня» / «50 дней» — для подписей достижений. */
export function pluralDays(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} день`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} дня`;
  return `${n} дней`;
}
