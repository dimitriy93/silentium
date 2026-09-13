import { and, desc, eq } from "drizzle-orm";
import { withUserDb } from "@/lib/db";
import { thoughts, type Thought } from "@/lib/db/schema";

/**
 * Слой данных «Мысли». Все запросы идут через withUserDb (RLS).
 * Лента — по created_at (внутри дня хронологично), группировку по датам
 * делает интерфейс.
 */

export async function createThought(
  userId: string,
  entryDate: string,
  content: string,
): Promise<Thought> {
  return withUserDb(userId, async (tx) => {
    const [row] = await tx
      .insert(thoughts)
      .values({ userId, entryDate, content })
      .returning();
    return row;
  });
}

export async function updateThought(
  userId: string,
  id: string,
  content: string,
): Promise<Thought | null> {
  return withUserDb(userId, async (tx) => {
    const [row] = await tx
      .update(thoughts)
      .set({ content, updatedAt: new Date() })
      .where(and(eq(thoughts.id, id), eq(thoughts.userId, userId)))
      .returning();
    return row ?? null;
  });
}

export async function deleteThought(userId: string, id: string): Promise<boolean> {
  return withUserDb(userId, async (tx) => {
    const rows = await tx
      .delete(thoughts)
      .where(and(eq(thoughts.id, id), eq(thoughts.userId, userId)))
      .returning({ id: thoughts.id });
    return rows.length > 0;
  });
}

/** Лента мыслей: новые сверху, ограничение по количеству. */
export async function listThoughts(userId: string, limit = 200): Promise<Thought[]> {
  return withUserDb(userId, (tx) =>
    tx.select().from(thoughts).orderBy(desc(thoughts.createdAt)).limit(limit),
  );
}

/** Мысли конкретного дня (для экрана «Сегодня» и истории). */
export async function listThoughtsForDay(userId: string, entryDate: string): Promise<Thought[]> {
  return withUserDb(userId, (tx) =>
    tx
      .select()
      .from(thoughts)
      .where(and(eq(thoughts.userId, userId), eq(thoughts.entryDate, entryDate)))
      .orderBy(desc(thoughts.createdAt)),
  );
}
