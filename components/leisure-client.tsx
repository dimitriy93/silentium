"use client";

import { useCallback, useEffect, useState } from "react";
import { useCacheQuery } from "@/hooks/use-cache-query";
import { usePendingRows } from "@/hooks/use-pending-rows";
import { readLeisureForDay } from "@/lib/local/queries";
import { writes } from "@/lib/local/mutations";
import type { LocalLeisure } from "@/lib/local/types";
import { formatMinutes, todayLocalDate } from "@/lib/format";
import OrbitalLoader from "@/components/orbital-loader";
import PendingDot from "@/components/pending-dot";

/**
 * Раздел «Развлечения» — честный учёт отдыха и отвлечений. Не система
 * наказаний: задача — видеть реальную картину дня.
 *
 * Записи дня мгновенно читаются из локального кеша; мутации идут через
 * локальный путь (кеш + outbox): запись появляется мгновенно, при сети
 * сразу уходит в Башню, офлайн — ждёт в очереди.
 */
export default function LeisureClient() {
  const [title, setTitle] = useState("");
  const [minutes, setMinutes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [today, setToday] = useState<string | null>(null);

  const entries = useCacheQuery<LocalLeisure[]>(
    useCallback(async () => (today ? readLeisureForDay(today) : null), [today]),
    [today],
  );
  const pendingIds = usePendingRows("leisure");

  useEffect(() => {
    setToday(todayLocalDate());
  }, []);

  async function submit() {
    if (!title.trim() || saving) return;
    setSaving(true);
    setError(null);
    const res = await writes.addLeisure(
      todayLocalDate(),
      title.trim(),
      minutes ? Number(minutes) : null,
    );
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setTitle("");
    setMinutes("");
  }

  const totalMinutes = (entries ?? []).reduce((sum, e) => sum + (e.minutes ?? 0), 0);

  return (
    <div className="space-y-5">
      <form
        className="bronze-card bronze-edge space-y-2 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="flex items-center gap-2">
          <input
            className="field h-11 w-full px-3 text-[15px]"
            placeholder="Что отвлекало: YouTube, игра, прогулка…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            className="field h-11 w-28 px-3 text-[15px]"
            type="number"
            inputMode="numeric"
            min="1"
            placeholder="Минуты"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
          />
          <button
            type="submit"
            disabled={saving || !title.trim()}
            className="btn-bronze h-11 flex-1 text-sm"
          >
            {saving ? "Записываю…" : "Записать"}
          </button>
        </div>
        {error ? <p className="text-sm text-[#c96a5a]">{error}</p> : null}
      </form>

      {entries !== null && entries.length > 0 ? (
        <p className="px-1 text-sm text-[var(--ink-secondary)]">
          Всего за день: <span className="font-semibold text-[var(--gold)]">{formatMinutes(totalMinutes)}</span>
        </p>
      ) : null}

      {entries === null ? (
        <OrbitalLoader label="Читаю хронику…" className="py-10" />
      ) : entries.length === 0 ? (
        <p className="py-8 text-center text-sm text-[var(--ink-faint)]">
          День чист. Отдых и отвлечения не записаны.
        </p>
      ) : (
        <ul className="bronze-card divide-y divide-[var(--card-edge)]">
          {entries.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="text-[15px] font-medium">{e.title}</p>
                {e.minutes ? (
                  <p className="text-xs text-[var(--ink-faint)]">{formatMinutes(e.minutes)}</p>
                ) : null}
                {pendingIds.has(e.id) ? (
                  <span className="mt-1 flex items-center gap-1.5 text-[11px] text-[var(--ink-faint)]">
                    <PendingDot />
                    ещё не отправлено
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                className="shrink-0 text-xs text-[#a05a4e] active:text-[#c96a5a]"
                onClick={() => {
                  if (confirm("Удалить запись?")) void writes.deleteLeisure(e.id);
                }}
              >
                Удалить
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}


