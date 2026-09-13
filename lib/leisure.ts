import { and, desc, eq } from "drizzle-orm";
import { withUserDb } from "@/lib/db";
import { leisureEntries, type LeisureEntry } from "@/lib/db/schema";

/** Слой данных «Развлечения» — честный учёт отдыха и отвлечений. */

export async function createLeisureEntry(
  userId: string,
  entryDate: string,
  values: { title: string; minutes?: number | null; notes?: string | null },
): Promise<LeisureEntry> {
  return withUserDb(userId, async (tx) => {
    const [row] = await tx
      .insert(leisureEntries)
      .values({ userId, entryDate, ...values })
      .returning();
    return row;
  });
}

export async function deleteLeisureEntry(userId: string, id: string): Promise<boolean> {
  return withUserDb(userId, async (tx) => {
    const rows = await tx
      .delete(leisureEntries)
      .where(and(eq(leisureEntries.id, id), eq(leisureEntries.userId, userId)))
      .returning({ id: leisureEntries.id });
    return rows.length > 0;
  });
}

export async function listLeisureForDay(
  userId: string,
  entryDate: string,
): Promise<LeisureEntry[]> {
  return withUserDb(userId, (tx) =>
    tx
      .select()
      .from(leisureEntries)
      .where(and(eq(leisureEntries.userId, userId), eq(leisureEntries.entryDate, entryDate)))
      .orderBy(desc(leisureEntries.createdAt)),
  );
}
