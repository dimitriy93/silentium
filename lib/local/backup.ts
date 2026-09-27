"use client";

import { z } from "zod";
import {
  LOCAL_USER_ID,
  PRE_IMPORT_BACKUP_KEY,
  journalTables,
  localDb,
} from "@/lib/local/db";
import { notifyLocalChanged } from "@/lib/local/events";
import { syncLocalDayStreak } from "@/lib/local/streaks";
import { recomputeXpProfile } from "@/lib/local/xp";
import { todayLocalDate } from "@/lib/format";
import { entryDateSchema, uuidSchema } from "@/lib/validation";

/**
 * Резервная копия (полностью локальное приложение): единственный способ
 * перенести данные между устройствами и восстановиться после очистки
 * хранилища — versioned JSON-файл.
 *
 * Принцип минимальности: backup содержит первичные данные (записи, отметки,
 * аскезы, серии аскез с не выводимой из истории streakSince, XP-события,
 * изображения). Производные значения в backup не попадают — они
 * восстанавливаются пересчётом: агрегат xpProfile пересчитывается из
 * xpEvents, серия дневника — из дат записей, уровень/ранг/характеристики/
 * радар вычисляются на лету из событий.
 *
 * UUID всех записей сохраняются как есть — импорт не генерирует новые:
 * связи, история XP, якоря sourceId и статистика остаются согласованными.
 */

export const BACKUP_FORMAT = "silentium-backup";
export const BACKUP_VERSION = 1;

// ---------- Формат экспорта ----------

/** Строка изображения в backup: blob кодируется data-URL (base64). */
export interface BackupImage {
  key: string;
  mimeType: string;
  savedAt: string;
  dataUrl: string;
}

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  data: {
    thoughts: BackupThought[];
    training: BackupTraining[];
    nutrition: BackupNutrition[];
    learning: BackupLearning[];
    creation: BackupLearning[];
    leisure: BackupLeisure[];
    asceticisms: BackupAsceticism[];
    asceticismLogs: BackupAsceticismLog[];
    asceticismStreaks: BackupAsceticismStreak[];
    xpEvents: BackupXpEvent[];
    images: BackupImage[];
  };
}

type BackupThought = Omit<LocalThoughtRow, "userId">;
type BackupTraining = Omit<LocalTrainingRow, "userId">;
type BackupNutrition = Omit<LocalNutritionRow, "userId">;
type BackupLearning = Omit<LocalLearningRow, "userId">;
type BackupLeisure = Omit<LocalLeisureRow, "userId">;
type BackupAsceticism = Omit<LocalAsceticismRow, "userId">;
type BackupAsceticismLog = Omit<LocalAsceticismLogRow, "userId">;
type BackupAsceticismStreak = Omit<LocalAsceticismStreakRow, "userId">;
type BackupXpEvent = Omit<LocalXpEventRow, "userId">;

interface LocalThoughtRow {
  id: string;
  userId: string;
  entryDate: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}
interface LocalTrainingRow {
  id: string;
  userId: string;
  entryDate: string;
  title: string;
  detail: string | null;
  durationMinutes: number | null;
  notes: string | null;
  createdAt: string;
}
interface LocalNutritionRow {
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
interface LocalLearningRow {
  id: string;
  userId: string;
  entryDate: string;
  content: string;
  createdAt: string;
}
interface LocalLeisureRow {
  id: string;
  userId: string;
  entryDate: string;
  title: string;
  minutes: number | null;
  notes: string | null;
  createdAt: string;
}
interface LocalAsceticismRow {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  startDate: string;
  isActive: boolean;
  createdAt: string;
}
interface LocalAsceticismLogRow {
  id: string;
  asceticismId: string;
  userId: string;
  entryDate: string;
  status: string;
  createdAt: string;
}
interface LocalAsceticismStreakRow {
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
interface LocalXpEventRow {
  id: string;
  userId: string;
  entryDate: string | null;
  type: string;
  amount: number;
  description: string;
  sourceId: string;
  createdAt: string;
}

// ---------- Валидация (zod) ----------

/** Лёгкая проверка ISO-метки: формат «2026-09-27T19:30:00…» любой вариации. */
const timestampSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}T/, "Некорректная метка времени");
const nullableText = (max: number) => z.string().max(max).nullish().transform((v) => v ?? null);
const text = (max: number) => z.string().max(max);
const macro = z.number().min(0).max(1_000_000).nullish().transform((v) => v ?? null);
const positiveInt = z.number().int().min(1).max(1440).nullish().transform((v) => v ?? null);

