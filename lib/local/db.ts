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
  LocalXpEvent,
  LocalXpProfile,
} from "@/lib/local/types";

/**
 * Локальная база (IndexedDB через Dexie) — единственный источник истины
 * (модель Local First). Все экраны читают журнальные таблицы отсюда;
 * мутации пишутся сюда одновременно с постановкой в очередь исходящих
 * операций `outbox`, которые уходят на сервер только по явной команде
 * пользователя — ручная синхронизация в Профиле.
 *
 * Схема версионируется: будущие изменения — новые this.version(n) с
 * апгрейдами. Версия 2 добавила таблицу outbox, версия 3 — изображения
 * (бинарные blob'ы, переживают перезагрузку и работают без сети),
 * версия 4 — XP-события и агрегат опыта.
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
  /** Очередь исходящих операций: порядок применения = порядок вставки. */
  outbox!: Table<OutboxEntry, number>;
  /** Локальные изображения: blob по символьному ключу. */
  images!: Table<StoredImage, string>;
  /** События начисления опыта (свои + пришедшие со снапшотом). */
  xpEvents!: Table<LocalXpEvent, string>;
  /** Агрегат опыта (кэш суммы событий): одна строка, key = userId. */
  xpProfile!: Table<LocalXpProfile, string>;

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
    // v3: локальные изображения (IndexedDB), апгрейд пустой.
    this.version(3).stores({
      images: "key",
    });
    // v4: XP-события и кэш-агрегат опыта, апгрейд пустой. sourceId — якорь
    // защиты от повторного начисления; createdAt — сортировка «последних».
    this.version(4).stores({
      xpEvents: "id, userId, sourceId, type, createdAt",
      xpProfile: "userId",
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

/** Строка таблицы изображений: бинарные данные живут в IndexedDB. */
export interface StoredImage {
  key: string;
  blob: Blob;
  /** ISO: когда изображение было сохранено локально. */
  savedAt: string;
  /** Исходный MIME-тип — для пересборки Blob при чтении. */
  mimeType: string;
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

/** Все журнальные таблицы одним списком — для транзакций снапшота.
 * Включая XP-события: они участвуют в сравнении дат синхронизации (createdAt)
 * и очищаются при смене пользователя, как остальные журналы. Агрегат
 * xpProfile сюда не входит — он кэш, восстанавливаемый из событий. */
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
    db.xpEvents,
    db.dayStreak,
  ] as unknown as Table<unknown, string>[];
}
