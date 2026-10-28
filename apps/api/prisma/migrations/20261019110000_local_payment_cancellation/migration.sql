ALTER TABLE payments ADD COLUMN cancelled_at TIMESTAMPTZ(3);
ALTER TABLE payments ADD COLUMN provider_finalized_at TIMESTAMPTZ(3);
ALTER TABLE payments DROP CONSTRAINT payments_status_check;
ALTER TABLE payments ADD CONSTRAINT payments_status_check
  CHECK (status IN ('PENDING', 'PAID', 'FAILED', 'EXPIRED', 'CANCELLED'));
ALTER TABLE sales DROP CONSTRAINT sales_status_check;
ALTER TABLE sales ADD CONSTRAINT sales_status_check
  CHECK (status IN ('PAYMENT_PENDING', 'PAID', 'EXPIRED', 'CANCELLED'));
CREATE INDEX payments_cancelled_watch_idx ON payments (last_queried_at)
  WHERE method = 'MOMO' AND status = 'CANCELLED' AND provider_finalized_at IS NULL;
