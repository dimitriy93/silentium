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
} from "@/lib/local/row-types";

/**
 * Форматы данных локальной базы (IndexedDB через Dexie) — единственного
 * источника истины. Компоненты работают с ними напрямую; метки времени —
 * ISO-строки (структурный клон IndexedDB и JSON-сериализация backup
 * согласованы на строках), в UI — через new Date(...).
 */

/** Timestamp-поля заменены на ISO-строки — формат строк в Dexie. */
export type Localify<T> = {
  [K in keyof T]: T[K] extends Date ? string : T[K] extends Date | null ? string | null : T[K];
};

export type LocalThought = Localify<Thought>;
export type LocalTraining = Localify<TrainingActivity>;
export type LocalNutrition = Localify<NutritionEntry>;
export type LocalLearning = Localify<LearningEntry>;
export type LocalCreation = Localify<CreationEntry>;
export type LocalLeisure = Localify<LeisureEntry>;
export type LocalAsceticism = Localify<Asceticism>;
export type LocalAsceticismLog = Localify<AsceticismLog>;
export type LocalAsceticismStreak = Localify<AsceticismStreak>;

export interface LocalPathDay {
  training: LocalTraining[];
  nutrition: LocalNutrition | null;
  learning: LocalLearning[];
  creation: LocalCreation[];
}

/** Дневной срез аскез: список, отметки дня и серии. */
export interface LocalAsceticismDay {
  list: LocalAsceticism[];
  logs: LocalAsceticismLog[];
  streaks: LocalAsceticismStreak[];
}

/** Достижения аскез: bestMilestone каждой аскезы. */
export interface LocalAchievement {
  asceticismId: string;
  title: string;
  milestone: number;
}

/** День для страницы истории: записи + названия аскез для отметок. */
export interface LocalHistoryDay {
  entryDate: string;
  thoughts: LocalThought[];
  training: LocalTraining[];
  nutrition: LocalNutrition | null;
  learning: LocalLearning[];
  creation: LocalCreation[];
  leisure: LocalLeisure[];
  asceticismLogs: LocalAsceticismLog[];
  asceticismTitles: Record<string, string>;
}

/** Сводка дня для списка истории. */
export interface LocalDaySummary {
  entryDate: string;
  totalEntries: number;
  pathFilled: boolean;
  asceticismDone: number;
  asceticismTotal: number;
}

export interface LocalHistoryPage {
  days: LocalDaySummary[];
  page: number;
  pageCount: number;
  totalDays: number;
}

// ---------- Опыт (XP) ----------

/** Тип источника опыта. */
export type XpEventType = "path" | "asceticism" | "thought" | "day";

/**
 * Событие начисления опыта. id — клиентский UUID (стабилен, переносится
 * backup'ом), sourceId — якорь исходного действия для защиты от повторного
 * начисления (id записи; для дневных/аскетичных бонусов — составной ключ
 * «тип:дата»).
 */
export interface LocalXpEvent {
  id: string;
  userId: string;
  /** Локальная дата действия (для дневных бонусов и группировки). */
  entryDate: string | null;
  type: XpEventType;
  amount: number;
  description: string;
  sourceId: string;
  createdAt: string;
}

/** Локальный агрегат опыта: кэш суммы событий; истина — сумма xpEvents. */
export interface LocalXpProfile {
  userId: string;
  totalXP: number;
  updatedAt: string;
}

/** Сериализация timestamp в ISO-строку (для кода, принимающего Date | string). */
export function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}
