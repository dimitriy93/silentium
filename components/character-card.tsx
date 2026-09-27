"use client";

import { useCacheQuery } from "@/hooks/use-cache-query";
import { readCharacterView, type CharacterView } from "@/lib/local/character";
import { getRankTitle } from "@/lib/ranks";
import OrbitalLoader from "@/components/orbital-loader";

/**
 * Карточка персонажа на «Сегодня»: уровень, ранг, общий XP и характеристики.
 * Всё вычисляется локально из IndexedDB (readCharacterView) — сервер не
 * запрашивается, чтение кэшируется, вкладки не тормозят.
 */

function formatNumber(value: number): string {
  return value.toLocaleString("ru-RU");
}

export default function CharacterCard() {
  const view = useCacheQuery(readCharacterView, []);

  if (view === null) {
    return (
      <section className="bronze-card bronze-edge p-4">
        <OrbitalLoader className="py-2" />
      </section>
    );
  }
  return <CharacterCardBody view={view} />;
}

function CharacterCardBody({ view }: { view: CharacterView }) {
  const percent = Math.round(view.progress * 100);

  return (
    <section className="bronze-card bronze-edge relative overflow-hidden px-4 py-4" aria-live="polite">
      {/* Декоративные уголки хроники */}
      <span aria-hidden="true" className="pointer-events-none absolute left-1.5 top-1.5 h-4 w-4 border-l border-t border-[var(--bronze-bright)]/50" />
      <span aria-hidden="true" className="pointer-events-none absolute right-1.5 top-1.5 h-4 w-4 border-r border-t border-[var(--bronze-bright)]/50" />
      <span aria-hidden="true" className="pointer-events-none absolute bottom-1.5 left-1.5 h-4 w-4 border-b border-l border-[var(--bronze-bright)]/50" />
      <span aria-hidden="true" className="pointer-events-none absolute bottom-1.5 right-1.5 h-4 w-4 border-b border-r border-[var(--bronze-bright)]/50" />

      <p className="font-chronicle text-center text-[11px] uppercase tracking-[0.3em] text-[var(--bronze-bright)]">
        Персонаж
      </p>
      <p className="font-chronicle mt-1.5 text-center text-3xl font-bold leading-none text-[var(--gold)]">
        Уровень {view.level}
      </p>
      <p className="font-chronicle mt-1.5 text-center text-sm uppercase tracking-[0.24em] text-[var(--bronze-bright)]">
        {getRankTitle(view.level)}
      </p>

      {/* Прогресс до следующего уровня */}
      <div
        className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[var(--pill-active)]"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Прогресс уровня"
      >
        <div
          className="h-full rounded-full bg-[var(--gold)] transition-[width] duration-500"
          style={{ width: `${Math.max(view.progress * 100, view.totalXp > 0 ? 4 : 0)}%` }}
        />
      </div>
      <p className="mt-2 text-center text-sm text-[var(--ink-secondary)]">
        {formatNumber(view.totalXp)} / {formatNumber(view.nextLevelXp)} XP
      </p>

      {/* Тонкий орнамент: линия с ромбом по центру */}
      <div aria-hidden="true" className="mt-3 flex items-center gap-2 px-6">
        <span className="engraved-line flex-1" />
        <span className="h-1.5 w-1.5 rotate-45 bg-[var(--gold)]/70" />
        <span className="engraved-line flex-1" />
      </div>

      {/* Характеристики — уровни вычисляются из XP-событий */}
      <ul className="mt-3 grid grid-cols-2 gap-2">
        {view.characteristics.map((c) => (
          <li
            key={c.key}
            className="rounded-2xl border border-[var(--card-edge)] px-3 py-2 text-center"
          >
            <p className="text-xs text-[var(--ink-secondary)]">{c.title}</p>
            <p className="font-chronicle text-lg font-bold leading-tight text-[var(--gold)]">
              {c.level}
            </p>
            <p className="text-[10px] text-[var(--ink-faint)]">{formatNumber(c.xp)} XP</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
