"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { pullSnapshot } from "@/actions/snapshot";
import { pushOutbox } from "@/actions/sync";
import { SYNC_THROTTLE_MS } from "@/lib/local/constants";
import { lastSnapshotAt } from "@/lib/local/queries";
import {
  applyPushResults,
  batchToWire,
  cachedUserId,
  discardOutboxOp,
  listFailedOps,
  outboxStats,
  retryOutboxOp,
  revertSendingToPending,
  subscribeOutbox,
  takePushBatch,
} from "@/lib/local/outbox";
import { writeSnapshot } from "@/lib/local/writes";
import type { OutboxEntity } from "@/lib/local/outbox-types";

/**
 * Полный цикл синхронизации (этап 2, docs/offline-write-sync-design.md,
 * разделы 5 и 7): сначала push очереди outbox на сервер, затем pull снапшота
 * (pending-строки переживают снапшот — оверлей в writeSnapshot).
 *
 * Триггеры push: событие online, возврат вкладки, каждая постановка в очередь
 * (с дебаунсом, чтобы сгруппировать быстрые операции в один батч), таймер ~1
 * мин, ручной «Повторить». Сетевой сбой батча — экспоненциальный backoff
 * раннера (1 мин · 2^n, до 1 ч). Операция после MAX_ATTEMPTS неудач — dead
 * letter: ждёт ручного «Повторить»/«Удалить» (панель внизу экрана).
 *
 * На страницах входа/регистрации синхронизация не запускается. Ошибка
 * авторизации трактуется как «гость»/истёкшая сессия и ошибкой очереди не
 * считается — операции остаются pending до повторного входа.
 */

const PUSH_DEBOUNCE_MS = 2500;
const PUSH_BACKOFF_BASE_MS = 60_000;
const PUSH_BACKOFF_MAX_MS = 3_600_000;
const SENT_NOTICE_MS = 3000;
const ERROR_NOTICE_MS = 4000;

interface FailedOpView {
  opId: string;
  entity: OutboxEntity;
  createdAt: string;
  error: string | null;
}

interface SyncState {
  /** Инкрементируется после снапшота и после каждой локальной мутации. */
  version: number;
  syncing: boolean;
  /** Кеш уже был гидратирован ранее (повторный запуск) — для индикатора. */
  hydratedBefore: boolean;
  /** Последняя попытка синхронизации не удалась (сеть/Башня недоступны). */
  error: boolean;
  online: boolean;
  /** Хроники, ожидающие отправки (pending + sending). */
  pendingCount: number;
  /** Операции dead letter — для панели «Повторить»/«Удалить». */
  failedOps: FailedOpView[];
  retryFailed: (opId: string) => void;
  discardFailed: (opId: string) => void;
}

