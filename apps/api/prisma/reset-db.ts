// Kept as a fail-closed stub because an earlier local reset erased device and
// demo history. There is deliberately no database connection or truncate path.
throw new Error(
  'Database reset is disabled. Preserve demo data; use a reviewed backup/restore procedure if needed.',
);
