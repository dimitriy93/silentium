"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { pullSnapshot } from "@/actions/snapshot";
import { lastSnapshotAt } from "@/lib/local/queries";
import {
  listFailedOps,
  outboxStats,
  retryOutboxOp,
  discardOutboxOp,
  revertSendingToPending,
  subscribeOutbox,
} from "@/lib/local/outbox";
import { writeSnapshot } from "@/lib/local/writes";
import XpToaster from "@/components/xp-toaster";
import type { OutboxEntity } from "@/lib/local/outbox-types";

/**
 * Local First: локальная база — единственный источник истины, приложение
 * работает без сети. Никаких автоматических синхронизаций: ни push очереди,
 * ни pull снапшота, ни фоновых таймеров, ни online/offline listeners.
 * Общение с сервером начинается только по явной команде пользователя —
 * кнопка «Синхронизировать данные» в Профиле (components/sync-section.tsx).
 *
 * Провайдер отвечает за три вещи:
 * 1) version — инкремент после каждой локальной мутации (экраны перечитывают
 *    локальную базу) и после ручной загрузки с сервера;
 * 2) счётчики очереди и dead letter (панель «Повторить»/«Удалить» после
 *    неудачной ручной отправки);
 * 3) разовая гидратация: если локальная база пуста (первый запуск после
 *    входа, локальные данные ещё не заведены), единственный раз выполняется
 *    pull снапшота — иначе приложению не с чем работать. После этого ни
 *    одного запроса к серверу при старте.
 */

interface FailedOpView {
  opId: string;
  entity: OutboxEntity;
  createdAt: string;
  error: string | null;
}

interface SyncState {
  /** Инкрементируется после локальной мутации и после загрузки с сервера. */
  version: number;
  /** Хроники, ожидающие ручной синхронизации (pending + sending). */
  pendingCount: number;
  /** Операции dead letter — для панели «Повторить»/«Удалить». */
  failedOps: FailedOpView[];
  retryFailed: (opId: string) => void;
  discardFailed: (opId: string) => void;
}

const SyncContext = createContext<SyncState>({
  version: 0,
  pendingCount: 0,
  failedOps: [],
  retryFailed: () => {},
  discardFailed: () => {},
});

export function useSync(): SyncState {
  return useContext(SyncContext);
}

const GUEST_ROUTES = ["/login", "/register"];

