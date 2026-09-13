"use client";

import { useCallback, useEffect, useState } from "react";
import OrbitalLoader from "@/components/orbital-loader";
import {
  createCreationEntry,
  createLearningEntry,
  createTrainingActivity,
  deleteCreationEntry,
  deleteLearningEntry,
  deleteTrainingActivity,
  getPathDay,
  saveNutrition,
  type PathDay,
} from "@/actions/path";
import { todayLocalDate } from "@/lib/format";

/**
 * Раздел «Путь»: четыре стихии на вкладках.
 * ОГОНЬ — журнал активности; ВОДА — КБЖУ + заметка (одна запись на день);
 * ВОЗДУХ — «я изучил»; ЗЕМЛЯ — «я создал».
 */

const TABS = [
  { key: "ogon", symbol: "🔥", title: "Стихия Огня", subtitle: "Физическое развитие" },
  { key: "voda", symbol: "🌊", title: "Стихия Воды", subtitle: "Питание" },
  { key: "vozduh", symbol: "🌬", title: "Стихия Воздуха", subtitle: "Умственное развитие" },
  { key: "zemlya", symbol: "🪨", title: "Стихия Земли", subtitle: "Созидание" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function PathClient() {
  const [tab, setTab] = useState<TabKey>("ogon");
  const [day, setDay] = useState<PathDay | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const res = await getPathDay(todayLocalDate());
    if (res.ok) {
      setDay(res.data);
    } else {
      setError(res.error);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <div className="space-y-5">
      {/* Вкладки стихий: полные названия в две строки */}
      <nav className="bronze-card grid grid-cols-2 gap-1 p-1.5" aria-label="Стихии Пути">
        {TABS.map(({ key, symbol, title, subtitle }) => (
          <button
            key={key}
            type="button"
            aria-current={tab === key ? "true" : undefined}
            onClick={() => setTab(key)}
            className={
              "flex items-center gap-2 rounded-xl px-2.5 py-2 text-left transition-colors " +
              (tab === key
                ? "bg-[var(--pill-active)]"
                : "active:bg-[var(--pill-active)]")
            }
          >
            <span aria-hidden="true" className="text-lg leading-none">
              {symbol}
            </span>
            <span className="min-w-0">
              <span
                className={
                  "block text-[13px] leading-tight font-semibold " +
                  (tab === key ? "text-[var(--gold)]" : "text-[var(--ink)]")
                }
              >
                {title}
              </span>
              <span className="block text-[11px] leading-tight text-[var(--ink-secondary)]">
                {subtitle}
              </span>
            </span>
          </button>
        ))}
      </nav>

      {error ? <p className="text-sm text-[#c96a5a]">{error}</p> : null}
      {day === null ? (
        <OrbitalLoader label="Читаю хронику…" className="py-10" />
      ) : (
        <>
          {tab === "ogon" && <FireTab day={day} reload={reload} />}
          {tab === "voda" && <WaterTab day={day} reload={reload} />}
          {tab === "vozduh" && <AirTab day={day} reload={reload} />}
          {tab === "zemlya" && <EarthTab day={day} reload={reload} />}
        </>
      )}
    </div>
  );
}

type TabProps = { day: PathDay; reload: () => Promise<void> };

function EntryActions({ onDelete }: { onDelete: () => void }) {
  return (
    <button
      type="button"
      className="shrink-0 text-xs text-[#a05a4e] active:text-[#c96a5a]"
      onClick={onDelete}
    >
      Удалить
    </button>
  );
}

// ---------- ОГОНЬ ----------

function FireTab({ day, reload }: TabProps) {
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [minutes, setMinutes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!title.trim() || saving) return;
    setSaving(true);
    setError(null);
    const res = await createTrainingActivity(
      todayLocalDate(),
      title.trim(),
      detail.trim() || null,
      minutes ? Number(minutes) : null,
    );
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setTitle("");
    setDetail("");
    setMinutes("");
    await reload();
  }

  return (
    <div className="space-y-5">
      <form
        className="bronze-card bronze-edge space-y-2 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <input
          className="field h-11 w-full px-3 text-[15px]"
          placeholder="Что делал: подтягивания, гиря, Вин Чун…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <input
          className="field h-11 w-full px-3 text-[15px]"
          placeholder="Результат: +31.5 кг × 6/6/5/5"
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
        />
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

      {day.training.length === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--ink-faint)]">
          Сегодня огонь не разжигали.
        </p>
      ) : (
        <ul className="bronze-card divide-y divide-[var(--card-edge)]">
          {day.training.map((t) => (
            <li key={t.id} className="flex items-start justify-between gap-3 px-4 py-3">
              <div>
                <p className="text-[15px] font-medium">{t.title}</p>
                {t.detail ? <p className="text-sm text-[var(--gold)]">{t.detail}</p> : null}
                {t.durationMinutes ? (
                  <p className="text-xs text-[var(--ink-faint)]">{t.durationMinutes} мин</p>
                ) : null}
              </div>
              <EntryActions
                onDelete={() => {
                  if (confirm("Удалить запись?")) void deleteTrainingActivity(t.id).then(reload);
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------- ВОДА ----------

function WaterTab({ day, reload }: TabProps) {
  const [calories, setCalories] = useState(
    day.nutrition?.calories != null ? String(day.nutrition.calories) : "",
  );
  const [protein, setProtein] = useState(
    day.nutrition?.proteinGrams != null ? String(day.nutrition.proteinGrams) : "",
  );
  const [fat, setFat] = useState(
    day.nutrition?.fatGrams != null ? String(day.nutrition.fatGrams) : "",
  );
  const [carbs, setCarbs] = useState(
    day.nutrition?.carbsGrams != null ? String(day.nutrition.carbsGrams) : "",
  );
  const [note, setNote] = useState(day.nutrition?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (saving) return;
    setSaving(true);
    setError(null);
    const res = await saveNutrition(todayLocalDate(), {
      calories: calories ? Number(calories) : null,
      proteinGrams: protein ? Number(protein) : null,
      fatGrams: fat ? Number(fat) : null,
      carbsGrams: carbs ? Number(carbs) : null,
      note: note.trim() || null,
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    await reload();
  }

  return (
    <div className="space-y-5">
      <form
        className="bronze-card bronze-edge space-y-2 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1">
            <span className="px-1 text-xs text-[var(--ink-secondary)]">Калории</span>
            <input
              className="field h-11 w-full px-3 text-[15px]"
              type="number"
              inputMode="numeric"
              min="0"
              placeholder="3034"
              value={calories}
              onChange={(e) => setCalories(e.target.value)}
            />
          </label>
          <label className="space-y-1">
            <span className="px-1 text-xs text-[var(--ink-secondary)]">Белок, г</span>
            <input
              className="field h-11 w-full px-3 text-[15px]"
              type="number"
              inputMode="decimal"
              min="0"
              placeholder="160"
              value={protein}
              onChange={(e) => setProtein(e.target.value)}
            />
          </label>
          <label className="space-y-1">
            <span className="px-1 text-xs text-[var(--ink-secondary)]">Жиры, г</span>
            <input
              className="field h-11 w-full px-3 text-[15px]"
              type="number"
              inputMode="decimal"
              min="0"
              placeholder="130"
              value={fat}
              onChange={(e) => setFat(e.target.value)}
            />
          </label>
          <label className="space-y-1">
            <span className="px-1 text-xs text-[var(--ink-secondary)]">Углеводы, г</span>
            <input
              className="field h-11 w-full px-3 text-[15px]"
              type="number"
              inputMode="decimal"
              min="0"
              placeholder="304"
              value={carbs}
              onChange={(e) => setCarbs(e.target.value)}
            />
          </label>
        </div>
        <textarea
          className="field w-full resize-none px-3 py-2.5 text-[15px]"
          rows={2}
          placeholder="Заметка о питании (необязательно)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <button
          type="submit"
          disabled={saving}
          className="btn-bronze h-11 w-full text-sm"
        >
          {saving ? "Сохраняю…" : day.nutrition ? "Обновить" : "Сохранить"}
        </button>
        {error ? <p className="text-sm text-[#c96a5a]">{error}</p> : null}
      </form>
      <p className="px-1 text-xs leading-relaxed text-[var(--ink-faint)]">
        Запись одна на день: повторное сохранение обновляет значения. В будущем данные
        будут приходить из Nutriarium.
      </p>
    </div>
  );
}

// ---------- ВОЗДУХ ----------

function AirTab({ day, reload }: TabProps) {
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!content.trim() || saving) return;
    setSaving(true);
    setError(null);
    const res = await createLearningEntry(todayLocalDate(), content.trim());
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setContent("");
    await reload();
  }

  return (
    <div className="space-y-5">
      <form
        className="bronze-card bronze-edge space-y-2 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <textarea
          className="field w-full resize-none px-3 py-2.5 text-[15px]"
          rows={2}
          placeholder="Я изучил…"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              void submit();
            }
          }}
        />
        <button
          type="submit"
          disabled={saving || !content.trim()}
          className="btn-bronze h-11 w-full text-sm"
        >
          {saving ? "Записываю…" : "Записать"}
        </button>
        {error ? <p className="text-sm text-[#c96a5a]">{error}</p> : null}
      </form>

      {day.learning.length === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--ink-faint)]">
          Сегодня воздух был неподвижен.
        </p>
      ) : (
        <ul className="bronze-card divide-y divide-[var(--card-edge)]">
          {day.learning.map((t) => (
            <li key={t.id} className="flex items-start justify-between gap-3 px-4 py-3">
              <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{t.content}</p>
              <EntryActions
                onDelete={() => {
                  if (confirm("Удалить запись?")) void deleteLearningEntry(t.id).then(reload);
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------- ЗЕМЛЯ ----------

function EarthTab({ day, reload }: TabProps) {
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!content.trim() || saving) return;
    setSaving(true);
    setError(null);
    const res = await createCreationEntry(todayLocalDate(), content.trim());
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setContent("");
    await reload();
  }

  return (
    <div className="space-y-5">
      <form
        className="bronze-card bronze-edge space-y-2 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <textarea
          className="field w-full resize-none px-3 py-2.5 text-[15px]"
          rows={2}
          placeholder="Я создал…"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              void submit();
            }
          }}
        />
        <button
          type="submit"
          disabled={saving || !content.trim()}
          className="btn-bronze h-11 w-full text-sm"
        >
          {saving ? "Записываю…" : "Записать"}
        </button>
        {error ? <p className="text-sm text-[#c96a5a]">{error}</p> : null}
      </form>

      {day.creation.length === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--ink-faint)]">
          Сегодня ничего не создано.
        </p>
      ) : (
        <ul className="bronze-card divide-y divide-[var(--card-edge)]">
          {day.creation.map((t) => (
            <li key={t.id} className="flex items-start justify-between gap-3 px-4 py-3">
              <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{t.content}</p>
              <EntryActions
                onDelete={() => {
                  if (confirm("Удалить запись?")) void deleteCreationEntry(t.id).then(reload);
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
