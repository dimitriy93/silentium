import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import BottomNav from "@/components/bottom-nav";
import HistoryDayClient from "@/components/history-day-client";
import { formatDateRu, formatWeekdayRu } from "@/lib/format";
import { getCurrentUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Страница одного дня истории: все записи разделов этого дня. Данные читает
 * клиентский HistoryDayClient — мгновенно из локального кеша, при пустом
 * кеше — серверным экшеном fetchHistoryDay. Только чтение — редактирование
 * выполняется в соответствующих разделах.
 */
export default async function HistoryDayPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    notFound();
  }

  return (
    <main className="pb-32">
      <div className="mx-auto min-h-dvh w-full max-w-[480px] space-y-4 px-5 pt-[max(env(safe-area-inset-top),32px)]">
        <header className="space-y-1 px-1">
          <Link href="/history" className="text-xs text-[var(--ink-secondary)]">
            ← История
          </Link>
          <h1 className="font-chronicle text-2xl font-bold text-[var(--gold)]">
            {formatDateRu(date)}
          </h1>
          <p className="text-sm text-[var(--ink-secondary)]">{formatWeekdayRu(date)}</p>
        </header>
        <HistoryDayClient date={date} />
      </div>
      <BottomNav />
    </main>
  );
}
