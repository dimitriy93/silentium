"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import AvatarSprite from "@/components/avatar/avatar-sprite";
import { useAvatarBehavior, DEFAULT_AVATAR_BOUNDS } from "@/hooks/avatar/use-avatar-behavior";
import { useDialogue } from "@/hooks/dialog/use-dialogue";
import { activityCountOfDay, moodForActivityCount, type Mood } from "@/lib/avatar/mood";
import {
  EMPTY_FACTS,
  phrasesForScenario,
  scenarioForNow,
  type DayFacts,
} from "@/lib/avatar/phrases";
import {
  preloadRoomImages,
  ROOM_IMAGES,
  roomPeriodForHour,
  type RoomPeriod,
} from "@/lib/avatar/room";
import type { PathDay } from "@/actions/path";
import type { AsceticismDay } from "@/actions/asceticism";

/**
 * «Живая комната» — карточка-секция на экране «Сегодня».
 * Фон выбирается по локальному времени, аватар живёт по собственному
 * циклу поведения (useAvatarBehavior), фразы — локальный диалоговый движок,
 * опирающийся только на фактические записи дня.
 */

/** Размер спрайта в px (2× от исходных 56). Границы движения считаются от него. */
const AVATAR_SIZE_PX = 112;
/** Отступ спрайта от краёв комнаты, px (к половине ширины спрайта). */
const AVATAR_EDGE_GAP_PX = 4;
/** Вертикальная точка опоры аватара — доля высоты комнаты. */
const AVATAR_BOTTOM = 0.14;
/** Размер портрета в диалоговой панели, px. */
const PORTRAIT_SIZE_PX = 56;

function roomImageSrc(period: RoomPeriod): string {
  return ROOM_IMAGES[period];
}

/**
 * Портрет спутника в диалоговой панели: настроение дня → лицо.
 * Известные настроения маппятся явно, неизвестные — на усталое лицо.
 */
const MOOD_FACE: Record<Mood, string> = {
  happy: "/avatar/face/happy.png",
  neutral: "/avatar/face/neutral.png",
  concerned: "/avatar/face/sad.png",
};
const FALLBACK_FACE = "/avatar/face/tired.png";

function faceForMood(mood: Mood): string {
  return MOOD_FACE[mood] ?? FALLBACK_FACE;
}

/** Факты дня из загруженных записей: Путь, аскезы, развлечения. */
function dayFacts(path: PathDay | null, asceticism: AsceticismDay | null): DayFacts {
  if (!path) return EMPTY_FACTS;
  const done = asceticism?.logs.filter((l) => l.status === "done").length ?? 0;
  const failed = asceticism?.logs.filter((l) => l.status === "failed").length ?? 0;
  return {
    trainingCount: path.training.length,
    learningCount: path.learning.length,
    creationCount: path.creation.length,
    nutritionRecorded: path.nutrition != null && path.nutrition.calories != null,
    asceticismDone: done,
    asceticismFailed: failed,
    // Развлечения не загружены в комнату — на «Сегодня» их карточка рядом,
    // в диалог они пока не передаются, чтобы не утверждать лишнего.
    leisureCount: 0,
  };
}

