"use client";

import Dexie, { type Table } from "dexie";
import type { OutboxEntry } from "@/lib/local/outbox-types";
import type {
  LocalAsceticism,
  LocalAsceticismLog,
  LocalAsceticismStreak,
  LocalCreation,
  LocalLearning,
  LocalLeisure,
  LocalNutrition,
  LocalThought,
  LocalTraining,
} from "@/lib/local/types";

/**
 * Локальный кеш (IndexedDB через Dexie) — этапы 1–2 offline-first плана
 * (docs/offline-write-sync-design.md). Сервер остаётся источником истины:
 * кеш зеркалирует журнальные таблицы пользователя и заменяется снапшотом
 * при синхронизации; мутации пишутся в кеш одновременно с постановкой в
 * очередь исходящих операций `outbox` (push на сервер отдельным циклом).
 *
 * Схема версионируется: будущие изменения — новые this.version(n) с
 * апгрейдами, без re-pull. Версия 2 добавила только таблицу outbox —
 * апгрейд пустой, кеш этапа 1 не трогается.
 */
class SilentiumLocalDb extends Dexie {
  thoughts!: Table<LocalThought, string>;
  training!: Table<LocalTraining, string>;
  nutrition!: Table<LocalNutrition, string>;
  learning!: Table<LocalLearning, string>;
  creation!: Table<LocalCreation, string>;
  leisure!: Table<LocalLeisure, string>;
  asceticisms!: Table<LocalAsceticism, string>;
  asceticismLogs!: Table<LocalAsceticismLog, string>;
  asceticismStreaks!: Table<LocalAsceticismStreak, string>;

  /** Серия дневника (read-only из снапшота; одна строка, key = 'current'). */
  dayStreak!: Table<{ key: string; view: LocalDayStreakView }, string>;
  /** Метаданные кеша: кто и когда делал снапшот. */
  meta!: Table<CacheMeta, string>;
  /** Очередь исходящих операций (этап 2): порядок применения = порядок вставки. */
  outbox!: Table<OutboxEntry, number>;

  constructor() {
    super("silentium");
    this.version(1).stores({
      thoughts: "id, entryDate",
      training: "id, entryDate",
      nutrition: "id, entryDate",
      learning: "id, entryDate",
      creation: "id, entryDate",
      leisure: "id, entryDate",
      asceticisms: "id",
      asceticismLogs: "id, entryDate, asceticismId",
      asceticismStreaks: "id, asceticismId",
      dayStreak: "key",
      meta: "key",
    });
    // v2: только новая таблица; существующие схемы не меняются, апгрейд пустой.
    this.version(2).stores({
      outbox: "++seq, opId, status, entity, rowId",
    });
  }
}

export type LocalDb = NonNullable<ReturnType<typeof localDb>>;

export interface LocalDayStreakView {
  currentStreak: number;
  longestStreak: number;
  bestMilestone: number;
  lastActiveDate: string | null;
}

export interface CacheMeta {
  key: string;
  userId: string;
  pulledAt: string;
}

export const SNAPSHOT_META_KEY = "snapshot";
export const DAY_STREAK_KEY = "current";

let instance: SilentiumLocalDb | null = null;

/**
 * Единственный экземпляр базы. null вне браузера (клиентские компоненты
 * рендерятся и на сервере) — все операции кеша обязаны это учитывать.
 */
export function localDb(): SilentiumLocalDb | null {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") return null;
  if (!instance) {
    instance = new SilentiumLocalDb();
  }
  return instance;
}

/** Все журнальные таблицы одним списком — для транзакций снапшота. */
export function journalTables(db: SilentiumLocalDb): Table<unknown, string>[] {
  return [
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
  ] as unknown as Table<unknown, string>[];
}
