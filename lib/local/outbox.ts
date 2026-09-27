"use client";

import { SNAPSHOT_META_KEY, localDb } from "@/lib/local/db";
import type { OutboxEntity, OutboxEntry, OutboxOp, PushOpResult } from "@/lib/local/outbox-types";

/**
 * Очередь исходящих операций (этап 2, docs/offline-write-sync-design.md,
 * разделы 3 и 5): постановка, чтение, статусы, батч для push, dead letter.
 *
 * Подтверждённые операции удаляются (статус done не хранится). Порядок
 * применения задаётся автоинкрементом seq — порядком вставки.
 */

/** После стольких неудачных попыток операция ждёт ручного «Повторить». */
export const MAX_ATTEMPTS = 10;
/** Операций в одном push-батче (остальные — в следующий заход). */
export const PUSH_BATCH_SIZE = 50;

const OP_BACKOFF_BASE_MS = 60_000;
const OP_BACKOFF_MAX_MS = 3_600_000;

// ---------- Событие «очередь изменилась» ----------

const OUTBOX_EVENT = "silentium:outbox";

/** Разбудить SyncProvider: пересчитать счётчики, перечитать экраны, запланировать push. */
export function notifyOutboxChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(OUTBOX_EVENT));
}

export function subscribeOutbox(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(OUTBOX_EVENT, listener);
  return () => window.removeEventListener(OUTBOX_EVENT, listener);
}

// ---------- Чтение состояния ----------

/** Пользователь последнего снапшота — владелец локальных операций. */
export async function cachedUserId(): Promise<string | null> {
  const db = localDb();
  if (!db) return null;
  try {
    const meta = await db.meta.get(SNAPSHOT_META_KEY);
    return meta?.userId ?? null;
  } catch {
    return null;
  }
}

export interface OutboxStats {
  /** Ждут отправки (pending + sending). */
  pending: number;
  failed: number;
}

export async function outboxStats(): Promise<OutboxStats> {
  const db = localDb();
  if (!db) return { pending: 0, failed: 0 };
  try {
    const rows = await db.outbox.toArray();
    let pending = 0;
    let failed = 0;
    for (const r of rows) {
      if (r.status === "failed") failed += 1;
      else pending += 1;
    }
    return { pending, failed };
  } catch {
    return { pending: 0, failed: 0 };
  }
}

/** Операции dead letter (пользовательские действия: «Повторить» / «Удалить»). */
export async function listFailedOps(): Promise<OutboxEntry[]> {
  const db = localDb();
  if (!db) return [];
  try {
    const rows = await db.outbox.where("status").equals("failed").toArray();
    return rows.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  } catch {
    return [];
  }
}

/** rowId записей сущности, ещё не подтверждённые сервером — для меток на записях. */
export async function pendingRowIds(entity: OutboxEntity): Promise<Set<string>> {
  const db = localDb();
  if (!db) return new Set();
  try {
    const rows = await db.outbox.where("entity").equals(entity).toArray();
    return new Set(
      rows.filter((r) => r.status === "pending" || r.status === "sending").map((r) => r.rowId),
    );
  } catch {
    return new Set();
  }
}

// ---------- Постановка и жизненный цикл ----------

/** Новая операция в очередь (без применения к кешу — тот пишет mutations.ts). */
export async function addOutboxOp(
  op: Omit<OutboxEntry, "seq" | "status" | "attempts" | "lastAttemptAt" | "error">,
): Promise<void> {
  const db = localDb();
  if (!db) throw new Error("Локальное хранилище недоступно");
  await db.outbox.add({
    ...op,
    status: "pending",
    attempts: 0,
    lastAttemptAt: null,
    error: null,
  });
}

/**
 * Собрать батч для push: pending/failed в порядке seq, кроме dead letter
 * (attempts ≥ MAX) и операций, чей персональный backoff не истёк. Чужие
 * операции (смена пользователя) выбрасываются и удаляются. Батч помечается
 * status = sending.
 */
export async function takePushBatch(userId: string): Promise<OutboxEntry[]> {
  const db = localDb();
  if (!db) return [];
  try {
    return await db.transaction("rw", db.outbox, async () => {
      const all = (await db.outbox.toArray()).sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
      const now = Date.now();
      const batch: OutboxEntry[] = [];
      for (const entry of all) {
        if (!entry.seq) continue;
        if (entry.userId !== userId) {
          // Операция другого пользователя после смены аккаунта смысла не имеет.
          await db.outbox.delete(entry.seq);
          continue;
        }
        if (entry.status === "sending") continue; // гонка второй вкладки
        if (entry.status === "failed") {
          if (entry.attempts >= MAX_ATTEMPTS) continue; // dead letter: только вручную
          const nextTry = entry.lastAttemptAt
            ? Date.parse(entry.lastAttemptAt) + opBackoffMs(entry.attempts)
            : 0;
          if (now < nextTry) continue;
        }
        await db.outbox.update(entry.seq, { status: "sending" });
        batch.push({ ...entry, status: "sending" });
        if (batch.length >= PUSH_BATCH_SIZE) break;
      }
      return batch;
    });
  } catch {
    return [];
  }
}

