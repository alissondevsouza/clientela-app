CREATE TABLE "monthly_goals" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"consultant_id" uuid NOT NULL,
	"month_start" date NOT NULL,
	"goal_cents" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "monthly_goals_consultant_id_month_start_key" UNIQUE("consultant_id","month_start"),
	CONSTRAINT "monthly_goals_month_start_day_check" CHECK (EXTRACT(DAY FROM "monthly_goals"."month_start") = 1),
	CONSTRAINT "monthly_goals_goal_cents_check" CHECK ("monthly_goals"."goal_cents" IS NULL OR ("monthly_goals"."goal_cents" > 0 AND "monthly_goals"."goal_cents" <= 100000000))
);
--> statement-breakpoint
ALTER TABLE "monthly_goals" ADD CONSTRAINT "monthly_goals_consultant_id_consultants_id_fk" FOREIGN KEY ("consultant_id") REFERENCES "public"."consultants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sales_consultant_sold_at_idx" ON "sales" USING btree ("consultant_id","sold_at");