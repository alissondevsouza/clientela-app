CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"consultant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"whatsapp" text NOT NULL,
	"birthday" date,
	"skin_tone" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_consultant_id_consultants_id_fk" FOREIGN KEY ("consultant_id") REFERENCES "public"."consultants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clients_consultant_id_idx" ON "clients" USING btree ("consultant_id");