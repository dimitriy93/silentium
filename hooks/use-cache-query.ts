"use client";

import { useEffect, useRef, useState, type DependencyList } from "react";
import { useLocalData } from "@/lib/local/local-context";

/**
 * Чтение данных экрана из локальной базы.
 *
 * Читатель вызывается при монтировании, при смене зависимостей (дата,
 * страница) и после каждой локальной мутации (version из LocalProvider) —
 * интерфейс всегда отражает текущее состояние IndexedDB.
 *
 * null от читателя («хранилище недоступно») состояние не изменяет:
 * компонент продолжает показывать лоадер.
 */
export function useCacheQuery<T>(read: () => Promise<T | null>, deps: DependencyList): T | null {
  const { version } = useLocalData();
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
        // Повреждённый кеш не ломает экран: остаётся последнее состояние.
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version]);

  return data;
}
