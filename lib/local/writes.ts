"use client";

import type {
  Asceticism,
  AsceticismLog,
  AsceticismStreak,
  CreationEntry,
  LearningEntry,
  LeisureEntry,
  NutritionEntry,
  Thought,
  TrainingActivity,
} from "@/lib/db/schema";
import type { DayStreakView } from "@/lib/day-streak";
import { applyOutboxOverlay } from "@/lib/local/apply";
import {
  DAY_STREAK_KEY,
  SNAPSHOT_META_KEY,
  journalTables,
  localDb,
  type LocalDayStreakView,
} from "@/lib/local/db";
import type {
  LocalAsceticism,
  LocalAsceticismDay,
  LocalAsceticismLog,
  LocalCreation,
  LocalLearning,
  LocalLeisure,
  LocalNutrition,
  LocalPathDay,
  LocalThought,
  LocalTraining,
  Snapshot,
  Wire,
} from "@/lib/local/types";

/**
 * Запись в локальный кеш. Две группы операций:
 * 1) writeSnapshot — полная замена кеша снапшотом с сервера (транзакция,
 *    с защитой от смены пользователя на устройстве) плюс оверлей pending-
 *    операций outbox поверх снапшота: ещё не отправленные локальные записи
 *    переживают снапшот до подтверждения их push'ем;
 * 2) точечные писатели дневных срезов — после успешных мутаций экраны
 *    перечитывают свой срез через существующие Server Actions и обновляют
 *    кеш этим срезом (запись по-прежнему идёт только на сервер).
 *
 * Писатели принимают строки в «проводном» формате (timestamp — Date или
 * ISO-строка) и возвращают нормализованные локальные строки (ISO-строки),
 * чтобы компонент мог сразу положить их в состояние. Приведение Wire →
 * Local — динамическое, поэтому на границе стоят явные касты.
 */

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

/** Runtime-конвертация строки: Date-поля → ISO-строки (остальные — как есть). */
function toLocal<T extends object>(row: T): T {
  const out = { ...row } as Record<string, unknown>;
  if ("createdAt" in out) out.createdAt = iso(out.createdAt as Date | string);
  if ("updatedAt" in out) out.updatedAt = iso(out.updatedAt as Date | string);
  return out as T;
}

async function clearJournal(db: NonNullable<ReturnType<typeof localDb>>): Promise<void> {
  for (const table of journalTables(db)) {
    await table.clear();
  }
}

/** Полная замена кеша снапшотом + оверлей pending-операций — одна транзакция. */
export async function writeSnapshot(snapshot: Snapshot): Promise<boolean> {
  const db = localDb();
  if (!db) return false;
  try {
    await db.transaction(
      "rw",
      [
        db.thoughts,
        db.training,
        db.nutrition,
        db.learning,
        db.creation,
        db.leisure,
        db.asceticisms,
        db.asceticismLogs,
        db.asceticismStreaks,
        db.dayStreak,
        db.meta,
        db.outbox,
      ],
      async () => {
        // Смена пользователя на устройстве: прошлый кеш и очередь чужие —
        // стираем целиком (очередь несёт userId операции).
        const meta = await db.meta.get(SNAPSHOT_META_KEY);
        if (meta && meta.userId !== snapshot.userId) {
          await clearJournal(db);
          await db.outbox.clear();
        }
        await Promise.all([
          db.thoughts.clear(),
          db.training.clear(),
          db.nutrition.clear(),
          db.learning.clear(),
          db.creation.clear(),
          db.leisure.clear(),
          db.asceticisms.clear(),
          db.asceticismLogs.clear(),
          db.asceticismStreaks.clear(),
          db.dayStreak.clear(),
        ]);
        await Promise.all([
          db.thoughts.bulkPut(snapshot.thoughts),
          db.training.bulkPut(snapshot.training),
          db.nutrition.bulkPut(snapshot.nutrition),
          db.learning.bulkPut(snapshot.learning),
          db.creation.bulkPut(snapshot.creation),
          db.leisure.bulkPut(snapshot.leisure),
          db.asceticisms.bulkPut(snapshot.asceticisms),
          db.asceticismLogs.bulkPut(snapshot.asceticismLogs),
          db.asceticismStreaks.bulkPut(snapshot.asceticismStreaks),
          snapshot.dayStreak
            ? db.dayStreak.put({ key: DAY_STREAK_KEY, view: snapshot.dayStreak })
            : Promise.resolve(),
        ]);
        // ОВЕРЛЕЙ: операции очереди (pending/sending/failed) переписывают
        // свои строки поверх снапшота, пока push их не подтвердил.
        await applyOutboxOverlay(db);
        await db.meta.put({
          key: SNAPSHOT_META_KEY,
          userId: snapshot.userId,
          pulledAt: snapshot.pulledAt,
        });
      },
    );
    return true;
  } catch (error) {
    // Повреждённый кеш не должен ломать приложение: сервер — источник истины.
    console.error("[local] snapshot write failed", error);
    return false;
  }
}

