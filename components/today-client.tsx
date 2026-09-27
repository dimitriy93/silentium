"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useCacheQuery } from "@/hooks/use-cache-query";
import {
  readAsceticismAchievements,
  readDayStreakView,
  readLeisureForDay,
  readPathDay,
  readThoughtsForDay,
  readAsceticismDay,
} from "@/lib/local/queries";
import { writes } from "@/lib/local/mutations";
import type {
  LocalAchievement,
  LocalAsceticismDay,
  LocalLeisure,
  LocalPathDay,
  LocalThought,
} from "@/lib/local/types";
import { formatDateRu, formatMinutes, formatWeekdayRu, todayLocalDate } from "@/lib/format";
import { displayStreak, pluralDays } from "@/lib/asceticism-streak";
import OrbitalLoader from "@/components/orbital-loader";
import PendingDot from "@/components/pending-dot";
import { usePendingRows } from "@/hooks/use-pending-rows";
import AvatarRoom from "@/components/avatar-room/avatar-room";
import CharacterCard from "@/components/character-card";

/**
 * Главный экран «Сегодня»: дата, быстрый ввод мысли, сводка Пути,
 * развлечения, отметки аскез и наставник. Дата вычисляется на клиенте —
 * «сегодня» всегда локальное для пользователя.
 *
 * Данные читаются из локального кеша (IndexedDB) — экран открывается
 * мгновенно. Мутации идут через локальный путь (кеш + outbox, этап 2):
 * запись появляется мгновенно, на сервер вручную, офлайн —
 * ждёт в очереди.
 */
export default function TodayClient() {
  const [today, setToday] = useState<string | null>(null);

  const thoughts = useCacheQuery<LocalThought[]>(
    useCallback(async () => (today ? readThoughtsForDay(today) : null), [today]),
    [today],
  );
  const path = useCacheQuery<LocalPathDay>(
    useCallback(async () => (today ? readPathDay(today) : null), [today]),
    [today],
  );
  const leisure = useCacheQuery<LocalLeisure[]>(
    useCallback(async () => (today ? readLeisureForDay(today) : null), [today]),
    [today],
  );
  const asceticism = useCacheQuery<LocalAsceticismDay>(
    useCallback(async () => (today ? readAsceticismDay(today) : null), [today]),
    [today],
  );
  const achievements = useCacheQuery(readAsceticismAchievements, []);
  const dayStreak = useCacheQuery(readDayStreakView, []);

  useEffect(() => {
    setToday(todayLocalDate());
  }, []);

  return (
    <div className="space-y-4">
      <header className="space-y-0.5 px-1 pt-2">
        <p className="font-chronicle text-sm uppercase tracking-[0.2em] text-[var(--bronze-bright)]">
          Сегодня
        </p>
        <h1 className="font-chronicle text-2xl font-bold text-[var(--gold)]">
          {today ? formatDateRu(today) : "…"}
        </h1>
        <p className="text-sm text-[var(--ink-secondary)]">
          {today ? formatWeekdayRu(today) : ""}
        </p>
      </header>

      <DayStreakCard streak={dayStreak} />

      <AvatarRoom path={path} asceticism={asceticism} />

      <CharacterCard />

      <AchievementsCard achievements={achievements} dayStreak={dayStreak} />

      <ThoughtsCard thoughts={thoughts} />
      <PathCard path={path} />
      <LeisureCard leisure={leisure} />
      <AsceticismCard asceticism={asceticism} today={today} />
      <MentorCard />
    </div>
  );
}

