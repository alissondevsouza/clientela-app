-- Custom SQL migration file, put your code below! --
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM sales
    WHERE sold_at < created_at
  ) THEN RAISE EXCEPTION 'CRM-12 backfill: sales.sold_at precede sales.created_at'; END IF;

  IF EXISTS (
    SELECT 1 FROM sales
    WHERE updated_at < created_at
  ) THEN RAISE EXCEPTION 'CRM-12 backfill: sales.updated_at precede sales.created_at'; END IF;

  IF EXISTS (
    SELECT 1 FROM sales
    WHERE updated_at < sold_at
  ) THEN RAISE EXCEPTION 'CRM-12 backfill: sales.updated_at precede sales.sold_at'; END IF;

  IF EXISTS (
    SELECT 1 FROM receivables r
    JOIN sales s ON s.id = r.sale_id
    WHERE r.created_at < s.created_at
  ) THEN RAISE EXCEPTION 'CRM-12 backfill: receivables.created_at precede sales.created_at'; END IF;

  IF EXISTS (
    SELECT 1 FROM receivables r
    JOIN sales s ON s.id = r.sale_id
    WHERE r.created_at < s.sold_at
  ) THEN RAISE EXCEPTION 'CRM-12 backfill: receivables.created_at precede sales.sold_at'; END IF;

  IF EXISTS (
    SELECT 1 FROM receivables
    WHERE updated_at < created_at
  ) THEN RAISE EXCEPTION 'CRM-12 backfill: receivables.updated_at precede receivables.created_at'; END IF;

  IF EXISTS (
    SELECT 1 FROM receivables r
    JOIN sales s ON s.id = r.sale_id
    WHERE r.paid_at < s.sold_at
  ) THEN RAISE EXCEPTION 'CRM-12 backfill: receivables.paid_at precede sales.sold_at'; END IF;

  IF EXISTS (
    SELECT 1 FROM receivables
    WHERE paid_at < created_at
  ) THEN RAISE EXCEPTION 'CRM-12 backfill: receivables.paid_at precede receivables.created_at'; END IF;

  IF EXISTS (
    SELECT 1 FROM receivables
    WHERE paid_at > updated_at
  ) THEN RAISE EXCEPTION 'CRM-12 backfill: receivables.paid_at exceeds receivables.updated_at'; END IF;

  IF EXISTS (
    SELECT 1
    FROM sales s
    JOIN receivables r ON r.sale_id = s.id
    WHERE s.status = 'canceled' AND r.paid_at IS NOT NULL
  ) THEN RAISE EXCEPTION 'CRM-12 backfill: canceled sale has paid receivable'; END IF;

  IF EXISTS (
    SELECT 1
    FROM sales s
    WHERE (
      s.payment_method IN ('cash', 'pix', 'card')
      OR s.status = 'canceled'
      OR s.total_cents = 0
    ) AND EXISTS (SELECT 1 FROM receivables r WHERE r.sale_id = s.id)
  ) THEN RAISE EXCEPTION 'CRM-12 backfill: unexpected receivable for legacy sale class'; END IF;

  IF EXISTS (
    SELECT 1
    FROM sales s
    LEFT JOIN receivables r ON r.sale_id = s.id
    WHERE s.status = 'completed'
      AND s.payment_method = 'credit'
      AND s.total_cents > 0
    GROUP BY s.id, s.total_cents
    HAVING COUNT(r.id) NOT BETWEEN 1 AND 24
      OR COALESCE(SUM(r.amount_cents), 0) <> s.total_cents
  ) THEN RAISE EXCEPTION 'CRM-12 backfill: legacy credit installments are unreconcilable'; END IF;
END $$;
--> statement-breakpoint

UPDATE sales s
SET
  payment_condition = CASE
    WHEN s.payment_method = 'credit' THEN 'installments'
    ELSE 'received'
  END,
  card_type = NULL,
  installments = CASE
    WHEN s.payment_method = 'credit'
      AND s.status = 'completed'
      AND s.total_cents > 0
      THEN (SELECT COUNT(*)::integer FROM receivables r WHERE r.sale_id = s.id)
    ELSE 1
  END,
  payment_plan_known = NOT (
    s.payment_method = 'credit'
    AND (s.status = 'canceled' OR s.total_cents = 0)
  ),
  status = CASE
    WHEN s.payment_method = 'credit'
      AND s.status = 'completed'
      AND s.total_cents > 0
      AND EXISTS (
        SELECT 1 FROM receivables r
        WHERE r.sale_id = s.id AND r.paid_at IS NULL
      ) THEN 'open'
    ELSE s.status
  END,
  delivered_at = s.sold_at,
  completed_at = CASE
    WHEN s.status = 'completed'
      AND s.payment_method = 'credit'
      AND s.total_cents > 0
      AND EXISTS (
        SELECT 1 FROM receivables r
        WHERE r.sale_id = s.id AND r.paid_at IS NULL
      ) THEN NULL
    WHEN s.status = 'completed'
      AND s.payment_method = 'credit'
      AND s.total_cents > 0
      THEN (SELECT GREATEST(s.sold_at, MAX(r.paid_at)) FROM receivables r WHERE r.sale_id = s.id)
    WHEN s.status = 'completed' THEN s.sold_at
    ELSE NULL
  END,
  canceled_at = CASE WHEN s.status = 'canceled' THEN s.updated_at ELSE NULL END,
  updated_at = CASE
    WHEN s.status = 'completed'
      AND s.payment_method = 'credit'
      AND s.total_cents > 0
      THEN GREATEST(s.updated_at, (SELECT MAX(r.paid_at) FROM receivables r WHERE r.sale_id = s.id), s.sold_at)
    ELSE s.updated_at
  END;
