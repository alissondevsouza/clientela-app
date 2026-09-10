ALTER TABLE "receivables" ALTER COLUMN "due_kind" SET DEFAULT 'scheduled';--> statement-breakpoint
ALTER TABLE "receivables" ALTER COLUMN "due_kind" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sales" ALTER COLUMN "payment_condition" SET DEFAULT 'received';--> statement-breakpoint
ALTER TABLE "sales" ALTER COLUMN "payment_condition" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sales" ALTER COLUMN "installments" SET DEFAULT 1;--> statement-breakpoint
ALTER TABLE "sales" ALTER COLUMN "installments" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sales" ALTER COLUMN "payment_plan_known" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "sales" ALTER COLUMN "payment_plan_known" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sales" ALTER COLUMN "status" SET DEFAULT 'open';--> statement-breakpoint
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_due_kind_check" CHECK ("receivables"."due_kind" IN ('scheduled', 'on_delivery', 'unknown'));--> statement-breakpoint
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_due_date_kind_check" CHECK (("receivables"."due_kind" = 'scheduled' AND "receivables"."due_date" IS NOT NULL)
        OR ("receivables"."due_kind" IN ('on_delivery', 'unknown') AND "receivables"."due_date" IS NULL));--> statement-breakpoint
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_temporal_matrix_check" CHECK ("receivables"."created_at" <= "receivables"."updated_at"
        AND ("receivables"."paid_at" IS NULL OR ("receivables"."created_at" <= "receivables"."paid_at" AND "receivables"."paid_at" <= "receivables"."updated_at"))
        AND ("receivables"."voided_at" IS NULL OR ("receivables"."created_at" <= "receivables"."voided_at" AND "receivables"."voided_at" <= "receivables"."updated_at"))
        AND NOT ("receivables"."paid_at" IS NOT NULL AND "receivables"."voided_at" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_payment_condition_check" CHECK ("sales"."payment_condition" IN ('received', 'on_delivery', 'installments'));--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_card_type_check" CHECK ("sales"."card_type" IS NULL OR "sales"."card_type" IN ('debit', 'credit'));--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_installments_check" CHECK ("sales"."installments" BETWEEN 1 AND 24);--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_payment_matrix_check" CHECK ((
        ("sales"."payment_method" IN ('cash', 'pix')
          AND "sales"."card_type" IS NULL
          AND (
            ("sales"."payment_condition" IN ('received', 'on_delivery') AND "sales"."installments" = 1)
            OR ("sales"."payment_method" = 'pix' AND "sales"."payment_condition" = 'installments' AND "sales"."installments" BETWEEN 2 AND 24)
          )
        )
        OR ("sales"."payment_method" = 'card' AND (
          ("sales"."card_type" IS NULL AND "sales"."payment_condition" = 'received' AND "sales"."installments" = 1)
          OR ("sales"."card_type" = 'debit' AND "sales"."payment_condition" IN ('received', 'on_delivery') AND "sales"."installments" = 1)
          OR ("sales"."card_type" = 'credit' AND (
            ("sales"."payment_condition" IN ('received', 'on_delivery') AND "sales"."installments" BETWEEN 1 AND 24)
            OR ("sales"."payment_condition" = 'installments' AND "sales"."installments" BETWEEN 2 AND 24)
          ))
        ))
        OR ("sales"."payment_method" = 'credit'
          AND "sales"."card_type" IS NULL
          AND "sales"."payment_condition" = 'installments'
          AND "sales"."installments" BETWEEN 1 AND 24)
      ));--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_temporal_matrix_check" CHECK ("sales"."created_at" <= "sales"."sold_at"
        AND "sales"."sold_at" <= "sales"."updated_at"
        AND ("sales"."delivered_at" IS NULL OR ("sales"."sold_at" <= "sales"."delivered_at" AND "sales"."delivered_at" <= "sales"."updated_at"))
        AND ("sales"."completed_at" IS NULL OR ("sales"."delivered_at" IS NOT NULL AND "sales"."delivered_at" <= "sales"."completed_at" AND "sales"."completed_at" <= "sales"."updated_at"))
        AND ("sales"."canceled_at" IS NULL OR ("sales"."sold_at" <= "sales"."canceled_at" AND "sales"."canceled_at" <= "sales"."updated_at" AND ("sales"."delivered_at" IS NULL OR "sales"."delivered_at" <= "sales"."canceled_at")))
        AND (
          ("sales"."status" = 'open' AND "sales"."completed_at" IS NULL AND "sales"."canceled_at" IS NULL)
          OR ("sales"."status" = 'completed' AND "sales"."delivered_at" IS NOT NULL AND "sales"."completed_at" IS NOT NULL AND "sales"."canceled_at" IS NULL)
          OR ("sales"."status" = 'canceled' AND "sales"."completed_at" IS NULL AND "sales"."canceled_at" IS NOT NULL)
        ));