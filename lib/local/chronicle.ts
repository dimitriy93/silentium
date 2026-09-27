"use client";

import { ASCETICISM_MILESTONES, firstMilestoneDate, pluralDays } from "@/lib/asceticism-streak";
import { KIND_ORDER, type ChronicleEvent } from "@/lib/chronicle-shared";
import { localDb } from "@/lib/local/db";
import { isCacheHydrated } from "@/lib/local/writes";

/**
 * Хроника Пути из локальной базы — клиентский двойник getChronicleEvents
 * (lib/chronicle.ts): те же источники и та же арифметика, только вместо
 * UNION-запроса к Postgres — проход по журнальным таблицам Dexie.
 * Возвращает null, если кеш ещё не гидратирован (первый запуск) — компонент
 * в этом случае обращается к серверному экшену fetchChronicleEvents.
 */

/**
 * Все «осмысленные» даты из локальных таблиц — зеркало dayRowsUnionSql:
 * мысли, путь (4 стихии), развлечения и отметки аскез (любой статус).
 */
async function activeDates(db: NonNullable<ReturnType<typeof localDb>>): Promise<string[]> {
  const dates = new Set<string>();
  const [thoughts, training, nutrition, learning, creation, leisure, logs] = await Promise.all([
    db.thoughts.toArray(),
    db.training.toArray(),
    db.nutrition.toArray(),
    db.learning.toArray(),
    db.creation.toArray(),
    db.leisure.toArray(),
    db.asceticismLogs.toArray(),
  ]);
  for (const row of thoughts) dates.add(row.entryDate);
  for (const row of training) dates.add(row.entryDate);
  for (const row of nutrition) dates.add(row.entryDate);
  for (const row of learning) dates.add(row.entryDate);
  for (const row of creation) dates.add(row.entryDate);
  for (const row of leisure) dates.add(row.entryDate);
  for (const row of logs) dates.add(row.entryDate);
  return [...dates].sort();
}

export async function readChronicleEvents(): Promise<ChronicleEvent[] | null> {
  const db = localDb();
  if (!db || !(await isCacheHydrated())) return null;
  try {
    return await db.transaction(
      "r",
      [db.thoughts, db.training, db.nutrition, db.learning, db.creation, db.leisure, db.asceticisms, db.asceticismLogs],
      async () => {
        const dates = await activeDates(db);
        const events: ChronicleEvent[] = [];

        if (dates.length > 0) {
          events.push({
            key: "journal-start",
            date: dates[0],
            kind: "journal_start",
            title: "Вступил на Путь Дисциплины",
            subtitle: "Первая запись в дневнике",
          });

          // Пороги серии дневника — те же пороги, что у аскез (DAY_STREAK_MILESTONES).
          for (const m of ASCETICISM_MILESTONES) {
            const d = firstMilestoneDate(dates, m);
            if (d) {
              events.push({
                key: `day-streak-${m}`,
                date: d,
                kind: "day_streak_milestone",
                title: "Серия дневника",
                subtitle: pluralDays(m),
              });
            }
          }
        }

        const ascList = [...(await db.asceticisms.toArray())].sort((a, b) =>
          a.startDate.localeCompare(b.startDate),
        );
        for (const a of ascList) {
          events.push({
            key: `asc-created-${a.id}`,
            date: a.startDate,
            kind: "asceticism_created",
            title: "Принял аскезу",
            subtitle: `«${a.title}»`,
          });
        }

        const doneByAsceticism = new Map<string, string[]>();
        const logs = (await db.asceticismLogs.toArray())
          .filter((l) => l.status === "done")
          .sort((a, b) => a.entryDate.localeCompare(b.entryDate));
        for (const l of logs) {
          const list = doneByAsceticism.get(l.asceticismId) ?? [];
          list.push(l.entryDate);
          doneByAsceticism.set(l.asceticismId, list);
        }

        const firstDone = [...doneByAsceticism.values()].reduce<string | null>(
          (min, ds) => (min === null || ds[0] < min ? ds[0] : min),
          null,
        );
        if (firstDone) {
          events.push({
            key: "asc-first-done",
            date: firstDone,
            kind: "asceticism_first_done",
            title: "Первая выполненная аскеза",
          });
        }

        for (const a of ascList) {
          const ds = doneByAsceticism.get(a.id) ?? [];
          for (const m of ASCETICISM_MILESTONES) {
            const d = firstMilestoneDate(ds, m);
            if (d) {
              events.push({
                key: `asc-milestone-${a.id}-${m}`,
                date: d,
                kind: "asceticism_milestone",
                title: "Получено достижение",
                subtitle: `${pluralDays(m)} · «${a.title}»`,
              });
            }
          }
        }

        return events.sort(
          (a, b) => a.date.localeCompare(b.date) || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind),
        );
      },
    );
  } catch {
    return null;
  }
}
