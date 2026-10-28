ALTER TABLE register_sessions
  ADD COLUMN compensation_cash_vnd BIGINT,
  ADD COLUMN compensation_denominations JSONB,
  ADD COLUMN compensation_note TEXT,
  ADD COLUMN closing_mode TEXT,
  ADD COLUMN handover_from_session_id UUID;
CREATE UNIQUE INDEX register_sessions_handover_from_session_id_key
  ON register_sessions(handover_from_session_id);
ALTER TABLE register_sessions
  ADD CONSTRAINT register_handover_source_fk FOREIGN KEY (handover_from_session_id)
    REFERENCES register_sessions(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  ADD CONSTRAINT register_closing_mode_check
    CHECK (closing_mode IS NULL OR closing_mode IN ('HANDOVER', 'END_OF_DAY')),
  ADD CONSTRAINT register_compensation_nonnegative_check
    CHECK (compensation_cash_vnd IS NULL OR compensation_cash_vnd >= 0),
  ADD CONSTRAINT register_new_close_compensation_check CHECK (
    closing_mode IS NULL OR status <> 'CLOSED' OR
    (variance_vnd >= 0 AND COALESCE(compensation_cash_vnd, 0) = 0) OR
    (variance_vnd < 0 AND COALESCE(compensation_cash_vnd, 0) >= -variance_vnd)
  );
