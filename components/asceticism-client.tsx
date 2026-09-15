"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createAsceticism,
  deleteAsceticism,
  getAsceticismDay,
  setAsceticismLog,
  updateAsceticism,
  type AsceticismDay,
} from "@/actions/asceticism";
import type { Asceticism } from "@/lib/db/schema";
import { formatDateRu, todayLocalDate } from "@/lib/format";
import { displayStreak, pluralDays } from "@/lib/asceticism-streak";
import OrbitalLoader from "@/components/orbital-loader";

/**
 * Раздел «Аскезы»: список правил + отметка за сегодня (выполнено / не
 * выполнено), создание и редактирование, серии и награды.
 */
export default function AsceticismClient() {
  const [data, setData] = useState<AsceticismDay | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [today, setToday] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const res = await getAsceticismDay(todayLocalDate());
    if (res.ok) setData(res.data);
    else setError(res.error);
  }, []);

  useEffect(() => {
    setToday(todayLocalDate());
    void reload();
  }, [reload]);

  return (
    <div className="space-y-5">
      {error ? <p className="text-sm text-[#c96a5a]">{error}</p> : null}

      {data === null ? (
        <OrbitalLoader label="Читаю хронику…" className="py-10" />
      ) : (
        <>
          <AsceticismList data={data} reload={reload} today={today} />

          {showForm ? (
            <CreateForm
              onDone={async () => {
                setShowForm(false);
                await reload();
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="btn-bronze h-12 w-full text-sm"
            >
              Новая аскеза
            </button>
          )}
        </>
      )}
    </div>
  );
}

function AsceticismList({
  data,
  reload,
  today,
}: {
  data: AsceticismDay;
  reload: () => Promise<void>;
  today: string | null;
}) {
  if (data.list.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-[var(--ink-faint)]">
        Правил ещё нет. Аскеза — это рамка, которую ты сам выбрал.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {data.list.map((a) => {
        const log = data.logs.find((l) => l.asceticismId === a.id);
        const streakView = data.streaks.find((s) => s.asceticismId === a.id);
        const streak = streakView && today ? displayStreak(streakView, today) : 0;
        return (
          <AsceticismCard
            key={a.id}
            asceticism={a}
            log={log}
            streak={streak}
            reload={reload}
            today={today}
          />
        );
      })}
    </div>
  );
}

function AsceticismCard({
  asceticism: a,
  log,
  streak,
  reload,
  today,
}: {
  asceticism: Asceticism;
  log: AsceticismDay["logs"][number] | undefined;
  streak: number;
  reload: () => Promise<void>;
  today: string | null;
}) {
  /** Отметка, запрос которой сейчас выполняется: показываем лоадер только на ней. */
  const [pendingStatus, setPendingStatus] = useState<"done" | "failed" | "none" | null>(null);
  const [markError, setMarkError] = useState<string | null>(null);
  const done = log?.status === "done";

  async function mark(status: "done" | "failed" | "none") {
    if (pendingStatus || !today) return;
    setPendingStatus(status);
    setMarkError(null);
    const res = await setAsceticismLog(a.id, today, status, today);
    setPendingStatus(null);
    if (!res.ok) {
      setMarkError(res.error);
      return;
    }
    await reload();
  }

  return (
    <article
      className={"bronze-card bronze-edge p-4 transition-colors " + (done ? "asceticism-done" : "")}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold">{a.title}</h3>
          <p className="mt-0.5 text-xs text-[var(--ink-faint)]">
            с {formatDateRu(a.startDate)}
            {a.isActive ? "" : " · не активна"}
            {a.isActive && streak > 0 ? ` · серия ${pluralDays(streak)}` : ""}
          </p>
        </div>
        <CardMenu asceticism={a} reload={reload} />
      </div>
      {a.description ? (
        <p className="mt-1.5 text-sm leading-relaxed text-[var(--ink-secondary)]">
          {a.description}
        </p>
      ) : null}

      {a.isActive && today ? (
        <div className="mt-3 space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <MarkButton
              pending={pendingStatus === "done"}
              disabled={pendingStatus !== null}
              selected={log?.status === "done"}
              kind="done"
              onClick={() => void mark("done")}
            />
            <MarkButton
              pending={pendingStatus === "failed"}
              disabled={pendingStatus !== null}
              selected={log?.status === "failed"}
              kind="failed"
              onClick={() => void mark("failed")}
            />
            <MarkButton
              pending={pendingStatus === "none"}
              disabled={pendingStatus !== null}
              selected={false}
              kind="none"
              onClick={() => void mark("none")}
            />
          </div>
          {markError ? <p className="text-sm text-[#c96a5a]">{markError}</p> : null}
        </div>
      ) : null}
    </article>
  );
}

const MARK_LABELS = { done: "Выполнено", failed: "Не выполнено", none: "Снять" } as const;

/** Кнопка отметки: во время запроса показывает компактный лоадер вместо текста. */
function MarkButton({
  pending,
  disabled,
  selected,
  kind,
  onClick,
}: {
  pending: boolean;
  disabled: boolean;
  selected: boolean;
  kind: "done" | "failed" | "none";
  onClick: () => void;
}) {
  const selectedClass =
    kind === "done"
      ? "border-[#5d7a4a] bg-[#2b3a24] text-[#a8c78a]"
      : kind === "failed"
        ? "border-[#7a2f2a] bg-[#3a1f1c] text-[#d99a8f]"
        : "";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={
        "flex h-11 items-center justify-center rounded-xl border text-sm font-semibold transition-colors " +
        (kind === "none"
          ? "btn-ghost"
          : selected
            ? selectedClass
            : "border-[var(--card-edge)] text-[var(--ink-secondary)] active:border-[var(--bronze)]")
      }
    >
      {pending ? <ButtonSpinner /> : MARK_LABELS[kind]}
    </button>
  );
}

