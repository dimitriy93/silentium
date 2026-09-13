-- ============================================================
-- 0001_rls: FK на auth.users, справочники, RLS (enable + force),
-- политики, триггер автосоздания профиля и RPG-профиля.
--
-- Контекст: Drizzle подключается под ролью `postgres` (DATABASE_URL).
-- На Supabase роль `postgres` не имеет BYPASSRLS, но как ВЛАДЕЛЕЦ таблиц
-- она обошла бы RLS без FORCE ROW LEVEL SECURITY. Поэтому здесь включён
-- FORCE — после этого любые запросы приложения обязаны пройти политики.
--
-- Приложение задаёт JWT-контекст в каждой транзакции через
-- set_config('request.jwt.claims', ...) (см. lib/db/index.ts, withUserDb).
-- auth.uid() в политиках читает именно этот контекст.
-- ============================================================

-- --- Внешние ключи на auth.users (Supabase Auth) ---
-- Drizzle не управляет схемой auth, поэтому FK добавляем вручную.

ALTER TABLE "profiles"
  ADD CONSTRAINT "profiles_id_fkey"
  FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "rpg_profiles"
  ADD CONSTRAINT "rpg_profiles_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "xp_events"
  ADD CONSTRAINT "xp_events_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "days"
  ADD CONSTRAINT "days_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "thoughts"
  ADD CONSTRAINT "thoughts_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "training_activities"
  ADD CONSTRAINT "training_activities_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "nutrition_entries"
  ADD CONSTRAINT "nutrition_entries_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "learning_entries"
  ADD CONSTRAINT "learning_entries_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "creation_entries"
  ADD CONSTRAINT "creation_entries_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "leisure_entries"
  ADD CONSTRAINT "leisure_entries_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "asceticisms"
  ADD CONSTRAINT "asceticisms_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "asceticism_logs"
  ADD CONSTRAINT "asceticism_logs_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "ai_daily_memories"
  ADD CONSTRAINT "ai_daily_memories_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "ai_periodic_memories"
  ADD CONSTRAINT "ai_periodic_memories_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "mentor_messages"
  ADD CONSTRAINT "mentor_messages_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

--> statement-breakpoint

-- --- Справочник стихий Пути ---

INSERT INTO "path_elements" ("key", "title", "symbol", "description", "sort_order") VALUES
  ('ogon',   'Огонь',  '🔥', 'Физическое развитие: тренировки, гиря, Вин Чун', 1),
  ('voda',   'Вода',   '🌊', 'Питание: калории, белки, жиры, углеводы',        2),
  ('vozduh', 'Воздух', '🌬', 'Умственное развитие: «я изучил»',                3),
  ('zemlya', 'Земля',  '🪨', 'Созидание: «я создал»',                          4)
ON CONFLICT ("key") DO NOTHING;

--> statement-breakpoint

-- --- Дефолтный system prompt наставника ---
-- Текст-источник: lib/mentor/default-system-prompt.ts

