ALTER TABLE "consultants" ADD COLUMN "monthly_goal_cents" integer;--> statement-breakpoint
ALTER TABLE "sale_items" ADD COLUMN "cost_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "consultants" ADD CONSTRAINT "consultants_monthly_goal_cents_check" CHECK ("consultants"."monthly_goal_cents" IS NULL OR "consultants"."monthly_goal_cents" > 0);--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_cost_cents_check" CHECK ("sale_items"."cost_cents" >= 0);