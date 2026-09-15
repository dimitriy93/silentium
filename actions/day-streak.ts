"use server";

import { getCurrentUser } from "@/lib/supabase/server";
import { getDayStreakView } from "@/lib/day-streak";
import type { DayStreakView } from "@/lib/day-streak";

export type { DayStreakView };
import { entryDateSchema, formatZodError } from "@/lib/validation";
import type { Action } from "@/lib/types";

/** Server actions серии ведения дневника (Day Streak). */

/** Живая серия для карточки на «Сегодня» (с ленивым backfill по всей истории). */
export async function getDayStreak(today: string): Promise<Action<DayStreakView>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Требуется авторизация" };

  const parsed = entryDateSchema.safeParse(today);
  if (!parsed.success) return { ok: false, error: formatZodError(parsed.error) };

  return { ok: true, data: await getDayStreakView(user.id, parsed.data) };
}
