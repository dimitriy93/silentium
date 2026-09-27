"use client";

import { journalTables, localDb, LOCAL_USER_ID, type LocalDb } from "@/lib/local/db";
import { applyOpToCache, type LocalEntity, type LocalOpType } from "@/lib/local/apply";
import { notifyLocalChanged } from "@/lib/local/events";
import { syncLocalAsceticismStreak, syncLocalDayStreak } from "@/lib/local/streaks";
import {
  XP_AMOUNTS,
  awardXpInTx,
  levelChanged,
  notifyXpAwarded,
  readTotalXpInTx,
  type XpAwardPlan,
  type XpToastDetail,
} from "@/lib/local/xp";
import { XP_DESCRIPTIONS } from "@/lib/xp";
import { todayLocalDate } from "@/lib/format";

/**
 * Единый путь пользовательских мутаций (полностью локальное приложение):
 * локальное изменение журнальных таблиц, XP-событие и пересчёт серий — одна
 * транзакция IndexedDB, затем уведомление LocalProvider (экраны перечитывают
 * локальную базу). Сервер не участвует: данные живут и умирают на устройстве.
 *
 * UUID новой строки генерируется здесь; клиентский createdAt сохраняет
 * существующую сортировку (внутри дня — по времени создания).
 *
 * XP начисляется в момент успешного локального действия, в той же транзакции
 * (см. lib/local/xp.ts): событие + агрегат атомарны с самой записью. Дневной
 * бонус +10 — когда запись первая за день (те же разделы, что у серии
 * дневника) и за эту дату бонус ещё не выдавался.
 */

export type MutationResult = { ok: true } | { ok: false; error: string };

// ---------- XP: планы начисления ----------

/** Действия, добавляющие контент дня (для дневного бонуса и серии дневника). */
const DAY_CONTENT_ENTITIES = new Set<LocalEntity>([
  "thought",
  "training",
  "nutrition",
  "learning",
  "creation",
  "leisure",
  "asceticismLog",
]);

/**
 * XP-план действия или null (не начисляется). sourceId — якорь защиты от
 * повторной выдачи: id записи для «созданий», составной ключ для
 * перезаписываемых сущностей (питание — одна строка на день, отметка аскезы —
 * одна на аскезу и день).
 */
function xpPlanFor(
  entity: LocalEntity,
  op: LocalOpType,
  payload: Record<string, unknown> | null,
): XpAwardPlan | null {
  const v = payload ?? {};
  const entryDate = typeof v.entryDate === "string" ? v.entryDate : null;
  switch (`${entity}:${op}`) {
    case "thought:create":
      return {
        type: "thought",
        amount: XP_AMOUNTS.thought,
        description: XP_DESCRIPTIONS.thought,
        sourceId: typeof v.id === "string" ? v.id : "",
        entryDate,
      };
    case "training:create":
      return {
        type: "path",
        amount: XP_AMOUNTS.path,
        description: XP_DESCRIPTIONS.training,
        sourceId: typeof v.id === "string" ? v.id : "",
        entryDate,
      };
    case "learning:create":
      return {
        type: "path",
        amount: XP_AMOUNTS.path,
        description: XP_DESCRIPTIONS.learning,
        sourceId: typeof v.id === "string" ? v.id : "",
        entryDate,
      };
    case "creation:create":
      return {
        type: "path",
        amount: XP_AMOUNTS.path,
        description: XP_DESCRIPTIONS.creation,
        sourceId: typeof v.id === "string" ? v.id : "",
        entryDate,
      };
    case "nutrition:upsert":
      return {
        type: "path",
        amount: XP_AMOUNTS.path,
        description: XP_DESCRIPTIONS.nutrition,
        sourceId: `nutrition:${entryDate ?? ""}`,
        entryDate,
      };
    case "asceticismLog:upsert":
      if (v.status !== "done") return null; // 'failed' и снятие отметки — не выполнение
      return {
        type: "asceticism",
        amount: XP_AMOUNTS.asceticism,
        description: XP_DESCRIPTIONS.asceticism,
        sourceId: `asceticismDone:${String(v.asceticismId)}:${entryDate ?? ""}`,
        entryDate,
      };
    default:
      return null;
  }
}

