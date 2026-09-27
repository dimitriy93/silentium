"use client";

import { todayLocalDate } from "@/lib/format";
import type { LocalDb } from "@/lib/local/db";

/**
 * Применение пользовательской операции к журнальным таблицам локальной базы.
 * Вызывается из мутаций (lib/local/mutations.ts): запись появляется в
 * IndexedDB в момент действия — мгновенно и без сети.
 *
 * Строки строятся из payload (полное состояние) + userId; клиентские метки
 * времени играют роль created/updated.
 */

/** Тип сущности локальной операции. */
export type LocalEntity =
  | "thought"
  | "training"
  | "nutrition"
  | "learning"
  | "creation"
  | "leisure"
  | "asceticism"
  | "asceticismLog";

/** Тип операции над сущностью. */
export type LocalOpType = "create" | "update" | "delete" | "upsert";

/** Операция мутации: сущность, действие, id строки и полный payload. */
export interface LocalOp {
  entity: LocalEntity;
  op: LocalOpType;
  rowId: string;
  payload: Record<string, unknown> | null;
}

function fields(entry: Pick<LocalOp, "payload">): Record<string, unknown> {
  return entry.payload ?? {};
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function numOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Применить одну операцию к кешу (внутри транзакции вызывающего). */
export async function applyOpToCache(
  db: LocalDb,
  entry: Pick<LocalOp, "entity" | "op" | "rowId" | "payload">,
  userId: string,
): Promise<void> {
  const v = fields(entry);
  switch (entry.entity) {
    case "thought": {
      if (entry.op === "create") {
        await db.thoughts.put({
          id: entry.rowId,
          userId,
          entryDate: str(v.entryDate),
          content: str(v.content),
          createdAt: str(v.createdAt),
          updatedAt: str(v.updatedAt, str(v.createdAt)),
        } as Parameters<typeof db.thoughts.put>[0]);
        return;
      }
      if (entry.op === "update") {
        const row = await db.thoughts.get(entry.rowId);
        if (row) {
          await db.thoughts.put({
            ...row,
            content: str(v.content, row.content),
            updatedAt: str(v.clientUpdatedAt, row.updatedAt),
          });
        }
        return;
      }
      if (entry.op === "delete") {
        await db.thoughts.delete(entry.rowId);
        return;
      }
      return;
    }

    case "training": {
      if (entry.op === "create") {
        await db.training.put({
          id: entry.rowId,
          userId,
          entryDate: str(v.entryDate),
          title: str(v.title),
          detail: v.detail == null ? null : str(v.detail),
          durationMinutes: numOrNull(v.durationMinutes),
          notes: null,
          createdAt: str(v.createdAt),
        } as Parameters<typeof db.training.put>[0]);
        return;
      }
      if (entry.op === "delete") {
        await db.training.delete(entry.rowId);
      }
      return;
    }

    case "nutrition": {
      // Одна строка на день: новая версия замещает предыдущую.
      const entryDate = str(v.entryDate);
      await db.nutrition.where("entryDate").equals(entryDate).delete();
      if (entry.op === "upsert") {
        const ts = str(v.clientUpdatedAt, str(v.createdAt));
        await db.nutrition.put({
          id: entry.rowId,
          userId,
          entryDate,
          calories: numOrNull(v.calories),
          proteinGrams: numOrNull(v.proteinGrams),
          fatGrams: numOrNull(v.fatGrams),
          carbsGrams: numOrNull(v.carbsGrams),
          note: v.note == null ? null : str(v.note),
          source: "manual",
          createdAt: ts,
          updatedAt: ts,
        } as Parameters<typeof db.nutrition.put>[0]);
      }
      return;
    }

    case "learning":
    case "creation": {
      const table = entry.entity === "learning" ? db.learning : db.creation;
      if (entry.op === "create") {
        await table.put({
          id: entry.rowId,
          userId,
          entryDate: str(v.entryDate),
          content: str(v.content),
          createdAt: str(v.createdAt),
        } as Parameters<typeof table.put>[0]);
        return;
      }
      if (entry.op === "delete") {
        await table.delete(entry.rowId);
      }
      return;
    }

    case "leisure": {
      if (entry.op === "create") {
        await db.leisure.put({
          id: entry.rowId,
          userId,
          entryDate: str(v.entryDate),
          title: str(v.title),
          minutes: numOrNull(v.minutes),
          notes: v.notes == null ? null : str(v.notes),
          createdAt: str(v.createdAt),
        } as Parameters<typeof db.leisure.put>[0]);
        return;
      }
      if (entry.op === "delete") {
        await db.leisure.delete(entry.rowId);
      }
      return;
    }

    case "asceticism": {
      if (entry.op === "create") {
        await db.asceticisms.put({
          id: entry.rowId,
          userId,
          title: str(v.title),
          description: v.description == null ? null : str(v.description),
          startDate: str(v.startDate),
          isActive: true,
          createdAt: str(v.createdAt),
        } as Parameters<typeof db.asceticisms.put>[0]);
        await db.asceticismStreaks.put({
          id: crypto.randomUUID(),
          asceticismId: entry.rowId,
          userId,
          currentStreak: 0,
          longestStreak: 0,
          bestMilestone: 0,
          lastDoneDate: null,
          streakSince: null,
          updatedAt: new Date().toISOString(),
        } as Parameters<typeof db.asceticismStreaks.put>[0]);
        return;
      }
      if (entry.op === "update") {
        const row = await db.asceticisms.get(entry.rowId);
        if (!row) return;
        const next = { ...row };
        if ("title" in v) next.title = str(v.title, row.title);
        if ("description" in v) next.description = v.description == null ? null : str(v.description);
        if ("isActive" in v) next.isActive = Boolean(v.isActive);
        await db.asceticisms.put(next);
        // Повторный запуск (деактивация → активация): серия начинается заново.
        if (v.isActive === true) {
          const streak = await db.asceticismStreaks.where("asceticismId").equals(entry.rowId).first();
          if (streak) {
            await db.asceticismStreaks.put({
              ...streak,
              currentStreak: 0,
              lastDoneDate: null,
              streakSince: todayLocalDate(),
              updatedAt: new Date().toISOString(),
            });
          }
        }
        return;
      }
      if (entry.op === "delete") {
        // Каскад: отметки и серия удаляются вместе с аскезой.
        await db.asceticisms.delete(entry.rowId);
        await db.asceticismLogs.where("asceticismId").equals(entry.rowId).delete();
        await db.asceticismStreaks.where("asceticismId").equals(entry.rowId).delete();
      }
      return;
    }

    case "asceticismLog": {
      const asceticismId = str(v.asceticismId);
      const entryDate = str(v.entryDate);
      const existing = await db.asceticismLogs
        .where("asceticismId")
        .equals(asceticismId)
        .filter((l) => l.entryDate === entryDate)
        .toArray();
      await db.asceticismLogs.bulkDelete(existing.map((l) => l.id));
      const status = str(v.status);
      if (entry.op === "upsert" && status !== "none") {
        await db.asceticismLogs.put({
          id: entry.rowId,
          userId,
          asceticismId,
          entryDate,
          status,
          createdAt: str(v.clientUpdatedAt, new Date().toISOString()),
        } as Parameters<typeof db.asceticismLogs.put>[0]);
      }
      return;
    }
  }
}
