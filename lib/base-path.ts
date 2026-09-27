/**
 * Базовый путь деплоя. По умолчанию приложение живёт в корне любого
 * static-хостинга; при размещении в подпапке (например GitHub Pages
 * <user>.github.io/<repo>) сборка задаёт NEXT_PUBLIC_BASE_PATH — и статика,
 * ссылки на публичные файлы и service worker получают тот же префикс.
 * Жёсткой привязки к GitHub Pages нет: без переменной всё работает как раньше.
 */
export function basePath(): string {
  const value = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  return value.replace(/\/$/, "");
}

/** Добавить базовый путь к абсолютному пути публичного файла. */
export function withBasePath(path: string): string {
  const base = basePath();
  if (!base || !path.startsWith("/")) return path;
  return `${base}${path}`;
}
