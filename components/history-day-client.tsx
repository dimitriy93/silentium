"use client";

import { useEffect, useState } from "react";
import { useLocalData } from "@/lib/local/local-context";
import { readHistoryDay } from "@/lib/local/queries";
import type { LocalHistoryDay } from "@/lib/local/types";
import { formatMinutes } from "@/lib/format";
import OrbitalLoader from "@/components/orbital-loader";
import LocalTime from "@/components/local-time";

/**
 * Один день истории: записи всех разделов этого дня. Полностью читается из
 * локальной базы. Только чтение — редактирование выполняется в
 * соответствующих разделах.
 */
export default function HistoryDayClient({ date }: { date: string }) {
  const { version } = useLocalData();
  const [day, setDay] = useState<LocalHistoryDay | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const built = await readHistoryDay(date);
      if (!active) return;
      if (built !== null) setDay(built);
    })();
    return () => {
      active = false;
    };
  }, [date, version]);

  if (day === null) return <OrbitalLoader label="Читаю хронику…" className="py-10" />;

  const hasAny =
    day.thoughts.length > 0 ||
    day.training.length > 0 ||
    day.nutrition !== null ||
    day.learning.length > 0 ||
    day.creation.length > 0 ||
    day.leisure.length > 0 ||
    day.asceticismLogs.length > 0;

  if (!hasAny) {
    return (
      <p className="bronze-card bronze-edge p-6 text-center text-sm text-[var(--ink-faint)]">
        В этот день записей нет. Молчание в хронике — тоже факт.
      </p>
    );
  }

  return (
    <>
      {day.thoughts.length > 0 && (
        <Section title="Мысли">
          <ul className="space-y-2.5">
            {day.thoughts.map((t) => (
              <li key={t.id}>
                <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{t.content}</p>
                <p className="mt-0.5 text-xs text-[var(--ink-faint)]">
                  <LocalTime utc={t.createdAt} />
                </p>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {day.training.length > 0 && (
        <Section title="🔥 Огонь — тело">
          <ul className="space-y-2.5">
            {day.training.map((t) => (
              <li key={t.id}>
                <p className="text-[15px] font-medium">{t.title}</p>
                {t.detail ? <p className="text-sm text-[var(--gold)]">{t.detail}</p> : null}
                {t.durationMinutes ? (
                  <p className="text-xs text-[var(--ink-faint)]">{formatMinutes(t.durationMinutes)}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {day.nutrition !== null && (
        <Section title="🌊 Вода — питание">
          <div className="space-y-1">
            {day.nutrition.calories != null && (
              <p className="text-[15px]">
                Калории: <span className="text-[var(--gold)]">{day.nutrition.calories}</span>
              </p>
            )}
            <p className="text-sm text-[var(--ink-secondary)]">
              Белок: {day.nutrition.proteinGrams ?? "—"} г · Жиры: {day.nutrition.fatGrams ?? "—"} г ·
              Углеводы: {day.nutrition.carbsGrams ?? "—"} г
            </p>
            {day.nutrition.note ? (
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{day.nutrition.note}</p>
            ) : null}
          </div>
        </Section>
      )}

      {day.learning.length > 0 && (
        <Section title="🌬 Воздух — изучил">
          <ul className="space-y-2.5">
            {day.learning.map((t) => (
              <li key={t.id} className="text-[15px] leading-relaxed whitespace-pre-wrap">
                {t.content}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {day.creation.length > 0 && (
        <Section title="🪨 Земля — создал">
          <ul className="space-y-2.5">
            {day.creation.map((t) => (
              <li key={t.id} className="text-[15px] leading-relaxed whitespace-pre-wrap">
                {t.content}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {day.leisure.length > 0 && (
        <Section title="Развлечения">
          <ul className="space-y-1.5">
            {day.leisure.map((e) => (
              <li key={e.id} className="flex items-center justify-between text-[15px]">
                <span>{e.title}</span>
                <span className="text-sm text-[var(--ink-faint)]">
                  {e.minutes ? formatMinutes(e.minutes) : ""}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {day.asceticismLogs.length > 0 && (
        <Section title="Аскезы">
          <ul className="space-y-1.5">
            {day.asceticismLogs.map((log) => (
              <li key={log.id} className="flex items-center justify-between text-[15px]">
                <span>{day.asceticismTitles[log.asceticismId] ?? "Аскеза"}</span>
                <span
                  className={
                    "text-sm " + (log.status === "done" ? "text-[#a8c78a]" : "text-[#d99a8f]")
                  }
                >
                  {log.status === "done" ? "выполнено" : "не выполнено"}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bronze-card bronze-edge p-4">
      <h2 className="font-chronicle mb-3 text-base font-semibold text-[var(--gold)]">{title}</h2>
      {children}
    </section>
  );
}
