/**
 * Ранги пути — общий модуль клиента и сервера (без рантайм-зависимостей).
 *
 * Ранг определяется только общим уровнем и никогда не хранится как
 * самостоятельное состояние (как и уровень в lib/xp.ts). Границы ранга —
 * минимальный уровень включительно; последний ранг открыт сверху.
 */

export interface Rank {
  /** Минимальный уровень ранга (включительно). */
  minLevel: number;
  title: string;
}

/** Таблица рангов по минимальному уровню — отсортирована по возрастанию. */
export const RANKS: readonly Rank[] = [
  { minLevel: 1, title: "Странник" },
  { minLevel: 5, title: "Искатель" },
  { minLevel: 10, title: "Ученик" },
  { minLevel: 20, title: "Послушник" },
  { minLevel: 35, title: "Хранитель" },
  { minLevel: 50, title: "Наставник" },
  { minLevel: 70, title: "Магистр" },
  { minLevel: 100, title: "Архонт" },
  { minLevel: 150, title: "Возвышенный" },
  { minLevel: 250, title: "Безмолвный" },
];

/** Ранг по общему уровню (минимальный уровень 1). */
export function getRank(level: number): Rank {
  let rank = RANKS[0];
  for (const r of RANKS) {
    if (level >= r.minLevel) rank = r;
    else break;
  }
  return rank;
}

/** Название ранга по общему уровню. */
export function getRankTitle(level: number): string {
  return getRank(level).title;
}
