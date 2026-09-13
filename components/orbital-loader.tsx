import type { CSSProperties } from "react";

/**
 * Фирменный лоадер: три сферы движутся по орбите и догоняют друг друга.
 * Анимация целиком в globals.css (transform-only), без сторонних библиотек.
 */
export default function OrbitalLoader({
  size = 44,
  label,
  className = "",
}: {
  size?: number;
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={"flex flex-col items-center justify-center gap-3 " + className}
    >
      <div
        className="orbital-loader"
        style={{ "--orbital-size": `${size}px` } as CSSProperties}
        aria-hidden="true"
      >
        <span className="orbital-orb orbital-orb-1" />
        <span className="orbital-orb orbital-orb-2" />
        <span className="orbital-orb orbital-orb-3" />
      </div>
      {label ? <p className="text-sm text-[var(--ink-secondary)]">{label}</p> : null}
    </div>
  );
}
