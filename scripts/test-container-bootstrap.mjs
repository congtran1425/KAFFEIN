import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
const bootstrap = new URL(
  "../apps/api/container-bootstrap.cjs",
  import.meta.url,
);
function run(env, code) {
  return spawnSync(
    process.execPath,
    [
      bootstrap.pathname.replace(/^\/([A-Z]:)/, "$1"),
      process.execPath,
      "-e",
      code,
    ],
    {
      encoding: "utf8",
      env: { ...process.env, DATABASE_URL: "", DB_HOST: "", ...env },
    },
  );
}
test("RDS URL encodes credentials and validates TLS with AWS CA", () => {
  const r = run(
    {
      DB_HOST: "demo.rds.amazonaws.com",
      DB_USER: "test%@user",
      DB_PASSWORD: "synthetic%:/?#@+",
      DB_NAME: "kaffein_pos",
      DB_SSL_ROOT_CERT: "/app/rds.pem",
    },
    `
    const assert=require('node:assert/strict');const u=new URL(process.env.DATABASE_URL);
    assert.equal(decodeURIComponent(u.password),'synthetic%:/?#@+');
    assert.equal(decodeURIComponent(u.username),'test%@user');
    assert.equal(u.searchParams.get('sslmode'),'verify-full');
    assert.equal(u.searchParams.get('sslrootcert'),'/app/rds.pem');
  `,
  );
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, "");
});
test("existing injected URL remains unchanged for OCI/local compatibility", () => {
  const r = run(
    { DATABASE_URL: "postgresql://local:synthetic@db/coffee_pos" },
    `require('node:assert/strict').equal(process.env.DATABASE_URL,'postgresql://local:synthetic@db/coffee_pos')`,
  );
  assert.equal(r.status, 0, r.stderr);
});
test("missing DB credentials fail closed without printing password", () => {
  const r = run(
    {
      DB_HOST: "demo.rds.amazonaws.com",
      DB_PASSWORD: "private-synthetic-value",
    },
    "",
  );
  assert.notEqual(r.status, 0);
  assert.ok(!r.stderr.includes("private-synthetic-value"));
});
