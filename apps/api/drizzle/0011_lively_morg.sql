ALTER TABLE "sales" DROP CONSTRAINT "sales_status_check";--> statement-breakpoint
ALTER TABLE "receivables" ALTER COLUMN "due_date" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "receivables" ADD COLUMN "due_kind" text;--> statement-breakpoint
ALTER TABLE "receivables" ADD COLUMN "voided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "payment_condition" text;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "card_type" text;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "installments" integer;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "payment_plan_known" boolean;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "delivered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "canceled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_status_check" CHECK ("sales"."status" IN ('open', 'completed', 'canceled'));