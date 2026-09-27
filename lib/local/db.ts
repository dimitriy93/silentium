"use client";

import Dexie, { type Table } from "dexie";
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
 * (полностью локальное приложение). Все экраны читают журнальные таблицы
 * отсюда; мутации пишутся сюда в одной транзакции вместе с XP-событием
 * и пересчётом серий. Сервер в пользовательском data flow не участвует.
 *
 * Схема версионируется: будущие изменения — новые this.version(n) с
 * апгрейдами. Версия 2 добавляла таблицу outbox (удалена в v5), версия 3 —
 * изображения (бинарные blob'ы, переживают перезагрузку и работают без
 * сети), версия 4 — XP-события и агрегат опыта, версия 5 — удаление outbox
 * (серверной синхронизации больше нет) и перенос владельца данных на
 * постоянный локальный идентификатор LOCAL_USER_ID.
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

  /** Серия дневника (одна строка, key = 'current'). */
  dayStreak!: Table<{ key: string; view: LocalDayStreakView }, string>;
  /** Метаданные базы (в т.ч. страховочная копия перед импортом backup). */
  meta!: Table<CacheMeta, string>;
  /** Локальные изображения: blob по символьному ключу. */
  images!: Table<StoredImage, string>;
  /** События начисления опыта. */
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
    // v2 (история): таблица outbox — удалена в v5.
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
    // v5: серверная синхронизация удалена — очередь outbox больше не нужна.
    // Владелец всех данных переносится на постоянный локальный идентификатор:
    // у приложения без аккаунтов один владелец на устройстве.
    this.version(5)
      .stores({
        outbox: null,
      })
      .upgrade(async (tx) => {
        const owned = [
          "thoughts",
          "training",
          "nutrition",
          "learning",
          "creation",
          "leisure",
          "asceticisms",
          "asceticismLogs",
          "asceticismStreaks",
          "xpEvents",
        ];
        for (const name of owned) {
          await tx.table(name).toCollection().modify({ userId: LOCAL_USER_ID });
        }
        // Агрегат опыта (ключ = userId) пересчитывается из событий — истина.
        const events = await tx.table("xpEvents").toArray();
        const total = events.reduce((sum: number, e: { amount?: number }) => sum + (e.amount ?? 0), 0);
        await tx.table("xpProfile").clear();
        await tx.table("xpProfile").put({
          userId: LOCAL_USER_ID,
          totalXP: total,
          updatedAt: new Date().toISOString(),
        });
        await tx.table("meta").toCollection().modify({ userId: LOCAL_USER_ID });
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
  /** Страховочная JSON-копия перед импортом backup (key = PRE_IMPORT_BACKUP_KEY). */
  backupJson?: string;
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

/**
 * Постоянный владелец локальных данных. Приложение без аккаунтов хранит всё
 * на устройстве от одного лица; миграция v5 переписывает старые строки
 * (писались под идентификатором аккаунта) на этот идентификатор.
 */
export const LOCAL_USER_ID = "local";

export const DAY_STREAK_KEY = "current";
/** Ключ страховочной копии текущих данных, создаваемой перед импортом. */
export const PRE_IMPORT_BACKUP_KEY = "pre-import-backup";

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

/** Все журнальные таблицы одним списком — для транзакций мутаций и backup.
 * Включая XP-события и серии дневника; агрегат xpProfile сюда не входит —
 * он кэш, восстанавливаемый из событий. */
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