const SyncContext = createContext<SyncState>({
  version: 0,
  syncing: false,
  hydratedBefore: false,
  error: false,
  online: true,
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
  const [syncing, setSyncing] = useState(false);
  const [hydratedBefore, setHydratedBefore] = useState(false);
  const [error, setError] = useState(false);
  const [pushError, setPushError] = useState(false);
  /** Ненулевой nonce: показать короткое «Хроники отправлены». */
  const [sentNotice, setSentNotice] = useState(0);
  const [online, setOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [failedOps, setFailedOps] = useState<FailedOpView[]>([]);

  const inFlight = useRef(false);
  const pushBusy = useRef(false);
  const lastAttempt = useRef(0);
  const nextPushAt = useRef(0);
  const networkFails = useRef(0);
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingBefore = useRef(0);
  const guestRef = useRef(false);
  guestRef.current = GUEST_ROUTES.includes(pathname);

  /** Пересчитать счётчики очереди (после enqueue, push, pull, ручных действий). */
  const refreshOutbox = useCallback(async () => {
    const stats = await outboxStats();
    pendingBefore.current = stats.pending;
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

  const scheduleBackoff = useCallback(() => {
    networkFails.current += 1;
    nextPushAt.current =
      Date.now() +
      Math.min(PUSH_BACKOFF_BASE_MS * 2 ** (networkFails.current - 1), PUSH_BACKOFF_MAX_MS);
  }, []);

  /** Один push-заход: батч pending/failed → pushOutbox → подтверждения. */
  const push = useCallback(async (): Promise<"applied" | "idle" | "failed"> => {
    if (pushBusy.current) return "idle";
    if (typeof navigator !== "undefined" && !navigator.onLine) return "idle";
    if (Date.now() < nextPushAt.current) return "idle";
    const userId = await cachedUserId();
    if (!userId) return "idle";

    pushBusy.current = true;
    try {
      const batch = await takePushBatch(userId);
      if (batch.length === 0) return "idle";
      try {
        const res = await pushOutbox(batchToWire(batch));
        if (!res.ok) {
          // Истёкшая сессия и прочие ошибки уровня пакета: операции остаются
          // pending — повтор после восстановления сети/входа.
          await revertSendingToPending();
          scheduleBackoff();
          if (res.error !== "Требуется авторизация") setPushError(true);
          return "failed";
        }
        const applied = await applyPushResults(batch, res.data);
        networkFails.current = 0;
        nextPushAt.current = 0;
        return applied > 0 ? "applied" : "idle";
      } catch {
        // Сетевой сбой батча целиком: всё обратно в pending, backoff раннера.
        await revertSendingToPending();
        scheduleBackoff();
        setPushError(true);
        return "failed";
      }
    } finally {
      pushBusy.current = false;
    }
  }, [scheduleBackoff]);

  const pull = useCallback(async (): Promise<boolean> => {
    const res = await pullSnapshot();
    if (res.ok) {
      const written = await writeSnapshot(res.data);
      if (written) setHydratedBefore(true);
      return written;
    }
    if (res.error !== "Требуется авторизация") setError(true);
    return false;
  }, []);

  /** Полный цикл: push → pull. Локальные изменения уходят, кеш сверяется. */
  const runCycle = useCallback(
    async (force = false) => {
      if (inFlight.current || guestRef.current) return;
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setOnline(false);
        return;
      }
      const now = Date.now();
      if (!force && now - lastAttempt.current < SYNC_THROTTLE_MS) return;
      lastAttempt.current = now;
      inFlight.current = true;
      setSyncing(true);
      setError(false);
      setOnline(true);
      try {
        const wasLongQueue = pendingBefore.current >= 3;
        const pushResult = await push();
        const written = await pull();
        if (written) setVersion((v) => v + 1);
        if (pushResult === "applied" && wasLongQueue) {
          // Батч закрыл длинную офлайн-сессию — короткое тихое подтверждение.
          setSentNotice((n) => n + 1);
        }
      } catch {
        setError(true);
      } finally {
        inFlight.current = false;
        setSyncing(false);
        void refreshOutbox();
      }
    },
    [push, pull, refreshOutbox],
  );

  useEffect(() => {
    void (async () => {
      // Операции, застрявшие в sending (вкладка закрылась во время push),
      // возвращаются в очередь; повторный push тех же операций безопасен
      // (идемпотентность, раздел 9 дизайн-документа).
      await revertSendingToPending();
      const pulledAt = await lastSnapshotAt();
      if (pulledAt) setHydratedBefore(true);
      await refreshOutbox();
    })();
    void runCycle();
    if (typeof navigator !== "undefined") setOnline(navigator.onLine);

    const onOnline = () => {
      setOnline(true);
      void runCycle(true);
    };
    const onOffline = () => setOnline(false);
    const onVisible = () => {
      if (document.visibilityState === "visible") void runCycle();
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);
    const periodic = setInterval(() => void runCycle(), SYNC_THROTTLE_MS);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(periodic);
    };
  }, [runCycle, refreshOutbox]);

  // Локальная мутация: экраны перечитывают кеш, push планируется с дебаунсом.
  useEffect(
    () =>
      subscribeOutbox(() => {
        void refreshOutbox();
        setVersion((v) => v + 1);
        if (pushTimer.current) clearTimeout(pushTimer.current);
        pushTimer.current = setTimeout(() => void runCycle(true), PUSH_DEBOUNCE_MS);
      }),
    [refreshOutbox, runCycle],
  );

  const retryFailed = useCallback(
    (opId: string) => {
      void (async () => {
        await retryOutboxOp(opId);
        nextPushAt.current = 0;
        networkFails.current = 0;
        await refreshOutbox();
        void runCycle(true);
      })();
    },
    [runCycle, refreshOutbox],
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
      syncing,
      hydratedBefore,
      error,
      online,
      pendingCount,
      failedOps,
      retryFailed,
      discardFailed,
    }),
    [version, syncing, hydratedBefore, error, online, pendingCount, failedOps, retryFailed, discardFailed],
  );

  return (
    <SyncContext.Provider value={value}>
      {children}
      <SyncIndicator
        syncing={syncing}
        hydratedBefore={hydratedBefore}
        error={error}
        pushError={pushError}
        sentNotice={sentNotice}
        online={online}
        pendingCount={pendingCount}
        failedOps={failedOps}
        onRetry={retryFailed}
        onDiscard={discardFailed}
      />
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
};

interface IndicatorProps {
  syncing: boolean;
  hydratedBefore: boolean;
  error: boolean;
  pushError: boolean;
  /** Ненулевой nonce — показать короткое подтверждение отправки. */
  sentNotice: number;
  online: boolean;
  pendingCount: number;
  failedOps: FailedOpView[];
  onRetry: (opId: string) => void;
  onDiscard: (opId: string) => void;
}

/**
 * Индикатор синхронизации и dead letter. Всё молчит, пока всё хорошо:
 * офлайн и несинхронизированные записи — один тихий индикатор внизу,
 * отклонённые операции — панель с «Повторить»/«Удалить».
 */
function SyncIndicator({
  syncing,
  hydratedBefore,
  error: pullError,
  pushError,
  sentNotice,
  online,
  pendingCount,
  failedOps,
  onRetry,
  onDiscard,
}: IndicatorProps) {
  const [showError, setShowError] = useState(false);
  const [showPushError, setShowPushError] = useState(false);
  const [showSent, setShowSent] = useState(false);

  useEffect(() => {
    if (!pullError) {
      setShowError(false);
      return;
    }
    setShowError(true);
    const timer = setTimeout(() => setShowError(false), ERROR_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [pullError]);

  useEffect(() => {
    if (!pushError) {
      setShowPushError(false);
      return;
    }
    setShowPushError(true);
    const timer = setTimeout(() => setShowPushError(false), ERROR_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [pushError]);

  useEffect(() => {
    if (!sentNotice) return;
    setShowSent(true);
    const timer = setTimeout(() => setShowSent(false), SENT_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [sentNotice]);

  // Dead letter заменяет индикатор: пользователь должен увидеть действия.
  if (failedOps.length > 0) {
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
              — не удалось отправить
            </p>
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

  // Офлайн: тихий постоянный индикатор — записи сохраняются на устройстве.
  if (!online && (hydratedBefore || pendingCount > 0)) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="fixed bottom-24 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border border-[var(--card-edge)] bg-[var(--card)]/85 px-3 py-1.5 text-[11px] text-[var(--ink-faint)] shadow-lg backdrop-blur"
      >
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[var(--ink-faint)] opacity-60" />
        Нет связи с Башней{pendingCount > 0 ? ` — ${pendingLabel(pendingCount)} на устройстве` : " — записи сохраняются на устройстве"}
      </div>
    );
  }

  if (showSent) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="fixed bottom-24 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border border-[var(--card-edge)] bg-[var(--card)]/85 px-3 py-1.5 text-[11px] text-[var(--ink-faint)] shadow-lg backdrop-blur"
      >
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#5d7a4a]" />
        Хроники отправлены
      </div>
    );
  }

  if (showError || showPushError) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="fixed bottom-24 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border border-[var(--card-edge)] bg-[var(--card)]/85 px-3 py-1.5 text-[11px] text-[var(--ink-faint)] shadow-lg backdrop-blur"
      >
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#c96a5a]" />
        {showPushError ? "Не удалось отправить хроники, повторю позже" : "Нет связи с Башней — показаны хроники устройства"}
      </div>
    );
  }

  if (syncing && hydratedBefore) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="fixed bottom-24 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border border-[var(--card-edge)] bg-[var(--card)]/85 px-3 py-1.5 text-[11px] text-[var(--ink-faint)] shadow-lg backdrop-blur"
      >
        <span
          aria-hidden="true"
          className="block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent opacity-70"
        />
        {pendingCount > 0 ? "Отправляю хроники…" : "Сверяю хроники…"}
      </div>
    );
  }

  return null;
}

function pendingLabel(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} запись ждёт отправки`;
  const word =
    mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? "записи" : "записей";
  return `${n} ${word} ждут отправки`;
}
