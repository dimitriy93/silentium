"use client";

import { useEffect, useRef, useState, type DependencyList } from "react";
import { useSync } from "@/lib/local/sync-context";

/**
 * Чтение данных экрана из локального кеша (stale-while-revalidate, этап 1).
 *
 * Читатель вызывается при монтировании, при смене зависимостей (дата,
 * страница) и после каждой успешной снапшот-синхронизации (version из
 * SyncProvider) — так интерфейс, показанный мгновенно из кеша,
 * обновляется, если сервер вернул другое.
 *
 * null от читателя («кеш ещё не гидратирован») состояние не изменяет:
 * компонент продолжает показывать лоадер до первого снапшота.
 */
export function useCacheQuery<T>(read: () => Promise<T | null>, deps: DependencyList): T | null {
  const { version } = useSync();
  const [data, setData] = useState<T | null>(null);
  const readRef = useRef(read);
  readRef.current = read;

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const result = await readRef.current();
        if (active && result !== null) setData(result);
      } catch {
        // Повреждённый кеш не ломает экран: остаётся лоадер / данные сервера.
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version]);

  return data;
}
