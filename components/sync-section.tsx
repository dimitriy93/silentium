"use client";

import { useCallback, useRef, useState } from "react";
import { getServerLastChange } from "@/actions/snapshot";
import {
  getLastLocalChange,
  pullIntoLocal,
  pushLocal,
} from "@/lib/local/manual-sync";

/**
 * Раздел «Синхронизация» в Профиле — единственное место, где приложение
 * общается с сервером (Local First). Пока пользователь не нажал кнопку,
 * ни одного запроса к серверу не выполняется.
 *
 * Сценарий: сравнение дат последних изменений (локальная база ↔ сервер) и
 * предложение направления — «на сервере новее» → загрузка, «на устройстве
 * новее» → отправка, даты равны → короткое подтверждение. Все сообщения —
 * нейтральные, без игровых терминов.
 */

type Phase =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "message"; text: string; tone: "ok" | "error" }
  | {
      kind: "dialog";
      direction: "download" | "upload";
      title: string;
      text: string;
    };

const DIALOG_SERVER_NEWER = {
  title: "На сервере найдены более новые данные",
  text: "Вы можете загрузить данные с сервера на это устройство.",
};

const DIALOG_LOCAL_NEWER = {
  title: "На устройстве найдены более новые данные",
  text: "Вы можете отправить данные на сервер.",
};

export default function SyncSection() {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const busyRef = useRef(false);

  const setBusy = useCallback(() => {
    setPhase({ kind: "busy" });
  }, []);

  const compare = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy();
    try {
      const [local, serverRes] = await Promise.all([
        getLastLocalChange(),
        getServerLastChange(),
      ]);
      if (!serverRes.ok) {
        setPhase({ kind: "message", text: "Нет связи с сервером", tone: "error" });
        return;
      }
      const server = serverRes.data.lastChange;
      const newer = (a: string | null, b: string | null) => a !== null && (b === null || a.localeCompare(b) > 0);

      if (local === null && server === null) {
        setPhase({ kind: "message", text: "Данные уже синхронизированы", tone: "ok" });
      } else if (newer(server, local)) {
        setPhase({ kind: "dialog", direction: "download", ...DIALOG_SERVER_NEWER });
      } else if (newer(local, server)) {
        setPhase({ kind: "dialog", direction: "upload", ...DIALOG_LOCAL_NEWER });
      } else {
        setPhase({ kind: "message", text: "Данные уже синхронизированы", tone: "ok" });
      }
    } catch {
      setPhase({ kind: "message", text: "Нет связи с сервером", tone: "error" });
    } finally {
      busyRef.current = false;
    }
  }, [setBusy]);

  const download = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy();
    try {
      const ok = await pullIntoLocal();
      setPhase(
        ok
          ? { kind: "message", text: "Синхронизация завершена", tone: "ok" }
          : { kind: "message", text: "Ошибка синхронизации", tone: "error" },
      );
    } finally {
      busyRef.current = false;
    }
  }, [setBusy]);

  const upload = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy();
    try {
      const res = await pushLocal();
      setPhase(
        res === "applied" || res === "empty"
          ? { kind: "message", text: "Синхронизация завершена", tone: "ok" }
          : { kind: "message", text: "Ошибка синхронизации", tone: "error" },
      );
    } catch {
      setPhase({ kind: "message", text: "Ошибка синхронизации", tone: "error" });
    } finally {
      busyRef.current = false;
    }
  }, [setBusy]);

  const cancel = useCallback(() => setPhase({ kind: "idle" }), []);

  return (
    <section className="bronze-card bronze-edge p-4">
      <h2 className="font-chronicle mb-3 text-base font-semibold text-[var(--gold)]">
        Синхронизация
      </h2>
      <p className="mb-3 text-xs leading-relaxed text-[var(--ink-faint)]">
        Записи хранятся на этом устройстве. Синхронизация с сервером выполняется
        только по вашей команде.
      </p>

      {phase.kind === "dialog" ? (
        <div className="space-y-3">
          <div className="rounded-xl border border-[var(--card-edge)] bg-[var(--pill-active)] p-3">
            <p className="text-sm font-semibold text-[var(--gold)]">{phase.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-[var(--ink-secondary)]">
              {phase.text}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-bronze h-11 flex-1 text-sm"
              onClick={() => void (phase.direction === "download" ? download() : upload())}
            >
              {phase.direction === "download" ? "Загрузить с сервера" : "Отправить на сервер"}
            </button>
            <button type="button" className="btn-ghost h-11 flex-1 text-sm" onClick={cancel}>
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
            onClick={() => void compare()}
          >
            {phase.kind === "busy" ? "Выполняется синхронизация…" : "Синхронизировать данные"}
          </button>
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
        </div>
      )}
    </section>
  );
}