/** Дневной бонус: действие добавляет первый контент дня (проверка — до записи). */
function dayPlanFor(
  entity: LocalEntity,
  op: LocalOpType,
  payload: Record<string, unknown> | null,
): { entryDate: string } | null {
  if (op !== "create" && op !== "upsert") return null;
  if (!DAY_CONTENT_ENTITIES.has(entity)) return null;
  const v = payload ?? {};
  if (entity === "asceticismLog" && v.status === "none") return null;
  const entryDate = typeof v.entryDate === "string" ? v.entryDate : null;
  if (!entryDate) return null;
  return { entryDate };
}

/** Есть ли уже записи за дату (те же разделы, что у серии дневника). */
async function dayHasEntries(db: LocalDb, entryDate: string): Promise<boolean> {
  const counts = await Promise.all([
    db.thoughts.where("entryDate").equals(entryDate).count(),
    db.training.where("entryDate").equals(entryDate).count(),
    db.nutrition.where("entryDate").equals(entryDate).count(),
    db.learning.where("entryDate").equals(entryDate).count(),
    db.creation.where("entryDate").equals(entryDate).count(),
    db.leisure.where("entryDate").equals(entryDate).count(),
    db.asceticismLogs.where("entryDate").equals(entryDate).count(),
  ]);
  return counts.some((n) => n > 0);
}

async function commit(
  entity: LocalEntity,
  op: LocalOpType,
  rowId: string,
  payload: Record<string, unknown> | null,
): Promise<MutationResult> {
  const db = localDb();
  if (!db) return { ok: false, error: "Локальное хранилище недоступно" };
  const userId = LOCAL_USER_ID;
  const plan = xpPlanFor(entity, op, payload);
  const dayPlan = dayPlanFor(entity, op, payload);
  let toast: XpToastDetail | null = null;
  try {
    await db.transaction(
      "rw",
      [...journalTables(db), db.xpProfile],
      async () => {
        const dayWasEmpty = dayPlan ? !(await dayHasEntries(db, dayPlan.entryDate)) : false;
        await applyOpToCache(db, { entity, op, rowId, payload }, userId);

        // Пересчёт серий — в той же транзакции (раньше это делал сервер,
        // результат приходил со снапшотом).
        if (DAY_CONTENT_ENTITIES.has(entity)) {
          const v = payload ?? {};
          const entryDate = typeof v.entryDate === "string" ? v.entryDate : null;
          // Создания считаются от даты записи, удаления — от сегодня
          // (зеркало прежнего серверного syncDayStreak).
          await syncLocalDayStreak(db, op === "delete" || !entryDate ? todayLocalDate() : entryDate);
        }
        if (entity === "asceticismLog" && op === "upsert") {
          const logPayload = payload ?? {};
          const asceticismId = typeof logPayload.asceticismId === "string" ? logPayload.asceticismId : null;
          const logDate = typeof logPayload.entryDate === "string" ? logPayload.entryDate : null;
          if (asceticismId && logDate) {
            await syncLocalAsceticismStreak(db, asceticismId, logDate);
          }
        }

        if (!plan && !dayPlan) return;
        const events: XpToastDetail["events"] = [];
        const beforeTotal = await readTotalXpInTx(db, userId);
        let awardedSum = 0;
        if (plan) {
          const event = await awardXpInTx(db, userId, plan);
          if (event) {
            awardedSum += event.amount;
            events.push({ amount: event.amount, description: event.description });
          }
        }
        if (dayPlan && dayWasEmpty) {
          const dayAward: XpAwardPlan = {
            type: "day",
            amount: XP_AMOUNTS.day,
            description: XP_DESCRIPTIONS.day,
            sourceId: `day:${dayPlan.entryDate}`,
            entryDate: dayPlan.entryDate,
          };
          const event = await awardXpInTx(db, userId, dayAward);
          if (event) {
            awardedSum += event.amount;
            events.push({ amount: event.amount, description: event.description });
          }
        }
        if (awardedSum > 0) {
          toast = {
            events,
            newLevel: levelChanged(beforeTotal, beforeTotal + awardedSum),
          };
        }
      },
    );
  } catch (error) {
    console.error("[local] mutation commit failed", error);
    return { ok: false, error: "Не удалось сохранить запись на устройстве" };
  }
  if (toast) notifyXpAwarded(toast);
  notifyLocalChanged();
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
