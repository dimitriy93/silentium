"use client";

import { useEffect, useMemo, useRef } from "react";
import { ANIMATIONS, animationKey, type AvatarState } from "@/lib/avatar/sprites";

/**
 * Покадровая анимация спрайта, независимая от цикла рендера React:
 * rAF-цикл напрямую переключает src у <img> через ref. Компонент
 * перерисовывается только при смене состояния аватара, не при смене кадра.
 * Возвращает ref для <img> и путь текущего первого кадра.
 */
export function useFrameAnimation(state: AvatarState) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const key = animationKey(state);
  const animation = ANIMATIONS[key];

  // В SIT поза выбирается один раз на вход в состояние (memo пересчитывается
  // только при смене ключа анимации) и держится до конца SIT — без цикла кадров.
  // При выходе из SIT ключ меняется и запомненная поза сбрасывается сама.
  const sitFrame = useMemo(
    () =>
      state.kind === "SIT" && animation
        ? Math.floor(Math.random() * animation.frames.length)
        : 0,
    [animation, state.kind],
  );

  useEffect(() => {
    if (!animation) return;
    const img = imgRef.current;
    if (!img) return;

    if (state.kind === "SIT") {
      img.src = animation.frames[sitFrame];
      return; // статичная поза: никакого rAF-цикла, кадр не меняется
    }

    const { frames, fps, loop } = animation;
    const image = img;
    let frame = 0;
    let raf = 0;
    let last = performance.now();
    const interval = 1000 / fps;
    let stopped = false;

    image.src = frames[0];

    function tick(now: number) {
      if (stopped) return;
      if (now - last >= interval) {
        last = now;
        frame += 1;
        if (frame >= frames.length) {
          if (!loop) {
            return; // одноразовая анимация останавливается на последнем кадре
          }
          frame = 0;
        }
        image.src = frames[frame];
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
    };
  }, [animation, state.kind, sitFrame]);

  return { imgRef, initialSrc: animation?.frames[sitFrame] ?? "" };
}
