"use client";

import { useCallback, useEffect, useState } from "react";
import OrbitalLoader from "@/components/orbital-loader";
import { useCacheQuery } from "@/hooks/use-cache-query";
import { readPathDay } from "@/lib/local/queries";
import { writes } from "@/lib/local/mutations";
import { useLocalImage } from "@/lib/local/images";
import type { LocalPathDay } from "@/lib/local/types";
import { todayLocalDate } from "@/lib/format";
import { withBasePath } from "@/lib/base-path";

/**
 * Раздел «Путь»: четыре стихии на вкладках.
 * ОГОНЬ — журнал активности; ВОДА — КБЖУ + заметка (одна запись на день);
 * ВОЗДУХ — «я изучил»; ЗЕМЛЯ — «я создал».
 *
 * Данные дня мгновенно читаются из локальной базы; мутации пишутся туда же
 * в момент действия — без сети и без очередей.
 *
 * Иллюстрации Пути живут в локальном хранилище изображений (IndexedDB):
 * один раз забираются по сети и дальше отображаются без интернета.
 */

const TABS = [
  { key: "ogon", symbol: "🔥", title: "Стихия Огня", subtitle: "Физическое развитие" },
  { key: "voda", symbol: "🌊", title: "Стихия Воды", subtitle: "Питание" },
  { key: "vozduh", symbol: "🌬", title: "Стихия Воздуха", subtitle: "Умственное развитие" },
  { key: "zemlya", symbol: "🪨", title: "Стихия Земли", subtitle: "Созидание" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

// Иллюстрация состояния пути: нейтральная + по одной на стихию.
// Все слои рендерятся одновременно — изображения предзагружены, кроссфейд чистый.
const PATH_IMAGES = [
  { key: "neutral", src: withBasePath("/path/path-neutral.webp"), alt: "Нейтральное состояние пути" },
  { key: "ogon", src: withBasePath("/path/path-fire.webp"), alt: "Путь Огня" },
  { key: "voda", src: withBasePath("/path/path-water.webp"), alt: "Путь Воды" },
  { key: "vozduh", src: withBasePath("/path/path-air.webp"), alt: "Путь Воздуха" },
  { key: "zemlya", src: withBasePath("/path/path-earth.webp"), alt: "Путь Земли" },
] as const;

export default function PathClient() {
  const [tab, setTab] = useState<TabKey | null>(null);
  const [hydratedDate, setHydratedDate] = useState<string | null>(null);

  const day = useCacheQuery<LocalPathDay>(
    useCallback(async () => readPathDay(hydratedDate ?? ""), [hydratedDate]),
    [hydratedDate],
  );

  useEffect(() => {
    setHydratedDate(todayLocalDate());
  }, []);

  return (
    <div className="space-y-5">
      {/* Иллюстрация текущего состояния пути: кроссфейд в контейнере стабильной пропорции */}
      <div
        className="relative mx-auto aspect-[650/350] w-full"
        aria-live="polite"
      >
        {PATH_IMAGES.map(({ key, src, alt }) => (
          <PathImage
            key={key}
            src={src}
            alt={alt}
            visible={tab === key || (tab === null && key === "neutral")}
          />
        ))}
      </div>

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

      {day === null ? (
        <OrbitalLoader label="Читаю хронику…" className="py-10" />
      ) : (
        <>
          {tab === "ogon" && <FireTab day={day} />}
          {tab === "voda" && <WaterTab day={day} />}
          {tab === "vozduh" && <AirTab day={day} />}
          {tab === "zemlya" && <EarthTab day={day} />}
        </>
      )}
    </div>
  );
}

type TabProps = { day: LocalPathDay };

/** Слой иллюстрации: локальная копия из IndexedDB (после первого сетевого захода). */
function PathImage({ src, alt, visible }: { src: string; alt: string; visible: boolean }) {
  const url = useLocalImage(src);
  return (
    // next/image не подходит: оптимизатор требует сервер. Локальная копия
    // показывается <img>'ом с object URL — без сети и без сервера.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url ?? undefined}
      alt={visible ? alt : ""}
      aria-hidden={!visible}
      className={
        "absolute inset-0 h-full w-full object-contain transition-opacity duration-500 ease-out " +
        (visible && url ? "opacity-100" : "pointer-events-none opacity-0")
      }
    />
  );
}

/** Строка записи дня. */
function EntryRow({
  children,
  onDelete,
}: {
  children: React.ReactNode;
  onDelete: () => void;
}) {
  return (
    <li className="flex items-start justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        {children}
      </div>
      <button
        type="button"
        className="shrink-0 text-xs text-[#a05a4e] active:text-[#c96a5a]"
        onClick={onDelete}
      >
        Удалить
      </button>
    </li>
  );
}

// ---------- ОГОНЬ ----------

function FireTab({ day }: TabProps) {
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [minutes, setMinutes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!title.trim() || saving) return;
    setSaving(true);
    setError(null);
    const res = await writes.addTraining(
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
            <EntryRow
              key={t.id}
              onDelete={() => {
                if (confirm("Удалить запись?")) void writes.deleteTraining(t.id);
              }}
            >
              <p className="text-[15px] font-medium">{t.title}</p>
              {t.detail ? <p className="text-sm text-[var(--gold)]">{t.detail}</p> : null}
              {t.durationMinutes ? (
                <p className="text-xs text-[var(--ink-faint)]">{t.durationMinutes} мин</p>
              ) : null}
            </EntryRow>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------- ВОДА ----------

function WaterTab({ day }: TabProps) {
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
    const res = await writes.saveNutrition(todayLocalDate(), {
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

function AirTab({ day }: TabProps) {
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!content.trim() || saving) return;
    setSaving(true);
    setError(null);
    const res = await writes.addLearning(todayLocalDate(), content.trim());
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setContent("");
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
            <EntryRow
              key={t.id}
              onDelete={() => {
                if (confirm("Удалить запись?")) void writes.deleteLearning(t.id);
              }}
            >
              <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{t.content}</p>
            </EntryRow>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------- ЗЕМЛЯ ----------

function EarthTab({ day }: TabProps) {
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!content.trim() || saving) return;
    setSaving(true);
    setError(null);
    const res = await writes.addCreation(todayLocalDate(), content.trim());
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setContent("");
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
            <EntryRow
              key={t.id}
              onDelete={() => {
                if (confirm("Удалить запись?")) void writes.deleteCreation(t.id);
              }}
            >
              <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{t.content}</p>
            </EntryRow>
          ))}
        </ul>
      )}
    </div>
  );
}