export default function AvatarRoom({
  path,
  asceticism,
}: {
  path: PathDay | null;
  asceticism: AsceticismDay | null;
}) {
  // Период и час вычисляются только на клиенте — без рассинхрона гидратации.
  const [period, setPeriod] = useState<RoomPeriod | null>(null);
  const [hour, setHour] = useState<number | null>(null);
  // Аватар показываем, только когда фон комнаты загружен — иначе он
  // «повисает» над пустой карточкой в первый кадр.
  const [bgReady, setBgReady] = useState(false);
  const roomRef = useRef<HTMLDivElement | null>(null);
  // Ширина комнаты нужна для границ движения; до измерения — безопасные дефолты.
  const [roomWidth, setRoomWidth] = useState<number | null>(null);

  const facts = dayFacts(path, asceticism);
  const activityCount = path ? activityCountOfDay(path) : 0;
  const mood = moodForActivityCount(activityCount);
  const actor = useAvatarBehavior(boundsFor(roomWidth));
  const phrases = useMemo(() => {
    // Час неизвестен до монтирования — берём нейтральный полдень.
    const scenario = scenarioForNow(hour ?? 12, facts, mood);
    return phrasesForScenario(scenario, facts);
  }, [hour, facts, mood]);
  const { message } = useDialogue(phrases);

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

  // Измерение комнаты: границы движения спрайта зависят от фактической ширины.
  useEffect(() => {
    const el = roomRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width && width > 0) setRoomWidth(width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Диалоговая панель закреплена внизу карточки и не следует за аватаром;
  // портрет и текст живут в собственном блоке под сценой комнаты.

  return (
    <section className="bronze-card bronze-edge overflow-hidden">
      {/* Комната: скруглены только верхние углы, низ «уходит» под панель */}
      <div ref={roomRef} className="relative w-full" style={{ aspectRatio: "765 / 509" }}>
        {/* Фон: два слоя для плавного кроссфейда при смене периода */}
        <RoomBackground
          period={period}
          src={period ? roomImageSrc(period) : null}
          onTopLayerReady={setBgReady}
        />

        {/* Аватар: перемещение сглаживает CSS-переход, длительность задаёт behavior.
            Переход на left включается ТОЛЬКО в состоянии WALK — сидя и в idle
            позиция не анимируется в принципе. Панель диалога — отдельный блок
            под комнатой, аватар в сцене остаётся полностью видимым. */}
        <div
          className="absolute"
          style={{
            bottom: `${AVATAR_BOTTOM * 100}%`,
            left: `${actor.x * 100}%`,
            transform: "translateX(-50%)",
            transition:
              actor.state.kind === "WALK" && actor.walkDurationMs > 0
                ? `left ${actor.walkDurationMs}ms linear`
                : undefined,
          }}
        >
          <div
            style={{
              opacity: bgReady ? 1 : 0,
              transition: "opacity 500ms ease",
            }}
          >
            <AvatarSprite state={actor.state} size={AVATAR_SIZE_PX} />
          </div>
        </div>
      </div>

      {/* Панель диалога в стиле визуальной новеллы: прижата к низу карточки,
          портрет слева, текст справа. Полупрозрачный фон продолжает комнату. */}
      <div
        className="flex items-center gap-3 px-3 py-2.5"
        style={{
          background: "rgba(10, 15, 28, 0.74)",
          borderTop: "1px solid var(--card-edge)",
          backdropFilter: "blur(6px)",
        }}
      >
        <img
          src={faceForMood(mood)}
          alt=""
          aria-hidden="true"
          draggable={false}
          className="shrink-0 select-none rounded-lg object-cover"
          style={{
            width: PORTRAIT_SIZE_PX,
            height: PORTRAIT_SIZE_PX,
            border: "1px solid var(--card-edge)",
          }}
        />
        {/* Между репликами — спокойный индикатор ожидания «•••»: тот же
            тайминг-цикл useDialogue (message === null), без своих таймеров. */}
        {message ? (
          <p
            aria-live="polite"
            className="min-w-0 flex-1 text-[13px] leading-snug text-[var(--ink)] transition-opacity duration-700"
          >
            {message}
          </p>
        ) : (
          <div
            role="status"
            aria-label="Спутник обдумывает реплику"
            className="dialogue-typing flex min-w-0 flex-1 items-center"
          >
            <span />
            <span />
            <span />
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * Границы движения центра спрайта: спрайт шириной S px на комнате W px
 * не должен выходить краем за комнату, значит центр ограничен
 * [S/2 + зазор, W − S/2 − зазор]. До измерения — прежние безопасные доли.
 */
function boundsFor(roomWidth: number | null) {
  if (!roomWidth || roomWidth <= 0) return DEFAULT_AVATAR_BOUNDS;
  const half = AVATAR_SIZE_PX / 2;
  const insetPx = half + AVATAR_EDGE_GAP_PX;
  const insetFraction = insetPx / roomWidth;
  if (insetFraction * 2 >= 0.96) return DEFAULT_AVATAR_BOUNDS;
  return { minX: insetFraction, maxX: 1 - insetFraction };
}

/** Кроссфейд фона: старый слой растворяется, новый проявляется сверху. */
function RoomBackground({
  period,
  src,
  onTopLayerReady,
}: {
  period: RoomPeriod | null;
  src: string | null;
  onTopLayerReady?: (ready: boolean) => void;
}) {
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
      {layers.map((layer, index) => (
        <img
          key={layer.src}
          src={layer.src}
          alt=""
          aria-hidden="true"
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ease-in-out"
          style={{ opacity: layer.opacity }}
          onLoad={() => {
            // Верхний (активный) слой загружен — комната готова показывать аватара.
            if (index === layers.length - 1) onTopLayerReady?.(true);
          }}
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
