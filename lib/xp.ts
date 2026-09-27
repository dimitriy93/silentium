/**
 * Формула опыта и уровней — общий модуль клиента и сервера (без рантайм-зависимостей).
 *
 * XP накопительный: порог уровня L — floor(100 × L^1.6) единиц ОБЩЕГО XP.
 * Уровень вычисляется из totalXP, никогда не хранится как самостоятельное
 * состояние (кэш допускается, истина — totalXP).
 *
 * Уровень 1 — стартовый (0 XP): формула задаёт пороги уровней ≥ 2, поэтому
 * первый переход (1 → 2) происходит на 100 × 2^1.6 ≈ 303 XP.
 */

/**
 * Описания XP-событий. Единый источник строк: записываются в событие при
 * начислении (lib/local/mutations.ts) и служат признаком раздела для
 * характеристик персонажа (lib/character.ts) — менять только вместе.
 */
export const XP_DESCRIPTIONS = {
  thought: "Записана мысль",
  training: "Тренировка",
  nutrition: "Питание",
  learning: "Обучение",
  creation: "Созидание",
  asceticism: "Выполнена аскеза",
  day: "День продолжен",
} as const;

/** Порог общего XP для достижения уровня L (L ≥ 2 как граница перехода). */
export function requiredXp(level: number): number {
  return Math.floor(100 * Math.pow(level, 1.6));
}

/** Уровень из общего XP: наибольший L, порог которого достигнут (минимум 1). */
export function levelFromTotal(totalXp: number): number {
  let level = 1;
  while (requiredXp(level + 1) <= totalXp) level += 1;
  return level;
}

export interface LevelProgress {
  level: number;
  /** Общий накопленный XP (истина, из которой вычислен уровень). */
  totalXp: number;
  /** Порог общего XP следующего уровня. */
  nextLevelXp: number;
  /** XP внутри текущего уровня. */
  xpInLevel: number;
  /** Сколько XP осталось до следующего уровня. */
  xpToNext: number;
  /** Прогресс текущего уровня, 0..1. */
  progress: number;
}

/** Прогресс уровня по общему XP (все числа вычисляются, ничего не хардкодится). */
export function levelProgress(totalXp: number): LevelProgress {
  const level = levelFromTotal(totalXp);
  const base = level === 1 ? 0 : requiredXp(level);
  const next = requiredXp(level + 1);
  const span = next - base;
  return {
    level,
    totalXp,
    nextLevelXp: next,
    xpInLevel: totalXp - base,
    xpToNext: next - totalXp,
    progress: span > 0 ? Math.min(1, Math.max(0, (totalXp - base) / span)) : 1,
  };
}