function opBackoffMs(attempts: number): number {
  return Math.min(OP_BACKOFF_BASE_MS * 2 ** Math.max(0, attempts - 1), OP_BACKOFF_MAX_MS);
}

function toWire(entry: OutboxEntry): OutboxOp {
  return {
    opId: entry.opId,
    userId: entry.userId,
    entity: entry.entity,
    op: entry.op,
    rowId: entry.rowId,
    payload: entry.payload,
    createdAt: entry.createdAt,
  };
}

/** Операции батча в формате для pushOutbox. */
export function batchToWire(batch: OutboxEntry[]): OutboxOp[] {
  return batch.map(toWire);
}

/** Пооперационные результаты push: ok → удалить из очереди; ошибка → failed. */
export async function applyPushResults(
  batch: OutboxEntry[],
  results: PushOpResult[],
): Promise<number> {
  const db = localDb();
  if (!db) return 0;
  const byOpId = new Map(batch.map((e) => [e.opId, e]));
  const answered = new Set(results.map((r) => r.opId));
  const nowIso = new Date().toISOString();
  let applied = 0;
  try {
    await db.transaction("rw", db.outbox, async () => {
      for (const r of results) {
        const entry = byOpId.get(r.opId);
        if (!entry?.seq) continue;
        if (r.ok) {
          await db.outbox.delete(entry.seq);
          applied += 1;
        } else {
          await db.outbox.update(entry.seq, {
            status: "failed",
            attempts: entry.attempts + 1,
            lastAttemptAt: nowIso,
            error: r.error ?? "Неизвестная ошибка",
          });
        }
      }
      // Операции без ответа (обрыв после применения) — обратно в pending:
      // рано или поздно уйдут повторно, повтор безопасен (идемпотентность).
      for (const entry of batch) {
        if (entry.seq && !answered.has(entry.opId)) {
          await db.outbox.update(entry.seq, { status: "pending", lastAttemptAt: nowIso });
        }
      }
    });
  } catch {
    // Очередь недоступна — статус не критичен, повтор будет после перезагрузки.
  }
  return applied;
}

/**
 * Сетевой сбой батча целиком / застрявшие после закрытия вкладки:
 * все sending → pending (backoff удерживает раннер от немедленного повтора).
 */
export async function revertSendingToPending(): Promise<void> {
  const db = localDb();
  if (!db) return;
  try {
    await db.outbox.where("status").equals("sending").modify({ status: "pending" });
  } catch {
    // повтор после перезагрузки
  }
}

/** Ручной «Повторить» для dead letter: свежая серия попыток. */
export async function retryOutboxOp(opId: string): Promise<void> {
  const db = localDb();
  if (!db) return;
  try {
    await db.outbox.where("opId").equals(opId).modify({
      status: "pending",
      attempts: 0,
      lastAttemptAt: null,
      error: null,
    });
  } catch {
    // игнорируем: операция остаётся в dead letter
  }
}

/** Ручной «Удалить» для dead letter: операция снимается, кеш исправит снапшот. */
export async function discardOutboxOp(opId: string): Promise<void> {
  const db = localDb();
  if (!db) return;
  try {
    await db.outbox.where("opId").equals(opId).delete();
  } catch {
    // игнорируем
  }
}

/** Очистка очереди (смена пользователя / выход из аккаунта). */
export async function clearOutbox(): Promise<void> {
  const db = localDb();
  if (!db) return;
  try {
    await db.outbox.clear();
  } catch {
    // игнорируем
  }
}

/**
 * Локальная очистка при выходе из аккаунта: очередь и метаданные снапшота.
 * Журнальный кеш пересоздаётся следующим снапшотом; при входе другого
 * пользователя writeSnapshot стирает его принудительно.
 */
export async function clearLocalSession(): Promise<void> {
  const db = localDb();
  if (!db) return;
  try {
    await db.transaction("rw", [db.outbox, db.meta], async () => {
      await db.outbox.clear();
      await db.meta.clear();
    });
  } catch {
    // лучший результат из возможного; чужой кеш стирает writeSnapshot
  }
}
