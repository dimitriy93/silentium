/**
 * Реестр спрайтов аватара и машина состояний.
 * Кадры — PNG в /public/avatar/<action>/<direction>/N.png.
 * Реестр расширяемый: новые действия (sleep, read, code, exercise, eat)
 * добавляются одной записью в ANIMATIONS.
 */

export type AvatarDirection = "down" | "up" | "left" | "right";

export type AvatarState =
  | { kind: "IDLE"; direction: AvatarDirection }
  | { kind: "WALK"; direction: "left" | "right" }
  | { kind: "SIT"; direction: AvatarDirection };

export interface SpriteAnimation {
  /** Относительные пути кадров, по порядку проигрывания. */
  frames: string[];
  fps: number;
  /** Зацикливать ли анимацию (walk/idle — да, sit — да, будущие loop=false). */
  loop: boolean;
}

const FRAME_COUNTS: Record<string, number> = {
  idle: 2,
  sit: 3,
  walk: 9,
};

function frames(action: string, direction: string): string[] {
  const count = FRAME_COUNTS[`${action}/${direction}`] ?? FRAME_COUNTS[action];
  return Array.from({ length: count }, (_, i) => `/avatar/${action}/${direction}/${i + 1}.png`);
}

export const ANIMATIONS: Record<string, SpriteAnimation> = {
  "idle:down": { frames: frames("idle", "down"), fps: 2, loop: true },
  "idle:up": { frames: frames("idle", "up"), fps: 2, loop: true },
  "idle:left": { frames: frames("idle", "left"), fps: 2, loop: true },
  "idle:right": { frames: frames("idle", "right"), fps: 2, loop: true },
  "sit:down": { frames: frames("sit", "down"), fps: 1.5, loop: true },
  "sit:up": { frames: frames("sit", "up"), fps: 1.5, loop: true },
  "sit:left": { frames: frames("sit", "left"), fps: 1.5, loop: true },
  "sit:right": { frames: frames("sit", "right"), fps: 1.5, loop: true },
  "walk:left": { frames: frames("walk", "left"), fps: 10, loop: true },
  "walk:right": { frames: frames("walk", "right"), fps: 10, loop: true },
};

export function animationKey(state: AvatarState): string {
  if (state.kind === "WALK") return `walk:${state.direction}`;
  return `${state.kind.toLowerCase()}:${state.direction}`;
}

/** Ключ анимации для будущего действия (sleep/read/…), пока кадры не добавлены. */
export function actionAnimationKey(action: string, direction: AvatarDirection): string {
  return `${action}:${direction}`;
}