--> statement-breakpoint

UPDATE receivables r
SET due_kind = 'scheduled', voided_at = NULL
FROM sales s
WHERE s.id = r.sale_id
  AND s.payment_method = 'credit'
  AND s.status <> 'canceled'
  AND s.total_cents > 0;
--> statement-breakpoint

INSERT INTO receivables (
  sale_id, amount_cents, due_date, due_kind, paid_at, voided_at, created_at, updated_at
)
SELECT
  s.id,
  s.total_cents,
  (s.sold_at AT TIME ZONE 'America/Sao_Paulo')::date,
  'scheduled',
  CASE WHEN s.status = 'completed' THEN s.sold_at ELSE NULL END,
  CASE WHEN s.status = 'canceled' THEN s.canceled_at ELSE NULL END,
  s.sold_at,
  CASE WHEN s.status = 'canceled' THEN s.canceled_at ELSE s.sold_at END
FROM sales s
WHERE s.payment_method IN ('cash', 'pix', 'card')
  AND s.total_cents > 0;
--> statement-breakpoint

INSERT INTO receivables (
  sale_id, amount_cents, due_date, due_kind, paid_at, voided_at, created_at, updated_at
)
SELECT
  s.id, s.total_cents, NULL, 'unknown', NULL, s.canceled_at, s.sold_at, s.canceled_at
FROM sales s
WHERE s.payment_method = 'credit'
  AND s.status = 'canceled'
  AND s.total_cents > 0;
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM sales
    WHERE payment_condition IS NULL
      OR installments IS NULL
      OR payment_plan_known IS NULL
      OR delivered_at IS NULL
      OR (status = 'open' AND (completed_at IS NOT NULL OR canceled_at IS NOT NULL))
      OR (status = 'completed' AND (completed_at IS NULL OR canceled_at IS NOT NULL))
      OR (status = 'canceled' AND (completed_at IS NOT NULL OR canceled_at IS NULL))
      OR delivered_at < sold_at
      OR delivered_at > updated_at
      OR completed_at < delivered_at
      OR completed_at > updated_at
      OR canceled_at < sold_at
      OR canceled_at > updated_at
      OR (delivered_at IS NOT NULL AND canceled_at IS NOT NULL AND canceled_at < delivered_at)
  ) THEN RAISE EXCEPTION 'CRM-12 backfill: sales temporal matrix postcondition failed'; END IF;

  IF EXISTS (
    SELECT 1
    FROM receivables r
    JOIN sales s ON s.id = r.sale_id
    WHERE r.due_kind IS NULL
      OR (r.due_kind = 'scheduled' AND r.due_date IS NULL)
      OR (r.due_kind IN ('unknown', 'on_delivery') AND r.due_date IS NOT NULL)
      OR r.updated_at < r.created_at
      OR r.paid_at < r.created_at
      OR r.paid_at > r.updated_at
      OR r.voided_at < r.created_at
      OR r.voided_at > r.updated_at
      OR (r.paid_at IS NOT NULL AND r.voided_at IS NOT NULL)
      OR r.created_at < s.sold_at
      OR r.paid_at < s.sold_at
      OR r.voided_at < s.sold_at
  ) THEN RAISE EXCEPTION 'CRM-12 backfill: receivables temporal matrix postcondition failed'; END IF;

  IF EXISTS (
    SELECT 1
    FROM sales s
    LEFT JOIN receivables r ON r.sale_id = s.id
    GROUP BY s.id, s.payment_method, s.status, s.total_cents, s.installments, s.payment_plan_known
    HAVING
      (s.payment_method IN ('cash', 'pix', 'card') AND s.total_cents > 0 AND COUNT(r.id) <> 1)
      OR (s.payment_method IN ('cash', 'pix', 'card') AND s.total_cents = 0 AND COUNT(r.id) <> 0)
      OR (s.payment_method = 'credit' AND s.status = 'open' AND s.total_cents > 0 AND COUNT(r.id) <> s.installments)
      OR (s.payment_method = 'credit' AND s.status = 'completed' AND s.total_cents > 0 AND COUNT(r.id) <> s.installments)
      OR (s.payment_method = 'credit' AND s.status = 'canceled' AND s.total_cents > 0 AND COUNT(r.id) <> 1)
      OR (s.payment_method = 'credit' AND s.total_cents = 0 AND COUNT(r.id) <> 0)
  ) THEN RAISE EXCEPTION 'CRM-12 backfill: receivable cardinality postcondition failed'; END IF;
END $$;
