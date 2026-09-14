/**
 * Настроение аватара — производное от числа записанных активностей за день.
 * Модель изолирована, чтобы в будущем учитывать больше сигналов.
 */

export type Mood = "happy" | "neutral" | "concerned";

export function moodForActivityCount(count: number): Mood {
  if (count >= 2) return "happy";
  if (count === 1) return "neutral";
  return "concerned";
}

/** Число активностей дня по данным Пути (уже загруженным на «Сегодня»). */
export function activityCountOfDay(day: {
  training: unknown[];
  nutrition: unknown;
  learning: unknown[];
  creation: unknown[];
}): number {
  return (
    day.training.length +
    (day.nutrition != null ? 1 : 0) +
    day.learning.length +
    day.creation.length
  );
}
