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

/**
 * Форматы данных локального кеша (этап 1 — кеш чтения, см.
 * docs/offline-first-research.md, раздел 4).
 *
 * IndexedDB хранит значения через структурный клон: Date клонируется, но
 * для единообразия с JSON-сериализацией server actions все метки времени
 * храним ISO-строками. Компоненты работают с ними через new Date(...) —
 * как и с Date, приходящим напрямую из server action.
 */

/** Timestamp-поля заменены на ISO-строки — формат строк в Dexie. */
export type Localify<T> = {
  [K in keyof T]: T[K] extends Date ? string : T[K] extends Date | null ? string | null : T[K];
};

/** То же, но timestamp-поля допускают обе формы — формат строк на входе
 * кеш-писателей (сервер возвращает Date, кеш — строки). */
export type Wire<T> = {
  [K in keyof T]: T[K] extends Date
    ? string | Date
    : T[K] extends Date | null
      ? string | Date | null
      : T[K];
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

/** Дневной срез аскез: тот же контракт, что AsceticismDay в actions/asceticism. */
export interface LocalAsceticismDay {
  list: LocalAsceticism[];
  logs: LocalAsceticismLog[];
  streaks: LocalAsceticismStreak[];
}

/** Достижения аскез: тот же контракт, что AsceticismAchievementView. */
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

/** Сводка дня для списка истории (аналог DaySummary из lib/day). */
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
 * Событие начисления опыта. id — клиентский UUID (стабилен для синхронизации),
 * sourceId — якорь исходного действия для защиты от повторного начисления
 * (id записи; для дневных/аскетичных бонусов — составной ключ «тип:дата»).
 */
export interface LocalXpEvent {
  id: string;
  userId: string;
  /** Локальная дата действия (для дневных бонусов и серверной группировки). */
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

/**
 * Полный снапшот журнальных таблиц пользователя (этап 1 — read-only:
 * записи по-прежнему идут через Server Actions, кеш только читает).
 */
export interface Snapshot {
  userId: string;
  pulledAt: string;
  thoughts: LocalThought[];
  training: LocalTraining[];
  nutrition: LocalNutrition[];
  learning: LocalLearning[];
  creation: LocalCreation[];
  leisure: LocalLeisure[];
  asceticisms: LocalAsceticism[];
  asceticismLogs: LocalAsceticismLog[];
  asceticismStreaks: LocalAsceticismStreak[];
  xpEvents: LocalXpEvent[];
  dayStreak: DayStreakView | null;
}

/** Сериализация серверной строки для кеша: Date → ISO-строка. */
export function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}
