"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { withUserDb } from "@/lib/db";
import { getCurrentUser } from "@/lib/supabase/server";
import { rpgProfiles, xpEvents } from "@/lib/db/schema";
import {
  createThought as dbCreateThought,
  deleteThought as dbDeleteThought,
  updateThought as dbUpdateThought,
} from "@/lib/thoughts";
import {
  createCreationEntry as dbCreateCreation,
  createLearningEntry as dbCreateLearning,
  createTrainingActivity as dbCreateTraining,
  deleteCreationEntry as dbDeleteCreation,
  deleteLearningEntry as dbDeleteLearning,
  deleteTrainingActivity as dbDeleteTraining,
  upsertNutrition as dbUpsertNutrition,
} from "@/lib/path";
import {
  createLeisureEntry as dbCreateLeisure,
  deleteLeisureEntry as dbDeleteLeisure,
} from "@/lib/leisure";
import {
  createAsceticism as dbCreateAsceticism,
  deleteAsceticism as dbDeleteAsceticism,
  restartAsceticismStreak,
  setAsceticismLog as dbSetAsceticismLog,
  updateAsceticism as dbUpdateAsceticism,
} from "@/lib/asceticism";
import { syncDayStreak } from "@/lib/day-streak";
import { clampToNow, todayLocalDate } from "@/lib/format";
import { levelFromTotal } from "@/lib/xp";
import { entryDateSchema, formatZodError, nonEmptyText, uuidSchema } from "@/lib/validation";
import type { Action } from "@/lib/types";
import type { OutboxEntity, OutboxOp, OutboxOpType, PushOpResult } from "@/lib/local/outbox-types";

/**
 * Приём очереди outbox (этап 2, docs/offline-write-sync-design.md, разделы 6 и 9).
 *
 * Единственный серверный канал записи для клиентских мутаций. Диспетчер по
 * entity/op вызывает существующий lib-слой (бизнес-логика — syncDayStreak,
 * каскад и серии аскез — живёт в одном месте); zod-схемы повторяют валидацию
 * существующих экшенов (модули actions/*.ts — "use server", схемы из них не
 * экспортируются).
 *
 * Идемпотентность — естественными ключами, без реестра opId:
 * create — onConflictDoNothing по PK (клиентский UUID); update — полный
 * payload + LWW по clientUpdatedAt (повтор не сдвигает LWW); delete —
 * 0 строк = успех; upsert — natural key + LWW.
 *
 * Полу-атомарность: операции применяются по одной в порядке получения,
 * ошибка одной не откатывает соседние; результат — пооперационный.
 */

const isoTimestamp = z.iso.datetime();
const nullableText = (max: number) =>
  z.string().trim().max(max).nullish().transform((v) => v || null);
const macro = z.number().min(0, "Значение не может быть отрицательным").max(100000).nullish();
const minutes = z.number().int().positive("Минуты должны быть больше нуля").max(1440).nullish();

const thoughtCreateSchema = z.object({
  id: uuidSchema,
  entryDate: entryDateSchema,
  content: nonEmptyText("Текст мысли", 10000),
  createdAt: isoTimestamp,
});

const thoughtUpdateSchema = z.object({
  id: uuidSchema,
  content: nonEmptyText("Текст мысли", 10000),
  clientUpdatedAt: isoTimestamp,
});

const trainingCreateSchema = z.object({
  id: uuidSchema,
  entryDate: entryDateSchema,
  title: nonEmptyText("Название", 200),
  detail: nullableText(500),
  durationMinutes: minutes,
  createdAt: isoTimestamp,
});

const nutritionUpsertSchema = z.object({
  id: uuidSchema,
  entryDate: entryDateSchema,
  calories: macro,
  proteinGrams: macro,
  fatGrams: macro,
  carbsGrams: macro,
  note: nullableText(2000),
  clientUpdatedAt: isoTimestamp,
});

const learningCreateSchema = z.object({
  id: uuidSchema,
  entryDate: entryDateSchema,
  content: nonEmptyText("Текст записи", 5000),
  createdAt: isoTimestamp,
});

const leisureCreateSchema = z.object({
  id: uuidSchema,
  entryDate: entryDateSchema,
  title: nonEmptyText("Название", 200),
  minutes,
  notes: nullableText(2000),
  createdAt: isoTimestamp,
});

