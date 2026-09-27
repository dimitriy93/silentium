"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import HistoryDayClient from "@/components/history-day-client";
import { formatDateRu, formatWeekdayRu } from "@/lib/format";

/**
 * Клиентская часть дня истории: разбирает ?date=YYYY-MM-DD и рисует шапку
 * с записями дня. Некорректная дата — не крашит страницу: показывается
 * «день не распознан» со ссылкой назад.
 */
export default function HistoryDayView() {
  const searchParams = useSearchParams();
  const date = searchParams.get("date") ?? "";

  return (
    <>
      <header className="space-y-1 px-1">
        <Link href="/history" className="text-xs text-[var(--ink-secondary)]">
          ← История
        </Link>
        <h1 className="font-chronicle text-2xl font-bold text-[var(--gold)]">
          {/^\d{4}-\d{2}-\d{2}$/.test(date) ? formatDateRu(date) : "День не распознан"}
        </h1>
        <p className="text-sm text-[var(--ink-secondary)]">
          {/^\d{4}-\d{2}-\d{2}$/.test(date) ? formatWeekdayRu(date) : ""}
        </p>
      </header>
      {/^\d{4}-\d{2}-\d{2}$/.test(date) ? (
        <HistoryDayClient date={date} />
      ) : (
        <p className="bronze-card bronze-edge p-6 text-center text-sm text-[var(--ink-faint)]">
          В ссылке нет корректной даты. Вернитесь к списку истории.
        </p>
      )}
    </>
  );
}