/** Кеш актуален: снапшот хотя бы раз успешно записан. */
export async function isCacheHydrated(): Promise<boolean> {
  const db = localDb();
  if (!db) return false;
  try {
    return (await db.meta.get(SNAPSHOT_META_KEY)) !== undefined;
  } catch {
    return false;
  }
}

// ---------- Точечные писатели дневных срезов ----------

export async function cacheThoughtsForDay(
  entryDate: string,
  rows: Wire<Thought>[],
): Promise<LocalThought[]> {
  const db = localDb();
  const local = rows.map(toLocal) as unknown as LocalThought[];
  if (!db) return local;
  try {
    await db.transaction("rw", db.thoughts, async () => {
      await db.thoughts.where("entryDate").equals(entryDate).delete();
      await db.thoughts.bulkPut(local);
    });
  } catch (error) {
    console.error("[local] cache thoughts failed", error);
  }
  return local;
}

/** Полная замена ленты мыслей (экран «Мысли» читает весь журнал). */
export async function cacheAllThoughts(rows: Wire<Thought>[]): Promise<LocalThought[]> {
  const db = localDb();
  const local = rows.map(toLocal) as unknown as LocalThought[];
  if (!db) return local;
  try {
    await db.transaction("rw", db.thoughts, async () => {
      await db.thoughts.clear();
      await db.thoughts.bulkPut(local);
    });
  } catch (error) {
    console.error("[local] cache thoughts failed", error);
  }
  return local;
}

/** Срезы четырёх стихий одного дня (порядок полей зеркалит PathDay). */
export async function cachePathDay(
  entryDate: string,
  parts: {
    training: Wire<TrainingActivity>[];
    nutrition: Wire<NutritionEntry> | null;
    learning: Wire<LearningEntry>[];
    creation: Wire<CreationEntry>[];
  },
): Promise<LocalPathDay> {
  const db = localDb();
  const local: LocalPathDay = {
    training: parts.training.map(toLocal) as unknown as LocalTraining[],
    nutrition:
      parts.nutrition === null
        ? null
        : (toLocal(parts.nutrition) as unknown as LocalNutrition),
    learning: parts.learning.map(toLocal) as unknown as LocalLearning[],
    creation: parts.creation.map(toLocal) as unknown as LocalCreation[],
  };
  if (!db) return local;
  try {
    await db.transaction(
      "rw",
      [db.training, db.nutrition, db.learning, db.creation],
      async () => {
        await Promise.all([
          db.training.where("entryDate").equals(entryDate).delete(),
          db.nutrition.where("entryDate").equals(entryDate).delete(),
          db.learning.where("entryDate").equals(entryDate).delete(),
          db.creation.where("entryDate").equals(entryDate).delete(),
        ]);
        await Promise.all([
          db.training.bulkPut(local.training),
          local.nutrition ? db.nutrition.put(local.nutrition) : Promise.resolve(),
          db.learning.bulkPut(local.learning),
          db.creation.bulkPut(local.creation),
        ]);
      },
    );
  } catch (error) {
    console.error("[local] cache path day failed", error);
  }
  return local;
}

