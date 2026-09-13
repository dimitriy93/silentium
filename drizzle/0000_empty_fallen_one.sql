CREATE TABLE "ai_daily_memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"day_id" uuid,
	"entry_date" date NOT NULL,
	"content" jsonb NOT NULL,
	"generated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_daily_memories_user_date_unique" UNIQUE("user_id","entry_date")
);
--> statement-breakpoint
CREATE TABLE "ai_periodic_memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"period_type" text NOT NULL,
	"period_start" date NOT NULL,
	"content" jsonb NOT NULL,
	"generated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_periodic_memories_unique" UNIQUE("user_id","period_type","period_start"),
	CONSTRAINT "ai_periodic_memories_period_check" CHECK ("ai_periodic_memories"."period_type" in ('week', 'month'))
);
--> statement-breakpoint
CREATE TABLE "asceticism_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asceticism_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"entry_date" date NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asceticism_logs_unique" UNIQUE("asceticism_id","entry_date"),
	CONSTRAINT "asceticism_logs_status_check" CHECK ("asceticism_logs"."status" in ('done', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "asceticisms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"start_date" date NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asceticisms_title_check" CHECK (length(trim("asceticisms"."title")) > 0)
);
--> statement-breakpoint
CREATE TABLE "creation_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"entry_date" date NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creation_content_check" CHECK (length(trim("creation_entries"."content")) > 0)
);
--> statement-breakpoint
CREATE TABLE "days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"day_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "days_user_date_unique" UNIQUE("user_id","day_date")
);
--> statement-breakpoint
CREATE TABLE "learning_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"entry_date" date NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learning_content_check" CHECK (length(trim("learning_entries"."content")) > 0)
);
--> statement-breakpoint
CREATE TABLE "leisure_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"entry_date" date NOT NULL,
	"title" text NOT NULL,
	"minutes" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leisure_title_check" CHECK (length(trim("leisure_entries"."title")) > 0),
	CONSTRAINT "leisure_minutes_check" CHECK ("leisure_entries"."minutes" IS NULL OR "leisure_entries"."minutes" > 0)
);
--> statement-breakpoint
CREATE TABLE "mentor_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"entry_date" date,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mentor_messages_role_check" CHECK ("mentor_messages"."role" in ('mentor', 'user'))
);
--> statement-breakpoint
CREATE TABLE "mentor_prompts" (
	"key" text PRIMARY KEY NOT NULL,
	"content" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nutrition_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"entry_date" date NOT NULL,
	"calories" integer,
	"protein_grams" numeric(6, 1),
	"fat_grams" numeric(6, 1),
	"carbs_grams" numeric(6, 1),
	"note" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nutrition_user_date_unique" UNIQUE("user_id","entry_date"),
	CONSTRAINT "nutrition_source_check" CHECK ("nutrition_entries"."source" in ('manual', 'nutriarium')),
	CONSTRAINT "nutrition_calories_check" CHECK ("nutrition_entries"."calories" IS NULL OR "nutrition_entries"."calories" >= 0),
	CONSTRAINT "nutrition_protein_check" CHECK ("nutrition_entries"."protein_grams" IS NULL OR "nutrition_entries"."protein_grams" >= 0),
	CONSTRAINT "nutrition_fat_check" CHECK ("nutrition_entries"."fat_grams" IS NULL OR "nutrition_entries"."fat_grams" >= 0),
	CONSTRAINT "nutrition_carbs_check" CHECK ("nutrition_entries"."carbs_grams" IS NULL OR "nutrition_entries"."carbs_grams" >= 0)
);
--> statement-breakpoint
CREATE TABLE "path_elements" (
	"key" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"symbol" text NOT NULL,
	"description" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rpg_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL,
	"rank" text DEFAULT 'novice' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rpg_profiles_level_check" CHECK ("rpg_profiles"."level" >= 1),
	CONSTRAINT "rpg_profiles_xp_check" CHECK ("rpg_profiles"."xp" >= 0)
);
--> statement-breakpoint
CREATE TABLE "thoughts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"entry_date" date NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "thoughts_content_check" CHECK (length(trim("thoughts"."content")) > 0)
);
--> statement-breakpoint
CREATE TABLE "training_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"entry_date" date NOT NULL,
	"title" text NOT NULL,
	"detail" text,
	"duration_minutes" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_title_check" CHECK (length(trim("training_activities"."title")) > 0),
	CONSTRAINT "training_duration_check" CHECK ("training_activities"."duration_minutes" IS NULL OR "training_activities"."duration_minutes" > 0)
);
--> statement-breakpoint
CREATE TABLE "xp_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"entry_date" date,
	"source" text NOT NULL,
	"xp" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "xp_events_xp_check" CHECK ("xp_events"."xp" <> 0)
);
--> statement-breakpoint
ALTER TABLE "ai_daily_memories" ADD CONSTRAINT "ai_daily_memories_day_id_days_id_fk" FOREIGN KEY ("day_id") REFERENCES "public"."days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asceticism_logs" ADD CONSTRAINT "asceticism_logs_asceticism_id_asceticisms_id_fk" FOREIGN KEY ("asceticism_id") REFERENCES "public"."asceticisms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_daily_memories_user_date_idx" ON "ai_daily_memories" USING btree ("user_id","entry_date");--> statement-breakpoint
CREATE INDEX "asceticism_logs_user_date_idx" ON "asceticism_logs" USING btree ("user_id","entry_date");--> statement-breakpoint
CREATE INDEX "creation_user_date_idx" ON "creation_entries" USING btree ("user_id","entry_date");--> statement-breakpoint
CREATE INDEX "learning_user_date_idx" ON "learning_entries" USING btree ("user_id","entry_date");--> statement-breakpoint
CREATE INDEX "leisure_user_date_idx" ON "leisure_entries" USING btree ("user_id","entry_date");--> statement-breakpoint
CREATE INDEX "mentor_messages_user_idx" ON "mentor_messages" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "thoughts_user_date_idx" ON "thoughts" USING btree ("user_id","entry_date");--> statement-breakpoint
CREATE INDEX "training_user_date_idx" ON "training_activities" USING btree ("user_id","entry_date");--> statement-breakpoint
CREATE INDEX "xp_events_user_date_idx" ON "xp_events" USING btree ("user_id","entry_date");