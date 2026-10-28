import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
const configUrl = new URL("../apps/api/prisma.config.ts", import.meta.url).href;
function run(env, assertions) {
  const code = `import assert from 'node:assert/strict'; import value from ${JSON.stringify(configUrl)}; const config=value.default??value; ${assertions}`;
  return spawnSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", code],
    {
      encoding: "utf8",
      env: { ...process.env, DB_HOST: "", DB_SSL_ROOT_CERT: "", ...env },
    },
  );
}
test("migration CLI validates RDS CA using native connector settings", () => {
  const r = run(
    {
      DATABASE_URL:
        "postgresql://test:synthetic@demo.rds.amazonaws.com/kaffein_pos?sslmode=verify-full&sslrootcert=/app/ca.pem",
      DB_HOST: "demo.rds.amazonaws.com",
      DB_SSL_ROOT_CERT: "/app/ca.pem",
    },
    `
    const u=new URL(config.datasource.url);
    assert.equal(u.searchParams.get('sslmode'),'require');
    assert.equal(u.searchParams.get('sslcert'),'/app/ca.pem');
    assert.equal(u.searchParams.get('sslaccept'),'strict');
    assert.equal(u.searchParams.has('sslrootcert'),false);
  `,
  );
  assert.equal(r.status, 0, r.stderr);
});
test("local and OCI Prisma URLs remain unchanged", () => {
  const url = "postgresql://local:synthetic@localhost:55435/test_e2e";
  const r = run(
    { DATABASE_URL: url },
    `assert.equal(config.datasource.url,${JSON.stringify(url)});`,
  );
  assert.equal(r.status, 0, r.stderr);
});
test("migration config rejects a mismatched cloud DB host", () => {
  const r = run(
    {
      DATABASE_URL:
        "postgresql://test:synthetic@other.rds.amazonaws.com/kaffein_pos",
      DB_HOST: "demo.rds.amazonaws.com",
      DB_SSL_ROOT_CERT: "/app/ca.pem",
    },
    "",
  );
  assert.notEqual(r.status, 0);
  assert.ok(r.stderr.includes("Migration DB host mismatch"));
});