function CardShell({
  title,
  href,
  children,
}: {
  title: string;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bronze-card bronze-edge p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-chronicle text-base font-semibold text-[var(--gold)]">{title}</h2>
        <Link href={href} className="text-xs text-[var(--ink-secondary)] active:text-[var(--gold)]">
          Открыть →
        </Link>
      </div>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-[var(--ink-faint)]">{text}</p>;
}

// ---------- Серия дневника ----------

/**
 * Карточка серии ведения дневника: первый блок после даты.
 * Активная серия — золотая, отсутствующая — серая с подсказкой.
 * Декор: бронзовые уголки и тонкий орнамент-разделитель.
 */
function DayStreakCard({
  streak,
}: {
  streak: { currentStreak: number; longestStreak: number; bestMilestone: number; lastActiveDate: string | null } | null;
}) {
  const active = (streak?.currentStreak ?? 0) > 0;
  const n = streak?.currentStreak ?? 0;

  const hint =
    streak === null
      ? null
      : active
        ? null
        : (streak?.longestStreak ?? 0) > 0
          ? "Начни путь сегодня. Ежедневная работа складывается в годы."
          : "Сделай первую запись. Любое осмысленное действие продолжит серию.";

  return (
    <section className="bronze-card bronze-edge relative overflow-hidden px-4 py-4" aria-live="polite">
      {/* Декоративные уголки хроники */}
      <span aria-hidden="true" className="pointer-events-none absolute left-1.5 top-1.5 h-4 w-4 border-l border-t border-[var(--bronze-bright)]/50" />
      <span aria-hidden="true" className="pointer-events-none absolute right-1.5 top-1.5 h-4 w-4 border-r border-t border-[var(--bronze-bright)]/50" />
      <span aria-hidden="true" className="pointer-events-none absolute bottom-1.5 left-1.5 h-4 w-4 border-b border-l border-[var(--bronze-bright)]/50" />
      <span aria-hidden="true" className="pointer-events-none absolute bottom-1.5 right-1.5 h-4 w-4 border-b border-r border-[var(--bronze-bright)]/50" />

      <p className="font-chronicle text-center text-[11px] uppercase tracking-[0.3em] text-[var(--bronze-bright)]">
        Активная серия
      </p>
      <p
        className={
          "font-chronicle mt-1.5 text-center text-3xl font-bold leading-none " +
          (active ? "text-[var(--gold)]" : "text-[var(--ink-faint)]")
        }
      >
        День {n}
      </p>
      <p className="mt-1.5 text-center text-xs text-[var(--ink-secondary)]">
        {active ? `${n} ${n === 1 ? "день" : n < 5 ? "дня" : "дней"} подряд` : "Серия не начата"}
      </p>

      {/* Тонкий орнамент: линия с ромбом по центру */}
      <div aria-hidden="true" className="mt-3 flex items-center gap-2 px-6">
        <span className="engraved-line flex-1" />
        <span className={"h-1.5 w-1.5 rotate-45 " + (active ? "bg-[var(--gold)]/70" : "bg-[var(--card-edge)]")} />
        <span className="engraved-line flex-1" />
      </div>

      {hint ? <p className="mt-3 text-center text-xs leading-relaxed text-[var(--ink-faint)]">{hint}</p> : null}
    </section>
  );
}

// ---------- Мысли ----------

function ThoughtsCard({ thoughts }: { thoughts: LocalThought[] | null }) {
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingIds = usePendingRows("thought");

  async function submit() {
    const content = draft.trim();
    if (!content || saving) return;
    setSaving(true);
    setError(null);
    const res = await writes.addThought(todayLocalDate(), content);
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setDraft("");
  }

  return (
    <CardShell title="Мысли" href="/thoughts">
      <div className="space-y-2">
        <textarea
          className="field w-full resize-none px-3 py-2.5 text-[15px]"
          rows={2}
          placeholder="Добавить мысль…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              void submit();
            }
          }}
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={saving || !draft.trim()}
          className="btn-bronze h-10 w-full text-sm"
        >
          {saving ? "Записываю…" : "Записать"}
        </button>
        {error ? <p className="text-sm text-[#c96a5a]">{error}</p> : null}
        {thoughts !== null && thoughts.length > 0 ? (
          <ul className="space-y-1.5 pt-1">
            {thoughts.slice(0, 3).map((t) => (
              <li key={t.id} className="line-clamp-2 text-sm text-[var(--ink-secondary)]">
                <span className="mr-2 inline-flex items-center gap-1.5 text-xs text-[var(--ink-faint)]">
                  {new Date(t.createdAt).toLocaleTimeString("ru-RU", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {pendingIds.has(t.id) ? <PendingDot /> : null}
                </span>
                {t.content}
              </li>
            ))}
            {thoughts.length > 3 ? (
              <li className="text-xs text-[var(--ink-faint)]">
                и ещё {thoughts.length - 3}…
              </li>
            ) : null}
          </ul>
        ) : thoughts !== null ? (
          <Empty text="Мыслей пока нет." />
        ) : null}
      </div>
    </CardShell>
  );
}

// ---------- Путь ----------

