"use client";

/**
 * Событие «локальные данные изменились». Мутации (lib/local/mutations.ts)
 * будят им LocalProvider — экраны перечитывают локальную базу. Замена
 * прежних outbox-уведомлений: серверной очереди больше нет.
 */

const LOCAL_EVENT = "silentium:local";

export function notifyLocalChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(LOCAL_EVENT));
}

export function subscribeLocal(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(LOCAL_EVENT, listener);
  return () => window.removeEventListener(LOCAL_EVENT, listener);
}
