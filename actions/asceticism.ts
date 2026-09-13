"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/supabase/server";
import type { Asceticism, AsceticismLog } from "@/lib/db/schema";
import {
  createAsceticism as dbCreateAsceticism,
  deleteAsceticism as dbDeleteAsceticism,
  listAsceticismLogsForDay as dbListLogsForDay,
  listAsceticisms as dbListAsceticisms,
  setAsceticismLog as dbSetAsceticismLog,
  updateAsceticism as dbUpdateAsceticism,
} from "@/lib/asceticism";
import { entryDateSchema, formatZodError, nonEmptyText, uuidSchema } from "@/lib/validation";
import type { Action } from "@/lib/types";

/** Server actions раздела «Аскезы». */

const createSchema = z.object({
  title: nonEmptyText("Название", 200),
  description: z.string().trim().max(2000).nullish().transform((v) => v || null),
  startDate: entryDateSchema,
});

function revalidateAll() {
  revalidatePath("/asceticism");
  revalidatePath("/today");
  revalidatePath("/history");
}

export interface AsceticismDay {
  list: Asceticism[];
  logs: AsceticismLog[];
}

/** Аскезы + отметки за день. */
export async function getAsceticismDay(entryDate: string): Promise<Action<AsceticismDay>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Требуется авторизация" };

  const parsed = entryDateSchema.safeParse(entryDate);
  if (!parsed.success) return { ok: false, error: formatZodError(parsed.error) };

  const [list, logs] = await Promise.all([
    dbListAsceticisms(user.id),
    dbListLogsForDay(user.id, parsed.data),
  ]);
  return { ok: true, data: { list, logs } };
}

export async function createAsceticism(
  title: string,
  startDate: string,
  description?: string | null,
): Promise<Action<void>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Требуется авторизация" };

  const parsed = createSchema.safeParse({ title, startDate, description });
  if (!parsed.success) return { ok: false, error: formatZodError(parsed.error) };

  await dbCreateAsceticism(user.id, {
    title: parsed.data.title,
    description: parsed.data.description,
    startDate: parsed.data.startDate,
  });
  revalidateAll();
  return { ok: true, data: undefined };
}

const updateSchema = z.object({
  id: uuidSchema,
  title: nonEmptyText("Название", 200).optional(),
  description: z.string().trim().max(2000).nullish().transform((v) => v || null),
  isActive: z.boolean().optional(),
});

export async function updateAsceticism(
  id: string,
  values: { title?: string; description?: string | null; isActive?: boolean },
): Promise<Action<void>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Требуется авторизация" };

  const parsed = updateSchema.safeParse({ id, ...values });
  if (!parsed.success) return { ok: false, error: formatZodError(parsed.error) };

  const updated = await dbUpdateAsceticism(user.id, parsed.data.id, {
    ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
    ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
    ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {}),
  });
  if (!updated) return { ok: false, error: "Аскеза не найдена" };

  revalidateAll();
  return { ok: true, data: undefined };
}

export async function deleteAsceticism(id: string): Promise<Action<void>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Требуется авторизация" };

  const parsed = uuidSchema.safeParse(id);
  if (!parsed.success) return { ok: false, error: "Некорректный идентификатор" };

  await dbDeleteAsceticism(user.id, parsed.data);
  revalidateAll();
  return { ok: true, data: undefined };
}

const logSchema = z.object({
  id: uuidSchema,
  entryDate: entryDateSchema,
  status: z.enum(["done", "failed", "none"]),
});

/** Отметка за день: 'done' | 'failed' | 'none' (снять отметку). */
export async function setAsceticismLog(
  id: string,
  entryDate: string,
  status: "done" | "failed" | "none",
): Promise<Action<void>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Требуется авторизация" };

  const parsed = logSchema.safeParse({ id, entryDate, status });
  if (!parsed.success) return { ok: false, error: formatZodError(parsed.error) };

  await dbSetAsceticismLog(
    user.id,
    parsed.data.id,
    parsed.data.entryDate,
    parsed.data.status === "none" ? null : parsed.data.status,
  );
  revalidateAll();
  return { ok: true, data: undefined };
}
