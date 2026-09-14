"use client";

import { useEffect, useMemo, useState } from "react";
import AvatarSprite from "@/components/avatar/avatar-sprite";
import { useAvatarBehavior } from "@/hooks/avatar/use-avatar-behavior";
import { useDialogue } from "@/hooks/dialog/use-dialogue";
import { activityCountOfDay, moodForActivityCount, type Mood } from "@/lib/avatar/mood";
import { scenarioForNow } from "@/lib/avatar/phrases";
import {
  preloadRoomImages,
  ROOM_IMAGES,
  roomPeriodForHour,
  type RoomPeriod,
} from "@/lib/avatar/room";
import type { PathDay } from "@/actions/path";

/**
 * «Живая комната» — карточка-секция на экране «Сегодня».
 * Фон выбирается по локальному времени, аватар живёт по собственному
 * циклу поведения (useAvatarBehavior), настроение зависит от числа
 * записанных активностей дня, фразы — из локального диалогового движка.
 */

const MOOD_STYLES: Record<Mood, { color: string; label: string }> = {
  happy: { color: "#8fae6f", label: "спокойно и довольно" },
  neutral: { color: "var(--bronze-bright)", label: "размышляет" },
  concerned: { color: "#c07a6a", label: "немного обеспокоен" },
};

function roomImageSrc(period: RoomPeriod): string {
  return ROOM_IMAGES[period];
}

export default function AvatarRoom({ path }: { path: PathDay | null }) {
  // Период и час вычисляются только на клиенте — без рассинхрона гидратации.
  const [period, setPeriod] = useState<RoomPeriod | null>(null);
  const [hour, setHour] = useState<number | null>(null);
  const actor = useAvatarBehavior();
  const activityCount = path ? activityCountOfDay(path) : 0;
  const mood = moodForActivityCount(activityCount);

  useEffect(() => {
    preloadRoomImages();
    function update() {
      const now = new Date();
      setPeriod(roomPeriodForHour(now.getHours()));
      setHour(now.getHours());
    }
    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, []);

  const scenario = useMemo(() => {
    // Час неизвестен до монтирования — берём нейтральный полдень.
    return scenarioForNow(hour ?? 12, activityCount, mood);
  }, [hour, activityCount, mood]);

  const { message } = useDialogue(scenario);

  return (
    <section className="bronze-card bronze-edge overflow-hidden">
      <div className="relative w-full" style={{ aspectRatio: "765 / 509" }}>
        {/* Фон: два слоя для плавного кроссфейда при смене периода */}
        <RoomBackground period={period} src={period ? roomImageSrc(period) : null} />

        {/* Настроение — маленькая точка-индикатор в углу комнаты */}
        <div
          className="absolute top-3 right-3 flex items-center gap-1.5 rounded-full px-2.5 py-1"
          style={{ background: "rgba(10, 15, 28, 0.55)", border: "1px solid var(--card-edge)" }}
        >
          <span
            aria-hidden="true"
            className="block h-2 w-2 rounded-full"
            style={{ background: MOOD_STYLES[mood].color, boxShadow: `0 0 6px ${MOOD_STYLES[mood].color}` }}
          />
          <span className="text-[11px] text-[var(--ink-secondary)]">Спутник</span>
        </div>

        {/* Реплика спутника */}
        <div
          aria-live="polite"
          className={
            "absolute inset-x-4 bottom-[27%] flex justify-center transition-all duration-700 " +
            (message ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0")
          }
        >
          {message ? (
            <p
              className="max-w-[85%] rounded-xl px-3.5 py-2 text-center text-[13px] leading-snug text-[var(--ink)]"
              style={{
                background: "rgba(10, 15, 28, 0.82)",
                border: "1px solid var(--card-edge)",
                backdropFilter: "blur(6px)",
              }}
            >
              {message}
            </p>
          ) : null}
        </div>

        {/* Аватар: перемещение сглаживает CSS-переход, длительность задаёт behavior */}
        <div
          className="absolute bottom-[14%]"
          style={{
            left: `${actor.x * 100}%`,
            transform: "translateX(-50%)",
            transition:
              actor.walkDurationMs > 0
                ? `left ${actor.walkDurationMs}ms linear`
                : "left 700ms ease",
          }}
        >
          <AvatarSprite state={actor.state} />
        </div>
      </div>
    </section>
  );
}

/** Кроссфейд фона: старый слой растворяется, новый проявляется сверху. */
function RoomBackground({ period, src }: { period: RoomPeriod | null; src: string | null }) {
  const [layers, setLayers] = useState<{ src: string; opacity: number }[]>(
    src ? [{ src, opacity: 1 }] : [],
  );

  useEffect(() => {
    if (!src) return;
    setLayers((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.src === src) return prev;
      const faded = prev.map((l) => ({ ...l, opacity: 0 }));
      return [...faded, { src, opacity: 1 }].slice(-2);
    });
  }, [src, period]);

  return (
    <>
      {layers.map((layer) => (
        <img
          key={layer.src}
          src={layer.src}
          alt=""
          aria-hidden="true"
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ease-in-out"
          style={{ opacity: layer.opacity }}
        />
      ))}
      {/* Мягкое затемнение снизу — реплики читаются спокойнее */}
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(10,15,28,0.12) 0%, transparent 30%, transparent 70%, rgba(10,15,28,0.35) 100%)",
        }}
      />
    </>
  );
}
