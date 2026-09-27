"use client";

import {
  characteristicProgresses,
  sumCharacterXp,
  type CharacteristicProgress,
} from "@/lib/character";
import { levelProgress } from "@/lib/xp";
import { localDb } from "@/lib/local/db";
import { cachedUserId } from "@/lib/local/outbox";

/**
 * Персонаж (Local First): уровень, XP и характеристики вычисляются из
 * локальных XP-событий — на сервер ничего не читается и не пишется.
 *
 * Кэш вычисления: xpEvents читаются целиком только когда изменился агрегат
 * xpProfile (тот же отпечаток, которым живёт XP-блок) — при обычном чтении
 * и переключении вкладок возвращается готовый результат, полной выборки не
 * происходит. Отпечаток надёжен: агрегат обновляется в той же транзакции,
 * что и события, и пересчитывается из событий после снапшота; смена
 * пользователя меняет userId в отпечатке.
 */

export interface CharacterView {
  /** Общий XP (сумма событий — та же истина, что у xpProfile). */
  totalXp: number;
  level: number;
  nextLevelXp: number;
  xpInLevel: number;
  xpToNext: number;
  progress: number;
  characteristics: CharacteristicProgress[];
}

interface CharacterCache {
  fingerprint: string;
  view: CharacterView;
}

let cache: CharacterCache | null = null;

/** Вычислить представление из событий (вызывается только при смене отпечатка). */
function buildView(
  events: Array<{ type: string; description: string; sourceId: string; amount: number }>,
): CharacterView {
  const totalXp = events.reduce((sum, e) => sum + e.amount, 0);
  return {
    ...levelProgress(totalXp),
    characteristics: characteristicProgresses(sumCharacterXp(events)),
  };
}

/**
 * Персонаж из локальной базы. null — локальное хранилище или пользователь
 * ещё не готовы (кеш не гидратирован).
 */
export async function readCharacterView(): Promise<CharacterView | null> {
  const db = localDb();
  if (!db) return null;
  try {
    const userId = await cachedUserId();
    if (!userId) return null;
    const profile = await db.xpProfile.get(userId);
    const fingerprint = profile
      ? `${userId}:${profile.totalXP}:${profile.updatedAt}`
      : `${userId}:none`;
    if (cache && cache.fingerprint === fingerprint) return cache.view;

    const events = await db.xpEvents.where("userId").equals(userId).toArray();
    const view = buildView(events);
    if (profile) cache = { fingerprint, view };
    return view;
  } catch {
    return null;
  }
}