const thoughtSchema = z.object({
  id: uuidSchema,
  entryDate: entryDateSchema,
  content: text(10000),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

const trainingSchema = z.object({
  id: uuidSchema,
  entryDate: entryDateSchema,
  title: text(200),
  detail: nullableText(500),
  durationMinutes: positiveInt,
  notes: nullableText(2000),
  createdAt: timestampSchema,
});

const nutritionSchema = z.object({
  id: uuidSchema,
  entryDate: entryDateSchema,
  calories: macro,
  proteinGrams: macro,
  fatGrams: macro,
  carbsGrams: macro,
  note: nullableText(2000),
  source: text(20).catch("manual"),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

const learningSchema = z.object({
  id: uuidSchema,
  entryDate: entryDateSchema,
  content: text(5000),
  createdAt: timestampSchema,
});

const leisureSchema = z.object({
  id: uuidSchema,
  entryDate: entryDateSchema,
  title: text(200),
  minutes: positiveInt,
  notes: nullableText(2000),
  createdAt: timestampSchema,
});

const asceticismSchema = z.object({
  id: uuidSchema,
  title: text(200),
  description: nullableText(2000),
  startDate: entryDateSchema,
  isActive: z.boolean(),
  createdAt: timestampSchema,
});

const asceticismLogSchema = z.object({
  id: uuidSchema,
  asceticismId: uuidSchema,
  entryDate: entryDateSchema,
  status: z.enum(["done", "failed"]),
  createdAt: timestampSchema,
});

const asceticismStreakSchema = z.object({
  id: uuidSchema,
  asceticismId: uuidSchema,
  currentStreak: z.number().int().min(0),
  longestStreak: z.number().int().min(0),
  bestMilestone: z.number().int().min(0),
  lastDoneDate: entryDateSchema.nullish().transform((v) => v ?? null),
  streakSince: entryDateSchema.nullish().transform((v) => v ?? null),
  updatedAt: timestampSchema,
});

const xpEventSchema = z.object({
  id: uuidSchema,
  entryDate: entryDateSchema.nullish().transform((v) => v ?? null),
  type: z.enum(["path", "asceticism", "thought", "day"]),
  amount: z.number().int().min(1).max(10000),
  description: text(200).catch(""),
  sourceId: text(200).min(1),
  createdAt: timestampSchema,
});

const imageSchema = z.object({
  key: text(200).min(1),
  mimeType: text(100).regex(/^[\w.+-]+\/[\w.+-]+$/, "Некорректный MIME-тип"),
  savedAt: timestampSchema,
  dataUrl: z
    .string()
    .max(20 * 1024 * 1024)
    .regex(/^data:[\w.+-]+\/[\w.+-]+;base64,/, "Некорректный data-URL изображения"),
});

const backupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.literal(BACKUP_VERSION),
  exportedAt: timestampSchema,
  data: z.object({
    thoughts: z.array(thoughtSchema),
    training: z.array(trainingSchema),
    nutrition: z.array(nutritionSchema),
    learning: z.array(learningSchema),
    creation: z.array(learningSchema),
    leisure: z.array(leisureSchema),
    asceticisms: z.array(asceticismSchema),
    asceticismLogs: z.array(asceticismLogSchema),
    asceticismStreaks: z.array(asceticismStreakSchema),
    xpEvents: z.array(xpEventSchema),
    images: z.array(imageSchema),
  }),
});

export type ParsedBackup = z.infer<typeof backupSchema>;

// ---------- Экспорт ----------

/** Собрать backup текущих локальных данных (JSON-строка). */
export async function createBackupJson(): Promise<string> {
  const db = localDb();
  if (!db) throw new Error("Локальное хранилище недоступно");

  const [
    thoughts,
    training,
    nutrition,
    learning,
    creation,
    leisure,
    asceticisms,
    asceticismLogs,
    asceticismStreaks,
    xpEvents,
    images,
  ] = await Promise.all([
    db.thoughts.toArray(),
    db.training.toArray(),
    db.nutrition.toArray(),
    db.learning.toArray(),
    db.creation.toArray(),
    db.leisure.toArray(),
    db.asceticisms.toArray(),
    db.asceticismLogs.toArray(),
    db.asceticismStreaks.toArray(),
    db.xpEvents.toArray(),
    db.images.toArray(),
  ]);

  const strip = <T extends { userId: string }>(rows: T[]): Omit<T, "userId">[] =>
    // userId не экспортируется: владелец данных — само устройство.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    rows.map(({ userId: _userId, ...rest }) => rest);

  const backup: BackupFile = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      thoughts: strip(thoughts as LocalThoughtRow[]),
      training: strip(training as LocalTrainingRow[]),
      nutrition: strip(nutrition as LocalNutritionRow[]),
      learning: strip(learning as LocalLearningRow[]),
      creation: strip(creation as LocalLearningRow[]),
      leisure: strip(leisure as LocalLeisureRow[]),
      asceticisms: strip(asceticisms as LocalAsceticismRow[]),
      asceticismLogs: strip(asceticismLogs as LocalAsceticismLogRow[]),
      asceticismStreaks: strip(asceticismStreaks as LocalAsceticismStreakRow[]),
      xpEvents: strip(xpEvents as LocalXpEventRow[]),
      images: await Promise.all(
        images.map(async (img) => ({
          key: img.key,
          mimeType: img.mimeType,
          savedAt: img.savedAt,
          dataUrl: await blobToDataUrl(img.blob, img.mimeType),
        })),
      ),
    },
  };
  return JSON.stringify(backup);
}

