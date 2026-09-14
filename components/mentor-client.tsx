"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { regenerateMentorReading, requestMentorReading, type MentorReading } from "@/actions/mentor";
import OrbitalLoader from "@/components/orbital-loader";
import { formatDateRu, formatWeekdayRu, todayLocalDate } from "@/lib/format";

/**
 * Наставник: разбор дня. На открытии экрана запрашивается наставление
 * (действие вернёт сохранённое, если день уже разобран). Принудительно
 * новый разбор — только по явной кнопке «Получить новое наставление»,
 * защищённой от двойного нажатия. Все обращения к модели — только через
 * server action; ключ Gemini на клиент не попадает.
 */
export default function MentorClient() {
  const [reading, setReading] = useState<MentorReading | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [today, setToday] = useState<string | null>(null);
  // Пока идёт regenerate, старое наставление не трогаем: при ошибке оно
  // останется на экране, при успехе — заменится новым.
  const requestInFlight = useRef(false);

  const request = useCallback(async (date: string) => {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setLoading(true);
    setError(null);
    const res = await requestMentorReading(date);
    requestInFlight.current = false;
    setLoading(false);
    setRegenerating(false);
    if (res.ok) setReading(res.data);
    else setError(res.error);
  }, []);

  const regenerate = useCallback(async (date: string) => {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setRegenerating(true);
    setError(null);
    const res = await regenerateMentorReading(date);
    requestInFlight.current = false;
    setRegenerating(false);
    if (res.ok) setReading(res.data);
    else setError(res.error);
  }, []);

  useEffect(() => {
    const date = todayLocalDate();
    setToday(date);
    void request(date);
  }, [request]);

  return (
    <div className="space-y-4">
      {today ? (
        <p className="px-1 text-sm text-[var(--ink-faint)]">
          {formatWeekdayRu(today)}, {formatDateRu(today)}
        </p>
      ) : null}

      {loading ? (
        <section className="bronze-card bronze-edge p-5">
          <OrbitalLoader
            size={36}
            label={regenerating ? "Наставник заново читает хронику…" : "Наставник читает хронику…"}
            className="py-6"
          />
        </section>
      ) : error ? (
        <section className="bronze-card bronze-edge space-y-3 p-5">
          <p className="text-sm leading-relaxed text-[#d99a8f]">{error}</p>
          {today ? (
            <button
              type="button"
              onClick={() => void request(today)}
              className="btn-ghost flex h-11 w-full items-center justify-center text-sm"
            >
              Попробовать снова
            </button>
          ) : null}
          {/* При ошибке regenerate старое наставление осталось в состоянии — даём кнопку ещё раз */}
          {reading && today ? (
            <button
              type="button"
              onClick={() => void regenerate(today)}
              className="btn-ghost flex h-11 w-full items-center justify-center text-sm"
            >
              Получить новое наставление
            </button>
          ) : null}
        </section>
      ) : reading ? (
        <section className="bronze-card bronze-edge space-y-3 p-5">
          {reading.cached ? (
            <p className="text-xs uppercase tracking-[0.15em] text-[var(--ink-faint)]">
              Наставление за сегодня уже сказано
            </p>
          ) : null}
          <div className="engraved-line" />
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-[var(--ink)]">
            {reading.content}
          </p>
          <div className="engraved-line" />
          {regenerating ? (
            <OrbitalLoader size={28} label="Наставник заново читает хронику…" />
          ) : today ? (
            <button
              type="button"
              onClick={() => void regenerate(today)}
              className="btn-ghost flex h-11 w-full items-center justify-center text-sm"
            >
              Получить новое наставление
            </button>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