export async function cacheLeisureForDay(
  entryDate: string,
  rows: Wire<LeisureEntry>[],
): Promise<LocalLeisure[]> {
  const db = localDb();
  const local = rows.map(toLocal) as unknown as LocalLeisure[];
  if (!db) return local;
  try {
    await db.transaction("rw", db.leisure, async () => {
      await db.leisure.where("entryDate").equals(entryDate).delete();
      await db.leisure.bulkPut(local);
    });
  } catch (error) {
    console.error("[local] cache leisure failed", error);
  }
  return local;
}

/**
 * Дневной срез аскез: список аскез и серии заменяются целиком (они
 * глобальные), отметки — срезом дня.
 */
export async function cacheAsceticismDay(
  entryDate: string,
  data: {
    list: Wire<Asceticism>[];
    logs: Wire<AsceticismLog>[];
    streaks: Wire<AsceticismStreak>[];
  },
): Promise<LocalAsceticismDay> {
  const db = localDb();
  const local: LocalAsceticismDay = {
    list: data.list.map(toLocal) as unknown as LocalAsceticism[],
    logs: data.logs.map(toLocal) as unknown as LocalAsceticismLog[],
    streaks: data.streaks.map(toLocal) as unknown as LocalAsceticismDay["streaks"],
  };
  if (!db) return local;
  try {
    await db.transaction(
      "rw",
      [db.asceticisms, db.asceticismLogs, db.asceticismStreaks],
      async () => {
        await Promise.all([
          db.asceticisms.clear(),
          db.asceticismLogs.where("entryDate").equals(entryDate).delete(),
          db.asceticismStreaks.clear(),
        ]);
        await Promise.all([
          db.asceticisms.bulkPut(local.list),
          db.asceticismLogs.bulkPut(local.logs),
          db.asceticismStreaks.bulkPut(local.streaks),
        ]);
      },
    );
  } catch (error) {
    console.error("[local] cache asceticism day failed", error);
  }
  return local;
}

/** Срез одного дня для истории (fallback-загрузка при пустом кеше). */
export async function cacheHistoryDay(data: {
  entryDate: string;
  thoughts: Wire<Thought>[];
  training: Wire<TrainingActivity>[];
  nutrition: Wire<NutritionEntry> | null;
  learning: Wire<LearningEntry>[];
  creation: Wire<CreationEntry>[];
  leisure: Wire<LeisureEntry>[];
  asceticismLogs: Wire<AsceticismLog>[];
}): Promise<void> {
  await cacheThoughtsForDay(data.entryDate, data.thoughts);
  await cachePathDay(data.entryDate, {
    training: data.training,
    nutrition: data.nutrition,
    learning: data.learning,
    creation: data.creation,
  });
  await cacheLeisureForDay(data.entryDate, data.leisure);
  // Отметки дня дописываем, не трогая список аскез и серии (они приходят
  // только со снапшотом или дневным срезом аскез).
  const db = localDb();
  const logs = data.asceticismLogs.map(toLocal) as unknown as LocalAsceticismLog[];
  if (db && logs.length > 0) {
    try {
      await db.transaction("rw", db.asceticismLogs, async () => {
        await db.asceticismLogs.where("entryDate").equals(data.entryDate).delete();
        await db.asceticismLogs.bulkPut(logs);
      });
    } catch (error) {
      console.error("[local] cache history logs failed", error);
    }
  }
}

export async function cacheDayStreak(view: DayStreakView): Promise<void> {
  const db = localDb();
  if (!db) return;
  const local: LocalDayStreakView = { ...view };
  try {
    await db.dayStreak.put({ key: DAY_STREAK_KEY, view: local });
  } catch (error) {
    console.error("[local] cache day streak failed", error);
  }
}
