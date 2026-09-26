import { and, asc, desc, eq, gt, gte } from "drizzle-orm";
import { withUserDb, type Tx } from "@/lib/db";
import {
  asceticismLogs,
  asceticismStreaks,
  asceticisms,
  type Asceticism,
  type AsceticismLog,
  type AsceticismStreak,
} from "@/lib/db/schema";
import { computeCurrentStreak, computeLongestStreak, milestoneForStreak } from "@/lib/asceticism-streak";

/**
 * Слой данных «Аскезы»: долгосрочные правила + ежедневные отметки
 * ('done' | 'failed'; нет строки = не отмечено) + серии и рубежи.
 */

export interface AsceticismAchievement {
  asceticismId: string;
  title: string;
  milestone: number;
}

export async function createAsceticism(
  userId: string,
  values: { title: string; description?: string | null; startDate: string },
  options: { id?: string; createdAt?: Date } = {},
): Promise<Asceticism | null> {
  return withUserDb(userId, async (tx) => {
    const [row] = await tx
      .insert(asceticisms)
      .values({
        userId,
        ...values,
        ...(options.id ? { id: options.id } : {}),
        ...(options.createdAt ? { createdAt: options.createdAt } : {}),
      })
      .onConflictDoNothing({ target: asceticisms.id })
      .returning();
    if (!row) return null; // идемпотентный повтор: строка уже есть
    // Серия стартует с нуля; строка сразу, чтобы первый «сегодня» не писал при чтении.
    await tx.insert(asceticismStreaks).values({ asceticismId: row.id, userId });
    return row;
  });
}

export async function updateAsceticism(
  userId: string,
  id: string,
  values: Partial<{ title: string; description: string | null; isActive: boolean }>,
): Promise<Asceticism | null> {
  return withUserDb(userId, async (tx) => {
    const [row] = await tx
      .update(asceticisms)
      .set(values)
      .where(and(eq(asceticisms.id, id), eq(asceticisms.userId, userId)))
      .returning();
    return row ?? null;
  });
}

export async function deleteAsceticism(userId: string, id: string): Promise<boolean> {
  return withUserDb(userId, async (tx) => {
    const rows = await tx
      .delete(asceticisms)
      .where(and(eq(asceticisms.id, id), eq(asceticisms.userId, userId)))
      .returning({ id: asceticisms.id });
    return rows.length > 0;
  });
}

/** Все аскезы пользователя: активные сверху, затем неактивные. */
export async function listAsceticisms(userId: string): Promise<Asceticism[]> {
  return withUserDb(userId, (tx) =>
    tx
      .select()
      .from(asceticisms)
      .where(eq(asceticisms.userId, userId))
      .orderBy(asc(asceticisms.isActive), asc(asceticisms.createdAt)),
  );
}

/**
 * Отметка за день: 'done' | 'failed'. Повторная отметка меняет статус.
 * status = null снимает отметку (удаляет строку).
 * После изменения отметки пересчитывается серия аскезы.
 * options.id — клиентский UUID строки (pushOutbox): повторная отправка
 * вставляет ту же строку, конфликт решается по natural key.
 */
export async function setAsceticismLog(
  userId: string,
  asceticismId: string,
  entryDate: string,
  status: "done" | "failed" | null,
  today?: string,
  options: { id?: string } = {},
): Promise<void> {
  await withUserDb(userId, async (tx) => {
    if (status === null) {
      await tx
        .delete(asceticismLogs)
        .where(
          and(
            eq(asceticismLogs.asceticismId, asceticismId),
            eq(asceticismLogs.userId, userId),
            eq(asceticismLogs.entryDate, entryDate),
          ),
        );
    } else {
      await tx
        .insert(asceticismLogs)
        .values({
          asceticismId,
          userId,
          entryDate,
          status,
          ...(options.id ? { id: options.id } : {}),
        })
        .onConflictDoUpdate({
          target: [asceticismLogs.asceticismId, asceticismLogs.entryDate],
          set: { status },
        });
    }

    const [a] = await tx
      .select()
      .from(asceticisms)
      .where(and(eq(asceticisms.id, asceticismId), eq(asceticisms.userId, userId)));
    if (a) await syncStreakTx(tx, a, today ?? entryDate);
  });
}

/** Отметки конкретного дня. */
export async function listAsceticismLogsForDay(
  userId: string,
  entryDate: string,
): Promise<AsceticismLog[]> {
  return withUserDb(userId, (tx) =>
    tx
      .select()
      .from(asceticismLogs)
      .where(and(eq(asceticismLogs.userId, userId), eq(asceticismLogs.entryDate, entryDate))),
  );
}

/**
 * История отметок с даты: для подсчёта серий и отображения истории аскезы.
 * Серии и рубежи живут в asceticism_streaks (см. syncAsceticismStreak).
 */
