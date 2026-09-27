/**
 * Формы строк локальной базы (IndexedDB через Dexie). Раньше типы импортировались
 * из drizzle-схемы сервера (lib/db/schema); после перехода на полностью локальную
 * архитектуру серверная схема удалена — формы объявлены здесь напрямую.
 *
 * Все метки времени — ISO-строки (формат хранения Dexie; структурный клон
 * IndexedDB и JSON-сериализация backup согласованы на строках).
 */

/** Мысли — личная лента. Дата записи = entryDate, время = createdAt. */
export interface Thought {
  id: string;
  userId: string;
  entryDate: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

/** ОГНЬ — физическая активность: свободный журнал активности. */
export interface TrainingActivity {
  id: string;
  userId: string;
  entryDate: string;
  title: string;
  detail: string | null;
  durationMinutes: number | null;
  notes: string | null;
  createdAt: string;
}

/** ВОДА — питание: одна строка на день (КБЖУ + заметка). */
export interface NutritionEntry {
  id: string;
  userId: string;
  entryDate: string;
  calories: number | null;
  proteinGrams: number | null;
  fatGrams: number | null;
  carbsGrams: number | null;
  note: string | null;
  source: string;
  createdAt: string;
  updatedAt: string;
}

/** ВОЗДУХ — умственное развитие («я изучил»). */
export interface LearningEntry {
  id: string;
  userId: string;
  entryDate: string;
  content: string;
  createdAt: string;
}

/** ЗЕМЛЯ — созидание («я создал»). */
export interface CreationEntry {
  id: string;
  userId: string;
  entryDate: string;
  content: string;
  createdAt: string;
}

/** Развлечения — честный учёт отдыха и отвлечений. */
export interface LeisureEntry {
  id: string;
  userId: string;
  entryDate: string;
  title: string;
  minutes: number | null;
  notes: string | null;
  createdAt: string;
}

/** Аскеза — долгосрочное правило/ограничение. */
export interface Asceticism {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  startDate: string;
  isActive: boolean;
  createdAt: string;
}

/** Ежедневная отметка аскезы: 'done' | 'failed'; отсутствие строки = не отмечено. */
export interface AsceticismLog {
  id: string;
  asceticismId: string;
  userId: string;
  entryDate: string;
  status: string;
  createdAt: string;
}

/**
 * Серия аскезы: пересчитывается локально после каждой отметки
 * (lib/local/streaks.ts). streakSince — дата повторного запуска аскезы
 * (деактивация → активация) — единственное поле, не выводимое из истории
 * отметок, поэтому серии входят в backup как первичные данные.
 */
export interface AsceticismStreak {
  id: string;
  asceticismId: string;
  userId: string;
  currentStreak: number;
  longestStreak: number;
  bestMilestone: number;
  lastDoneDate: string | null;
  streakSince: string | null;
  updatedAt: string;
}

/** Серия ведения дневника (одна строка, key = 'current'). */
export interface DayStreakView {
  currentStreak: number;
  longestStreak: number;
  bestMilestone: number;
  lastActiveDate: string | null;
}
