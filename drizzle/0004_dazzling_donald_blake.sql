-- Только изменения xp_events. day_streaks здесь НЕ создаётся: таблица уже
-- существует (миграция 0003 писалась вручную без снапшота, и drizzle-kit
-- ошибочно включил её в diff — строки удалены).
ALTER TABLE "xp_events" ADD COLUMN "source_id" text;--> statement-breakpoint
ALTER TABLE "xp_events" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "xp_events" ADD CONSTRAINT "xp_events_user_source_unique" UNIQUE("user_id","source_id");
