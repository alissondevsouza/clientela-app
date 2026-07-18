CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"whatsapp" text NOT NULL,
	"interest" text,
	"source" text DEFAULT 'landing' NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"consent_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leads_status_check" CHECK ("leads"."status" IN ('new', 'contacted', 'converted', 'discarded'))
);