export default function SyncProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [version, setVersion] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [failedOps, setFailedOps] = useState<FailedOpView[]>([]);
  /** База пуста и разовый pull не удался (нет сети) — тихое предложение повторить. */
  const [hydrationFailed, setHydrationFailed] = useState(false);
  const hydratingRef = useRef(false);

  const guestRef = useRef(false);
  guestRef.current = GUEST_ROUTES.includes(pathname);

  /** Пересчитать счётчики очереди (после мутации, ручных действий). */
  const refreshOutbox = useCallback(async () => {
    const stats = await outboxStats();
    setPendingCount(stats.pending);
    const failed = await listFailedOps();
    setFailedOps(
      failed.map((f) => ({
        opId: f.opId,
        entity: f.entity,
        createdAt: f.createdAt,
        error: f.error,
      })),
    );
  }, []);

  /** Разовая гидратация пустой базы (первый запуск / после выхода). */
  const hydrateOnce = useCallback(async () => {
    if (hydratingRef.current) return;
    hydratingRef.current = true;
    setHydrationFailed(false);
    try {
      const res = await pullSnapshot();
      if (res.ok) {
        await writeSnapshot(res.data);
        await refreshOutbox();
        setVersion((v) => v + 1);
      } else if (res.error !== "Требуется авторизация") {
        setHydrationFailed(true);
      }
    } catch {
      setHydrationFailed(true);
    } finally {
      hydratingRef.current = false;
    }
  }, [refreshOutbox]);

  useEffect(() => {
    void (async () => {
      // Операции, застрявшие в sending (вкладка закрылась во время отправки),
      // возвращаются в очередь; повторная отправка тех же операций безопасна
      // (идемпотентность, раздел 9 дизайн-документа).
      await revertSendingToPending();
      await refreshOutbox();

      // Разовая гидратация пустой базы: локальных данных ещё нет ни когда —
      // один pull, дальше приложение живёт только от локальной базы.
      if (guestRef.current) return;
      const pulledAt = await lastSnapshotAt();
      if (!pulledAt) void hydrateOnce();
    })();
  }, [refreshOutbox, hydrateOnce]);

  // Локальная мутация: экраны перечитывают локальную базу. На сервер ничего
  // не отправляется — отправка только вручную из Профиля.
  useEffect(
    () =>
      subscribeOutbox(() => {
        void refreshOutbox();
        setVersion((v) => v + 1);
      }),
    [refreshOutbox],
  );

  const retryFailed = useCallback(
    (opId: string) => {
      void (async () => {
        await retryOutboxOp(opId);
        await refreshOutbox();
      })();
    },
    [refreshOutbox],
  );

  const discardFailed = useCallback(
    (opId: string) => {
      void (async () => {
        await discardOutboxOp(opId);
        await refreshOutbox();
        setVersion((v) => v + 1);
      })();
    },
    [refreshOutbox],
  );

  const value = useMemo(
    () => ({
      version,
      pendingCount,
      failedOps,
      retryFailed,
      discardFailed,
    }),
    [version, pendingCount, failedOps, retryFailed, discardFailed],
  );

  return (
    <SyncContext.Provider value={value}>
      {children}
      {hydrationFailed && failedOps.length === 0 ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-24 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full border border-[var(--card-edge)] bg-[var(--card)]/85 px-4 py-1.5 text-[11px] text-[var(--ink-faint)] shadow-lg backdrop-blur"
        >
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#c96a5a]" />
          Нет связи с сервером — данные не загружены
          <button
            type="button"
            className="text-[var(--gold)] active:opacity-70"
            onClick={() => void hydrateOnce()}
          >
            Повторить
          </button>
        </div>
      ) : null}
      <FailedOpsPanel failedOps={failedOps} onRetry={retryFailed} onDiscard={discardFailed} />
      <XpToaster />
    </SyncContext.Provider>
  );
}

const ENTITY_LABELS: Record<OutboxEntity, string> = {
  thought: "Мысль",
  training: "Тренировка",
  nutrition: "Питание",
  learning: "Изучение",
  creation: "Созидание",
  leisure: "Развлечение",
  asceticism: "Аскеза",
  asceticismLog: "Отметка аскезы",
  xpEvent: "Опыт",
};

interface PanelProps {
  failedOps: FailedOpView[];
  onRetry: (opId: string) => void;
  onDiscard: (opId: string) => void;
}

/**
 * Панель отклонённых операций. Появляется только когда сервер при ручной
 * синхронизации отклонил запись: пользователь должен решить её судьбу.
 * Пока всё хорошо — ничего не рисуется.
 */
function FailedOpsPanel({ failedOps, onRetry, onDiscard }: PanelProps) {
  if (failedOps.length === 0) return null;
  return (
    <div className="fixed bottom-24 left-1/2 z-40 w-[calc(100%-2.5rem)] max-w-md -translate-x-1/2 space-y-2">
      {failedOps.map((op) => (
        <div key={op.opId} className="bronze-card bronze-edge px-3 py-2.5 shadow-lg">
          <p className="text-xs leading-snug text-[var(--ink-secondary)]">
            {ENTITY_LABELS[op.entity]} от{" "}
            {new Date(op.createdAt).toLocaleString("ru-RU", {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}{" "}
            — не удалось синхронизировать
          </p>
          {op.error ? (
            <p className="mt-1 text-[11px] leading-snug text-[var(--ink-faint)]">{op.error}</p>
          ) : null}
          <div className="mt-1.5 flex gap-4 text-xs">
            <button
              type="button"
              className="text-[var(--gold)] active:opacity-70"
              onClick={() => onRetry(op.opId)}
            >
              Повторить
            </button>
            <button
              type="button"
              className="text-[#a05a4e] active:text-[#c96a5a]"
              onClick={() => onDiscard(op.opId)}
            >
              Удалить
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