function PathCard({ path }: { path: LocalPathDay | null }) {
  const n = path;
  const nutrition = n?.nutrition;
  return (
    <CardShell title="Путь" href="/path">
      {n === null ? (
        <OrbitalLoader size={26} className="py-1" />
      ) : (
        <ul className="divide-y divide-[var(--card-edge)]">
          <PathRow
            href="/path"
            symbol="🔥"
            label="Огонь"
            value={
              n.training.length > 0
                ? n.training.map((t) => t.title).join(", ")
                : "не разжигали"
            }
            filled={n.training.length > 0}
          />
          <PathRow
            href="/path"
            symbol="🌊"
            label="Вода"
            value={
              nutrition?.calories != null
                ? `${nutrition.calories} ккал · Б ${nutrition.proteinGrams ?? "—"} · Ж ${nutrition.fatGrams ?? "—"} · У ${nutrition.carbsGrams ?? "—"}`
                : "не записано"
            }
            filled={nutrition != null && nutrition.calories != null}
          />
          <PathRow
            href="/path"
            symbol="🌬"
            label="Воздух"
            value={
              n.learning.length > 0 ? `${n.learning.length} зап. — «я изучил»` : "изучения нет"
            }
            filled={n.learning.length > 0}
          />
          <PathRow
            href="/path"
            symbol="🪨"
            label="Земля"
            value={
              n.creation.length > 0 ? `${n.creation.length} зап. — «я создал»` : "созидания нет"
            }
            filled={n.creation.length > 0}
          />
        </ul>
      )}
    </CardShell>
  );
}

function PathRow({
  href,
  symbol,
  label,
  value,
  filled,
}: {
  href: string;
  symbol: string;
  label: string;
  value: string;
  filled: boolean;
}) {
  return (
    <li>
      <Link href={href} className="flex items-center gap-3 py-2.5">
        <span aria-hidden="true" className="text-base">
          {symbol}
        </span>
        <span className="w-16 shrink-0 text-sm font-semibold">{label}</span>
        <span
          className={
            "line-clamp-1 flex-1 text-right text-sm " +
            (filled ? "text-[var(--ink)]" : "text-[var(--ink-faint)]")
          }
        >
          {value}
        </span>
      </Link>
    </li>
  );
}

// ---------- Развлечения ----------

function LeisureCard({ leisure }: { leisure: LocalLeisure[] | null }) {
  const total = (leisure ?? []).reduce((sum, e) => sum + (e.minutes ?? 0), 0);
  return (
    <CardShell title="Развлечения" href="/leisure">
      {leisure === null ? (
        <OrbitalLoader size={26} className="py-1" />
      ) : leisure.length === 0 ? (
        <Empty text="Отвлечений не записано." />
      ) : (
        <div className="space-y-1">
          <p className="text-sm text-[var(--ink)]">
            {leisure.map((e) => e.title).join(" · ")}
          </p>
          <p className="text-xs text-[var(--ink-faint)]">
            Всего: {formatMinutes(total)}
          </p>
        </div>
      )}
    </CardShell>
  );
}

// ---------- Аскезы ----------

