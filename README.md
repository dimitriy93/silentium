# Silentium — Безмолвная дисциплина

Личный дневник дисциплины, развития и самоанализа с элементами RPG и AI-наставником.
Тёмная «хроника»: бронза, состаренный металл, приглушённое золото.

## Стек

- **Next.js 15** (App Router, Server Components, Server Actions)
- **React 19**, **TypeScript**
- **Supabase** (Auth) + **PostgreSQL**
- **Drizzle ORM** + `pg` (node-postgres), миграции `drizzle-kit`
- **Tailwind CSS 4**
- **Zod** — валидация
- Vercel-compatible

## Структура

```
app/          страницы (today, thoughts, path, leisure, asceticism, history, mentor, settings, login, register)
actions/      server actions (auth, thoughts, path, leisure, asceticism)
components/   клиентские компоненты
lib/
  db/         Drizzle: схема + пул с RLS-контекстом (withUserDb)
  supabase/   Supabase-клиенты (server, middleware)
  mentor.ts   system prompt наставника (хранится в БД, ключ 'system')
  profile.ts  RPG-профиль (level/xp/rank)
  day.ts      агрегаты дня для «Сегодня» и «Истории»
drizzle/      SQL-миграции (0000 — схема, 0001 — RLS/FK/справочники/триггер)
scripts/      smoke-тест слоя данных, apply-migrations
```

> В приложении используется драйвер `pg` (transaction pooler Supabase :6543,
> unnamed statements — безопасно для PgBouncer/Supavisor). postgres.js
> применяется только в служебных скриптах (`scripts/smoke.ts`,
> `scripts/apply-migrations.mjs`).

## Безопасность данных

- Все таблицы включают **FORCE ROW LEVEL SECURITY**; политики — `auth.uid() = user_id`.
- Приложение ходит в БД через `withUserDb(userId, fn)`: JWT-контекст задаётся в
  каждой транзакции, `userId` всегда из серверной сессии Supabase.
- Регистрация закрытая: whitelist email (`ALLOWED_EMAILS`) + ключ приглашения (`INVITE_KEY`).

## Разработка

```bash
npm install
npm run dev          # http://localhost:3000

# Локальный Supabase (Auth + Postgres в Docker):
npx supabase start   # API :54321, Postgres :54322, Studio :54323

# Миграции:
npm run db:generate  # сгенерировать из lib/db/schema.ts
npm run db:migrate   # применить

# Проверки:
npm run typecheck
npm run lint
npm run build
npm run db:smoke     # smoke-тест слоя данных (нужна живая БД)
```

> Локально smoke-тест лучше гонять под не-суперпользовательской ролью,
> иначе RLS обходится: `DATABASE_URL=postgresql://silentium_app:... SMOKE_ADMIN_URL=postgresql://postgres@...`.
> На Supabase роль `postgres` не суперпользователь — FORCE RLS работает как есть.

## Переменные окружения (.env.local)

| Переменная | Назначение |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL Supabase (Auth) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon-ключ Supabase |
| `DATABASE_URL` | Postgres для Drizzle (прямое подключение) |
| `INVITE_KEY` | ключ приглашения для регистрации |
| `ALLOWED_EMAILS` | whitelist email через запятую |

## Схема БД (кратко)

- `profiles`, `rpg_profiles` (level/xp/rank) — создаются триггером при регистрации
- `days` — якорь дня (для AI-памяти и будущей дневной метаинформации)
- `thoughts` — лента мыслей
- `path_elements` — справочник стихий (ogon/voda/vozduh/zemlya)
- `training_activities` — Огонь: журнал физической активности
- `nutrition_entries` — Вода: КБЖУ + заметка (1 строка/день, поле `source` под Nutriarium)
- `learning_entries` — Воздух: «я изучил»
- `creation_entries` — Земля: «я создал»
- `leisure_entries` — развлечения (название + минуты)
- `asceticisms`, `asceticism_logs` — аскезы и отметки done/failed
- `ai_daily_memories`, `ai_periodic_memories` — память наставника (день/период)
- `mentor_messages`, `mentor_prompts` — сообщения и system prompt наставника
- `xp_events` — архитектурная заготовка системы XP

## Планы (следующие этапы)

1. Создать облачный проект Supabase и деплой на Vercel.
2. Интеграция AI-наставника: сбор дня → `ai_daily_memories` → наставление.
3. Система XP: начисление за записи/аскезы, уровни и ранги.
4. Расписание тренировок (тип тренировки, упражнения, подходы/повторы/вес).
5. Интеграция с Nutriarium.
