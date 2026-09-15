import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Схема Silentium — дневник дисциплины, развития и самоанализа.
 *
 * Общие принципы:
 * - пользователь всегда `auth.users.id` (Supabase Auth); на user_id ссылается
 *   либо первичный ключ (profiles, rpg_profiles), либо колонка user_id;
 * - `entry_date` — локальная дата пользователя YYYY-MM-DD (определяется на
 *   клиенте), все дневные записи сгруппированы по ней;
 * - RLS: каждая таблица защищена политикой auth.uid() = user_id (см.
 *   drizzle/0001_rls.sql; FK на auth.users и политики добавляются там же);
 * - расширяемость: тренировки — свободный журнал активности (расписание,
 *   подходы/повторы/вес добавятся отдельными таблицами позже); питание —
 *   одна строка на день с полем source (будущая интеграция Nutriarium).
 */

/**
 * Профиль пользователя. Строка создаётся триггером on_auth_user_created
 * (drizzle/0001_rls.sql). Минимум полей: всё личное — в других таблицах.
 */
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * RPG-профиль: будущий уровень/опыт/ранг персонажа.
 * Логика начисления XP на этом этапе НЕ реализована — только сущность
 * и начальные значения (level = 1, xp = 0). Создаётся тем же триггером.
 */
export const rpgProfiles = pgTable(
  "rpg_profiles",
  {
    userId: uuid("user_id").primaryKey(),
    level: integer("level").notNull().default(1),
    xp: integer("xp").notNull().default(0),
    rank: text("rank").notNull().default("novice"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("rpg_profiles_level_check", sql`${t.level} >= 1`), check("rpg_profiles_xp_check", sql`${t.xp} >= 0`)],
);

/**
 * События начисления опыта — архитектурная подготовка будущей системы XP
 * («записал мысль → +2 XP» и т.п.). Приложение пока ничего сюда не пишет;
 * таблица готова для последующего включения логики.
 */
export const xpEvents = pgTable(
  "xp_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    entryDate: date("entry_date"),
    /** Источник опыта, например 'thought_created' | 'path_filled' | 'asceticism_done'. */
    source: text("source").notNull(),
    xp: integer("xp").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("xp_events_user_date_idx").on(t.userId, t.entryDate),
    check("xp_events_xp_check", sql`${t.xp} <> 0`),
  ],
);

/**
 * День — якорь для дневного контента: AI-память и будущая дневная
 * метаинформация ссылаются на него. Записи разделов (мысли, путь,
 * развлечения) ссылаются на дату напрямую (entry_date), поэтому строка
 * создаётся лениво — только когда нужен сам «день» (пока: AI-память).
 */
export const days = pgTable(
  "days",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    dayDate: date("day_date").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("days_user_date_unique").on(t.userId, t.dayDate)],
);

/**
 * Мысли — личная лента. Дата записи = entry_date, время = created_at
 * (хранится в UTC, отображается локально). Редактирование не меняет
 * created_at: лента отсортирована по created_at внутри дня.
 */
export const thoughts = pgTable(
  "thoughts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    entryDate: date("entry_date").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("thoughts_user_date_idx").on(t.userId, t.entryDate),
    check("thoughts_content_check", sql`length(trim(${t.content})) > 0`),
  ],
);

/**
 * Стихия Пути (категория). Справочник, расширяется новыми строками.
 * Наполнение — миграцией 0001_rls.sql (ogon / voda / vozduh / zemlya).
 */
