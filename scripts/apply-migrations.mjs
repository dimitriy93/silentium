/**
 * Одноразовый скрипт применения миграций к реальному Supabase через pgbouncer:
 * каждый стейтмент — на свежем соединении (долгие сессии пулер рвёт).
 * После применения пишет журнал drizzle (__drizzle_migrations), чтобы
 * `drizzle-kit migrate` считал схему применённой.
 */
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const files = [
  { tag: "0000_empty_fallen_one", path: "./drizzle/0000_empty_fallen_one.sql", when: 1789246047681n },
  { tag: "0001_rls", path: "./drizzle/0001_rls.sql", when: 1789246047781n },
];

async function execFresh(query) {
  let lastErr;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const sql = postgres(url, { prepare: false, max: 1, connect_timeout: 15 });
    try {
      const res = await sql.unsafe(query);
      await sql.end();
      return res;
    } catch (e) {
      lastErr = e;
      await sql.end().catch(() => {});
      const msg = String(e.message ?? e);
      if (/already exists|duplicate/i.test(msg)) throw e;
      console.log(`    retry ${attempt} (${msg.slice(0, 60)})`);
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  throw lastErr;
}

console.log("reset public schema...");
await execFresh(`drop schema public cascade;`);
await execFresh(`create schema public;`);
await execFresh(`grant usage on schema public to anon, authenticated, service_role;`);
await execFresh(
  `alter default privileges in schema public grant all on tables to postgres, anon, authenticated, service_role;`,
);
await execFresh(
  `alter default privileges in schema public grant all on sequences to postgres, anon, authenticated, service_role;`,
);
await execFresh(
  `alter default privileges in schema public grant all on functions to postgres, anon, authenticated, service_role;`,
);

for (const file of files) {
  console.log(`apply ${file.tag}...`);
  const content = readFileSync(file.path, "utf8");
  const stmts = content
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);
  let i = 0;
  for (const stmt of stmts) {
    i += 1;
    const firstLine = stmt.split("\n").find((l) => l.trim() && !l.trim().startsWith("--")) ?? "";
    try {
      await execFresh(stmt);
    } catch (e) {
      console.error(`  FAIL stmt ${i}: ${firstLine.slice(0, 70)}`);
      console.error(`  ${String(e.message).slice(0, 200)}`);
      process.exit(1);
    }
  }
  console.log(`  ${stmts.length} statements ok`);
}

console.log("write drizzle journal...");
await execFresh(`create schema if not exists drizzle;`);
await execFresh(
  `create table if not exists drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint)`,
);
for (const file of files) {
  await execFresh(
    `insert into drizzle.__drizzle_migrations (hash, created_at) values ('${file.tag}', ${file.when})`,
  );
}

const sql = postgres(url, { prepare: false, max: 1 });
const tables = await sql`select tablename from pg_tables where schemaname='public' order by 1`;
console.log(`tables (${tables.length}):`, tables.map((t) => t.tablename).join(", "));
await sql.end();
console.log("done");
