"use client";

/**
 * Метка ещё не отправленной записи: маленькая ненавязчивая бронзовая точка
 * рядом со временем записи (UX-состояние «есть несинхронизированные
 * изменения», docs/offline-write-sync-design.md, раздел 11).
 */
export default function PendingDot() {
  return (
    <span
      aria-hidden="true"
      title="Ещё не синхронизировано"
      className="block h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--bronze-bright)] opacity-70"
    />
  );
}
