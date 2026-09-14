"use client";

import { useEffect, useRef, useState } from "react";
import { pickPhrase, phrasesForScenario, type DialogScenario } from "@/lib/avatar/phrases";

/**
 * Тайминги диалога: 2–3 с после открытия → показать 4–5 с → скрыть →
 * пауза 5 с → следующая фраза. Продолжается, пока экран смонтирован.
 * Фразы берутся из констант, без ИИ.
 */

const INITIAL_DELAY_MS = 2500;
const VISIBLE_MS = 4500;
const HIDDEN_MS = 5000;

export function useDialogue(scenario: DialogScenario): { message: string | null } {
  const [message, setMessage] = useState<string | null>(null);
  const scenarioRef = useRef(scenario);
  scenarioRef.current = scenario;

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
      const phrases = phrasesForScenario(scenarioRef.current);
      setMessage(pickPhrase(phrases, counter));
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
