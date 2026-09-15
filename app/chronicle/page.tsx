import { redirect } from "next/navigation";
import BottomNav from "@/components/bottom-nav";
import { getChronicleEvents, type ChronicleEvent } from "@/lib/chronicle";
import { formatDateRu } from "@/lib/format";
import { getCurrentUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Хроника Пути — визуальная летопись. Бесконечная змейка: карточки событий
 * поочерёдно слева и справа от центральной дороги (узел → вниз → узел),
 * дорога идёт от первой записи к сегодняшнему дню и продолжается дальше.
 */
export default async function ChroniclePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const events = await getChronicleEvents(user.id);

  return (
    <main className="pb-32">
      <div className="mx-auto min-h-dvh w-full max-w-[480px] space-y-6 px-5 pt-[max(env(safe-area-inset-top),40px)]">
        <header className="space-y-1 px-1">
          <h1 className="font-chronicle text-[28px] font-bold text-[var(--gold)]">Хроника Пути</h1>
          <p className="text-sm text-[var(--ink-secondary)]">Летопись твоих событий — от первого шага до сегодня.</p>
        </header>

        {events.length === 0 ? (
          <p className="bronze-card bronze-edge px-4 py-8 text-center text-sm text-[var(--ink-faint)]">
            Летопись пуста. Сделай первую запись — и дорога начнётся.
          </p>
        ) : (
          <ol className="space-y-0">
            {events.map((event, i) => (
              <ChronicleRow key={event.key} event={event} index={i} first={i === 0} last={i === events.length - 1} />
            ))}
            <li>
              <div className="grid grid-cols-[1fr_36px_1fr] items-center">
                <div />
                <div className="relative flex h-16 items-center justify-center">
                  <span
                    aria-hidden="true"
                    className="absolute left-1/2 top-0 h-1/2 w-px -translate-x-1/2 bg-gradient-to-b from-[rgba(140,106,63,0.6)] to-transparent"
                  />
                  <span
                    aria-hidden="true"
                    className="relative z-10 h-3 w-3 rotate-45 border border-[var(--bronze)] bg-[var(--card)]"
                  />
                </div>
                <div />
                <div className="col-span-3 -mt-4 pb-2 text-center text-xs text-[var(--ink-faint)]">
                  Дорога продолжается…
                </div>
              </div>
            </li>
          </ol>
        )}
      </div>
      <BottomNav />
    </main>
  );
}

function ChronicleRow({
  event,
  index,
  first,
  last,
}: {
  event: ChronicleEvent;
  index: number;
  first: boolean;
  last: boolean;
}) {
  const left = index % 2 === 0;
  const card = (
    <div
      className={
        "rounded-2xl border border-[var(--card-edge)] bg-[rgba(18,27,46,0.7)] p-3 " +
        (event.kind === "journal_start" || event.kind === "day_streak_milestone"
          ? "border-[rgba(140,106,63,0.55)]"
          : "")
      }
    >
      <p className="font-chronicle text-sm font-semibold text-[var(--gold)]">{event.title}</p>
      {event.subtitle ? <p className="mt-0.5 text-sm text-[var(--ink)]">{event.subtitle}</p> : null}
      <p className="mt-1.5 text-[11px] uppercase tracking-wide text-[var(--ink-faint)]">
        {formatDateRu(event.date)}
      </p>
    </div>
  );

  return (
    <li>
      <div className="grid grid-cols-[1fr_36px_1fr] items-center">
        <div className={"py-3 " + (left ? "pr-3.5" : "")}>{left ? card : null}</div>

        {/* Центральная дорога: вертикальная линия, узел и отвод к карточке */}
        <div className="relative flex h-full items-center justify-center self-stretch">
          <span
            aria-hidden="true"
            className={
              "absolute left-1/2 w-px -translate-x-1/2 bg-gradient-to-b from-[rgba(176,141,87,0.55)] to-[rgba(140,106,63,0.6)] " +
              (first ? "top-1/2 bottom-0" : last ? "top-0 h-1/2" : "top-0 bottom-0")
            }
          />
          <span
            aria-hidden="true"
            className={
              "absolute top-1/2 h-px " +
              (left ? "left-0 w-1/2" : "right-0 w-1/2") +
              " bg-gradient-to-r from-[rgba(140,106,63,0.65)] to-[rgba(176,141,87,0.25)]"
            }
          />
          <span
            aria-hidden="true"
            className="relative z-10 h-3 w-3 rotate-45 border border-[var(--gold)] bg-[var(--bg-elevated)]"
          />
        </div>

        <div className={"py-3 " + (!left ? "pl-3.5" : "")}>{!left ? card : null}</div>
      </div>
    </li>
  );
}
