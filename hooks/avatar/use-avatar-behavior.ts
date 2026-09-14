"use client";

import { useEffect, useRef, useState } from "react";
import {
  decideNextAction,
  stateForAction,
  type AvatarAction,
} from "@/lib/avatar/behavior";
import type { AvatarState } from "@/lib/avatar/sprites";

/**
 * Цикл поведения аватара: каждые 5–10 секунд выбирается следующее действие
 * (idle / walk / sit), позиция ограничена границами комнаты. Движение
 * сглаживается CSS-переходом в компоненте; здесь считается только длительность.
 *
 * Позиция — доля ширины комнаты (0..1), считается от левого края «пятна пола».
 * Все таймеры очищаются при размонтировании.
 */

const WALK_SPEED = 0.12; // долей ширины комнаты в секунду
const MIN_X = 0.08;
const MAX_X = 0.92;
const FIRST_ACTION_DELAY = 3000;

export interface AvatarActor {
  state: AvatarState;
  /** Позиция по горизонтали, 0..1 ширины комнаты. */
  x: number;
  /** Длительность текущего перемещения в мс (0 — нет перемещения). */
  walkDurationMs: number;
}

const INITIAL: AvatarActor = {
  state: { kind: "IDLE", direction: "down" },
  x: 0.5,
  walkDurationMs: 0,
};

export function useAvatarBehavior(): AvatarActor {
  const [actor, setActor] = useState<AvatarActor>(INITIAL);
  const actorRef = useRef(actor);
  actorRef.current = actor;

  useEffect(() => {
    let decisionTimer: ReturnType<typeof setTimeout> | undefined;
    let walkTimer: ReturnType<typeof setTimeout> | undefined;
    let lastAction: AvatarAction = "idle";
    let walkEdge: "left" | "right" | null = null;
    let disposed = false;

    function scheduleNext(delayMs: number) {
      if (disposed) return;
      decisionTimer = setTimeout(performNext, delayMs);
    }

    function performNext() {
      if (disposed) return;
      const current = actorRef.current;
      const decision = decideNextAction(lastAction, walkEdge);

      if (decision.action === "walk" && decision.walkDelta != null) {
        const from = current.x;
        let to = from + decision.walkDelta;
        if (to < MIN_X) to = MIN_X;
        if (to > MAX_X) to = MAX_X;
        const distance = Math.abs(to - from);
        if (distance < 0.01) {
          walkEdge = decision.walkDelta < 0 ? "left" : "right";
          lastAction = "idle";
          setActor((a) => ({
            ...a,
            state: { kind: "IDLE", direction: "down" },
            walkDurationMs: 0,
          }));
          scheduleNext(4000);
          return;
        }
        walkEdge = to <= MIN_X ? "left" : to >= MAX_X ? "right" : null;
        lastAction = "walk";
        const durationMs = (distance / WALK_SPEED) * 1000;
        setActor((a) => ({
          ...a,
          state: { kind: "WALK", direction: decision.walkDelta! < 0 ? "left" : "right" },
          x: to,
          walkDurationMs: durationMs,
        }));
        walkTimer = setTimeout(() => {
          if (disposed) return;
          // По приходе — повернуться к зрителю и сделать паузу.
          setActor((a) => ({ ...a, state: stateForAction("idle", a.state), walkDurationMs: 0 }));
          scheduleNext(2000 + Math.random() * 4000);
        }, durationMs + 120);
      } else {
        walkEdge = null;
        lastAction = decision.action;
        setActor((a) => ({
          ...a,
          state: stateForAction(decision.action, a.state),
          walkDurationMs: 0,
        }));
        scheduleNext(decision.durationMs);
      }
    }

    scheduleNext(FIRST_ACTION_DELAY);

    return () => {
      disposed = true;
      clearTimeout(decisionTimer);
      clearTimeout(walkTimer);
    };
  }, []);

  return actor;
}
