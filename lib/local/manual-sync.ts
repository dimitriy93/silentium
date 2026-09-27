"use client";

import { pushOutbox } from "@/actions/sync";
import { pullSnapshot } from "@/actions/snapshot";
import {
  applyPushResults,
  batchToWire,
  cachedUserId,
  notifyOutboxChanged,
  revertSendingToPending,
  takePushBatch,
} from "@/lib/local/outbox";
import { SNAPSHOT_META_KEY, journalTables, localDb } from "@/lib/local/db";
import { writeSnapshot } from "@/lib/local/writes";

/**
 * Ручная синхронизация (Local First): единственный канал общения с сервером —
 * явная команда пользователя в Профиле. Никаких таймеров, слушателей сети
 * и фоновых попыток.
 *
 * Сравнение версий — по дате последнего изменения данных. С обеих сторон это
 * максимум created_at/updated_at по журнальным таблицам, поэтому после
 * завершённой синхронизации даты совпадают байт в байт: снапшот копирует
 * серверные метки, push создаёт серверные строки с клиентскими.
 */

/** Дата последнего изменения локальных данных (null — база пуста). */
export async function getLastLocalChange(): Promise<string | null> {
  const db = localDb();
  if (!db) return null;
  try {
    //Holder вместо простой переменной: даты пишутся из циклов, TypeScript
    //иначе сужает тип до null.
    const state: { newest: string | null } = { newest: null };
    const touch = (value: unknown) => {
      if (typeof value !== "string") return;
      if (state.newest === null || value.localeCompare(state.newest) > 0) state.newest = value;
    };
    const meta = await db.meta.get(SNAPSHOT_META_KEY);
    if (!meta) return null; // база не заведена — сравнивать не с чем
    for (const table of journalTables(db)) {
      for (const row of (await table.toArray()) as Record<string, unknown>[]) {
        touch(row.createdAt);
        touch(row.updatedAt);
      }
    }
    // Несинхронизированные операции очереди — тоже локальные изменения.
    for (const op of await db.outbox.toArray()) {
      if (op.status !== "failed") touch(op.createdAt);
    }
    return state.newest;
  } catch {
    return null;
  }
}

/**
 * Отправить локальные изменения на сервер и забрать актуальный снапшот.
 * Возвращает "empty", если отправлять нечего (очередь пуста).
 */
export async function pushLocal(): Promise<"applied" | "empty" | "auth" | "error"> {
  const userId = await cachedUserId();
  if (!userId) return "error";
  await revertSendingToPending();
  let applied = 0;
  for (;;) {
    const batch = await takePushBatch(userId);
    if (batch.length === 0) break;
    try {
      const res = await pushOutbox(batchToWire(batch));
      if (!res.ok) return res.error === "Требуется авторизация" ? "auth" : "error";
      applied += await applyPushResults(batch, res.data);
    } catch {
      await revertSendingToPending();
      return "error";
    }
  }
  // После отправки забираем снапшот: серверные пересчёты (серии) и метка
  // pulledAt приводят обе стороны к общему состоянию.
  const pulled = await pullIntoLocal();
  if (!pulled) return "error";
  notifyOutboxChanged();
  return applied > 0 ? "applied" : "empty";
}

/** Загрузить снапшот сервера в локальную базу (несинхронизированные записи переживают его). */
export async function pullIntoLocal(): Promise<boolean> {
  try {
    const res = await pullSnapshot();
    if (!res.ok) return false;
    const written = await writeSnapshot(res.data);
    if (written) notifyOutboxChanged();
    return written;
  } catch {
    return false;
  }
}