/** Имя файла backup: silentium-backup-YYYY-MM-DD.json. */
export function backupFileName(now: Date = new Date()): string {
  const date = todayLocalDateFrom(now);
  return `silentium-backup-${date}.json`;
}

function todayLocalDateFrom(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** Скачать backup как JSON-файл (браузерная загрузка). */
export async function downloadBackup(): Promise<void> {
  const json = await createBackupJson();
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = backupFileName();
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

// ---------- Импорт ----------

export type ParseResult =
  | { ok: true; backup: ParsedBackup }
  | { ok: false; error: string };

/** Прочитать и проверить JSON: формат, версия, структура всех таблиц. */
export function parseBackupJson(raw: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Файл не является корректным JSON" };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, error: "Файл не является резервной копией Silentium" };
  }
  const format = (parsed as { format?: unknown }).format;
  const version = (parsed as { version?: unknown }).version;
  if (format !== BACKUP_FORMAT) {
    return { ok: false, error: "Это не backup Silentium (неизвестный формат файла)" };
  }
  if (version !== BACKUP_VERSION) {
    return {
      ok: false,
      error: `Неподдерживаемая версия резервной копии (${String(version)}). Приложение понимает версию ${BACKUP_VERSION}`,
    };
  }
  const result = backupSchema.safeParse(parsed);
  if (!result.success) {
    const issue = result.error.issues[0];
    const where = issue?.path?.length ? ` (раздел «${issue.path.slice(0, 2).join(".")}»)` : "";
    return { ok: false, error: `Резервная копия повреждена${where}: ${issue?.message ?? "структура не совпадает"}` };
  }
  return { ok: true, backup: result.data };
}

/**
 * Восстановить данные из проверенного backup.
 *
 * Безопасность:
 * 1) перед заменой текущие данные сериализуются в страховочную копию и
 *    сохраняются в таблице meta (key = PRE_IMPORT_BACKUP_KEY) — если импорт
 *    запорот не тем файлом, копия остаётся в хранилище;
 * 2) замена выполняется одной транзакцией IndexedDB: очистка журнальных
 *    таблиц и изображений, запись данных backup, пересчёт агрегата XP и
 *    серии дневника — либо всё, либо ничего;
 * 3) XP заново не начисляется: события переносятся как есть, уровень,
 *    ранг, характеристики и радар восстанавливаются вычислением.
 */
export async function applyBackup(backup: ParsedBackup): Promise<void> {
  const db = localDb();
  if (!db) throw new Error("Локальное хранилище недоступно");

  // Шаг 1: страховочная копия текущих данных (отдельная транзакция —
  // если импорт сломается, копия уже сохранена).
  const safetyJson = await createBackupJson();
  await db.meta.put({
    key: PRE_IMPORT_BACKUP_KEY,
    userId: LOCAL_USER_ID,
    pulledAt: new Date().toISOString(),
    backupJson: safetyJson,
  });

  // Шаг 2: подготовка строк (userId нормализуется; изображения декодируются
  // в Blob до транзакции).
  const images = backup.data.images.map((img) => ({
    key: img.key,
    mimeType: img.mimeType,
    savedAt: img.savedAt,
    blob: dataUrlToBlob(img.dataUrl, img.mimeType),
  }));

  // Шаг 3: атомарная замена.
  await db.transaction(
    "rw",
    [...journalTables(db), db.xpProfile, db.images],
    async () => {
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
        db.xpEvents.clear(),
        db.dayStreak.clear(),
        db.images.clear(),
      ]);

      await Promise.all([
        db.thoughts.bulkPut(backup.data.thoughts.map((r) => ({ ...r, userId: LOCAL_USER_ID }))),
        db.training.bulkPut(backup.data.training.map((r) => ({ ...r, userId: LOCAL_USER_ID }))),
        db.nutrition.bulkPut(
          backup.data.nutrition.map((r) => ({ ...r, userId: LOCAL_USER_ID, source: "manual" })),
        ),
        db.learning.bulkPut(backup.data.learning.map((r) => ({ ...r, userId: LOCAL_USER_ID }))),
        db.creation.bulkPut(backup.data.creation.map((r) => ({ ...r, userId: LOCAL_USER_ID }))),
        db.leisure.bulkPut(backup.data.leisure.map((r) => ({ ...r, userId: LOCAL_USER_ID }))),
        db.asceticisms.bulkPut(backup.data.asceticisms.map((r) => ({ ...r, userId: LOCAL_USER_ID }))),
        db.asceticismLogs.bulkPut(backup.data.asceticismLogs.map((r) => ({ ...r, userId: LOCAL_USER_ID }))),
        db.asceticismStreaks.bulkPut(
          backup.data.asceticismStreaks.map((r) => ({ ...r, userId: LOCAL_USER_ID })),
        ),
        db.xpEvents.bulkPut(backup.data.xpEvents.map((r) => ({ ...r, userId: LOCAL_USER_ID }))),
        db.images.bulkPut(images),
      ]);

      // Производные значения восстанавливаются пересчётом.
      await recomputeXpProfile(db, LOCAL_USER_ID);
      await syncLocalDayStreak(db, todayLocalDate());
    },
  );

  notifyLocalChanged();
}

