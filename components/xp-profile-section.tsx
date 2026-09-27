"use client";

import { useCacheQuery } from "@/hooks/use-cache-query";
import { readRecentXpEvents, readXpProfileView } from "@/lib/local/xp";
import { readCharacterView } from "@/lib/local/character";
import type { CharacterView } from "@/lib/local/character";
import type { LocalXpEvent } from "@/lib/local/types";
import { getRankTitle } from "@/lib/ranks";
import { relativeDayLabel, todayLocalDate } from "@/lib/format";
import OrbitalLoader from "@/components/orbital-loader";

/**
 * Опыт и уровень в Профиле — только из локальной базы (Local First):
 * ни серверного запроса при открытии, ни расчёта на сервере. Уровень
 * вычисляется из общего XP формулой lib/xp.ts, ранг — по уровню
 * (lib/ranks.ts), характеристики — из XP-событий (lib/local/character.ts,
 * кэшированное вычисление). «Последний опыт» — последние 5 XP-событий
 * из IndexedDB.
 */

function formatEventTime(createdAt: string): string {
  const date = new Date(createdAt);
  const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const time = date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  const relative = relativeDayLabel(dateStr, todayLocalDate());
  if (relative) return `${relative[0].toUpperCase()}${relative.slice(1)}, ${time}`;
  return `${date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}, ${time}`;
}

function formatNumber(value: number): string {
  return value.toLocaleString("ru-RU");
}

export default function XpProfileSection() {
  const profile = useCacheQuery(readXpProfileView, []);
  const events = useCacheQuery(readRecentXpEvents, []);
  const character = useCacheQuery(readCharacterView, []);

  if (profile === null) {
    return (
      <section className="bronze-card bronze-edge p-4">
        <OrbitalLoader label="Читаю хронику…" className="py-4" />
      </section>
    );
  }

  const percent = Math.round(profile.progress * 100);

  return (
    <section className="bronze-card bronze-edge p-4">
      <h2 className="font-chronicle mb-3 text-base font-semibold text-[var(--gold)]">Опыт</h2>

      <p className="font-chronicle text-[22px] font-bold text-[var(--gold)]">
        Уровень {profile.level}
      </p>
      <p className="font-chronicle mt-0.5 text-sm uppercase tracking-[0.2em] text-[var(--bronze-bright)]">
        {getRankTitle(profile.level)}
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
          style={{ width: `${Math.max(profile.progress * 100, profile.totalXP > 0 ? 4 : 0)}%` }}
        />
      </div>

      <p className="mt-2 text-sm text-[var(--ink-secondary)]">
        {formatNumber(profile.totalXP)} / {formatNumber(profile.nextLevelXp)} XP
      </p>
      <p className="mt-0.5 text-xs text-[var(--ink-faint)]">
        {profile.xpToNext > 0
          ? `${formatNumber(profile.xpToNext)} XP до следующего уровня`
          : "Порог следующего уровня достигнут"}
      </p>

      {character !== null ? <CharacteristicsBlock view={character} /> : null}

      {/* Последний опыт */}
      <h3 className="mt-5 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-faint)]">
        Последний опыт
      </h3>
      {events === null ? null : events.length === 0 ? (
        <p className="mt-2 text-xs leading-relaxed text-[var(--ink-faint)]">
          Опыта ещё нет. Записи Пути, мысли и выполненные аскезы начнут его приносить.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-[var(--card-edge)]">
          {events.map((event: LocalXpEvent) => (
            <li key={event.id} className="flex items-baseline justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm text-[var(--ink-secondary)]">
                  +{event.amount} XP · {event.description}
                </p>
                <p className="mt-0.5 text-[11px] text-[var(--ink-faint)]">
                  {formatEventTime(event.createdAt)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Характеристики персонажа: уровни вычислены из XP-событий (кэш). */
function CharacteristicsBlock({ view }: { view: CharacterView }) {
  return (
    <>
      <h3 className="mt-5 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-faint)]">
        Характеристики
      </h3>
      <ul className="mt-1 divide-y divide-[var(--card-edge)]">
        {view.characteristics.map((c) => (
          <li key={c.key} className="flex items-baseline justify-between gap-3 py-2">
            <span className="text-sm text-[var(--ink-secondary)]">{c.title}</span>
            <span className="text-sm">
              <span className="font-chronicle text-base font-bold text-[var(--gold)]">
                {c.level}
              </span>
              <span className="ml-2 text-[11px] text-[var(--ink-faint)]">
                {formatNumber(c.xp)} XP
              </span>
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
