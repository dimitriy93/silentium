/** Унифицированный результат server action для useActionState / вызовов клиента. */
export type Action<T> = { ok: true; data: T } | { ok: false; error: string };

export type ActionState = { error?: string; success?: string };
