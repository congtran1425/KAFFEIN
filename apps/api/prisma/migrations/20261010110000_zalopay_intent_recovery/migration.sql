-- Additive only: preserve existing payments/sales and their history.
ALTER TABLE payments
  ADD COLUMN checkout_request_hash TEXT,
  ADD COLUMN provider_order_json JSONB,
  ADD COLUMN create_requested_at TIMESTAMPTZ(3),
  ADD COLUMN last_queried_at TIMESTAMPTZ(3),
  ADD COLUMN provider_confirmed_at TIMESTAMPTZ(3);
