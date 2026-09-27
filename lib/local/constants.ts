/**
 * Константы локальной базы. HISTORY_PAGE_SIZE дублирует lib/day.ts —
 * тот модуль серверный (тянет drizzle и pg-пул), клиенту нельзя.
 */

/** Записей на страницу истории. */
export const HISTORY_PAGE_SIZE = 12;
