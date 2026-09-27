"use client";

import { useEffect, useState } from "react";
import { fetchChronicleEvents } from "@/actions/history";
import { useSync } from "@/lib/local/sync-context";
import { readChronicleEvents } from "@/lib/local/chronicle";
import type { ChronicleEvent } from "@/lib/chronicle-shared";
import { formatDateRu } from "@/lib/format";
import OrbitalLoader from "@/components/orbital-loader";

/**
 * Хроника Пути: события летописи. Мгновенно строится из локальной базы
 * (readChronicleEvents повторяет серверную сборку в памяти); если кеш ещё
 * не гидратирован (первый запуск) — серверный экшен fetchChronicleEvents,
 * снапшот далее обновит летопись.
 */
export default function ChronicleClient() {
  const { version } = useSync();
  const [events, setEvents] = useState<ChronicleEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const cached = await readChronicleEvents();
      if (!active) return;
      if (cached) {
        setEvents(cached);
        setError(null);
        return;
      }
      // Кеш пуст (первый запуск, снапшот ещё не приходил) — серверный источник.
      const res = await fetchChronicleEvents();
      if (!active) return;
      if (res.ok) {
        setEvents(res.data);
        setError(null);
      } else {
        setError(res.error);
      }
    })();
    return () => {
      active = false;
    };
  }, [version]);

  if (error) return <p className="text-sm text-[#c96a5a]">{error}</p>;
  if (events === null) return <OrbitalLoader label="Разворачиваю летопись…" className="py-16" />;

  return (
    <>
      {events.length === 0 ? (
        <p className="bronze-card bronze-edge px-4 py-8 text-center text-sm text-[var(--ink-faint)]">
          Летопись пуста. Сделай первую запись — и дорога начнётся.
        </p>
      ) : (
        <ol className="space-y-0">
          {events.map((event, i) => (
            <ChronicleRow
              key={event.key}
              event={event}
              index={i}
              first={i === 0}
              last={i === events.length - 1}
            />
          ))}
          <li>
            <div className="grid grid-cols-[1fr_36px_1fr] items-center">
              <div />
              <div className="relative flex h-16 items-center justify-center">
                <span
                  aria-hidden="true"
                  className="absolute left-1/2 top-0 h-1/2 w-px -translate-x-1/2 bg-gradient-to-b from-[rgba(140,106,63,0.6)] to-transparent"
                />
                <span
                  aria-hidden="true"
                  className="relative z-10 h-3 w-3 rotate-45 border border-[var(--bronze)] bg-[var(--card)]"
                />
              </div>
              <div />
              <div className="col-span-3 -mt-4 pb-2 text-center text-xs text-[var(--ink-faint)]">
                Дорога продолжается…
              </div>
            </div>
          </li>
        </ol>
      )}
    </>
  );
}

function ChronicleRow({
  event,
  index,
  first,
  last,
}: {
  event: ChronicleEvent;
  index: number;
  first: boolean;
  last: boolean;
}) {
  const left = index % 2 === 0;
  const card = (
    <div
      className={
        "rounded-2xl border border-[var(--card-edge)] bg-[rgba(18,27,46,0.7)] p-3 " +
        (event.kind === "journal_start" || event.kind === "day_streak_milestone"
          ? "border-[rgba(140,106,63,0.55)]"
          : "")
      }
    >
      <p className="font-chronicle text-sm font-semibold text-[var(--gold)]">{event.title}</p>
      {event.subtitle ? <p className="mt-0.5 text-sm text-[var(--ink)]">{event.subtitle}</p> : null}
      <p className="mt-1.5 text-[11px] uppercase tracking-wide text-[var(--ink-faint)]">
        {formatDateRu(event.date)}
      </p>
    </div>
  );

  return (
    <li>
      <div className="grid grid-cols-[1fr_36px_1fr] items-center">
        <div className={"py-3 " + (left ? "pr-3.5" : "")}>{left ? card : null}</div>

        {/* Центральная дорога: вертикальная линия, узел и отвод к карточке */}
        <div className="relative flex h-full items-center justify-center self-stretch">
          <span
            aria-hidden="true"
            className={
              "absolute left-1/2 w-px -translate-x-1/2 bg-gradient-to-b from-[rgba(176,141,87,0.55)] to-[rgba(140,106,63,0.6)] " +
              (first ? "top-1/2 bottom-0" : last ? "top-0 h-1/2" : "top-0 bottom-0")
            }
          />
          <span
            aria-hidden="true"
            className={
              "absolute top-1/2 h-px " +
              (left ? "left-0 w-1/2" : "right-0 w-1/2") +
              " bg-gradient-to-r from-[rgba(140,106,63,0.65)] to-[rgba(176,141,87,0.25)]"
            }
          />
          <span
            aria-hidden="true"
            className="relative z-10 h-3 w-3 rotate-45 border border-[var(--gold)] bg-[var(--bg-elevated)]"
          />
        </div>

        <div className={"py-3 " + (!left ? "pl-3.5" : "")}>{!left ? card : null}</div>
      </div>
    </li>
  );
}
