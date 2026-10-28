// E2E creates and removes records. Never load the shared root .env implicitly.
// A separate, local *_e2e database and an explicit shell opt-in are required.
if (process.env.POS_E2E_ALLOW_DB_WRITE !== 'YES_I_ACCEPT_DB_MUTATION') {
  throw new Error(
    'E2E disabled: set POS_E2E_ALLOW_DB_WRITE=YES_I_ACCEPT_DB_MUTATION for an isolated local *_e2e database.',
  );
}
const connection = process.env.DATABASE_URL;
if (!connection) throw new Error('E2E requires an explicit DATABASE_URL.');
const databaseUrl = new URL(connection);
const databaseName = decodeURIComponent(databaseUrl.pathname.slice(1));
if (
  !['localhost', '127.0.0.1', '[::1]'].includes(databaseUrl.hostname) ||
  !databaseName.endsWith('_e2e')
) {
  throw new Error('E2E refuses non-local or non-*_e2e databases.');
}
