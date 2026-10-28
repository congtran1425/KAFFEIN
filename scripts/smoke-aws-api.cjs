// Execute inside the one-off tooling ECS task. Login traffic stays on loopback.
// DEMO_WEB_PASSWORD is injected by ECS Secrets Manager, never in task overrides.
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const server = spawn(process.execPath, ["dist/main"], {
  stdio: ["ignore", "ignore", "inherit"],
});
async function main() {
  const base = "http://127.0.0.1:3000";
  const req = (path, token, options = {}) =>
    fetch(base + path, {
      ...options,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
      signal: AbortSignal.timeout(15_000),
    });
  const json = async (path, token) => {
    const r = await req(path, token);
    assert.equal(r.status, 200, path);
    return r.json();
  };
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      assert.deepEqual(await json("/health"), { status: "ok", database: "ok" });
      ready = true;
      break;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  assert.ok(ready, "API must become healthy");
  async function login(email, role) {
    const r = await req("/api/v1/auth/web/login", null, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: process.env.DEMO_WEB_PASSWORD }),
    });
    assert.equal(r.status, 200, `Login ${role}`);
    const user = await r.json();
    assert.equal(user.role, role);
    return user.accessToken;
  }
  const owner = await login("owner@kaffein.vn", "OWNER");
  const manager = await login("manager.q1@kaffein.vn", "STORE_MANAGER");
  const stores = await json("/api/v1/auth/stores", owner);
  const managerStores = await json("/api/v1/auth/stores", manager);
  assert.equal(stores.length, 2);
  assert.equal(managerStores.length, 1);
  for (const [path, count] of [
    ["/api/v1/web/products", 28],
    ["/api/v1/ingredients", 21],
    ["/api/v1/web/toppings", 5],
  ])
    assert.equal((await json(path, owner)).length, count, path);
  await json("/api/v1/reports/dashboard", owner);
  await json("/api/v1/payments/online/cancelled-receipts", manager);
  const home = managerStores[0].id;
  const other = stores.find((s) => s.id !== home).id;
  await json(`/api/v1/stores/${home}/stock-balances`, manager);
  assert.equal(
    (await req(`/api/v1/stores/${other}/stock-balances`, manager)).status,
    403,
  );
  assert.equal((await req("/api/v1/auth/stores")).status, 401);
  for (const origin of [
    "https://admin-aws.congtc145.id.vn",
    "https://untrusted.example",
  ]) {
    const r = await req("/api/v1/auth/web/login", null, {
      method: "OPTIONS",
      headers: { Origin: origin, "Access-Control-Request-Method": "POST" },
    });
    assert.equal(
      r.headers.get("access-control-allow-origin"),
      origin.includes("admin-aws") ? origin : null,
    );
  }
  assert.ok(Object.keys((await json("/api/docs-json")).paths).length > 0);
  console.log(
    "PASS AWS RDS + API: health, Owner/Manager login, menu, dashboard, store scope, stock, 401/403, CORS, OpenAPI.",
  );
}
main().then(
  () => {
    server.kill("SIGTERM");
    process.exitCode = 0;
  },
  () => {
    console.error("AWS API smoke failed; no credentials logged.");
    server.kill("SIGTERM");
    process.exitCode = 1;
  },
);
