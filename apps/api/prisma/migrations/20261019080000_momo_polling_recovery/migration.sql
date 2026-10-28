-- Additive recovery metadata. Existing attempts keep their identities and evidence.
ALTER TABLE payments
  ADD COLUMN provider_create_request_json JSONB,
  ADD COLUMN create_lease_until TIMESTAMPTZ(3),
  ADD COLUMN create_attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE payments ADD CONSTRAINT payments_create_attempt_count_check
  CHECK (create_attempt_count >= 0);
