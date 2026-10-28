// ECS injects RDS secret fields separately. Never log the resulting URL.
const { spawn } = require('node:child_process');
if (!process.env.DATABASE_URL && process.env.DB_HOST) {
  for (const key of ['DB_USER', 'DB_PASSWORD', 'DB_NAME', 'DB_SSL_ROOT_CERT']) {
    if (!process.env[key])
      throw new Error(`Missing deployment setting: ${key}`);
  }
  const url = new URL(
    `postgresql://${process.env.DB_HOST}:${process.env.DB_PORT || '5432'}`,
  );
  url.username = encodeURIComponent(process.env.DB_USER);
  url.password = encodeURIComponent(process.env.DB_PASSWORD);
  url.pathname = `/${process.env.DB_NAME}`;
  url.searchParams.set('sslmode', 'verify-full');
  url.searchParams.set('sslrootcert', process.env.DB_SSL_ROOT_CERT);
  process.env.DATABASE_URL = url.toString();
}
const args = process.argv.slice(2);
if (!args.length) args.push('node', 'dist/main');
const child = spawn(args[0], args.slice(1), {
  stdio: 'inherit',
  env: process.env,
});
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => child.kill(signal));
child.on('error', () => {
  console.error('Unable to start container command');
  process.exit(1);
});
child.on('exit', (code) => process.exit(code ?? 1));
