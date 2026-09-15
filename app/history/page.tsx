import Link from "next/link";
import { redirect } from "next/navigation";
import BottomNav from "@/components/bottom-nav";
import { listDaySummariesPage } from "@/lib/day";
import { formatDateRu, formatWeekdayRu } from "@/lib/format";
import { getCurrentUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * История: список дней с активностью, новые сверху. Чистые серверные данные:
 * даты хранятся строками YYYY-MM-DD, часовые пояса на отображение не влияют.
 * Пагинация серверная: 12 дней на страницу (?page=N), LIMIT/OFFSET в SQL.
 */
export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const params = await searchParams;
  const requested = Number.parseInt(params.page ?? "1", 10);

  const first = await listDaySummariesPage(user.id, Number.isFinite(requested) && requested > 0 ? requested : 1);
  // Клампим за пределы: ?page=999 → последняя страница.
  const data = first.page > first.pageCount ? await listDaySummariesPage(user.id, first.pageCount) : first;
  const { days, page, pageCount } = data;

  const pageHref = (p: number) => `/history?page=${p}`;

  return (
    <main className="pb-32">
      <div className="mx-auto min-h-dvh w-full max-w-[480px] space-y-5 px-5 pt-[max(env(safe-area-inset-top),40px)]">
        <header className="space-y-1 px-1">
          <h1 className="font-chronicle text-[28px] font-bold text-[var(--gold)]">История</h1>
          <p className="text-sm text-[var(--ink-secondary)]">Хроника прошедших дней.</p>
        </header>

        <div className="flex justify-end px-1">
          <Link href="/chronicle" className="text-xs text-[var(--ink-secondary)] active:text-[var(--gold)]">
            Хроника Пути →
          </Link>
        </div>

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

            {pageCount > 1 ? (
              <nav aria-label="Страницы истории" className="flex items-center justify-center gap-4 pb-2">
                {page > 1 ? (
                  <Link
                    href={pageHref(page - 1)}
                    aria-label="Предыдущая страница"
                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--card-edge)] text-[var(--gold)] active:border-[var(--bronze)]"
                  >
                    ‹
                  </Link>
                ) : (
                  <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-xl border border-transparent text-[var(--ink-faint)] opacity-40">
                    ‹
                  </span>
                )}
                <span className="font-chronicle text-sm text-[var(--ink-secondary)]">
                  {page} / {pageCount}
                </span>
                {page < pageCount ? (
                  <Link
                    href={pageHref(page + 1)}
                    aria-label="Следующая страница"
                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--card-edge)] text-[var(--gold)] active:border-[var(--bronze)]"
                  >
                    ›
                  </Link>
                ) : (
                  <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-xl border border-transparent text-[var(--ink-faint)] opacity-40">
                    ›
                  </span>
                )}
              </nav>
            ) : null}
          </>
        )}
      </div>
      <BottomNav />
    </main>
  );
}
