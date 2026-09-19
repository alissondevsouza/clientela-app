ALTER TABLE "receivables" DROP CONSTRAINT "receivables_temporal_matrix_check";--> statement-breakpoint
ALTER TABLE "sales" DROP CONSTRAINT "sales_temporal_matrix_check";--> statement-breakpoint
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_temporal_matrix_check" CHECK ("receivables"."created_at" <= "receivables"."updated_at"
        AND ("receivables"."paid_at" IS NULL OR "receivables"."paid_at" <= "receivables"."updated_at")
        AND ("receivables"."voided_at" IS NULL OR ("receivables"."created_at" <= "receivables"."voided_at" AND "receivables"."voided_at" <= "receivables"."updated_at"))
        AND NOT ("receivables"."paid_at" IS NOT NULL AND "receivables"."voided_at" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_temporal_matrix_check" CHECK ("sales"."created_at" <= "sales"."updated_at"
        AND "sales"."sold_at" <= "sales"."updated_at"
        AND ("sales"."delivered_at" IS NULL OR ("sales"."sold_at" <= "sales"."delivered_at" AND "sales"."delivered_at" <= "sales"."updated_at"))
        AND ("sales"."completed_at" IS NULL OR ("sales"."delivered_at" IS NOT NULL AND "sales"."delivered_at" <= "sales"."completed_at" AND "sales"."completed_at" <= "sales"."updated_at"))
        AND ("sales"."canceled_at" IS NULL OR ("sales"."sold_at" <= "sales"."canceled_at" AND "sales"."canceled_at" <= "sales"."updated_at" AND ("sales"."delivered_at" IS NULL OR "sales"."delivered_at" <= "sales"."canceled_at")))
        AND (
          ("sales"."status" = 'open' AND "sales"."completed_at" IS NULL AND "sales"."canceled_at" IS NULL)
          OR ("sales"."status" = 'completed' AND "sales"."delivered_at" IS NOT NULL AND "sales"."completed_at" IS NOT NULL AND "sales"."canceled_at" IS NULL)
          OR ("sales"."status" = 'canceled' AND "sales"."completed_at" IS NULL AND "sales"."canceled_at" IS NOT NULL)
        ));