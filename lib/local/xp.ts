"use client";

import { levelFromTotal, levelProgress } from "@/lib/xp";
import { localDb, LOCAL_USER_ID } from "@/lib/local/db";
import type { LocalDb } from "@/lib/local/db";
import type { LocalXpEvent, XpEventType } from "@/lib/local/types";

/**
 * Начисление опыта (полностью локальное приложение). XP-событие создаётся в
 * той же транзакции IndexedDB, что и само действие — вызывать только из
 * mutations.commit, никогда из рендера UI.
 *
 * Защита от повторной выдачи: перед созданием события проверяется sourceId —
 * якорь исходного действия. Для записей это id записи (одно создание — одно
 * событие), для дневных/аскетичных бонусов — составной ключ
 * «тип:дата»/«тип:асkeза:дата», поэтому перезагрузки, повторные сохранения
 * питания и повторные отметки одной аскезы за день не начисляют XP второй раз.
 *
 * Агрегат xpProfile — кэш суммы событий: увеличивается в транзакции,
 * пересчитывается из событий при импорте backup — расхождение невозможно,
 * истина всегда восстанавливается из xpEvents.
 */

// ---------- Размеры опыта ----------

export const XP_AMOUNTS = {
  path: 10,
  asceticism: 15,
  thought: 5,
  day: 10,
} as const;

// ---------- Тосты ----------

const XP_EVENT = "silentium:xp";

export interface XpToastDetail {
  /** Начисленные события этого действия (обычно одно; дневной бонус — второе). */
  events: Array<{ amount: number; description: string }>;
  /** Уровень после начисления, если он вырос — тост «Новый уровень». */
  newLevel: number | null;
}

/** Разбудить тостер XP (components/xp-toaster.tsx). */
export function notifyXpAwarded(detail: XpToastDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<XpToastDetail>(XP_EVENT, { detail }));
}

export function subscribeXp(listener: (detail: XpToastDetail) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (event: Event): void => {
    const detail = (event as CustomEvent<XpToastDetail>).detail;
    if (detail) listener(detail);
  };
  window.addEventListener(XP_EVENT, handler);
  return () => window.removeEventListener(XP_EVENT, handler);
}

// ---------- Начисление (внутри транзакции commit) ----------

export interface XpAwardPlan {
  type: XpEventType;
  amount: number;
  description: string;
  sourceId: string;
  entryDate: string | null;
}

/**
 * Создать XP-событие и увеличить агрегат. Возвращает созданное событие
 * (вызывающий ставит его в outbox) или null, если событие с таким sourceId
 * уже существует (действие уже принесло XP). Вызывается только внутри
 * транзакции, включающей xpEvents и xpProfile.
 */
export async function awardXpInTx(
  db: LocalDb,
  userId: string,
  plan: XpAwardPlan,
): Promise<LocalXpEvent | null> {
  const existing = await db.xpEvents.where("sourceId").equals(plan.sourceId).first();
  if (existing) return null;

  const event: LocalXpEvent = {
    id: crypto.randomUUID(),
    userId,
    entryDate: plan.entryDate,
    type: plan.type,
    amount: plan.amount,
    description: plan.description,
    sourceId: plan.sourceId,
    createdAt: new Date().toISOString(),
  };
  await db.xpEvents.add(event);

  const profile = await db.xpProfile.get(userId);
  await db.xpProfile.put({
    userId,
    totalXP: (profile?.totalXP ?? 0) + plan.amount,
    updatedAt: event.createdAt,
  });
  return event;
}

/** Общий XP внутри транзакции (для определения перехода уровня). */
export async function readTotalXpInTx(db: LocalDb, userId: string): Promise<number> {
  const profile = await db.xpProfile.get(userId);
  return profile?.totalXP ?? 0;
}

/**
 * Пересчитать агрегат из событий — источник истины. Вызывается при импорте
 * backup и при чтении, если кэш-строка отсутствует.
 */
export async function recomputeXpProfile(
  db: LocalDb,
  userId: string,
): Promise<number> {
  const events = await db.xpEvents.where("userId").equals(userId).toArray();
  const total = events.reduce((sum, e) => sum + e.amount, 0);
  await db.xpProfile.put({ userId, totalXP: total, updatedAt: new Date().toISOString() });
  return total;
}

// ---------- Чтение для UI ----------

export interface XpProfileView {
  totalXP: number;
  level: number;
  nextLevelXp: number;
  xpInLevel: number;
  xpToNext: number;
  progress: number;
}

/**
 * Профиль опыта из локальной базы (сервер не нужен). null — локальное
 * хранилище недоступно. Агрегат читается из xpProfile, но при отсутствии
 * строки пересчитывается из событий — расхождение кэша не показывает
 * неверный XP.
 */
export async function readXpProfileView(): Promise<XpProfileView | null> {
  const db = localDb();
  if (!db) return null;
  try {
    const userId = LOCAL_USER_ID;
    let profile = await db.xpProfile.get(userId);
    if (!profile || profile.totalXP < 0) {
      const total = await recomputeXpProfile(db, userId);
      profile = { userId, totalXP: total, updatedAt: new Date().toISOString() };
    }
    const { level, nextLevelXp, xpInLevel, xpToNext, progress } = levelProgress(profile.totalXP);
    return {
      totalXP: profile.totalXP,
      level,
      nextLevelXp,
      xpInLevel,
      xpToNext,
      progress,
    };
  } catch {
    return null;
  }
}

/** Последние XP-события, новые сверху (блок «Последний опыт» в Профиле). */
export async function readRecentXpEvents(limit = 5): Promise<LocalXpEvent[] | null> {
  const db = localDb();
  if (!db) return null;
  try {
    const userId = LOCAL_USER_ID;
    const rows = await db.xpEvents.where("userId").equals(userId).toArray();
    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
  } catch {
    return null;
  }
}

/** Переход уровня для тоста: уровень до и после начисления плана. */
export function levelChanged(beforeTotal: number, afterTotal: number): number | null {
  const before = levelFromTotal(beforeTotal);
  const after = levelFromTotal(afterTotal);
  return after > before ? after : null;
}