INSERT INTO "mentor_prompts" ("key", "content")
VALUES ('system', 'Ты — Наставник Silentium. Ты ведёшь личный дневник одного человека, стремящегося к дисциплине и развитию, и делаешь это спокойно, строго и наблюдательно.

Твой характер:
- Ты немногословен. Каждое слово несёт вес.
- Ты рационален. Ты не мотивируешь пустыми словами и не хвалишь за ожидаемое.
- Ты наблюдателен. Ты видишь закономерности там, где человек видит отдельные дни.
- Ты различаешь единичный провал и устойчивую тенденцию — и говоришь о них по-разному.
- Ты умеешь указывать на самообман: прямым вопросом или коротким наблюдением, без морализаторства.

Как ты отвечаешь:
- Кратко: выжимка, наблюдение, наставление. Без вступлений и прощаний.
- Ты опираешься на факты из записей. Нет записей — нет утверждений о них.
- Ты не выдумываешь данные, которых нет в дневнике.
- Если данных мало, ты указываешь на это: молчание в дневнике — тоже факт.
- Ты не даёшь медицинских советов и не занимаешься психотерапией; при серьёзных проблемах ты советуешь обратиться к специалисту.

Твой тон — старая военная и философская хроника: сдержанная строгость, уважение к труду, беспощадность к отговоркам. Ты обращаешься к человеку на «ты». Ты никогда не используешь смайлики и восклицания без нужды.')
ON CONFLICT ("key") DO NOTHING;

--> statement-breakpoint

-- --- Включение и форсирование RLS ---

ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "profiles" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "rpg_profiles" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "rpg_profiles" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "xp_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "xp_events" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "days" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "days" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "thoughts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "thoughts" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "training_activities" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "training_activities" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "nutrition_entries" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "nutrition_entries" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "learning_entries" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "learning_entries" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "creation_entries" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "creation_entries" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "leisure_entries" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "leisure_entries" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "asceticisms" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "asceticisms" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "asceticism_logs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "asceticism_logs" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "ai_daily_memories" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "ai_daily_memories" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "ai_periodic_memories" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "ai_periodic_memories" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "mentor_messages" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "mentor_messages" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
-- mentor_prompts: без user_id — любой авторизованный читает (наставнику нужен
-- prompt), редактирует только владелец БД (политик INSERT/UPDATE/DELETE нет).
ALTER TABLE "mentor_prompts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "mentor_prompts" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
-- path_elements: общий справочник стихий — только чтение для авторизованных.
ALTER TABLE "path_elements" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "path_elements" FORCE ROW LEVEL SECURITY;

--> statement-breakpoint

-- --- Политики: владельцу полный доступ к своим строкам ---
-- profiles/rpg_profiles: user_id = id (первичный ключ).
-- Остальные таблицы: колонка user_id.

DROP POLICY IF EXISTS "profiles_select_own" ON "profiles";
CREATE POLICY "profiles_select_own" ON "profiles"
  FOR SELECT USING (auth.uid() = id);
--> statement-breakpoint
DROP POLICY IF EXISTS "profiles_insert_own" ON "profiles";
CREATE POLICY "profiles_insert_own" ON "profiles"
  FOR INSERT WITH CHECK (auth.uid() = id);
--> statement-breakpoint
DROP POLICY IF EXISTS "profiles_update_own" ON "profiles";
CREATE POLICY "profiles_update_own" ON "profiles"
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
--> statement-breakpoint

DROP POLICY IF EXISTS "rpg_profiles_select_own" ON "rpg_profiles";
CREATE POLICY "rpg_profiles_select_own" ON "rpg_profiles"
  FOR SELECT USING (auth.uid() = user_id);
--> statement-breakpoint
DROP POLICY IF EXISTS "rpg_profiles_insert_own" ON "rpg_profiles";
CREATE POLICY "rpg_profiles_insert_own" ON "rpg_profiles"
  FOR INSERT WITH CHECK (auth.uid() = user_id);
--> statement-breakpoint
DROP POLICY IF EXISTS "rpg_profiles_update_own" ON "rpg_profiles";
CREATE POLICY "rpg_profiles_update_own" ON "rpg_profiles"
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
--> statement-breakpoint

-- path_elements: общий справочник, только чтение для авторизованных.
DROP POLICY IF EXISTS "path_elements_select_authenticated" ON "path_elements";
CREATE POLICY "path_elements_select_authenticated" ON "path_elements"
  FOR SELECT USING (auth.uid() IS NOT NULL);
--> statement-breakpoint

-- mentor_prompts: system prompt наставника — читают только авторизованные.
DROP POLICY IF EXISTS "mentor_prompts_select_authenticated" ON "mentor_prompts";
CREATE POLICY "mentor_prompts_select_authenticated" ON "mentor_prompts"
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- mentor_prompts: system prompt наставника — читают только авторизованные,
-- редактирует владелец БД вручную (политик INSERT/UPDATE/DELETE нет).

-- Для таблиц с user_id политики генерируются единообразно:
-- полный доступ владельцу, где владелец = auth.uid() = user_id.
DROP POLICY IF EXISTS "xp_events_all_own" ON "xp_events";
CREATE POLICY "xp_events_all_own" ON "xp_events"
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
--> statement-breakpoint
DROP POLICY IF EXISTS "days_all_own" ON "days";
CREATE POLICY "days_all_own" ON "days"
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
--> statement-breakpoint
DROP POLICY IF EXISTS "thoughts_all_own" ON "thoughts";
CREATE POLICY "thoughts_all_own" ON "thoughts"
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
--> statement-breakpoint
DROP POLICY IF EXISTS "training_activities_all_own" ON "training_activities";
CREATE POLICY "training_activities_all_own" ON "training_activities"
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
--> statement-breakpoint
DROP POLICY IF EXISTS "nutrition_entries_all_own" ON "nutrition_entries";
CREATE POLICY "nutrition_entries_all_own" ON "nutrition_entries"
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
--> statement-breakpoint
DROP POLICY IF EXISTS "learning_entries_all_own" ON "learning_entries";
CREATE POLICY "learning_entries_all_own" ON "learning_entries"
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
--> statement-breakpoint
DROP POLICY IF EXISTS "creation_entries_all_own" ON "creation_entries";
CREATE POLICY "creation_entries_all_own" ON "creation_entries"
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
--> statement-breakpoint
DROP POLICY IF EXISTS "leisure_entries_all_own" ON "leisure_entries";
CREATE POLICY "leisure_entries_all_own" ON "leisure_entries"
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
--> statement-breakpoint
DROP POLICY IF EXISTS "asceticisms_all_own" ON "asceticisms";
CREATE POLICY "asceticisms_all_own" ON "asceticisms"
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
--> statement-breakpoint
DROP POLICY IF EXISTS "asceticism_logs_all_own" ON "asceticism_logs";
CREATE POLICY "asceticism_logs_all_own" ON "asceticism_logs"
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
--> statement-breakpoint
DROP POLICY IF EXISTS "ai_daily_memories_all_own" ON "ai_daily_memories";
CREATE POLICY "ai_daily_memories_all_own" ON "ai_daily_memories"
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
--> statement-breakpoint
DROP POLICY IF EXISTS "ai_periodic_memories_all_own" ON "ai_periodic_memories";
CREATE POLICY "ai_periodic_memories_all_own" ON "ai_periodic_memories"
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
--> statement-breakpoint
DROP POLICY IF EXISTS "mentor_messages_all_own" ON "mentor_messages";
CREATE POLICY "mentor_messages_all_own" ON "mentor_messages"
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

--> statement-breakpoint

-- --- Триггер автосоздания профиля и RPG-профиля при регистрации ---
-- SECURITY DEFINER: при включённом FORCE RLS триггер от имени GoTrue не
-- прошёл бы политики profiles/rpg_profiles — независимо от того, в каком
-- контексте создан пользователь.

CREATE OR REPLACE FUNCTION "public"."handle_new_user"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO "public"."profiles" ("id") VALUES (new.id);

  INSERT INTO "public"."rpg_profiles" ("user_id") VALUES (new.id);

  RETURN new;
END;
$$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS "on_auth_user_created" ON "auth"."users";
--> statement-breakpoint
CREATE TRIGGER "on_auth_user_created"
  AFTER INSERT ON "auth"."users"
  FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_user"();