const asceticismCreateSchema = z.object({
  id: uuidSchema,
  title: nonEmptyText("Название", 200),
  description: nullableText(2000),
  startDate: entryDateSchema,
  createdAt: isoTimestamp,
});

const asceticismUpdateSchema = z.object({
  id: uuidSchema,
  title: nonEmptyText("Название", 200).optional(),
  description: z.optional(z.nullable(z.string().trim().max(2000))),
  isActive: z.boolean().optional(),
  // Дата «сегодня» на устройстве — якорь пересчёта серии при повторном запуске.
  today: entryDateSchema.optional(),
});

const logUpsertSchema = z.object({
  id: uuidSchema,
  asceticismId: uuidSchema,
  entryDate: entryDateSchema,
  status: z.enum(["done", "failed", "none"]),
});

const xpEventCreateSchema = z.object({
  id: uuidSchema,
  entryDate: entryDateSchema.nullish(),
  type: z.enum(["path", "asceticism", "thought", "day"]),
  amount: z.number().int().positive().max(10_000),
  description: z.string().trim().max(200).nullish().transform((v) => v || null),
  sourceId: z.string().trim().min(1).max(200),
  createdAt: isoTimestamp,
});

const envelopeSchema = z.object({
  opId: uuidSchema,
  userId: uuidSchema,
  entity: z.enum([
    "thought",
    "training",
    "nutrition",
    "learning",
    "creation",
    "leisure",
    "asceticism",
    "asceticismLog",
    "xpEvent",
  ]),
  op: z.enum(["create", "update", "delete", "upsert"]),
  rowId: uuidSchema,
  payload: z.unknown().nullable(),
  createdAt: z.string(),
});

/** Порядок: thought → path-сущности → leisure → asceticism → xp. */
function markPaths(paths: Set<string>, entity: OutboxEntity): void {
  paths.add("/today");
  paths.add("/history");
  if (entity === "thought") paths.add("/thoughts");
  else if (entity === "leisure") paths.add("/leisure");
  else if (entity === "asceticism" || entity === "asceticismLog") paths.add("/asceticism");
  else if (entity === "xpEvent") return; // XP читается клиентом из локальной базы
  else paths.add("/path");
}

type Applied = { ok: true } | { ok: false; error: string };

/**
 * Применить одну операцию от текущего пользователя. Ошибки валидации и
 * состояния возвращаются, исключения lib-слоя ловит вызывающий.
 */
