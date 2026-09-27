/**
 * Общие типы и порядок событий Хроники Пути. Файл без серверных импортов:
 * его импортируют и серверная сборка (lib/chronicle.ts), и клиентское
 * построение из локальной базы (lib/local/chronicle.ts).
 *
 * События летописи собираются из уже существующих данных (без отдельной
 * таблицы событий):
 * - начало дневника — первый «осмысленный» день (тот же UNION, что у истории);
 * - принятие аскезы — её startDate;
 * - первая выполненная аскеза — первая отметка 'done';
 * - достижения серий аскез — даты, когда серия впервые достигла порога;
 * - рубежи серии дневника — даты, когда серия дней подряд впервые
 *   достигла порога.
 */

export type ChronicleKind =
  | "journal_start"
  | "asceticism_created"
  | "asceticism_first_done"
  | "asceticism_milestone"
  | "day_streak_milestone";

export interface ChronicleEvent {
  key: string;
  date: string;
  kind: ChronicleKind;
  title: string;
  subtitle?: string;
}

/** Порядок событий с одной датой: от «начала пути» к рубежам. */
export const KIND_ORDER: ChronicleKind[] = [
  "journal_start",
  "asceticism_created",
  "asceticism_first_done",
  "asceticism_milestone",
  "day_streak_milestone",
];
