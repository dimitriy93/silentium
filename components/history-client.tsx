"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { fetchHistoryPage } from "@/actions/history";
import { useSync } from "@/lib/local/sync-context";
import { readHistoryPage } from "@/lib/local/queries";
import type { LocalHistoryPage } from "@/lib/local/types";
import { formatDateRu, formatWeekdayRu } from "@/lib/format";
import OrbitalLoader from "@/components/orbital-loader";

/**
 * Список истории: дни с активностью, новые сверху. Мгновенно собирается из
 * локального кеша (readHistoryPage повторяет серверную группировку по
 * entry_date в памяти); если кеш ещё не гидратирован (первый запуск) —
 * данные запрашиваются у серверного экшена, снапшот далее обновит список.
 * Пагинация — через ?page=N, страница клампится в разумные пределы.
 */
export default function HistoryClient() {
  const searchParams = useSearchParams();
  const requested = Number.parseInt(searchParams.get("page") ?? "1", 10);
  const page = Number.isFinite(requested) && requested > 0 ? requested : 1;
  const { version } = useSync();
  const [data, setData] = useState<LocalHistoryPage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const cached = await readHistoryPage(page);
      if (!active) return;
      if (cached) {
        setData(cached);
        setError(null);
        return;
      }
      // Кеш пуст (первый запуск, снапшот ещё не приходил) — серверный источник.
      const res = await fetchHistoryPage(page);
      if (!active) return;
      if (res.ok) {
        setData(res.data);
        setError(null);
      } else {
        setError(res.error);
      }
    })();
    return () => {
      active = false;
    };
  }, [page, version]);

  if (error) return <p className="text-sm text-[#c96a5a]">{error}</p>;
  if (data === null) return <OrbitalLoader label="Читаю хронику…" className="py-10" />;

  const { days, page: currentPage, pageCount } = data;

  return (
    <>
      {days.length === 0 ? (
        <p className="py-8 text-center text-sm text-[var(--ink-faint)]">
          Хроника пуста.{" "}
          <Link href="/today" className="text-[var(--gold)] underline-offset-4 hover:underline">
            Заполните сегодняшний день.
          </Link>
        </p>
      ) : (
        <>
          <ul className="bronze-card divide-y divide-[var(--card-edge)]">
            {days.map((d) => (
              <li key={d.entryDate}>
                <Link
                  href={`/history/${d.entryDate}`}
                  className="flex items-center justify-between gap-3 px-4 py-3.5"
                >
                  <div>
                    <p className="text-[15px] font-medium">{formatDateRu(d.entryDate)}</p>
                    <p className="text-xs text-[var(--ink-faint)]">{formatWeekdayRu(d.entryDate)}</p>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    {d.pathFilled ? (
                      <span className="rounded-full border border-[#5c4826] px-2 py-0.5 text-[var(--gold)]">
                        Путь
                      </span>
                    ) : null}
                    {d.asceticismTotal > 0 ? (
                      <span
                        className={
                          "rounded-full border px-2 py-0.5 " +
                          (d.asceticismDone === d.asceticismTotal
                            ? "border-[#5d7a4a] text-[#a8c78a]"
                            : "border-[#7a2f2a] text-[#d99a8f]")
                        }
                      >
                        {d.asceticismDone}/{d.asceticismTotal}
                      </span>
                    ) : null}
                    <span className="text-[var(--ink-faint)]">{d.totalEntries} зап.</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          {pageCount > 1 ? (
            <nav aria-label="Страницы истории" className="flex items-center justify-center gap-4 pb-2">
              {currentPage > 1 ? (
                <Link
                  href={`/history?page=${currentPage - 1}`}
                  aria-label="Предыдущая страница"
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--card-edge)] text-[var(--gold)] active:border-[var(--bronze)]"
                >
                  ‹
                </Link>
              ) : (
                <span
                  aria-hidden="true"
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-transparent text-[var(--ink-faint)] opacity-40"
                >
                  ‹
                </span>
              )}
              <span className="font-chronicle text-sm text-[var(--ink-secondary)]">
                {currentPage} / {pageCount}
              </span>
              {currentPage < pageCount ? (
                <Link
                  href={`/history?page=${currentPage + 1}`}
                  aria-label="Следующая страница"
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--card-edge)] text-[var(--gold)] active:border-[var(--bronze)]"
                >
                  ›
                </Link>
              ) : (
                <span
                  aria-hidden="true"
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-transparent text-[var(--ink-faint)] opacity-40"
                >
                  ›
                </span>
              )}
            </nav>
          ) : null}
        </>
      )}
    </>
  );
}
