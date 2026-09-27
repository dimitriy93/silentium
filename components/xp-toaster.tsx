"use client";

import { useEffect, useRef, useState } from "react";
import { subscribeXp } from "@/lib/local/xp";

/**
 * Тосты начисления опыта: «+10 XP / Тренировка» и — при переходе уровня —
 * более заметный «Новый уровень». Слушает событие из lib/local/xp.ts
 * (диспетчится в момент локального действия, никогда из рендера).
 * Ненавязчиво: пилюли в существующем бронзовом стиле, исчезают сами.
 */

interface Toast {
  key: number;
  kind: "xp" | "level";
  amount?: number;
  description?: string;
  level?: number;
}

const XP_TTL_MS = 3200;
const LEVEL_TTL_MS = 6000;

export default function XpToaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextKey = useRef(0);

  useEffect(
    () =>
      subscribeXp((detail) => {
        const added: Toast[] = detail.events.map((e) => ({
          key: nextKey.current++,
          kind: "xp",
          amount: e.amount,
          description: e.description,
        }));
        if (detail.newLevel !== null) {
          added.push({ key: nextKey.current++, kind: "level", level: detail.newLevel });
        }
        setToasts((prev) => [...prev, ...added]);
        for (const t of added) {
          setTimeout(
            () => setToasts((prev) => prev.filter((x) => x.key !== t.key)),
            t.kind === "level" ? LEVEL_TTL_MS : XP_TTL_MS,
          );
        }
      }),
    [],
  );

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-24 left-1/2 z-50 flex w-[calc(100%-2.5rem)] max-w-xs -translate-x-1/2 flex-col items-center gap-2"
    >
      {toasts.map((t) =>
        t.kind === "level" ? (
          <div
            key={t.key}
            className="bronze-card bronze-edge w-full px-4 py-3 text-center shadow-lg"
            role="status"
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--ink-faint)]">
              Новый уровень
            </p>
            <p className="font-chronicle mt-0.5 text-xl font-bold text-[var(--gold)]">
              Уровень {t.level}
            </p>
          </div>
        ) : (
          <div
            key={t.key}
            className="bronze-card bronze-edge flex w-auto items-baseline gap-2 rounded-full px-4 py-1.5 shadow-lg"
            role="status"
          >
            <span className="text-sm font-semibold text-[var(--gold)]">+{t.amount} XP</span>
            <span className="text-xs text-[var(--ink-secondary)]">{t.description}</span>
          </div>
        ),
      )}
    </div>
  );
}