function ButtonSpinner() {
  return (
    <span
      aria-hidden="true"
      className="block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent opacity-70"
    />
  );
}

function CardMenu({ asceticism: a, reload }: { asceticism: Asceticism; reload: () => Promise<void> }) {
  async function toggleActive() {
    await updateAsceticism(a.id, { isActive: !a.isActive }, todayLocalDate());
    await reload();
  }

  return (
    <div className="flex shrink-0 gap-3 text-xs">
      <button
        type="button"
        className="text-[var(--ink-secondary)] active:text-[var(--gold)]"
        onClick={() => void toggleActive()}
      >
        {a.isActive ? "Отключить" : "Включить"}
      </button>
      <button
        type="button"
        className="text-[#a05a4e] active:text-[#c96a5a]"
        onClick={() => {
          if (confirm("Удалить аскезу? История отметок тоже будет удалена.")) {
            void deleteAsceticism(a.id).then(reload);
          }
        }}
      >
        Удалить
      </button>
    </div>
  );
}

function CreateForm({ onDone }: { onDone: () => Promise<void> }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState<string>(todayLocalDate());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!title.trim() || saving) return;
    setSaving(true);
    setError(null);
    const res = await createAsceticism(title.trim(), startDate, description.trim() || null);
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    await onDone();
  }

  return (
    <form
      className="bronze-card bronze-edge space-y-2 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <input
        className="field h-11 w-full px-3 text-[15px]"
        placeholder="Название: не играть в игры…"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <textarea
        className="field w-full resize-none px-3 py-2.5 text-[15px]"
        rows={2}
        placeholder="Описание (необязательно)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <label className="flex items-center justify-between gap-3 px-1">
        <span className="text-sm text-[var(--ink-secondary)]">Дата начала</span>
        <input
          className="field h-10 w-40 px-3 text-sm"
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />
      </label>
      {error ? <p className="text-sm text-[#c96a5a]">{error}</p> : null}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving || !title.trim()}
          className="btn-bronze h-11 flex-1 text-sm"
        >
          {saving ? "Создаю…" : "Создать"}
        </button>
        <button type="button" onClick={() => void onDone()} className="btn-ghost h-11 px-4 text-sm">
          Отмена
        </button>
      </div>
    </form>
  );
}
