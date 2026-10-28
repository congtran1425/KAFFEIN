import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';
import { resolve } from 'node:path';

// npm workspaces runs Prisma with apps/api as cwd. Production supplies the URL
// through the environment; the repository-level .env is for local development.
config({ path: resolve(import.meta.dirname, '../../.env'), quiet: true });

// Migrate's schema engine uses sslcert/sslaccept, whereas the runtime pg adapter
// uses sslrootcert/verify-full. Both must validate the RDS CA; never use no-verify.
function cliDatabaseUrl(): string {
  const value = process.env.DATABASE_URL ?? '';
  if (!value || !process.env.DB_HOST || !process.env.DB_SSL_ROOT_CERT)
    return value;
  const url = new URL(value);
  if (url.hostname !== process.env.DB_HOST)
    throw new Error('Migration DB host mismatch');
  url.searchParams.delete('sslrootcert');
  url.searchParams.set('sslmode', 'require');
  url.searchParams.set('sslcert', process.env.DB_SSL_ROOT_CERT);
  url.searchParams.set('sslaccept', 'strict');
  return url.toString();
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'node --import tsx prisma/seed-master-catalog.ts',
  },
  datasource: {
    url: cliDatabaseUrl(),
  },
});
