"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { subscribeLocal } from "@/lib/local/events";
import XpToaster from "@/components/xp-toaster";

/**
 * Провайдер локальных данных (полностью локальное приложение): после каждой
 * локальной мутации инкрементирует version — экраны перечитывают локальную
 * базу. Никаких сетевых эффектов: сервера больше нет, IndexedDB —
 * единственный источник истины.
 */

interface LocalState {
  /** Инкрементируется после каждой локальной мутации / импорта backup. */
  version: number;
  /** Принудительно перечитать экраны (используется после импорта). */
  bump: () => void;
}

const LocalContext = createContext<LocalState>({ version: 0, bump: () => {} });

export function useLocalData(): LocalState {
  return useContext(LocalContext);
}

export default function LocalProvider({ children }: { children: React.ReactNode }) {
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(
    () =>
      subscribeLocal(() => {
        setVersion((v) => v + 1);
      }),
    [],
  );

  const value = useMemo(() => ({ version, bump }), [version, bump]);

  return (
    <LocalContext.Provider value={value}>
      {children}
      <XpToaster />
    </LocalContext.Provider>
  );
}
