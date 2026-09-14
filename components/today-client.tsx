"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createThought, listThoughtsForDay } from "@/actions/thoughts";
import { getAsceticismDay, setAsceticismLog, type AsceticismDay } from "@/actions/asceticism";
import { getPathDay, type PathDay } from "@/actions/path";
import { listLeisureForDay } from "@/actions/leisure";
import type { LeisureEntry } from "@/lib/db/schema";
import type { Thought } from "@/lib/db/schema";
import { formatDateRu, formatMinutes, formatWeekdayRu, todayLocalDate } from "@/lib/format";
import OrbitalLoader from "@/components/orbital-loader";
import AvatarRoom from "@/components/avatar-room/avatar-room";

/**
 * Главный экран «Сегодня»: дата, быстрый ввод мысли, сводка Пути,
 * развлечения, отметки аскез и наставник. Дата вычисляется на клиенте —
 * «сегодня» всегда локальное для пользователя.
 */
export default function TodayClient() {
  const [today, setToday] = useState<string | null>(null);
  const [thoughts, setThoughts] = useState<Thought[] | null>(null);
  const [path, setPath] = useState<PathDay | null>(null);
  const [leisure, setLeisure] = useState<LeisureEntry[] | null>(null);
  const [asceticism, setAsceticism] = useState<AsceticismDay | null>(null);

  const reload = useCallback(async () => {
    const date = todayLocalDate();
    const [thoughtsRes, pathRes, leisureRes, asceticismRes] = await Promise.all([
      listThoughtsForDay(date),
      getPathDay(date),
      listLeisureForDay(date),
      getAsceticismDay(date),
    ]);
    if (thoughtsRes.ok) setThoughts(thoughtsRes.data);
    if (pathRes.ok) setPath(pathRes.data);
    if (leisureRes.ok) setLeisure(leisureRes.data);
    if (asceticismRes.ok) setAsceticism(asceticismRes.data);
  }, []);

  useEffect(() => {
    setToday(todayLocalDate());
    void reload();
  }, [reload]);

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

      <AvatarRoom path={path} asceticism={asceticism} />

      <ThoughtsCard thoughts={thoughts} reload={reload} />
      <PathCard path={path} />
      <LeisureCard leisure={leisure} />
      <AsceticismCard asceticism={asceticism} reload={reload} today={today} />
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

// ---------- Мысли ----------

function ThoughtsCard({
  thoughts,
  reload,
}: {
  thoughts: Thought[] | null;
  reload: () => Promise<void>;
}) {
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    const content = draft.trim();
    if (!content || saving) return;
    setSaving(true);
    const res = await createThought(todayLocalDate(), content);
    setSaving(false);
    if (res.ok) {
      setDraft("");
      await reload();
    }
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
        {thoughts !== null && thoughts.length > 0 ? (
          <ul className="space-y-1.5 pt-1">
            {thoughts.slice(0, 3).map((t) => (
              <li key={t.id} className="line-clamp-2 text-sm text-[var(--ink-secondary)]">
                <span className="mr-2 text-xs text-[var(--ink-faint)]">
                  {new Date(t.createdAt).toLocaleTimeString("ru-RU", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
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

function PathCard({ path }: { path: PathDay | null }) {
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

function LeisureCard({ leisure }: { leisure: LeisureEntry[] | null }) {
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
  reload,
  today,
}: {
  asceticism: AsceticismDay | null;
  reload: () => Promise<void>;
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
    const res = await setAsceticismLog(id, today, status);
    setPendingMark(null);
    if (!res.ok) {
      setMarkError(res.error);
      return;
    }
    await reload();
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
                <p className="mb-1 text-sm font-medium">{a.title}</p>
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
