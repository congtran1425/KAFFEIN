-- Register denomination snapshots existed in Prisma without a replayable SQL migration.
-- Preserve environments where these columns were already added manually.
ALTER TABLE register_sessions
  ADD COLUMN IF NOT EXISTS opening_denominations JSONB,
  ADD COLUMN IF NOT EXISTS closing_denominations JSONB;
