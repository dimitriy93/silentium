import { and, desc, eq } from "drizzle-orm";
import { withUserDb } from "@/lib/db";
import { clampToNow } from "@/lib/format";
import { thoughts, type Thought } from "@/lib/db/schema";

/**
 * Слой данных «Мысли». Все запросы идут через withUserDb (RLS).
 * Лента — по created_at (внутри дня хронологично), группировку по датам
 * делает интерфейс.
 *
 * Опциональные id/createdAt/clientUpdatedAt — для pushOutbox (этап 2):
 * клиентский UUID делает повторную отправку идемпотентной, клиентские метки
 * времени — основа LWW (клампятся к «сейчас», если часы устройства убежали).
 * Прежние вызовы (Server Actions) работают как раньше.
 */

export interface CreateOptions {
  /** Клиентский UUID строки; с ним повторная вставка — no-op. */
  id?: string;
  /** Клиентское время создания (клампится к «сейчас»). */
  createdAt?: Date;
}

export interface UpdateOptions {
  /** Клиентское время правки: пишется в updated_at и участвует в LWW. */
  clientUpdatedAt?: Date;
}

export async function createThought(
  userId: string,
  entryDate: string,
  content: string,
  options: CreateOptions = {},
): Promise<Thought | null> {
  return withUserDb(userId, async (tx) => {
    // updated_at = createdAt: иначе defaultNow() делает строку «новее» любой
    // клиентской правки, и офлайн-редакция после создания отбрасывалась бы LWW.
    const createdAt = options.createdAt ? clampToNow(options.createdAt) : null;
    const [row] = await tx
      .insert(thoughts)
      .values({
        userId,
        entryDate,
        content,
        ...(options.id ? { id: options.id } : {}),
        ...(createdAt ? { createdAt, updatedAt: createdAt } : {}),
      })
      .onConflictDoNothing({ target: thoughts.id })
      .returning();
    return row ?? null;
  });
}

export async function updateThought(
  userId: string,
  id: string,
  content: string,
  options: UpdateOptions = {},
): Promise<Thought | null> {
  return withUserDb(userId, async (tx) => {
    const [existing] = await tx
      .select()
      .from(thoughts)
      .where(and(eq(thoughts.id, id), eq(thoughts.userId, userId)));
    if (!existing) return null;

    // LWW: серверная версия новее клиентской правки (или это идемпотентный
    // повтор с тем же clientUpdatedAt) — правка не применяется, операция
    // всё равно считается выполненной.
    const clientTs = options.clientUpdatedAt ? clampToNow(options.clientUpdatedAt) : null;
    if (clientTs && existing.updatedAt.getTime() >= clientTs.getTime()) return existing;

    const [row] = await tx
      .update(thoughts)
      .set({ content, updatedAt: clientTs ?? new Date() })
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
