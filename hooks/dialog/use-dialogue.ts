"use client";

import { useEffect, useRef, useState } from "react";
import { pickPhrase } from "@/lib/avatar/phrases";

/**
 * Тайминги диалога: 2–3 с после открытия → показать 4–5 с → скрыть →
 * пауза 5 с → следующая фраза. Продолжается, пока экран смонтирован.
 * Фразы приходят готовым массивом (сценарий по фактическим данным дня);
 * при смене сценария пул перечитывается на следующем цикле. Без ИИ.
 */

const INITIAL_DELAY_MS = 2500;
const VISIBLE_MS = 4500;
const HIDDEN_MS = 5000;

export function useDialogue(phrases: string[]): { message: string | null } {
  const [message, setMessage] = useState<string | null>(null);
  const phrasesRef = useRef(phrases);
  phrasesRef.current = phrases;

  useEffect(() => {
    let disposed = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let counter = 0;

    const later = (fn: () => void, ms: number) => {
      const id = setTimeout(() => {
        if (!disposed) fn();
      }, ms);
      timers.push(id);
    };

    function cycle() {
      setMessage(pickPhrase(phrasesRef.current, counter));
      counter += 1;
      later(() => {
        setMessage(null);
        later(cycle, HIDDEN_MS);
      }, VISIBLE_MS);
    }

    later(cycle, INITIAL_DELAY_MS);

    return () => {
      disposed = true;
      timers.forEach(clearTimeout);
    };
  }, []);

  return { message };
}
