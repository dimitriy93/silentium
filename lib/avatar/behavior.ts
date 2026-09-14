/**
 * Поведение аватара: выбор следующего действия.
 * Чистая функция — никакого DOM и таймеров, чтобы логику можно было
 * расширять (sleep, read, …) и тестировать отдельно от UI.
 */

import type { AvatarState } from "./sprites";

export type AvatarAction = "idle" | "walk" | "sit";

export interface BehaviorDecision {
  action: AvatarAction;
  /** Длительность действия в мс (для idle/sit — пауза, для walk — путь). */
  durationMs: number;
  /** Для walk: доля ширины комнаты, на которую сместиться, от -1 до 1. */
  walkDelta?: number;
}

const MIN_PAUSE = 5000;
const MAX_PAUSE = 10000;

function randomPause(): number {
  return MIN_PAUSE + Math.random() * (MAX_PAUSE - MIN_PAUSE);
}

/**
 * Решение о следующем действии. previousSit учитывается, чтобы аватар
 * не сидел два раза подряд. direction нужен, чтобы после walk повернуться
 * к зрителю лицом (down).
 */
export function decideNextAction(
  previous: AvatarAction,
  walkEdge: "left" | "right" | null,
): BehaviorDecision {
  if (previous === "walk") {
    // После прогулки — пауза или сесть.
    return Math.random() < 0.35
      ? { action: "sit", durationMs: randomPause() }
      : { action: "idle", durationMs: randomPause() };
  }

  // Не ходим в стену: если упёрлись в край, разворачиваемся.
  const direction = walkEdge ?? (Math.random() < 0.5 ? "left" : "right");
  const roll = Math.random();

  if (roll < 0.4 && previous !== "sit") {
    return { action: "sit", durationMs: randomPause() };
  }
  if (roll < 0.75) {
    return { action: "walk", durationMs: 0, walkDelta: direction === "left" ? -0.35 : 0.35 };
  }
  return { action: "idle", durationMs: randomPause() };
}

/** Состояние спрайта для действия. */
export function stateForAction(action: AvatarAction, facing: AvatarState): AvatarState {
  if (action === "walk") {
    const dir = facing.kind === "WALK" ? facing.direction : "right";
    return { kind: "WALK", direction: dir };
  }
  // После ходьбы встаём лицом к зрителю; в остальных случаях сохраняем взгляд.
  const direction =
    facing.kind === "WALK" ? "down" : facing.direction;
  return action === "sit" ? { kind: "SIT", direction } : { kind: "IDLE", direction };
}
