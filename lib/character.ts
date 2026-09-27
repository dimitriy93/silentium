/**
 * Характеристики персонажа — общий чистый модуль (без рантайм-зависимостей).
 *
 * Пять характеристик (Тело, Разум, Созидание, Дисциплина, Питание) НЕ
 * хранятся: они вычисляются из XP-событий. Каждая характеристика копит свой
 * XP и проходит уровни по той же формуле, что и общий уровень (lib/xp.ts).
 *
 * Раздел события определяется типом и описанием: у событий «path»
 * (тренировки, питание, обучение, созидание) sourceId — id записи без
 * префикса раздела, поэтому единственный стабильный признак — description
 * из XP_DESCRIPTIONS (lib/xp.ts, строки записываются при начислении).
 */
import { XP_DESCRIPTIONS, levelProgress } from "@/lib/xp";

export type CharacterKey = "body" | "mind" | "creation" | "discipline" | "nutrition";

/** Порядок характеристик в интерфейсе. */
export const CHARACTERISTICS: readonly { key: CharacterKey; title: string }[] = [
  { key: "body", title: "Тело" },
  { key: "mind", title: "Разум" },
  { key: "creation", title: "Созидание" },
  { key: "discipline", title: "Дисциплина" },
  { key: "nutrition", title: "Питание" },
];

const CHARACTERISTIC_TITLES: Record<CharacterKey, string> = {
  body: "Тело",
  mind: "Разум",
  creation: "Созидание",
  discipline: "Дисциплина",
  nutrition: "Питание",
};

/**
 * Раздел XP-события или null (событие не относится ни к одной характеристике).
 * Тело — тренировки; Питание — записи питания; Разум — мысли и обучение;
 * Созидание — записи создания; Дисциплина — аскезы, дневные бонусы и серии
 * дней.
 */
export function characteristicOfXpEvent(event: {
  type: string;
  description: string;
  sourceId: string;
}): CharacterKey | null {
  switch (event.type) {
    case "thought":
      return "mind";
    case "asceticism":
    case "day":
      return "discipline";
    case "path":
      if (event.sourceId.startsWith("nutrition:") || event.description === XP_DESCRIPTIONS.nutrition) {
        return "nutrition";
      }
      if (event.description === XP_DESCRIPTIONS.training) return "body";
      if (event.description === XP_DESCRIPTIONS.learning) return "mind";
      if (event.description === XP_DESCRIPTIONS.creation) return "creation";
      return null;
    default:
      return null;
  }
}

/** XP каждой характеристики, просуммированный по событиям. */
export function sumCharacterXp(
  events: Iterable<{ type: string; description: string; sourceId: string; amount: number }>,
): Record<CharacterKey, number> {
  const xp: Record<CharacterKey, number> = {
    body: 0,
    mind: 0,
    creation: 0,
    discipline: 0,
    nutrition: 0,
  };
  for (const event of events) {
    const key = characteristicOfXpEvent(event);
    if (key) xp[key] += event.amount;
  }
  return xp;
}

export interface CharacteristicProgress {
  key: CharacterKey;
  title: string;
  /** XP характеристики. */
  xp: number;
  /** Уровень характеристики — та же формула, что и у общего уровня. */
  level: number;
}

/** Уровни характеристик из их XP (levelProgress из lib/xp.ts). */
export function characteristicProgresses(
  xp: Record<CharacterKey, number>,
): CharacteristicProgress[] {
  return CHARACTERISTICS.map(({ key }) => ({
    key,
    title: CHARACTERISTIC_TITLES[key],
    xp: xp[key],
    level: levelProgress(xp[key]).level,
  }));
}