async function applyOne(
  userId: string,
  op: OutboxOp,
  paths: Set<string>,
): Promise<Applied> {
  if (op.userId !== userId) return { ok: false, error: "Операция другого пользователя" };
  const payload = (op.payload ?? {}) as Record<string, unknown>;
  markPaths(paths, op.entity);

  switch (`${op.entity}:${op.op}` as `${OutboxEntity}:${OutboxOpType}`) {
    case "thought:create": {
      const p = thoughtCreateSchema.safeParse(payload);
      if (!p.success) return { ok: false, error: formatZodError(p.error) };
      await dbCreateThought(userId, p.data.entryDate, p.data.content, {
        id: p.data.id,
        createdAt: new Date(p.data.createdAt),
      });
      await syncDayStreak(userId, p.data.entryDate);
      return { ok: true };
    }
    case "thought:update": {
      const p = thoughtUpdateSchema.safeParse(payload);
      if (!p.success) return { ok: false, error: formatZodError(p.error) };
      // Запись не найдена (удалена на другом устройстве) — операция считается
      // применённой: побеждает удаление.
      await dbUpdateThought(userId, p.data.id, p.data.content, {
        clientUpdatedAt: new Date(p.data.clientUpdatedAt),
      });
      return { ok: true };
    }
    case "thought:delete": {
      const p = uuidSchema.safeParse(op.rowId);
      if (!p.success) return { ok: false, error: "Некорректный идентификатор" };
      await dbDeleteThought(userId, p.data);
      await syncDayStreak(userId, todayLocalDate());
      return { ok: true };
    }

    case "training:create": {
      const p = trainingCreateSchema.safeParse(payload);
      if (!p.success) return { ok: false, error: formatZodError(p.error) };
      await dbCreateTraining(
        userId,
        p.data.entryDate,
        {
          title: p.data.title,
          detail: p.data.detail,
          durationMinutes: p.data.durationMinutes ?? null,
        },
        { id: p.data.id, createdAt: new Date(p.data.createdAt) },
      );
      await syncDayStreak(userId, p.data.entryDate);
      return { ok: true };
    }
    case "training:delete": {
      const p = uuidSchema.safeParse(op.rowId);
      if (!p.success) return { ok: false, error: "Некорректный идентификатор" };
      await dbDeleteTraining(userId, p.data);
      await syncDayStreak(userId, todayLocalDate());
      return { ok: true };
    }

    case "nutrition:upsert": {
      const p = nutritionUpsertSchema.safeParse(payload);
      if (!p.success) return { ok: false, error: formatZodError(p.error) };
      await dbUpsertNutrition(
        userId,
        p.data.entryDate,
        {
          calories: p.data.calories ?? null,
          proteinGrams: p.data.proteinGrams ?? null,
          fatGrams: p.data.fatGrams ?? null,
          carbsGrams: p.data.carbsGrams ?? null,
          note: p.data.note,
        },
        { id: p.data.id, clientUpdatedAt: new Date(p.data.clientUpdatedAt) },
      );
      await syncDayStreak(userId, p.data.entryDate);
      return { ok: true };
    }

    case "learning:create": {
      const p = learningCreateSchema.safeParse(payload);
      if (!p.success) return { ok: false, error: formatZodError(p.error) };
      await dbCreateLearning(userId, p.data.entryDate, p.data.content, {
        id: p.data.id,
        createdAt: new Date(p.data.createdAt),
      });
      await syncDayStreak(userId, p.data.entryDate);
      return { ok: true };
    }
    case "learning:delete": {
      const p = uuidSchema.safeParse(op.rowId);
      if (!p.success) return { ok: false, error: "Некорректный идентификатор" };
      await dbDeleteLearning(userId, p.data);
      await syncDayStreak(userId, todayLocalDate());
      return { ok: true };
    }

    case "creation:create": {
      const p = learningCreateSchema.safeParse(payload);
      if (!p.success) return { ok: false, error: formatZodError(p.error) };
      await dbCreateCreation(userId, p.data.entryDate, p.data.content, {
        id: p.data.id,
        createdAt: new Date(p.data.createdAt),
      });
      await syncDayStreak(userId, p.data.entryDate);
      return { ok: true };
    }
    case "creation:delete": {
      const p = uuidSchema.safeParse(op.rowId);
      if (!p.success) return { ok: false, error: "Некорректный идентификатор" };
      await dbDeleteCreation(userId, p.data);
      await syncDayStreak(userId, todayLocalDate());
      return { ok: true };
    }

    case "leisure:create": {
      const p = leisureCreateSchema.safeParse(payload);
      if (!p.success) return { ok: false, error: formatZodError(p.error) };
      await dbCreateLeisure(
        userId,
        p.data.entryDate,
        {
          title: p.data.title,
          minutes: p.data.minutes ?? null,
          notes: p.data.notes,
        },
        { id: p.data.id, createdAt: new Date(p.data.createdAt) },
      );
      await syncDayStreak(userId, p.data.entryDate);
      return { ok: true };
    }
    case "leisure:delete": {
      const p = uuidSchema.safeParse(op.rowId);
      if (!p.success) return { ok: false, error: "Некорректный идентификатор" };
      await dbDeleteLeisure(userId, p.data);
      await syncDayStreak(userId, todayLocalDate());
      return { ok: true };
    }

    case "asceticism:create": {
      const p = asceticismCreateSchema.safeParse(payload);
      if (!p.success) return { ok: false, error: formatZodError(p.error) };
      await dbCreateAsceticism(
        userId,
        {
          title: p.data.title,
          description: p.data.description,
          startDate: p.data.startDate,
        },
        { id: p.data.id, createdAt: clampToNow(new Date(p.data.createdAt)) },
      );
      return { ok: true };
    }
    case "asceticism:update": {
      const p = asceticismUpdateSchema.safeParse(payload);
      if (!p.success) return { ok: false, error: formatZodError(p.error) };
      const updated = await dbUpdateAsceticism(userId, p.data.id, {
        ...(p.data.title !== undefined ? { title: p.data.title } : {}),
        ...(p.data.description !== undefined ? { description: p.data.description ?? null } : {}),
        ...(p.data.isActive !== undefined ? { isActive: p.data.isActive } : {}),
      });
      if (!updated) return { ok: true }; // аскеза удалена на другом устройстве
      // Повторный запуск: серия начинается заново, достижение остаётся навсегда.
      if (p.data.isActive === true) {
        const today = p.data.today ?? todayLocalDate();
        await restartAsceticismStreak(userId, p.data.id, today);
      }
      return { ok: true };
    }
    case "asceticism:delete": {
      const p = uuidSchema.safeParse(op.rowId);
      if (!p.success) return { ok: false, error: "Некорректный идентификатор" };
      await dbDeleteAsceticism(userId, p.data);
      return { ok: true };
    }

    case "asceticismLog:upsert": {
      const p = logUpsertSchema.safeParse(payload);
      if (!p.success) return { ok: false, error: formatZodError(p.error) };
      await dbSetAsceticismLog(
        userId,
        p.data.asceticismId,
        p.data.entryDate,
        p.data.status === "none" ? null : p.data.status,
      );
      // Любая отметка аскезы — осмысленное действие дня для серии дневника.
      await syncDayStreak(userId, p.data.entryDate);
      return { ok: true };
    }

    case "xpEvent:create": {
      const p = xpEventCreateSchema.safeParse(payload);
      if (!p.success) return { ok: false, error: formatZodError(p.error) };
      // Идемпотентность без реестра opId: PK = клиентский UUID события,
      // плюс unique (user_id, source_id) — якорь действия. Повторный push
      // существующего события (обрыв после применения, вторая вкладка)
      // не меняет данные — конфликт игнорируется целиком.
      await withUserDb(userId, (tx) =>
        tx
          .insert(xpEvents)
          .values({
            id: p.data.id,
            userId,
            entryDate: p.data.entryDate ?? null,
            source: p.data.type,
            sourceId: p.data.sourceId,
            description: p.data.description,
            xp: p.data.amount,
            createdAt: new Date(p.data.createdAt),
          })
          .onConflictDoNothing(),
      );
      // Агрегат пересчитывается из событий (а не += localTotal): идемпотентно,
      // самовосстанавливается после обрыва между insert и обновлением и
      // корректно сходится при синхронизации нескольких устройств.
      await recountRpgXp(userId);
      return { ok: true };
    }

    default:
      return { ok: false, error: "Неизвестный тип операции" };
  }
}

