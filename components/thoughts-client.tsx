"use client";

import { useEffect, useState } from "react";
import { useCacheQuery } from "@/hooks/use-cache-query";
import { usePendingRows } from "@/hooks/use-pending-rows";
import { readAllThoughts } from "@/lib/local/queries";
import { writes } from "@/lib/local/mutations";
import type { LocalThought } from "@/lib/local/types";
import { formatDateHeader, todayLocalDate } from "@/lib/format";
import OrbitalLoader from "@/components/orbital-loader";
import PendingDot from "@/components/pending-dot";

/**
 * Лента мыслей: быстрый ввод сверху, группировка по датам, редактирование
 * и удаление на месте. Дата и время записи — локальные для пользователя.
 *
 * Все мутации идут через локальный путь (кеш + outbox, этап 2): запись
 * появляется мгновенно, на сервер вручную, офлайн — ждёт в
 * очереди. Несинхронизированные записи помечены бронзовой точкой.
 */
export default function ThoughtsClient() {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [today, setToday] = useState<string | null>(null);

  const thoughts = useCacheQuery(readAllThoughts, []);
  const pendingIds = usePendingRows("thought");

  useEffect(() => {
    setToday(todayLocalDate());
  }, []);

  async function handleCreate() {
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

  async function handleSaveEdit(id: string) {
    const content = editDraft.trim();
    if (!content) return;
    const res = await writes.updateThought(id, content);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setEditingId(null);
  }

  async function handleDelete(id: string) {
    if (!confirm("Удалить запись?")) return;
    const res = await writes.deleteThought(id);
    if (!res.ok) setError(res.error);
  }

  // Группировка по entry_date, дни — новые сверху.
  const groups = new Map<string, LocalThought[]>();
  for (const t of thoughts ?? []) {
    const list = groups.get(t.entryDate) ?? [];
    list.push(t);
    groups.set(t.entryDate, list);
  }

  return (
    <div className="space-y-5">
      {/* Быстрый ввод */}
      <div className="bronze-card bronze-edge p-3">
        <textarea
          className="field w-full resize-none px-3 py-2.5 text-[15px]"
          rows={2}
          placeholder="Что в голове? Запиши, пока не улетучилось…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              void handleCreate();
            }
          }}
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="text-xs text-[var(--ink-faint)]">Ctrl+Enter — записать</span>
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={saving || !draft.trim()}
            className="btn-bronze h-10 px-5 text-sm"
          >
            {saving ? "Записываю…" : "Записать"}
          </button>
        </div>
      </div>

      {error ? <p className="text-sm text-[#c96a5a]">{error}</p> : null}

      {thoughts === null ? (
        <OrbitalLoader label="Читаю хронику…" className="py-10" />
      ) : thoughts.length === 0 ? (
        <p className="py-8 text-center text-sm text-[var(--ink-faint)]">
          Пока тихо. Первая запись откроет хронику.
        </p>
      ) : (
        <div className="space-y-6">
          {[...groups.entries()].map(([date, items]) => (
            <section key={date} aria-label={date}>
              <h2 className="font-chronicle mb-2 text-[15px] font-semibold text-[var(--gold)]">
                {formatDateHeader(date, today ?? "")}
              </h2>
              <div className="bronze-card divide-y divide-[var(--card-edge)]">
                {items.map((t) => (
                  <article key={t.id} className="px-4 py-3">
                    {editingId === t.id ? (
                      <div className="space-y-2">
                        <textarea
                          className="field w-full resize-none px-3 py-2 text-[15px]"
                          rows={3}
                          value={editDraft}
                          onChange={(e) => setEditDraft(e.target.value)}
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => void handleSaveEdit(t.id)}
                            className="btn-bronze h-9 px-4 text-sm"
                          >
                            Сохранить
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="btn-ghost h-9 px-4 text-sm"
                          >
                            Отмена
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="text-[15px] leading-relaxed whitespace-pre-wrap">
                          {t.content}
                        </p>
                        <div className="mt-1.5 flex items-center justify-between">
                          <span className="flex items-center gap-1.5">
                            <time className="text-xs text-[var(--ink-faint)]">
                              {new Date(t.createdAt).toLocaleTimeString("ru-RU", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </time>
                            {pendingIds.has(t.id) ? <PendingDot /> : null}
                          </span>
                          <div className="flex gap-3 text-xs">
                            <button
                              type="button"
                              className="text-[var(--ink-secondary)] active:text-[var(--gold)]"
                              onClick={() => {
                                setEditingId(t.id);
                                setEditDraft(t.content);
                              }}
                            >
                              Изменить
                            </button>
                            <button
                              type="button"
                              className="text-[#a05a4e] active:text-[#c96a5a]"
                              onClick={() => void handleDelete(t.id)}
                            >
                              Удалить
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
