import { and, asc, eq, gte } from "drizzle-orm";
import { withUserDb } from "@/lib/db";
import { asceticismLogs, asceticisms, type Asceticism, type AsceticismLog } from "@/lib/db/schema";

/**
 * Слой данных «Аскезы»: долгосрочные правила + ежедневные отметки
 * ('done' | 'failed'; нет строки = не отмечено).
 */

export async function createAsceticism(
  userId: string,
  values: { title: string; description?: string | null; startDate: string },
): Promise<Asceticism> {
  return withUserDb(userId, async (tx) => {
    const [row] = await tx.insert(asceticisms).values({ userId, ...values }).returning();
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
 */
export async function setAsceticismLog(
  userId: string,
  asceticismId: string,
  entryDate: string,
  status: "done" | "failed" | null,
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
      return;
    }

    await tx
      .insert(asceticismLogs)
      .values({ asceticismId, userId, entryDate, status })
      .onConflictDoUpdate({
        target: [asceticismLogs.asceticismId, asceticismLogs.entryDate],
        set: { status },
      });
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
 * Серии/рубежи (10/50/100/500) вычисляются поверх этих строк позже.
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
