import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import BottomNav from "@/components/bottom-nav";
import LocalTime from "@/components/local-time";
import { listAsceticisms } from "@/lib/asceticism";
import { getDayEntries } from "@/lib/day";
import { formatDateRu, formatMinutes, formatWeekdayRu } from "@/lib/format";
import { getCurrentUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Страница одного дня истории: все записи разделов этого дня.
 * Только чтение — редактирование выполняется в соответствующих разделах.
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

  const [day, asceticismList] = await Promise.all([
    getDayEntries(user.id, date),
    listAsceticisms(user.id),
  ]);

  const hasAny =
    day.thoughts.length > 0 ||
    day.training.length > 0 ||
    day.nutrition !== null ||
    day.learning.length > 0 ||
    day.creation.length > 0 ||
    day.leisure.length > 0 ||
    day.asceticismLogs.length > 0;

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

        {!hasAny ? (
          <p className="bronze-card bronze-edge p-6 text-center text-sm text-[var(--ink-faint)]">
            В этот день записей нет. Молчание в хронике — тоже факт.
          </p>
        ) : (
          <>
            {day.thoughts.length > 0 && (
              <Section title="Мысли">
                <ul className="space-y-2.5">
                  {day.thoughts.map((t) => (
                    <li key={t.id}>
                      <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{t.content}</p>
                      <p className="mt-0.5 text-xs text-[var(--ink-faint)]">
                        <LocalTime utc={t.createdAt.toISOString()} />
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
                        <p className="text-xs text-[var(--ink-faint)]">
                          {formatMinutes(t.durationMinutes)}
                        </p>
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
                    Белок: {day.nutrition.proteinGrams ?? "—"} г · Жиры:{" "}
                    {day.nutrition.fatGrams ?? "—"} г · Углеводы:{" "}
                    {day.nutrition.carbsGrams ?? "—"} г
                  </p>
                  {day.nutrition.note ? (
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">
                      {day.nutrition.note}
                    </p>
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
                  {day.asceticismLogs.map((log) => {
                    const a = asceticismList.find((x) => x.id === log.asceticismId);
                    return (
                      <li key={log.id} className="flex items-center justify-between text-[15px]">
                        <span>{a?.title ?? "Аскеза"}</span>
                        <span
                          className={
                            "text-sm " +
                            (log.status === "done" ? "text-[#a8c78a]" : "text-[#d99a8f]")
                          }
                        >
                          {log.status === "done" ? "выполнено" : "не выполнено"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </Section>
            )}
          </>
        )}
      </div>
      <BottomNav />
    </main>
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
