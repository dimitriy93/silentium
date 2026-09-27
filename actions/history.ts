"use server";

import { getDayEntries, listDaySummariesPage } from "@/lib/day";
import { listAsceticisms } from "@/lib/asceticism";
import { getChronicleEvents } from "@/lib/chronicle";
import type { ChronicleEvent } from "@/lib/chronicle-shared";
import { getCurrentUser } from "@/lib/supabase/server";
import { entryDateSchema, formatZodError } from "@/lib/validation";
import type { Action } from "@/lib/types";
import type {
  LocalAsceticismLog,
  LocalCreation,
  LocalLearning,
  LocalLeisure,
  LocalNutrition,
  LocalThought,
  LocalTraining,
  LocalHistoryDay,
  LocalHistoryPage,
} from "@/lib/local/types";

/**
 * Read-only server actions для экранов Истории: используются как серверный
 * источник при первом запуске (кеш ещё пуст) и для записи результатов в
 * локальный кеш. Схема БД не меняется.
 */

export async function fetchHistoryPage(page: number): Promise<Action<LocalHistoryPage>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Требуется авторизация" };
  if (!Number.isFinite(page) || page < 1) return { ok: false, error: "Некорректная страница" };

  const first = await listDaySummariesPage(user.id, Math.floor(page));
  // Клампим за пределы: ?page=999 → последняя страница (как раньше на сервере).
  const data =
    first.page > first.pageCount
      ? await listDaySummariesPage(user.id, first.pageCount)
      : first;
  return {
    ok: true,
    data: {
      days: data.days.map((d) => ({ ...d })),
      page: data.page,
      pageCount: data.pageCount,
      totalDays: data.totalDays,
    },
  };
}

export async function fetchHistoryDay(date: string): Promise<Action<LocalHistoryDay>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Требуется авторизация" };

  const parsed = entryDateSchema.safeParse(date);
  if (!parsed.success) return { ok: false, error: formatZodError(parsed.error) };

  const [day, asceticismList] = await Promise.all([
    getDayEntries(user.id, parsed.data),
    listAsceticisms(user.id),
  ]);

  const toIso = (v: Date | string): string => (v instanceof Date ? v.toISOString() : v);
  const titles: Record<string, string> = {};
  for (const a of asceticismList) titles[a.id] = a.title;

  return {
    ok: true,
    data: {
      entryDate: day.entryDate,
      thoughts: day.thoughts.map((t) => ({ ...t, createdAt: toIso(t.createdAt), updatedAt: toIso(t.updatedAt) })) as unknown as LocalThought[],
      training: day.training.map((t) => ({ ...t, createdAt: toIso(t.createdAt) })) as unknown as LocalTraining[],
      nutrition:
        day.nutrition === null
          ? null
          : ({
              ...day.nutrition,
              createdAt: toIso(day.nutrition.createdAt),
              updatedAt: toIso(day.nutrition.updatedAt),
            }) as unknown as LocalNutrition,
      learning: day.learning.map((t) => ({ ...t, createdAt: toIso(t.createdAt) })) as unknown as LocalLearning[],
      creation: day.creation.map((t) => ({ ...t, createdAt: toIso(t.createdAt) })) as unknown as LocalCreation[],
      leisure: day.leisure.map((t) => ({ ...t, createdAt: toIso(t.createdAt) })) as unknown as LocalLeisure[],
      asceticismLogs: day.asceticismLogs.map((t) => ({ ...t, createdAt: toIso(t.createdAt) })) as unknown as LocalAsceticismLog[],
      asceticismTitles: titles,
    },
  };
}

/**
 * Хроника Пути как server action: серверный источник при пустом локальном
 * кеше (первый запуск). Локальный двойник — lib/local/chronicle.ts.
 */
export async function fetchChronicleEvents(): Promise<Action<ChronicleEvent[]>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Требуется авторизация" };
  return { ok: true, data: await getChronicleEvents(user.id) };
}
