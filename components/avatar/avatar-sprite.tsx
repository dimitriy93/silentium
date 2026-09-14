"use client";

import { useFrameAnimation } from "@/hooks/avatar/use-frame-animation";
import type { AvatarState } from "@/lib/avatar/sprites";

/**
 * Спрайт аватара. Кадры переключаются вне цикла рендера (см. useFrameAnimation),
 * сам компонент перерисовывается только при смене состояния.
 */
export default function AvatarSprite({
  state,
  size = 56,
}: {
  state: AvatarState;
  size?: number;
}) {
  const { imgRef, initialSrc } = useFrameAnimation(state);
  return (
    <img
      ref={imgRef}
      src={initialSrc}
      alt=""
      aria-hidden="true"
      draggable={false}
      style={{
        width: size,
        height: size,
        maxWidth: "none", // preflight img{max-width:100%} сплющивает спрайт у правого края
        imageRendering: "pixelated",
      }}
      className="pointer-events-none select-none"
    />
  );
}
