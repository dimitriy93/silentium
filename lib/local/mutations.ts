"use client";

import { journalTables, localDb } from "@/lib/local/db";
import { applyOpToCache } from "@/lib/local/apply";
import { addOutboxOp, cachedUserId, notifyOutboxChanged } from "@/lib/local/outbox";
import type { OutboxEntity, OutboxOpType } from "@/lib/local/outbox-types";

/**
 * Единый путь пользовательских мутаций (Local First): локальное изменение
 * кеша и постановка в outbox — одна транзакция IndexedDB, затем уведомление
 * SyncProvider (экраны перечитывают локальную базу). На сервер ничего не
 * уходит автоматически — отправка только вручную из Профиля.
 *
 * UUID новой строки генерируется здесь, до постановки в очередь; клиентский
 * createdAt сохраняет существующую сортировку (внутри дня — по времени
 * создания). Операция требует хотя бы одной гидратации базы: без неё
 * неизвестен userId (после входа база один раз наполняется снапшотом).
 */

export type MutationResult = { ok: true } | { ok: false; error: string };

async function commit(
  entity: OutboxEntity,
  op: OutboxOpType,
  rowId: string,
  payload: Record<string, unknown> | null,
): Promise<MutationResult> {
  const db = localDb();
  if (!db) return { ok: false, error: "Локальное хранилище недоступно" };
  const userId = await cachedUserId();
  if (!userId) {
    return { ok: false, error: "Локальные данные не готовы — синхронизируйте в Профиле" };
  }
  try {
    await db.transaction("rw", [...journalTables(db), db.outbox], async () => {
      await applyOpToCache(db, { entity, op, rowId, payload }, userId);
      await addOutboxOp({
        opId: crypto.randomUUID(),
        userId,
        entity,
        op,
        rowId,
        payload,
        createdAt: new Date().toISOString(),
      });
    });
  } catch (error) {
    console.error("[local] mutation commit failed", error);
    return { ok: false, error: "Не удалось сохранить запись на устройстве" };
  }
  notifyOutboxChanged();
  return { ok: true };
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Экранные операции. Имена сознательно близки к прежним Server Actions —
 * замена в компонентах механическая.
 */
export const writes = {
  // ---------- Мысли ----------
  addThought(entryDate: string, content: string): Promise<MutationResult> {
    const id = crypto.randomUUID();
    return commit("thought", "create", id, { id, entryDate, content, createdAt: nowIso() });
  },
  updateThought(id: string, content: string): Promise<MutationResult> {
    return commit("thought", "update", id, { id, content, clientUpdatedAt: nowIso() });
  },
  deleteThought(id: string): Promise<MutationResult> {
    return commit("thought", "delete", id, null);
  },

  // ---------- Путь: Огонь ----------
  addTraining(
    entryDate: string,
    title: string,
    detail: string | null,
    durationMinutes: number | null,
  ): Promise<MutationResult> {
    const id = crypto.randomUUID();
    return commit("training", "create", id, {
      id,
      entryDate,
      title,
      detail,
      durationMinutes,
      createdAt: nowIso(),
    });
  },
  deleteTraining(id: string): Promise<MutationResult> {
    return commit("training", "delete", id, null);
  },

  // ---------- Путь: Вода (одна запись на день) ----------
  saveNutrition(
    entryDate: string,
    values: {
      calories: number | null;
      proteinGrams: number | null;
      fatGrams: number | null;
      carbsGrams: number | null;
      note: string | null;
    },
  ): Promise<MutationResult> {
    const id = crypto.randomUUID();
    return commit("nutrition", "upsert", id, {
      id,
      entryDate,
      ...values,
      clientUpdatedAt: nowIso(),
    });
  },

  // ---------- Путь: Воздух / Земля ----------
  addLearning(entryDate: string, content: string): Promise<MutationResult> {
    const id = crypto.randomUUID();
    return commit("learning", "create", id, { id, entryDate, content, createdAt: nowIso() });
  },
  deleteLearning(id: string): Promise<MutationResult> {
    return commit("learning", "delete", id, null);
  },
  addCreation(entryDate: string, content: string): Promise<MutationResult> {
    const id = crypto.randomUUID();
    return commit("creation", "create", id, { id, entryDate, content, createdAt: nowIso() });
  },
  deleteCreation(id: string): Promise<MutationResult> {
    return commit("creation", "delete", id, null);
  },

  // ---------- Развлечения ----------
  addLeisure(entryDate: string, title: string, minutes: number | null): Promise<MutationResult> {
    const id = crypto.randomUUID();
    return commit("leisure", "create", id, {
      id,
      entryDate,
      title,
      minutes,
      notes: null,
      createdAt: nowIso(),
    });
  },
  deleteLeisure(id: string): Promise<MutationResult> {
    return commit("leisure", "delete", id, null);
  },

  // ---------- Аскезы ----------
  addAsceticism(title: string, description: string | null, startDate: string): Promise<MutationResult> {
    const id = crypto.randomUUID();
    return commit("asceticism", "create", id, {
      id,
      title,
      description,
      startDate,
      createdAt: nowIso(),
    });
  },
  updateAsceticism(
    id: string,
    values: { title?: string; description?: string | null; isActive?: boolean },
  ): Promise<MutationResult> {
    return commit("asceticism", "update", id, { ...values, clientUpdatedAt: nowIso() });
  },
  deleteAsceticism(id: string): Promise<MutationResult> {
    return commit("asceticism", "delete", id, null);
  },
  /** Отметка за день: 'done' | 'failed' | 'none' (снять отметку). */
  setAsceticismLog(
    asceticismId: string,
    entryDate: string,
    status: "done" | "failed" | "none",
  ): Promise<MutationResult> {
    const id = crypto.randomUUID();
    return commit("asceticismLog", "upsert", id, {
      id,
      asceticismId,
      entryDate,
      status,
      clientUpdatedAt: nowIso(),
    });
  },
};
