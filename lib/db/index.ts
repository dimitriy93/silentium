import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient } from "pg";
import * as schema from "./schema";

/**
 * Подключение к Postgres (Supabase transaction pooler :6543) для всего приложения.
 *
 * Почему `pg` (node-postgres), а не postgres.js (проверено на реальном проекте):
 * - postgres.js после `select set_config(...)` (простой протокол) не получает
 *   ответы на последующие запросы расширенного протокола в той же транзакции —
 *   соединение зависает до разрыва (~20 c). Драйвер `pg` на той же
 *   последовательности через тот же pooler работает стабильно;
 * - postgres.js при разрыве соединения НЕ отклоняет запросы, а молча
 *   пере-очередивает их — страницы зависают навсегда. `pg` отклоняет промис
 *   сразу, сломанный клиент удаляется из пула автоматически.
 *
 * Разбор запросов не используется (unnamed statements) — это безопасно для
 * PgBouncer/Supavisor в режиме transaction.
 */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
  connectionTimeoutMillis: 5_000,
  // query_timeout — клиентский предохранитель: если ответ на запрос потерян
  // по пути, клиент сам обрывает ожидание, и withUserDb повторяет транзакцию
  // на новом соединении, не дожидаясь, пока pooler прибьёт «зависшую»
  // транзакцию (~15 c).
  //
  // ВАЖНО: серверные GUC (statement_timeout, idle_in_transaction_session_timeout)
  // НЕЛЬЗЯ задавать через startup-параметры (options) — Supavisor в режиме
  // transaction их отбрасывает (проверено: show ... возвращает дефолты Supabase).
  // Они задаются внутри транзакции в withUserDb через set_config(..., is_local).
  query_timeout: 6_000,
  maxUses: 1,
  idleTimeoutMillis: 10_000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 5_000,
});

// «Мёртвый» клиент, который уже вернулся в пул, может выкинуть ошибку сокета —
// пул сам удалит его; глушим событие, чтобы не ронять процесс (рекомендация node-pg).
pool.on("error", () => {});

type Db = NodePgDatabase<typeof schema>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

function isConnectionError(err: unknown): boolean {
  // Drizzle оборачивает ошибки запросов ("Failed query: ..."), а причина — в
  // цепочке cause; проверяем всю цепочку.
  for (
    let e = err as Error & { code?: string }, depth = 0;
    e instanceof Error && depth < 5;
    depth++, e = e.cause as Error & { code?: string }
  ) {
    const code = String(e.code ?? "");
    const message = String(e.message ?? "");
    if (
      /ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE/i.test(code) ||
      /ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE|connection terminated|not queryable|connection error|socket hang up|failed query/i.test(
        message,
      )
    ) {
      return true;
    }
  }
  return false;
}

/** Число попыток при сбоях соединения (транзакции короткие и атомарные).
 * Канал до Supabase рвёт заметную долю новых соединений — без запаса попыток
 * каждый 5-й запрос падал бы для пользователя. */
const MAX_DB_ATTEMPTS = 6;
const RETRY_BASE_DELAY_MS = 300;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Выполняет `fn` внутри транзакции от имени конкретного пользователя Supabase.
 *
 * Drizzle ходит в Postgres под ролью `postgres` (DATABASE_URL). На Supabase эта
 * роль не имеет BYPASSRLS, но как владелец таблиц она обошла бы RLS без
 * `FORCE ROW LEVEL SECURITY` (он включён миграцией 0001). Поэтому каждый запрос
 * обязан пройти RLS-политики, а политики построены на auth.uid(), который читает
 * JWT-контекст сессии. Здесь мы задаём этот контекст вручную — только
 * transaction-local (is_local = true), чтобы он не «протёк» в соседние запросы пула.
 *
 * `userId` всегда берётся из серверной сессии Supabase, никогда из аргументов запроса.
 */
export async function withUserDb<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  // Контекст и серверные предохранители задаются одним литеральным запросом
  // (is_local = true — действует только до конца транзакции и не «протекает»
  // в соседние запросы пула):
  // - JWT-контекст для auth.uid() в RLS-политиках;
  // - idle_in_transaction_session_timeout — страховка от зомби: если
  //   транзакция застынет (потеря пакета посреди), сервер сам закроет её
  //   через 30 c, иначе «висяки» исчерпывают бэкенды пула Supavisor;
  // - statement_timeout — серверный предел длительности запроса.
  // Startup-параметры (options в Pool) через Supavisor transaction pooler
  // не доходят — только так эти настройки реально применяются.
  // userId — UUID из сессии Supabase; кавычки в JSON экранируются на всякий случай.
  const claims = JSON.stringify({ sub: userId, role: "authenticated" }).replace(/'/g, "''");
  const contextQuery = sql.raw(`select
    set_config('request.jwt.claims', '${claims}', true),
    set_config('request.jwt.claim.sub', '${userId}', true),
    set_config('request.jwt.claim.role', 'authenticated', true),
    set_config('idle_in_transaction_session_timeout', '30000', true),
    set_config('statement_timeout', '10000', true)`);

    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_DB_ATTEMPTS; attempt++) {
      if (attempt > 1) {
        await sleep(RETRY_BASE_DELAY_MS * (attempt - 1));
      }
      // Клиент берём из пула вручную: (1) вешаем свой обработчик 'error' — без него
      // гибель сокета у выбранного клиента падает uncaughtException'ом; (2) при
      // сбое уничтожаем клиент через release(true), а не возвращаем в пул.
      let client: PoolClient | null = null;
      let failed = false;
      try {
        client = await pool.connect();
        client.on("error", () => {
          failed = true;
        });
        const result = await drizzle(client, { schema }).transaction(async (tx) => {
          await tx.execute(contextQuery);
          return await fn(tx);
        });
        return result;
      } catch (error) {
        failed = true;
        lastError = error;
        if (!isConnectionError(error) || attempt === MAX_DB_ATTEMPTS) {
          throw error;
        }
      } finally {
        if (client) {
          try {
            client.release(failed);
          } catch {
            // клиент уже мёртв
          }
        }
      }
    }
    throw lastError;
}
