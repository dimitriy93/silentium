"use client";

import { useEffect, useState } from "react";
import {
  applyBackup,
  backupSummary,
  parseBackupJson,
  type ParsedBackup,
} from "@/lib/local/backup";
import {
  connectDrive,
  deleteCloudBackup,
  disconnectDrive,
  downloadCloudBackupJson,
  formatSyncTime,
  getCloudConnectionState,
  isDriveConfigured,
  syncToDrive,
} from "@/lib/cloud/google-drive";

/**
 * Раздел «Облачная синхронизация» в Профиле. Google Drive — опциональная
 * удалённая копия backup: приложение полностью работает без него и офлайн.
 * Вся OAuth/Drive-логика живёт в lib/cloud/google-drive.ts — здесь только
 * состояние и подтверждения. Restore прогоняет облачный JSON через тот же
 * validated import (parseBackupJson → applyBackup), что и импорт файла.
 */

type Phase =
  | { kind: "idle" }
  | { kind: "busy"; label: string }
  | { kind: "message"; text: string; tone: "ok" | "error" }
  | { kind: "confirmRestore"; backup: ParsedBackup }
  | { kind: "confirmDelete" };

export default function CloudSyncSection() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  // Состояние живёт в localStorage — читаем на клиенте, чтобы не расходиться
  // с серверной сборкой (гидратация).
  useEffect(() => {
    setConfigured(isDriveConfigured());
    const state = getCloudConnectionState();
    setConnected(state.connected);
    setLastSyncAt(state.lastSyncAt);
  }, []);

  async function handleConnect() {
    if (phase.kind === "busy") return;
    setPhase({ kind: "busy", label: "Открываю Google…" });
    try {
      await connectDrive();
      setConnected(true);
      setPhase({ kind: "message", text: "Google Drive подключён.", tone: "ok" });
    } catch (error) {
      setPhase({
        kind: "message",
        text: error instanceof Error ? error.message : "Не удалось подключить Google Drive.",
        tone: "error",
      });
    }
  }

  async function handleSync() {
    if (phase.kind === "busy") return;
    setPhase({ kind: "busy", label: "Синхронизирую…" });
    try {
      await syncToDrive();
      setLastSyncAt(getCloudConnectionState().lastSyncAt);
      setPhase({ kind: "message", text: "Резервная копия сохранена в Google Drive.", tone: "ok" });
    } catch (error) {
      setPhase({
        kind: "message",
        text: error instanceof Error ? error.message : "Синхронизация не удалась. Локальные данные не изменены.",
        tone: "error",
      });
    }
  }

  async function handleRestoreStart() {
    if (phase.kind === "busy") return;
    setPhase({ kind: "busy", label: "Загружаю копию из Drive…" });
    try {
      const raw = await downloadCloudBackupJson();
      const parsed = parseBackupJson(raw);
      if (!parsed.ok) {
        setPhase({ kind: "message", text: parsed.error, tone: "error" });
        return;
      }
      setPhase({ kind: "confirmRestore", backup: parsed.backup });
    } catch (error) {
      setPhase({
        kind: "message",
        text: error instanceof Error ? error.message : "Не удалось скачать копию из Google Drive.",
        tone: "error",
      });
    }
  }

  async function handleRestoreConfirm(backup: ParsedBackup) {
    setPhase({ kind: "busy", label: "Восстанавливаю данные…" });
    try {
      await applyBackup(backup);
      setPhase({ kind: "message", text: "Данные восстановлены из облачной копии.", tone: "ok" });
    } catch {
      setPhase({
        kind: "message",
        text: "Не удалось восстановить данные. Текущие данные не пострадали — попробуйте ещё раз.",
        tone: "error",
      });
    }
  }

  function handleDisconnect() {
    disconnectDrive();
    setConnected(false);
    setLastSyncAt(null);
    setPhase({ kind: "message", text: "Google Drive отключён. Копия в Drive осталась на месте.", tone: "ok" });
  }

  async function handleDeleteConfirm() {
    setPhase({ kind: "busy", label: "Удаляю копию из Drive…" });
    try {
      await deleteCloudBackup();
      setPhase({ kind: "message", text: "Копия удалена из Google Drive. Локальные данные не изменены.", tone: "ok" });
    } catch (error) {
      setPhase({
        kind: "message",
        text: error instanceof Error ? error.message : "Не удалось удалить копию из Google Drive.",
        tone: "error",
      });
    }
  }

  const busy = phase.kind === "busy";

  return (
    <section className="bronze-card bronze-edge p-4">
      <h2 className="font-chronicle mb-3 text-base font-semibold text-[var(--gold)]">
        Облачная синхронизация
      </h2>

      {configured === false ? (
        <p className="text-xs leading-relaxed text-[var(--ink-faint)]">
          Синхронизация ещё не настроена. Cloud backup не включён в этой сборке
          приложения — локальный экспорт и импорт файла работают как раньше.
        </p>
      ) : !connected ? (
        <>
          <p className="mb-3 text-xs leading-relaxed text-[var(--ink-faint)]">
            Синхронизация ещё не настроена. Google Drive хранит резервную копию
            в скрытой папке приложения и используется только по вашему действию —
            приложение продолжает работать без него и офлайн.
          </p>
          <button
            type="button"
            className="btn-bronze h-11 w-full text-sm"
            disabled={busy}
            onClick={() => void handleConnect()}
          >
            {busy ? phase.label : "Подключить Google Drive"}
          </button>
        </>
      ) : (
        <>
          <p className="mb-1 text-xs leading-relaxed text-[var(--ink-secondary)]">
            Google Drive подключён
          </p>
          <p className="mb-3 text-xs leading-relaxed text-[var(--ink-faint)]">
            {lastSyncAt
              ? `Последняя синхронизация: ${formatSyncTime(lastSyncAt)}`
              : "Синхронизация ещё не выполнялась"}
          </p>

          {phase.kind === "confirmRestore" ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-[var(--card-edge)] bg-[var(--pill-active)] p-3">
                <p className="text-sm font-semibold text-[var(--gold)]">
                  Восстановление из Google Drive
                </p>
                <p className="mt-1 text-xs leading-relaxed text-[var(--ink-secondary)]">
                  Текущие локальные данные будут заменены данными из облачной
                  копии от {formatDate(phase.backup.exportedAt)}. Это действие
                  нельзя отменить.
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-[var(--ink-faint)]">
                  {backupSummary(phase.backup).join(" · ") || "Копия не содержит записей"}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-bronze h-11 flex-1 text-sm"
                  onClick={() => void handleRestoreConfirm(phase.backup)}
                >
                  Заменить данные
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
          ) : phase.kind === "confirmDelete" ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-[var(--card-edge)] bg-[var(--pill-active)] p-3">
                <p className="text-sm font-semibold text-[var(--gold)]">
                  Удаление облачной копии
                </p>
                <p className="mt-1 text-xs leading-relaxed text-[var(--ink-secondary)]">
                  Файл резервной копии будет удалён из скрытой папки приложения
                  в Google Drive. Локальные данные останутся без изменений.
                  Это действие нельзя отменить.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-bronze h-11 flex-1 text-sm"
                  disabled={busy}
                  onClick={() => void handleDeleteConfirm()}
                >
                  Удалить копию
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
                disabled={busy}
                onClick={() => void handleSync()}
              >
                {busy ? phase.label : "Синхронизировать сейчас"}
              </button>
              <button
                type="button"
                className="btn-ghost h-11 w-full text-sm"
                disabled={busy}
                onClick={() => void handleRestoreStart()}
              >
                Восстановить из Google Drive
              </button>
              <button
                type="button"
                className="btn-ghost h-11 w-full text-sm"
                disabled={busy}
                onClick={() => setPhase({ kind: "confirmDelete" })}
              >
                Удалить копию в Google Drive
              </button>
              <button
                type="button"
                className="btn-ghost h-11 w-full text-sm"
                disabled={busy}
                onClick={handleDisconnect}
              >
                Отключить Google Drive
              </button>
            </div>
          )}
        </>
      )}

      {phase.kind === "message" ? (
        <p
          role="status"
          aria-live="polite"
          className={
            "mt-3 text-xs " + (phase.tone === "ok" ? "text-[var(--ink-secondary)]" : "text-[#c96a5a]")
          }
        >
          {phase.text}
        </p>
      ) : null}
    </section>
  );
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "long" }).format(date);
}
