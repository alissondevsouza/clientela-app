CREATE TABLE "appointments" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"consultant_id" uuid NOT NULL,
	"client_id" uuid,
	"lead_id" uuid,
	"sale_id" uuid,
	"kind" text NOT NULL,
	"title" text,
	"starts_at" timestamp with time zone NOT NULL,
	"duration_minutes" integer NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"location" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appointments_duration_minutes_check" CHECK ("appointments"."duration_minutes" >= 1 AND "appointments"."duration_minutes" <= 1440),
	CONSTRAINT "appointments_kind_check" CHECK ("appointments"."kind" IN ('skin_analysis', 'demo', 'delivery', 'follow_up', 'other')),
	CONSTRAINT "appointments_status_check" CHECK ("appointments"."status" IN ('scheduled', 'done', 'no_show', 'canceled'))
);
--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_consultant_id_consultants_id_fk" FOREIGN KEY ("consultant_id") REFERENCES "public"."consultants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointments_consultant_id_starts_at_idx" ON "appointments" USING btree ("consultant_id","starts_at");--> statement-breakpoint
CREATE INDEX "appointments_client_id_idx" ON "appointments" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "appointments_lead_id_idx" ON "appointments" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "appointments_sale_id_idx" ON "appointments" USING btree ("sale_id");