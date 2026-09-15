CREATE TABLE "day_streaks" (
	"user_id" uuid PRIMARY KEY,
	"current_streak" integer DEFAULT 0 NOT NULL,
	"longest_streak" integer DEFAULT 0 NOT NULL,
	"best_milestone" integer DEFAULT 0 NOT NULL,
	"last_active_date" date,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- --- Ручные дополнения (по образцу 0002): FK на auth.users и RLS ---

ALTER TABLE "day_streaks"
  ADD CONSTRAINT "day_streaks_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
--> statement-breakpoint
CREATE INDEX "day_streaks_user_idx" ON "day_streaks" USING btree ("user_id","best_milestone");
--> statement-breakpoint
ALTER TABLE "day_streaks" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "day_streaks" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "day_streaks_all_own" ON "day_streaks";
--> statement-breakpoint
CREATE POLICY "day_streaks_all_own" ON "day_streaks"
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