/**
 * Пересчитать rpg_profiles из xp_events: xp = сумма всех событий, level —
 * из формулы lib/xp.ts (кэш; истина — xp). Идемпотентно и для повторов,
 * и для событий, пришедших с других устройств.
 */
async function recountRpgXp(userId: string): Promise<void> {
  await withUserDb(userId, async (tx) => {
    const result = await tx.execute<{ total: string | number | null }>(sql`
      select coalesce(sum(xp), 0) as total from xp_events where user_id = ${userId}
    `);
    const rows = (result as unknown as { rows?: { total: string | number | null }[] }).rows ??
      (result as unknown as { total: string | number | null }[]);
    const total = Number(rows[0]?.total ?? 0);
    await tx
      .insert(rpgProfiles)
      .values({ userId, xp: total, level: levelFromTotal(total), updatedAt: new Date() })
      .onConflictDoUpdate({
        target: rpgProfiles.userId,
        set: { xp: total, level: levelFromTotal(total), updatedAt: new Date() },
      });
  });
}

/**
 * Push очереди: пооперационный результат без реестра opId — идемпотентность
 * обеспечивают клиентские UUID, natural key и LWW (см. шапку файла).
 */
export async function pushOutbox(ops: OutboxOp[]): Promise<Action<PushOpResult[]>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Требуется авторизация" };
  if (!Array.isArray(ops) || ops.length === 0 || ops.length > 200) {
    return { ok: false, error: "Некорректный пакет операций" };
  }

  const paths = new Set<string>();
  const results: PushOpResult[] = [];
  for (const op of ops) {
    const envelope = envelopeSchema.safeParse(op);
    if (!envelope.success) {
      results.push({
        opId: typeof op?.opId === "string" ? op.opId : "",
        ok: false,
        error: "Некорректная операция",
      });
      continue;
    }
    try {
      const applied = await applyOne(user.id, envelope.data as OutboxOp, paths);
      results.push(
        applied.ok
          ? { opId: envelope.data.opId, ok: true }
          : { opId: envelope.data.opId, ok: false, error: applied.error },
      );
    } catch (error) {
      console.error("[sync] operation failed", envelope.data.opId, error);
      results.push({
        opId: envelope.data.opId,
        ok: false,
        error: "Сервер не смог применить запись",
      });
    }
  }

  for (const path of paths) revalidatePath(path);
  return { ok: true, data: results };
}
