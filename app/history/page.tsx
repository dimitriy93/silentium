import Link from "next/link";
import { redirect } from "next/navigation";
import BottomNav from "@/components/bottom-nav";
import { listDaySummaries } from "@/lib/day";
import { formatDateRu, formatWeekdayRu } from "@/lib/format";
import { getCurrentUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * История: список дней с активностью, новые сверху. Чистые серверные данные:
 * даты хранятся строками YYYY-MM-DD, часовые пояса на отображение не влияют.
 */
export default async function HistoryPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const days = await listDaySummaries(user.id);

  return (
    <main className="pb-32">
      <div className="mx-auto min-h-dvh w-full max-w-[480px] space-y-5 px-5 pt-[max(env(safe-area-inset-top),40px)]">
        <header className="space-y-1 px-1">
          <h1 className="font-chronicle text-[28px] font-bold text-[var(--gold)]">История</h1>
          <p className="text-sm text-[var(--ink-secondary)]">Хроника прошедших дней.</p>
        </header>

        {days.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--ink-faint)]">
            Хроника пуста.{" "}
            <Link href="/today" className="text-[var(--gold)] underline-offset-4 hover:underline">
              Заполните сегодняшний день.
            </Link>
          </p>
        ) : (
          <ul className="bronze-card divide-y divide-[var(--card-edge)]">
            {days.map((d) => (
              <li key={d.entryDate}>
                <Link
                  href={`/history/${d.entryDate}`}
                  className="flex items-center justify-between gap-3 px-4 py-3.5"
                >
                  <div>
                    <p className="text-[15px] font-medium">{formatDateRu(d.entryDate)}</p>
                    <p className="text-xs text-[var(--ink-faint)]">
                      {formatWeekdayRu(d.entryDate)}
                    </p>
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
        )}
      </div>
      <BottomNav />
    </main>
  );
}
