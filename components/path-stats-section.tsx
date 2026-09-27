"use client";

import { useCacheQuery } from "@/hooks/use-cache-query";
import { readPathStats, type PathStatsView } from "@/lib/local/stats";
import OrbitalLoader from "@/components/orbital-loader";

/**
 * «Статистика пути» в Профиле: счётчики записей и активных дней. Читается
 * только из локального кеша (readPathStats — дешёвые подсчёты по индексам,
 * объединение дней кэшируется), сервер не запрашивается. До гидратации кеша
 * — лоадер, как у остальных блоков.
 */

const STAT_LABELS: Array<{ key: keyof PathStatsView; label: string }> = [
  { key: "thoughts", label: "Мысли" },
  { key: "trainings", label: "Тренировки" },
  { key: "nutrition", label: "Питание" },
  { key: "learning", label: "Обучение" },
  { key: "creations", label: "Созидание" },
  { key: "asceticismsDone", label: "Аскезы выполнено" },
  { key: "activeDays", label: "Активные дни" },
];

export default function PathStatsSection() {
  const stats = useCacheQuery(readPathStats, []);

  return (
    <section className="bronze-card bronze-edge p-4">
      <h2 className="font-chronicle mb-3 text-base font-semibold text-[var(--gold)]">
        Статистика пути
      </h2>
      {stats === null ? (
        <OrbitalLoader className="py-2" />
      ) : (
        <ul className="divide-y divide-[var(--card-edge)]">
          {STAT_LABELS.map(({ key, label }) => (
            <li key={key} className="flex items-baseline justify-between gap-3 py-2">
              <span className="text-sm text-[var(--ink-secondary)]">{label}</span>
              <span className="font-chronicle text-base font-bold text-[var(--gold)]">
                {stats[key].toLocaleString("ru-RU")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