function AsceticismCard({
  asceticism,
  today,
}: {
  asceticism: LocalAsceticismDay | null;
  today: string | null;
}) {
  const active = asceticism?.list.filter((a) => a.isActive) ?? [];
  /** Отметка (asceticismId + статус), запрос которой сейчас выполняется. */
  const [pendingMark, setPendingMark] = useState<{ id: string; status: string } | null>(null);
  const [markError, setMarkError] = useState<string | null>(null);

  async function mark(id: string, status: "done" | "failed") {
    if (!today || pendingMark) return;
    setPendingMark({ id, status });
    setMarkError(null);
    const res = await writes.setAsceticismLog(id, today, status);
    setPendingMark(null);
    if (!res.ok) {
      setMarkError(res.error);
      return;
    }
  }

  return (
    <CardShell title="Аскезы" href="/asceticism">
      {asceticism === null ? (
        <OrbitalLoader size={26} className="py-1" />
      ) : active.length === 0 ? (
        <Empty text="Активных аскез нет." />
      ) : (
        <ul className="space-y-2">
          {active.map((a) => {
            const log = asceticism.logs.find((l) => l.asceticismId === a.id);
            const streakView = asceticism.streaks.find((s) => s.asceticismId === a.id);
            const streak = streakView && today ? displayStreak(streakView, today) : 0;
            const pending = pendingMark !== null;
            return (
              <li
                key={a.id}
                className={
                  "rounded-2xl border p-2 transition-colors " +
                  (log?.status === "done"
                    ? "border-[rgba(93,122,74,0.55)] bg-[rgba(43,58,36,0.28)]"
                    : "border-transparent")
                }
              >
                <p className="mb-1 flex items-center gap-2 text-sm font-medium">
                  <span className="line-clamp-1 flex-1">{a.title}</span>
                  {streak > 0 ? <StreakMedallion streak={streak} /> : null}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => void mark(a.id, "done")}
                    className={
                      "flex h-10 items-center justify-center rounded-xl border text-sm font-semibold transition-colors " +
                      (log?.status === "done"
                        ? "border-[#5d7a4a] bg-[#2b3a24] text-[#a8c78a]"
                        : "border-[var(--card-edge)] text-[var(--ink-secondary)]")
                    }
                  >
                    {pendingMark?.id === a.id && pendingMark.status === "done" ? (
                      <MarkSpinner />
                    ) : (
                      "Выполнено"
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => void mark(a.id, "failed")}
                    className={
                      "flex h-10 items-center justify-center rounded-xl border text-sm font-semibold transition-colors " +
                      (log?.status === "failed"
                        ? "border-[#7a2f2a] bg-[#3a1f1c] text-[#d99a8f]"
                        : "border-[var(--card-edge)] text-[var(--ink-secondary)]")
                    }
                  >
                    {pendingMark?.id === a.id && pendingMark.status === "failed" ? (
                      <MarkSpinner />
                    ) : (
                      "Не выполнено"
                    )}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {markError ? <p className="mt-2 text-sm text-[#c96a5a]">{markError}</p> : null}
    </CardShell>
  );
}

/** Компактный лоадер внутри кнопки отметки аскезы. */
function MarkSpinner() {
  return (
    <span
      aria-hidden="true"
      className="block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent opacity-70"
    />
  );
}

// ---------- Достижения аскез ----------

/**
 * Медальон серии: компактный жетон с числом дней рядом с названием аскезы.
 */
function StreakMedallion({ streak }: { streak: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5"
      title={`Серия: ${pluralDays(streak)}`}
    >
      <span
        aria-hidden="true"
        className="flex h-6 w-6 items-center justify-center rounded-full border border-[var(--gold)] bg-[radial-gradient(circle_at_30%_30%,rgba(255,215,130,0.35),rgba(122,86,32,0.25))] text-[10px] font-bold text-[var(--gold)]"
      >
        {streak > 999 ? "1k+" : streak}
      </span>
      <span className="whitespace-nowrap text-xs font-semibold text-[var(--gold)]">
        День {streak}
      </span>
    </span>
  );
}

/**
 * Блок достижений под Avatar Room: две ветки — достижения серий аскез
 * (по карточке на аскезу с достигнутым порогом) и достижение общей серии
 * дневника. Кубок берётся из public/achievements/trophy-{N}.webp,
 * при отсутствии файла — заглушка.
 */
interface AchievementItem {
  key: string;
  title: string;
  milestone: number;
}

function AchievementsCard({
  achievements,
  dayStreak,
}: {
  achievements: LocalAchievement[] | null;
  dayStreak: { bestMilestone: number } | null;
}) {
  const items: AchievementItem[] = [
    ...(achievements ?? []).map((a) => ({ key: `asc-${a.asceticismId}`, title: a.title, milestone: a.milestone })),
    ...(dayStreak !== null && dayStreak.bestMilestone > 0
      ? [{ key: "day-streak", title: "Серия дневника", milestone: dayStreak.bestMilestone }]
      : []),
  ];
  if (items.length === 0) return null;
  return (
    <section className="bronze-card bronze-edge p-4">
      <h2 className="font-chronicle mb-3 text-base font-semibold text-[var(--gold)]">
        Достижения
      </h2>
      <ul className="grid grid-cols-2 gap-2">
        {items.map((a) => (
          <li
            key={a.key}
            className="flex items-center gap-2.5 rounded-2xl border border-[var(--card-edge)] p-2"
          >
            <TrophyImage milestone={a.milestone} title={a.title} />
            <div className="min-w-0">
              <p className="line-clamp-2 text-sm font-medium leading-tight">{a.title}</p>
              <p className="text-xs text-[var(--ink-secondary)]">
                Серия: {pluralDays(a.milestone)}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Кубок порога; если WEBP ещё не добавлен — бронзовая заглушка-медальон. */
function TrophyImage({ milestone, title }: { milestone: number; title: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span
        aria-hidden="true"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--gold)] bg-[radial-gradient(circle_at_30%_30%,rgba(255,215,130,0.35),rgba(122,86,32,0.25))] text-[11px] font-bold text-[var(--gold)]"
      >
        {milestone}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/achievements/trophy-${milestone}.webp`}
      alt={`Награда «${title}» за ${pluralDays(milestone)}`}
      width={40}
      height={40}
      className="h-10 w-10 shrink-0 object-contain"
      onError={() => setFailed(true)}
    />
  );
}

// ---------- Наставник ----------

function MentorCard() {
  return (
    <section className="bronze-card bronze-edge p-4">
      <h2 className="font-chronicle mb-2 text-base font-semibold text-[var(--gold)]">
        Наставник
      </h2>
      <p className="mb-3 text-sm leading-relaxed text-[var(--ink-secondary)]">
        К концу дня Наставник прочтёт записи и даст выжимку, наблюдение и наставление.
      </p>
      <Link
        href="/mentor"
        className="btn-bronze flex h-11 items-center justify-center text-sm"
      >
        Получить наставление
      </Link>
    </section>
  );
}
