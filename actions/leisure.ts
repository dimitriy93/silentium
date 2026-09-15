"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/supabase/server";
import type { LeisureEntry } from "@/lib/db/schema";
import {
  createLeisureEntry as dbCreateLeisure,
  deleteLeisureEntry as dbDeleteLeisure,
  listLeisureForDay as dbListLeisure,
} from "@/lib/leisure";
import { syncDayStreak } from "@/lib/day-streak";
import { todayLocalDate } from "@/lib/format";
import { entryDateSchema, formatZodError, nonEmptyText, uuidSchema } from "@/lib/validation";
import type { Action } from "@/lib/types";

/** Server actions раздела «Развлечения». */

const createSchema = z.object({
  entryDate: entryDateSchema,
  title: nonEmptyText("Название", 200),
  minutes: z.number().int().positive("Минуты должны быть больше нуля").max(1440).nullish(),
  notes: z.string().trim().max(2000).nullish().transform((v) => v || null),
});

function revalidateDay() {
  revalidatePath("/leisure");
  revalidatePath("/today");
  revalidatePath("/history");
}

/** Развлечения за день. */
export async function listLeisureForDay(entryDate: string): Promise<Action<LeisureEntry[]>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Требуется авторизация" };

  const parsed = entryDateSchema.safeParse(entryDate);
  if (!parsed.success) return { ok: false, error: formatZodError(parsed.error) };

  const data = await dbListLeisure(user.id, parsed.data);
  return { ok: true, data };
}

export async function createLeisureEntry(
  entryDate: string,
  title: string,
  minutes?: number | null,
  notes?: string | null,
): Promise<Action<void>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Требуется авторизация" };

  const parsed = createSchema.safeParse({ entryDate, title, minutes: minutes ?? null, notes });
  if (!parsed.success) return { ok: false, error: formatZodError(parsed.error) };

  await dbCreateLeisure(user.id, parsed.data.entryDate, {
    title: parsed.data.title,
    minutes: parsed.data.minutes ?? null,
    notes: parsed.data.notes,
  });
  await syncDayStreak(user.id, parsed.data.entryDate);
  revalidateDay();
  return { ok: true, data: undefined };
}

export async function deleteLeisureEntry(id: string): Promise<Action<void>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Требуется авторизация" };

  const parsed = uuidSchema.safeParse(id);
  if (!parsed.success) return { ok: false, error: "Некорректный идентификатор" };

  await dbDeleteLeisure(user.id, parsed.data);
  await syncDayStreak(user.id, todayLocalDate());
  revalidateDay();
  return { ok: true, data: undefined };
}
