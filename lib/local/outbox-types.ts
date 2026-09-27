/**
 * Контракт очереди исходящих операций (этап 2, docs/offline-write-sync-design.md,
 * разделы 3–4). Модуль без рантайм-кода: импортируется и клиентом
 * (lib/local/*), и сервером (actions/sync.ts).
 *
 * Порядок операций задаётся автоинкрементом seq (порядок вставки в IndexedDB);
 * на провод передаются только содержательные поля — status/attempts живут
 * только в локальной таблице.
 */

export type OutboxEntity =
  | "thought"
  | "training"
  | "nutrition"
  | "learning"
  | "creation"
  | "leisure"
  | "asceticism"
  | "asceticismLog"
  | "xpEvent";

export type OutboxOpType = "create" | "update" | "delete" | "upsert";

/** Операция на проводе: клиент → pushOutbox. */
export interface OutboxOp {
  /** UUID самой операции — для пооперационных ответов сервера и трассировки. */
  opId: string;
  /** Кто создал операцию (защита при смене пользователя на устройстве). */
  userId: string;
  entity: OutboxEntity;
  op: OutboxOpType;
  /** Клиентский UUID строки. */
  rowId: string;
  /** Полный набор редактируемых полей (не дифф); для delete — null. */
  payload: Record<string, unknown> | null;
  /** ISO: время операции на клиенте. */
  createdAt: string;
}

/** Пооперационный ответ сервера. */
export interface PushOpResult {
  opId: string;
  ok: boolean;
  error?: string;
}

/** Локальная запись очереди (таблица outbox в IndexedDB). */
export interface OutboxEntry extends OutboxOp {
  /** Автоинкремент — первичный ключ; присваивается при вставке. */
  seq?: number;
  /** pending → sending → (удалена | failed). */
  status: "pending" | "sending" | "failed";
  attempts: number;
  lastAttemptAt: string | null;
  error: string | null;
}
