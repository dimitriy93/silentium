"use client";

import { useCallback, useEffect, useState } from "react";
import { requestMentorReading, type MentorReading } from "@/actions/mentor";
import OrbitalLoader from "@/components/orbital-loader";
import { formatDateRu, formatWeekdayRu, todayLocalDate } from "@/lib/format";

/**
 * Наставник: разбор дня. На открытии экрана запрашивается наставление
 * (действие вернёт сохранённое, если день уже разобран). Все обращения
 * к модели — только через server action; ключ Gemini на клиент не попадает.
 */
export default function MentorClient() {
  const [reading, setReading] = useState<MentorReading | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [today, setToday] = useState<string | null>(null);

  const request = useCallback(async (date: string) => {
    setLoading(true);
    setError(null);
    const res = await requestMentorReading(date);
    setLoading(false);
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
          <OrbitalLoader size={36} label="Наставник читает хронику…" className="py-6" />
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
        </section>
      ) : null}
    </div>
  );
}
