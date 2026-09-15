CREATE TABLE "asceticism_streaks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asceticism_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"current_streak" integer DEFAULT 0 NOT NULL,
	"longest_streak" integer DEFAULT 0 NOT NULL,
	"best_milestone" integer DEFAULT 0 NOT NULL,
	"last_done_date" date,
	"streak_since" date,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asceticism_streaks_unique" UNIQUE("asceticism_id")
);
--> statement-breakpoint
ALTER TABLE "asceticism_streaks" ADD CONSTRAINT "asceticism_streaks_asceticism_id_asceticisms_id_fk" FOREIGN KEY ("asceticism_id") REFERENCES "public"."asceticisms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "asceticism_streaks_user_idx" ON "asceticism_streaks" USING btree ("user_id","best_milestone");--> statement-breakpoint

-- --- Ручные дополнения (по образцу 0001_rls.sql): FK на auth.users и RLS ---

ALTER TABLE "asceticism_streaks"
  ADD CONSTRAINT "asceticism_streaks_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "asceticism_streaks" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "asceticism_streaks" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "asceticism_streaks_all_own" ON "asceticism_streaks";
--> statement-breakpoint
CREATE POLICY "asceticism_streaks_all_own" ON "asceticism_streaks"
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
