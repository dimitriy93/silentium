"use server";

import { eq, sql } from "drizzle-orm";
import { withUserDb } from "@/lib/db";
import { getCurrentUser } from "@/lib/supabase/server";
import {
  asceticismLogs,
  creationEntries,
  learningEntries,
  leisureEntries,
  nutritionEntries,
  thoughts,
  trainingActivities,
} from "@/lib/db/schema";
import { ensureAsceticismStreaks, listAsceticisms } from "@/lib/asceticism";
import { getDayStreakView } from "@/lib/day-streak";
import { todayLocalDate } from "@/lib/format";
import type { Action } from "@/lib/types";
import type {
  LocalAsceticism,
  LocalAsceticismLog,
  LocalAsceticismStreak,
  LocalCreation,
  LocalLearning,
  LocalLeisure,
  LocalNutrition,
  LocalThought,
  LocalTraining,
  Snapshot,
} from "@/lib/local/types";

/**
 * Снапшот журнальных таблиц пользователя для локального кеша чтения
 * (этап 1 offline-first). Read-only: схему БД не меняет, новых таблиц не
 * создаёт. Серии аскез читаются через ensureAsceticismStreaks, серия
 * дневника — через getDayStreakView, чтобы сохранить ленивый backfill
 * существующей логики.
 */

/** Сериализация строки для структурного клона: все timestamp-поля → ISO-строки. */
function toIsoRow<T extends object>(row: T): T {
  const out = { ...row } as Record<string, unknown>;
  if ("createdAt" in out) out.createdAt = toIsoValue(out.createdAt as Date | string);
  if ("updatedAt" in out) out.updatedAt = toIsoValue(out.updatedAt as Date | string);
  return out as T;
}

function toIsoValue(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

export async function pullSnapshot(): Promise<Action<Snapshot>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Требуется авторизация" };

  const today = todayLocalDate();
  const [thoughtRows, trainingRows, nutritionRows, learningRows, creationRows, leisureRows, ascList, logRows, streakRows, dayStreak] =
    await Promise.all([
      withUserDb(user.id, (tx) => tx.select().from(thoughts).where(eq(thoughts.userId, user.id))),
      withUserDb(user.id, (tx) =>
        tx.select().from(trainingActivities).where(eq(trainingActivities.userId, user.id)),
      ),
      withUserDb(user.id, (tx) =>
        tx.select().from(nutritionEntries).where(eq(nutritionEntries.userId, user.id)),
      ),
      withUserDb(user.id, (tx) =>
        tx.select().from(learningEntries).where(eq(learningEntries.userId, user.id)),
      ),
      withUserDb(user.id, (tx) =>
        tx.select().from(creationEntries).where(eq(creationEntries.userId, user.id)),
      ),
      withUserDb(user.id, (tx) =>
        tx.select().from(leisureEntries).where(eq(leisureEntries.userId, user.id)),
      ),
      listAsceticisms(user.id),
      withUserDb(user.id, (tx) =>
        tx.select().from(asceticismLogs).where(eq(asceticismLogs.userId, user.id)),
      ),
      ensureAsceticismStreaks(user.id, today),
      getDayStreakView(user.id, today),
    ]);

  const data: Snapshot = {
    userId: user.id,
    pulledAt: new Date().toISOString(),
    thoughts: thoughtRows.map(toIsoRow) as unknown as LocalThought[],
    training: trainingRows.map(toIsoRow) as unknown as LocalTraining[],
    nutrition: nutritionRows.map(toIsoRow) as unknown as LocalNutrition[],
    learning: learningRows.map(toIsoRow) as unknown as LocalLearning[],
    creation: creationRows.map(toIsoRow) as unknown as LocalCreation[],
    leisure: leisureRows.map(toIsoRow) as unknown as LocalLeisure[],
    asceticisms: ascList.map(toIsoRow) as unknown as LocalAsceticism[],
    asceticismLogs: logRows.map(toIsoRow) as unknown as LocalAsceticismLog[],
    asceticismStreaks: streakRows.map(toIsoRow) as unknown as LocalAsceticismStreak[],
    dayStreak,
  };
  return { ok: true, data };
}

/**
 * Дата последнего изменения данных пользователя на сервере — ручная
 * синхронизация в Профиле сравнивает её с локальной (Local First).
 * Максимум created_at/updated_at по тем же журнальным таблицам, что
 * входят в снапшот; метрики совпадают с клиентской getLastLocalChange,
 * поэтому после завершённой синхронизации даты равны.
 *
 * Epoch-миллисекунды одним запросом: drizzle возвращает сырые значения
 * sql`` как строки в формате pg ("2026-09-27 06:14:38.860883+00"), а
 * числовой результат не зависит от парсеров типов и часовых поясов.
 */
export async function getServerLastChange(): Promise<Action<{ lastChange: string | null }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Требуется авторизация" };

  const result = await withUserDb(user.id, async (tx) =>
    tx.execute<{ ms: string | number | null }>(sql`
      select extract(epoch from greatest(
        (select max(greatest(created_at, updated_at)) from thoughts where user_id = ${user.id}),
        (select max(created_at) from training_activities where user_id = ${user.id}),
        (select max(greatest(created_at, updated_at)) from nutrition_entries where user_id = ${user.id}),
        (select max(created_at) from learning_entries where user_id = ${user.id}),
        (select max(created_at) from creation_entries where user_id = ${user.id}),
        (select max(created_at) from leisure_entries where user_id = ${user.id}),
        (select max(created_at) from asceticisms where user_id = ${user.id}),
        (select max(created_at) from asceticism_logs where user_id = ${user.id}),
        (select max(updated_at) from asceticism_streaks where user_id = ${user.id})
      )) * 1000 as ms
    `),
  );
  const rows = (result as unknown as { rows?: { ms: string | number | null }[] }).rows ?? (result as unknown as { ms: string | number | null }[]);
  const ms = rows[0]?.ms;
  if (ms === null || ms === undefined) return { ok: true, data: { lastChange: null } };
  const value = Number(ms);
  if (!Number.isFinite(value)) return { ok: true, data: { lastChange: null } };
  return { ok: true, data: { lastChange: new Date(value).toISOString() } };
}
