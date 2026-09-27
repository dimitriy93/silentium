"use client";

import { useEffect, useState } from "react";
import { localDb } from "@/lib/local/db";

/**
 * Раздел «Информация о хранилище» в Профиле: сколько места занимают данные
 * на устройстве (navigator.storage.estimate) и сколько записей лежит в
 * локальной базе (Dexie / IndexedDB). Чисто локальное чтение — сервер не
 * вызывается. Если браузер не отдаёт оценку размера, блок размера скрывается
 * с пояснением, а статистика записей остаётся.
 */

type StorageInfo =
  | { kind: "loading" }
  | { kind: "estimate"; used: string; available: string; percent: string }
  | { kind: "unavailable" };

interface StatRow {
  label: string;
  value: string;
}

const STORAGE_UNAVAILABLE =
  "Информация о размере хранилища недоступна на этом устройстве.";

export default function StorageSection() {
  const [storage, setStorage] = useState<StorageInfo>({ kind: "loading" });
  const [stats, setStats] = useState<StatRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const [info, rows] = await Promise.all([readStorageInfo(), readStats()]);
      if (cancelled) return;
      setStorage(info);
      setStats(rows);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <section className="bronze-card bronze-edge p-4">
        <h2 className="font-chronicle mb-3 text-base font-semibold text-[var(--gold)]">
          Хранилище
        </h2>
        {storage.kind === "unavailable" ? (
          <p className="text-xs leading-relaxed text-[var(--ink-faint)]">
            {STORAGE_UNAVAILABLE}
          </p>
        ) : (
          <ul className="space-y-1.5 text-[15px]">
            <li className="flex justify-between">
              <span className="text-[var(--ink-secondary)]">Используется</span>
              <span>{storage.kind === "loading" ? "…" : storage.used}</span>
            </li>
            <li className="flex justify-between">
              <span className="text-[var(--ink-secondary)]">Доступно</span>
              <span>{storage.kind === "loading" ? "…" : storage.available}</span>
            </li>
            <li className="flex justify-between">
              <span className="text-[var(--ink-secondary)]">Заполнено</span>
              <span>{storage.kind === "loading" ? "…" : storage.percent}</span>
            </li>
          </ul>
        )}
      </section>

      <section className="bronze-card bronze-edge p-4">
        <h2 className="font-chronicle mb-3 text-base font-semibold text-[var(--gold)]">
          Статистика
        </h2>
        <ul className="space-y-1.5 text-[15px]">
          {(stats ?? LOADING_STATS).map((row) => (
            <li key={row.label} className="flex justify-between">
              <span className="text-[var(--ink-secondary)]">{row.label}</span>
              <span>{row.value}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

const LOADING_STATS: StatRow[] = [
  { label: "Мысли", value: "…" },
  { label: "Путь", value: "…" },
  { label: "Развлечения", value: "…" },
  { label: "Аскезы", value: "…" },
  { label: "Отметки", value: "…" },
  { label: "Дней истории", value: "…" },
];

/** Оценка места: estimate() поддерживается не во всех браузерах. */
async function readStorageInfo(): Promise<StorageInfo> {
  try {
    if (typeof navigator === "undefined" || !navigator.storage?.estimate) {
      return { kind: "unavailable" };
    }
    const estimate = await navigator.storage.estimate();
    const usage = estimate.usage;
    const quota = estimate.quota;
    if (typeof usage !== "number" || typeof quota !== "number") {
      return { kind: "unavailable" };
    }
    const percent = quota > 0 ? (usage / quota) * 100 : 0;
    return {
      kind: "estimate",
      used: formatBytes(usage),
      available: formatBytes(quota - usage),
      percent: formatPercent(percent),
    };
  } catch {
    return { kind: "unavailable" };
  }
}

/** Подсчёт записей локальной базы. Ошибки чтения — прочерк в значении. */
async function readStats(): Promise<StatRow[]> {
  const db = localDb();
  if (!db) return EMPTY_STATS;
  try {
    const [thoughts, training, nutrition, learning, creation, leisure, asceticisms, logs] =
      await Promise.all([
        db.thoughts.count(),
        db.training.count(),
        db.nutrition.count(),
        db.learning.count(),
        db.creation.count(),
        db.leisure.count(),
        db.asceticisms.count(),
        db.asceticismLogs.count(),
      ]);

    const pathCount = training + nutrition + learning + creation;
    const dates = new Set<string>();
    const tablesWithDates = [
      db.thoughts,
      db.training,
      db.nutrition,
      db.learning,
      db.creation,
      db.leisure,
      db.asceticismLogs,
    ] as const;
    const keyLists = await Promise.all(
      tablesWithDates.map((table) => table.orderBy("entryDate").keys()),
    );
    for (const keys of keyLists) {
      for (const key of keys) dates.add(String(key));
    }

    return [
      { label: "Мысли", value: String(thoughts) },
      { label: "Путь", value: `${pathCount} ${pluralRu(pathCount, "запись", "записи", "записей")}` },
      { label: "Развлечения", value: String(leisure) },
      { label: "Аскезы", value: String(asceticisms) },
      { label: "Отметки", value: String(logs) },
      { label: "Дней истории", value: String(dates.size) },
    ];
  } catch {
    return EMPTY_STATS;
  }
}

const EMPTY_STATS: StatRow[] = [
  { label: "Мысли", value: "—" },
  { label: "Путь", value: "—" },
  { label: "Развлечения", value: "—" },
  { label: "Аскезы", value: "—" },
  { label: "Отметки", value: "—" },
  { label: "Дней истории", value: "—" },
];

/** Байт → «Б / КБ / МБ / ГБ» с одним знаком после запятой, без хвостовых нулей. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${formatNumber(kb)} КБ`;
  const mb = kb / 1024;
  if (mb < 1024) return `${formatNumber(mb)} МБ`;
  const gb = mb / 1024;
  return `${formatNumber(gb)} ГБ`;
}

function formatNumber(value: number): string {
  if (value >= 100) return String(Math.round(value));
  const fixed = value.toFixed(1);
  return fixed.endsWith(".0") ? fixed.slice(0, -2) : fixed;
}

function formatPercent(percent: number): string {
  if (percent > 0 && percent < 0.01) return "<0.01%";
  if (percent >= 10) return `${Math.round(percent)}%`;
  if (percent >= 1) {
    const fixed = percent.toFixed(1);
    return `${fixed.endsWith(".0") ? fixed.slice(0, -2) : fixed}%`;
  }
  return `${percent.toFixed(2)}%`;
}

/** Русское склонение: pluralRu(3, "запись", "записи", "записей") → «записи». */
function pluralRu(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}
