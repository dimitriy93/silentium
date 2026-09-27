import { and, asc, eq, sql } from "drizzle-orm";
import { withUserDb } from "@/lib/db";
import { asceticismLogs, asceticisms } from "@/lib/db/schema";
import { ASCETICISM_MILESTONES, firstMilestoneDate, pluralDays } from "@/lib/asceticism-streak";
import { DAY_STREAK_MILESTONES } from "@/lib/day-streak";
import { dayRowsUnionSql, rowsOf } from "@/lib/day";
import { KIND_ORDER, type ChronicleEvent } from "@/lib/chronicle-shared";

/**
 * Хроника Пути — серверная сборка событий летописи (источник при пустом
 * локальном кеше). Клиентский двойник — lib/local/chronicle.ts: тот же
 * формат и тот же порядок событий из локальной базы. Типы и порядок событий
 * — в lib/chronicle-shared.ts.
 */

export type { ChronicleEvent, ChronicleKind } from "@/lib/chronicle-shared";

export async function getChronicleEvents(userId: string): Promise<ChronicleEvent[]> {
  const [datesRes, ascList, logs] = await Promise.all([
    withUserDb(userId, (tx) =>
      tx.execute(
        sql`select distinct entry_date::text as entry_date from ${dayRowsUnionSql(userId)}
            order by entry_date`,
      ),
    ),
    withUserDb(userId, (tx) =>
      tx
        .select({ id: asceticisms.id, title: asceticisms.title, startDate: asceticisms.startDate })
        .from(asceticisms)
        .where(eq(asceticisms.userId, userId))
        .orderBy(asc(asceticisms.startDate)),
    ),
    withUserDb(userId, (tx) =>
      tx
        .select({
          asceticismId: asceticismLogs.asceticismId,
          entryDate: asceticismLogs.entryDate,
          status: asceticismLogs.status,
        })
        .from(asceticismLogs)
        .where(and(eq(asceticismLogs.userId, userId), eq(asceticismLogs.status, "done")))
        .orderBy(asc(asceticismLogs.entryDate)),
    ),
  ]);

  const activeDates = (rowsOf(datesRes) as Array<{ entry_date: string }>).map((r) => r.entry_date);
  const events: ChronicleEvent[] = [];

  if (activeDates.length > 0) {
    events.push({
      key: "journal-start",
      date: activeDates[0],
      kind: "journal_start",
      title: "Вступил на Путь Дисциплины",
      subtitle: "Первая запись в дневнике",
    });

    for (const m of DAY_STREAK_MILESTONES) {
      const d = firstMilestoneDate(activeDates, m);
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
  for (const l of logs) {
    const list = doneByAsceticism.get(l.asceticismId) ?? [];
    list.push(l.entryDate);
    doneByAsceticism.set(l.asceticismId, list);
  }

  const firstDone = [...doneByAsceticism.values()].reduce<string | null>(
    (min, dates) => (min === null || dates[0] < min ? dates[0] : min),
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
    // Дата аскезы нужна для подписи рубежа — берём из созданного списка по id.
    const dates = doneByAsceticism.get(a.id) ?? [];
    for (const m of ASCETICISM_MILESTONES) {
      const d = firstMilestoneDate(dates, m);
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
}
