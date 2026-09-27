"use client";

import { useEffect, useState } from "react";
import { localDb, type StoredImage } from "@/lib/local/db";

/**
 * Локальное хранилище изображений (IndexedDB, таблица images).
 *
 * Изображение один раз забирается по сети, сохраняется blob'ом в IndexedDB
 * и дальше всегда показывается из локальной копии через object URL —
 * без интернета и без обращения к серверу. Перезагрузка страницы переживается
 * (данные в базе), object URL пересоздаётся на лету и держится в памяти
 * вкладки, чтобы не плодить записи.
 *
 * Ключ — произвольная строка (путь ассета или id пользовательской картинки);
 * сохранение пользовательских загрузок идёт через тот же API: saveLocalImage.
 */

/** object URL по ключу на время жизни вкладки. */
const urlCache = new Map<string, string>();

/** Ключ по пути ассета — путь уже уникален и стабилен. */
function keyForSource(src: string): string {
  return `asset:${src}`;
}

async function readStored(key: string): Promise<StoredImage | undefined> {
  const db = localDb();
  if (!db) return undefined;
  try {
    return await db.images.get(key);
  } catch {
    return undefined;
  }
}

function toObjectUrl(row: StoredImage): string {
  const cached = urlCache.get(row.key);
  if (cached) return cached;
  const blob =
    row.blob instanceof Blob && row.blob.type
      ? row.blob
      : new Blob([row.blob], { type: row.mimeType || "image/webp" });
  const url = URL.createObjectURL(blob);
  urlCache.set(row.key, url);
  return url;
}

/**
 * URL локальной копии изображения. Порядок: IndexedDB → (промаха) сеть с
 * сохранением → null (и сети нет, и локальной копии нет).
 */
export async function getLocalImage(src: string): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const cached = urlCache.get(keyForSource(src));
  if (cached) return cached;

  const stored = await readStored(keyForSource(src));
  if (stored) return toObjectUrl(stored);

  try {
    const response = await fetch(src);
    if (!response.ok) return null;
    const blob = await response.blob();
    await saveLocalImage(keyForSource(src), blob);
    return toObjectUrl({
      key: keyForSource(src),
      blob,
      savedAt: new Date().toISOString(),
      mimeType: blob.type || "image/webp",
    });
  } catch {
    return null;
  }
}

/** Сохранить blob под произвольным ключом (в том числе пользовательские загрузки). */
export async function saveLocalImage(key: string, blob: Blob): Promise<void> {
  const db = localDb();
  if (!db) throw new Error("Локальное хранилище недоступно");
  const row: StoredImage = {
    key,
    blob,
    savedAt: new Date().toISOString(),
    mimeType: blob.type || "application/octet-stream",
  };
  await db.images.put(row);
  const existing = urlCache.get(key);
  if (existing) URL.revokeObjectURL(existing);
  urlCache.set(key, URL.createObjectURL(blob));
}

/** Удалить изображение (например, пользовательскую картинку). */
export async function deleteLocalImage(key: string): Promise<void> {
  const db = localDb();
  if (!db) return;
  try {
    await db.images.delete(key);
  } catch {
    // повтор после перезагрузки
  }
  const existing = urlCache.get(key);
  if (existing) {
    URL.revokeObjectURL(existing);
    urlCache.delete(key);
  }
}

/** React-хук: локальный URL изображения (null → изображения нет и в кеше, и в сети). */
export function useLocalImage(src: string | null): string | null {
  const [url, setUrl] = useState<string | null>(src ? urlCache.get(keyForSource(src)) ?? null : null);
  useEffect(() => {
    let active = true;
    if (!src) {
      setUrl(null);
      return;
    }
    void getLocalImage(src).then((next) => {
      if (active) setUrl(next);
    });
    return () => {
      active = false;
    };
  }, [src]);
  return url;
}