/** Прочитать страховочную копию (для диагностики / ручного восстановления). */
export async function readPreImportBackupJson(): Promise<string | null> {
  const db = localDb();
  if (!db) return null;
  try {
    const row = await db.meta.get(PRE_IMPORT_BACKUP_KEY);
    return row?.backupJson ?? null;
  } catch {
    return null;
  }
}

// ---------- Утилиты ----------

function blobToDataUrl(blob: Blob, mimeType: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Не удалось прочитать изображение"));
    reader.readAsDataURL(new Blob([blob], { type: mimeType }));
  });
}

function dataUrlToBlob(dataUrl: string, mimeType: string): Blob {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

/** Сводка backup для подтверждения импорта. */
export function backupSummary(backup: ParsedBackup): string[] {
  const d = backup.data;
  const rows: Array<[string, number]> = [
    ["Мысли", d.thoughts.length],
    ["Тренировки", d.training.length],
    ["Питание", d.nutrition.length],
    ["Обучение", d.learning.length],
    ["Созидание", d.creation.length],
    ["Развлечения", d.leisure.length],
    ["Аскезы", d.asceticisms.length],
    ["Отметки аскез", d.asceticismLogs.length],
    ["XP-события", d.xpEvents.length],
    ["Изображения", d.images.length],
  ];
  return rows.filter(([, n]) => n > 0).map(([label, n]) => `${label}: ${n}`);
}
