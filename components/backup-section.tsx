"use client";

import { useEffect, useRef, useState } from "react";
import {
  applyBackup,
  backupFileName,
  backupSummary,
  downloadBackup,
  parseBackupJson,
  type ParsedBackup,
} from "@/lib/local/backup";
import { formatDateRu } from "@/lib/format";

/**
 * Раздел «Резервная копия» в Профиле. Все данные хранятся только на этом
 * устройстве, поэтому экспорт/импорт JSON-файла — единственный способ
 * переноса и восстановления.
 *
 * Импорт требует явного подтверждения: текущие данные будут заменены данными
 * файла. Перед заменой в хранилище автоматически сохраняется страховочная
 * копия текущих данных; сама замена атомарна (одна транзакция IndexedDB).
 * Повреждённый или чужой JSON не проходит валидацию — состояние не меняется.
 */

type Phase =
  | { kind: "idle" }
  | { kind: "busy"; label: string }
  | { kind: "message"; text: string; tone: "ok" | "error" }
  | { kind: "confirm"; backup: ParsedBackup };

export default function BackupSection() {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const fileRef = useRef<HTMLInputElement>(null);
  // Дата подсказки имени файла — только на клиенте (иначе расхождение
  // гидратации: серверная сборка рендерит дату своей сборки).
  const [fileHint, setFileHint] = useState<string | null>(null);

  useEffect(() => {
    setFileHint(backupFileName());
  }, []);

  async function handleExport() {
    if (phase.kind === "busy") return;
    setPhase({ kind: "busy", label: "Готовлю файл…" });
    try {
      await downloadBackup();
      setPhase({ kind: "message", text: `Файл ${backupFileName()} сохранён загрузками браузера.`, tone: "ok" });
    } catch {
      setPhase({ kind: "message", text: "Не удалось создать файл резервной копии.", tone: "error" });
    }
  }

  function handlePickFile() {
    if (phase.kind === "busy") return;
    fileRef.current?.click();
  }

  async function handleFileChosen(file: File) {
    setPhase({ kind: "busy", label: "Проверяю файл…" });
    let raw: string;
    try {
      raw = await file.text();
    } catch {
      setPhase({ kind: "message", text: "Не удалось прочитать файл.", tone: "error" });
      return;
    }
    const parsed = parseBackupJson(raw);
    if (!parsed.ok) {
      setPhase({ kind: "message", text: parsed.error, tone: "error" });
      return;
    }
    setPhase({ kind: "confirm", backup: parsed.backup });
  }

  async function handleRestore(backup: ParsedBackup) {
    setPhase({ kind: "busy", label: "Восстанавливаю данные…" });
    try {
      await applyBackup(backup);
      setPhase({ kind: "message", text: "Данные восстановлены из резервной копии.", tone: "ok" });
    } catch {
      setPhase({
        kind: "message",
        text: "Не удалось восстановить данные. Текущие данные не пострадали — попробуйте ещё раз.",
        tone: "error",
      });
    }
  }

  return (
    <section className="bronze-card bronze-edge p-4">
      <h2 className="font-chronicle mb-3 text-base font-semibold text-[var(--gold)]">
        Резервная копия
      </h2>
      <p className="mb-3 text-xs leading-relaxed text-[var(--ink-faint)]">
        Все данные хранятся только на этом устройстве. Экспорт создаёт JSON-файл
        со всеми записями, опытом и достижениями; импорт полностью заменяет
        текущие данные данными из файла.
      </p>

      {phase.kind === "confirm" ? (
        <div className="space-y-3">
          <div className="rounded-xl border border-[var(--card-edge)] bg-[var(--pill-active)] p-3">
            <p className="text-sm font-semibold text-[var(--gold)]">Импорт резервной копии</p>
            <p className="mt-1 text-xs leading-relaxed text-[var(--ink-secondary)]">
              Текущие локальные данные будут заменены данными из резервной копии
              от {formatDateRu(phase.backup.exportedAt.slice(0, 10))}. Это действие
              нельзя отменить.
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-[var(--ink-faint)]">
              {backupSummary(phase.backup).join(" · ") || "Файл не содержит записей"}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-bronze h-11 flex-1 text-sm"
              onClick={() => void handleRestore(phase.backup)}
            >
              Восстановить данные
            </button>
            <button
              type="button"
              className="btn-ghost h-11 flex-1 text-sm"
              onClick={() => setPhase({ kind: "idle" })}
            >
              Отмена
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2.5">
          <button
            type="button"
            className="btn-bronze h-11 w-full text-sm"
            disabled={phase.kind === "busy"}
            onClick={() => void handleExport()}
          >
            {phase.kind === "busy" ? phase.label : "Экспортировать данные"}
          </button>
          <button
            type="button"
            className="btn-ghost h-11 w-full text-sm"
            disabled={phase.kind === "busy"}
            onClick={handlePickFile}
          >
            Импортировать данные
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void handleFileChosen(file);
            }}
          />
          {phase.kind === "message" ? (
            <p
              role="status"
              aria-live="polite"
              className={
                "text-xs " + (phase.tone === "ok" ? "text-[var(--ink-secondary)]" : "text-[#c96a5a]")
              }
            >
              {phase.text}
            </p>
          ) : null}
          <p className="text-[11px] leading-relaxed text-[var(--ink-faint)]">
            Имя файла: {fileHint ?? "silentium-backup-ГГГГ-ММ-ДД.json"}
          </p>
        </div>
      )}
    </section>
  );
}