export const pathElements = pgTable("path_elements", {
  key: text("key").primaryKey(),
  title: text("title").notNull(),
  /** Символ стихии (эмодзи/знак), отображается в интерфейсе. */
  symbol: text("symbol").notNull(),
  description: text("description").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

/**
 * ОГНЬ — физическая активность: свободный журнал («Подтягивания
 * +31.5 кг × 6/6/5/5», «Гиря 24 кг, 15 минут»). Структура намеренно простая:
 * title = что делал, detail = результат/параметры, durationMinutes — минуты.
 * Будущее расписание/подходы/повторы/вес — отдельные таблицы поверх этой.
 */
export const trainingActivities = pgTable(
  "training_activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    entryDate: date("entry_date").notNull(),
    title: text("title").notNull(),
    detail: text("detail"),
    durationMinutes: integer("duration_minutes"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("training_user_date_idx").on(t.userId, t.entryDate),
    check("training_title_check", sql`length(trim(${t.title})) > 0`),
    check("training_duration_check", sql`${t.durationMinutes} IS NULL OR ${t.durationMinutes} > 0`),
  ],
);

/**
 * ВОДА — питание, ручной ввод: одна строка на день (КБЖУ + заметка).
 * source — откуда данные ('manual', позже 'nutriarium');Nutriarium будет
 * писать в эту же таблицу или в параллельную — поле оставляет простор.
 */
export const nutritionEntries = pgTable(
  "nutrition_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    entryDate: date("entry_date").notNull(),
    calories: integer("calories"),
    proteinGrams: numeric("protein_grams", { precision: 6, scale: 1, mode: "number" }),
    fatGrams: numeric("fat_grams", { precision: 6, scale: 1, mode: "number" }),
    carbsGrams: numeric("carbs_grams", { precision: 6, scale: 1, mode: "number" }),
    note: text("note"),
    source: text("source").notNull().default("manual"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("nutrition_user_date_unique").on(t.userId, t.entryDate),
    check("nutrition_source_check", sql`${t.source} in ('manual', 'nutriarium')`),
    check("nutrition_calories_check", sql`${t.calories} IS NULL OR ${t.calories} >= 0`),
    check("nutrition_protein_check", sql`${t.proteinGrams} IS NULL OR ${t.proteinGrams} >= 0`),
    check("nutrition_fat_check", sql`${t.fatGrams} IS NULL OR ${t.fatGrams} >= 0`),
    check("nutrition_carbs_check", sql`${t.carbsGrams} IS NULL OR ${t.carbsGrams} >= 0`),
  ],
);

/**
 * ВОЗДУХ — умственное развитие («я изучил»): свободный текст + дата.
 * Тип активности и продолжительность добавятся позже при необходимости.
 */
export const learningEntries = pgTable(
  "learning_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    entryDate: date("entry_date").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("learning_user_date_idx").on(t.userId, t.entryDate),
    check("learning_content_check", sql`length(trim(${t.content})) > 0`),
  ],
);

/**
 * ЗЕМЛЯ — созидание («я создал»): результат работы, а не процесс обучения.
 * Структура та же, что у Воздуха, но отдельная таблица — разделы развиваются
 * независимо.
 */
export const creationEntries = pgTable(
  "creation_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    entryDate: date("entry_date").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("creation_user_date_idx").on(t.userId, t.entryDate),
    check("creation_content_check", sql`length(trim(${t.content})) > 0`),
  ],
);

/**
 * Развлечения — честный учёт отдыха и отвлечений (не система наказаний).
 * Название + минуты; заметка опциональна.
 */
export const leisureEntries = pgTable(
  "leisure_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    entryDate: date("entry_date").notNull(),
    title: text("title").notNull(),
    minutes: integer("minutes"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("leisure_user_date_idx").on(t.userId, t.entryDate),
    check("leisure_title_check", sql`length(trim(${t.title})) > 0`),
    check("leisure_minutes_check", sql`${t.minutes} IS NULL OR ${t.minutes} > 0`),
  ],
);

/**
 * Аскеза — долгосрочное правило/ограничение. is_active = false отключает
 * отметки, история сохраняется. Серии и рубежи живут в asceticism_streaks.
 */
export const asceticisms = pgTable(
  "asceticisms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    startDate: date("start_date").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("asceticisms_title_check", sql`length(trim(${t.title})) > 0`)],
);

/**
 * Ежедневная отметка аскезы: 'done' | 'failed'; отсутствие строки = не
 * отмечено. unique (asceticism, date) — одна отметка в день.
 */
