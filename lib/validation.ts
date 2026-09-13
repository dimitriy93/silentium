import { z } from "zod";

/** UUID. */
export const uuidSchema = z.uuid();

/** Локальная дата пользователя YYYY-MM-DD. */
export const entryDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Некорректная дата");

/** Непустой текст после обрезки пробелов. */
export function nonEmptyText(label: string, max = 10000) {
  return z
    .string({ message: `${label} обязателен` })
    .trim()
    .min(1, `${label} не может быть пустым`)
    .max(max, `${label} слишком длинный`);
}

export function formatZodError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Некорректные данные";
}
