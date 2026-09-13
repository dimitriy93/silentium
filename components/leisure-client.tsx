"use client";

import { useCallback, useEffect, useState } from "react";
import { createLeisureEntry, deleteLeisureEntry, listLeisureForDay } from "@/actions/leisure";
import type { LeisureEntry } from "@/lib/db/schema";
import { formatMinutes, todayLocalDate } from "@/lib/format";

/**
 * Раздел «Развлечения» — честный учёт отдыха и отвлечений. Не система
 * наказаний: задача — видеть реальную картину дня.
 */
export default function LeisureClient() {
  const [entries, setEntries] = useState<LeisureEntry[] | null>(null);
  const [title, setTitle] = useState("");
  const [minutes, setMinutes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    const res = await listLeisureForDay(todayLocalDate());
    if (res.ok) setEntries(res.data);
    else setError(res.error);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function submit() {
    if (!title.trim() || saving) return;
    setSaving(true);
    setError(null);
    const res = await createLeisureEntry(
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
    await reload();
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
        <p className="py-8 text-center text-sm text-[var(--ink-faint)]">Читаю хронику…</p>
      ) : entries.length === 0 ? (
        <p className="py-8 text-center text-sm text-[var(--ink-faint)]">
          День чист. Отдых и отвлечения не записаны.
        </p>
      ) : (
        <ul className="bronze-card divide-y divide-[var(--card-edge)]">
          {entries.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="text-[15px] font-medium">{e.title}</p>
                {e.minutes ? (
                  <p className="text-xs text-[var(--ink-faint)]">{formatMinutes(e.minutes)}</p>
                ) : null}
              </div>
              <button
                type="button"
                className="shrink-0 text-xs text-[#a05a4e] active:text-[#c96a5a]"
                onClick={() => {
                  if (confirm("Удалить запись?")) void deleteLeisureEntry(e.id).then(reload);
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