export async function listAsceticismLogsSince(
  userId: string,
  sinceDate: string,
): Promise<AsceticismLog[]> {
  return withUserDb(userId, (tx) =>
    tx
      .select()
      .from(asceticismLogs)
      .where(and(eq(asceticismLogs.userId, userId), gte(asceticismLogs.entryDate, sinceDate)))
      .orderBy(asc(asceticismLogs.entryDate)),
  );
}

// ---------- Серии и достижения ----------

/**
 * Пересчитать и сохранить серию аскезы (внутри открытой транзакции).
 * Серия считается по отметкам 'done' подряд назад от today; дни раньше
 * startDate (или streak_since при повторном запуске) не учитываются.
 */
async function syncStreakTx(tx: Tx, a: Asceticism, today: string): Promise<void> {
  const [existing] = await tx
    .select()
    .from(asceticismStreaks)
    .where(eq(asceticismStreaks.asceticismId, a.id));

  const since =
    existing?.streakSince && existing.streakSince > a.startDate
      ? existing.streakSince
      : a.startDate;

  const logs = await tx
    .select({ entryDate: asceticismLogs.entryDate, status: asceticismLogs.status })
    .from(asceticismLogs)
    .where(and(eq(asceticismLogs.asceticismId, a.id), gte(asceticismLogs.entryDate, since)));

  const streak = computeCurrentStreak(logs, since, today);
  // Рекорд и достижение считаем по всей истории отметок — тогда backfill
  // для давно ведущихся аскез сразу даёт правильную максимальную награду.
  const longestRun = computeLongestStreak(logs);
  const longest = Math.max(existing?.longestStreak ?? 0, streak, longestRun);
  const bestMilestone = Math.max(existing?.bestMilestone ?? 0, milestoneForStreak(longest));
  const lastDoneDate =
    logs.reduce<string | null>(
      (max, l) => (l.status === "done" && (max === null || l.entryDate > max) ? l.entryDate : max),
      null,
    ) ?? null;

  await tx
    .insert(asceticismStreaks)
    .values({
      asceticismId: a.id,
      userId: a.userId,
      currentStreak: streak,
      longestStreak: longest,
      bestMilestone,
      lastDoneDate,
      streakSince: existing?.streakSince ?? null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: asceticismStreaks.asceticismId,
      set: {
        currentStreak: streak,
        longestStreak: longest,
        bestMilestone,
        lastDoneDate,
        updatedAt: new Date(),
      },
    });
}

/** Пересчитать серию одной аскезы (после отметки, в т.ч. задним числом). */
export async function syncAsceticismStreak(
  userId: string,
  asceticismId: string,
  today: string,
): Promise<void> {
  await withUserDb(userId, async (tx) => {
    const [a] = await tx
      .select()
      .from(asceticisms)
      .where(and(eq(asceticisms.id, asceticismId), eq(asceticisms.userId, userId)));
    if (a) await syncStreakTx(tx, a, today);
  });
}

/**
 * Ленивый backfill: гарантирует строки серий для всех аскез пользователя
 * (в т.ч. созданных до введения серий) и возвращает их.
 */
export async function ensureAsceticismStreaks(
  userId: string,
  today: string,
): Promise<AsceticismStreak[]> {
  return withUserDb(userId, async (tx) => {
    const list = await tx.select().from(asceticisms).where(eq(asceticisms.userId, userId));
    const existing = await tx.select().from(asceticismStreaks).where(eq(asceticismStreaks.userId, userId));
    const have = new Set(existing.map((s) => s.asceticismId));
    for (const a of list) {
      if (!have.has(a.id)) await syncStreakTx(tx, a, today);
    }
    return tx.select().from(asceticismStreaks).where(eq(asceticismStreaks.userId, userId));
  });
}

/**
 * Повторный запуск аскезы (деактивация → активация): серия начинается заново
 * с today, при этом наилучшее достижение и рекорд сохраняются навсегда.
 */
export async function restartAsceticismStreak(
  userId: string,
  asceticismId: string,
  today: string,
): Promise<void> {
  await withUserDb(userId, async (tx) => {
    await tx
      .insert(asceticismStreaks)
      .values({ asceticismId, userId, streakSince: today })
      .onConflictDoUpdate({
        target: asceticismStreaks.asceticismId,
        set: { currentStreak: 0, lastDoneDate: null, streakSince: today, updatedAt: new Date() },
      });
  });
}

/** Достижения аскез: максимальный достигнутый порог серии каждой аскезы. */
export async function listAsceticismAchievements(
  userId: string,
): Promise<AsceticismAchievement[]> {
  return withUserDb(userId, (tx) =>
    tx
      .select({
        asceticismId: asceticismStreaks.asceticismId,
        title: asceticisms.title,
        milestone: asceticismStreaks.bestMilestone,
      })
      .from(asceticismStreaks)
      .innerJoin(asceticisms, eq(asceticismStreaks.asceticismId, asceticisms.id))
      .where(and(eq(asceticismStreaks.userId, userId), gt(asceticismStreaks.bestMilestone, 0)))
      .orderBy(desc(asceticismStreaks.bestMilestone), asc(asceticisms.title)),
  );
}