export const asceticismLogs = pgTable(
  "asceticism_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    asceticismId: uuid("asceticism_id")
      .notNull()
      .references(() => asceticisms.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    entryDate: date("entry_date").notNull(),
    status: text("status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("asceticism_logs_unique").on(t.asceticismId, t.entryDate),
    index("asceticism_logs_user_date_idx").on(t.userId, t.entryDate),
    check("asceticism_logs_status_check", sql`${t.status} in ('done', 'failed')`),
  ],
);

/**
 * Серия аскезы и её максимальная награда. Одна строка на аскезу, создаётся
 * лениво (backfill по истории отметок) и пересчитывается при каждой отметке.
 *
 * current_streak — серия до последней отметки 'done' (серия из 'done' подряд,
 * 'failed' или пропуск дня её обрывает). best_milestone — максимальный
 * достигнутый порог серии (награда); хранится навсегда, даже после сброса
 * серии или отключения аскезы. streak_since — дата повторного запуска
 * (деактивация → активация): серия после неё считается заново.
 */
export const asceticismStreaks = pgTable(
  "asceticism_streaks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    asceticismId: uuid("asceticism_id")
      .notNull()
      .references(() => asceticisms.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    currentStreak: integer("current_streak").notNull().default(0),
    longestStreak: integer("longest_streak").notNull().default(0),
    bestMilestone: integer("best_milestone").notNull().default(0),
    lastDoneDate: date("last_done_date"),
    streakSince: date("streak_since"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("asceticism_streaks_unique").on(t.asceticismId),
    index("asceticism_streaks_user_idx").on(t.userId, t.bestMilestone),
  ],
);

/**
 * Серия ведения дневника: сколько дней подряд есть хотя бы одна осмысленная
 * запись (мысль, тренировка, обучение, созидание, питание, досуг, отметка
 * аскезы). Одна строка на пользователя, создаётся лениво при первой записи
 * и пересчитывается при каждом изменении контента. best_milestone —
 * максимальный достигнутый порог серии (достижение); хранится навсегда.
 */
export const dayStreaks = pgTable(
  "day_streaks",
  {
    userId: uuid("user_id").primaryKey(),
    currentStreak: integer("current_streak").notNull().default(0),
    longestStreak: integer("longest_streak").notNull().default(0),
    bestMilestone: integer("best_milestone").notNull().default(0),
    /** Последний день с осмысленной записью. */
    lastActiveDate: date("last_active_date"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("day_streaks_user_idx").on(t.userId, t.bestMilestone)],
);

/**
 * Дневная AI-память: краткая структурированная выжимка дня, созданная
 * наставником по записям этого дня. content — jsonb со структурой:
 * { summary, observations[], adherence, achievements[], problems[], themes[] }.
 * Наставник анализирует эти выжимки, а не полную историю пользователя.
 */
export const aiDailyMemories = pgTable(
  "ai_daily_memories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    dayId: uuid("day_id").references(() => days.id, { onDelete: "cascade" }),
    entryDate: date("entry_date").notNull(),
    content: jsonb("content").notNull(),
    /** Модель/промпт, которым создана память, — для воспроизводимости. */
    generatedBy: text("generated_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("ai_daily_memories_user_date_unique").on(t.userId, t.entryDate),
    index("ai_daily_memories_user_date_idx").on(t.userId, t.entryDate),
  ],
);

/**
 * Периодическая AI-память (неделя/месяц) — архитектурная заготовка:
 * наставник будет агрегировать дневные памяти в периодические выжимки.
 * Приложение пока сюда не пишет.
 */
export const aiPeriodicMemories = pgTable(
  "ai_periodic_memories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    /** 'week' | 'month' (расширяемо). */
    periodType: text("period_type").notNull(),
    /** Начало периода (понедельник недели / 1-е число месяца). */
    periodStart: date("period_start").notNull(),
    content: jsonb("content").notNull(),
    generatedBy: text("generated_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("ai_periodic_memories_unique").on(t.userId, t.periodType, t.periodStart),
    check("ai_periodic_memories_period_check", sql`${t.periodType} in ('week', 'month')`),
  ],
);

/**
 * Сообщения наставника. role: 'mentor' | 'user'. dayDate связывает
 * наставление с днём (выжимка дня формируется после завершения дня).
 */
export const mentorMessages = pgTable(
  "mentor_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    entryDate: date("entry_date"),
    role: text("role").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("mentor_messages_user_idx").on(t.userId, t.createdAt),
    check("mentor_messages_role_check", sql`${t.role} in ('mentor', 'user')`),
  ],
);

/**
 * Постоянный system prompt наставника — редактируется в БД без деплоя.
 * Дефолтное значение сеется миграцией 0001_rls.sql; текст дефолта живёт в
 * lib/mentor/default-system-prompt.ts (единый источник для сеяния и документации).
 */
export const mentorPrompts = pgTable("mentor_prompts", {
  key: text("key").primaryKey(),
  content: text("content").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Profile = typeof profiles.$inferSelect;
export type RpgProfile = typeof rpgProfiles.$inferSelect;
export type PathElement = typeof pathElements.$inferSelect;
export type Thought = typeof thoughts.$inferSelect;
export type TrainingActivity = typeof trainingActivities.$inferSelect;
export type NutritionEntry = typeof nutritionEntries.$inferSelect;
export type LearningEntry = typeof learningEntries.$inferSelect;
export type CreationEntry = typeof creationEntries.$inferSelect;
export type LeisureEntry = typeof leisureEntries.$inferSelect;
export type Asceticism = typeof asceticisms.$inferSelect;
export type AsceticismLog = typeof asceticismLogs.$inferSelect;
export type AsceticismStreak = typeof asceticismStreaks.$inferSelect;
export type DayStreak = typeof dayStreaks.$inferSelect;
export type AiDailyMemory = typeof aiDailyMemories.$inferSelect;
export type MentorMessage = typeof mentorMessages.$inferSelect;
