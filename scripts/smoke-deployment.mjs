// Read-only business checks plus login. Never seed/reset a deployed database.
// Supply DEMO_WEB_PASSWORD using a private env file (Node --env-file=...).
import assert from 'node:assert/strict';

const api = process.env.KAFFEIN_SMOKE_API ?? 'https://api-kaffein.congtc145.id.vn';
const admin = process.env.KAFFEIN_SMOKE_ADMIN ?? 'https://admin-kaffein.congtc145.id.vn';
const password = process.env.DEMO_WEB_PASSWORD;
const skipAdmin = process.env.KAFFEIN_SMOKE_SKIP_ADMIN === '1';
assert.ok(password, 'Supply DEMO_WEB_PASSWORD through a private environment file');

async function request(route, token, options = {}) {
  try { return await fetch(`${api}${route}`, {
    ...options,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
    signal: AbortSignal.timeout(20_000),
  }); } catch (cause) {
    throw new Error(`${options.method ?? 'GET'} ${route}: ${cause.message}`, { cause });
  }
}

async function json(route, token) {
  const response = await request(route, token);
  assert.equal(response.status, 200, `GET ${route}`);
  return response.json();
}

async function login(email, role) {
  const response = await request('/api/v1/auth/web/login', undefined, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(response.status, 200, `Login ${role}`);
  const body = await response.json();
  assert.equal(body.role, role);
  assert.equal((await json('/api/v1/auth/me', body.accessToken)).role, role);
  return body.accessToken;
}

assert.deepEqual(await json('/health'), { status: 'ok', database: 'ok' });
assert.ok(Object.keys((await json('/api/docs-json')).paths).length > 0);
const owner = await login('owner@coffeepos.vn', 'OWNER');
const manager = await login('manager.q1@coffeepos.vn', 'STORE_MANAGER');
const stores = await json('/api/v1/auth/stores', owner);
const managerStores = await json('/api/v1/auth/stores', manager);
assert.ok(stores.length >= 2, 'Need at least two stores for the scope smoke check');
assert.equal(managerStores.length, 1);
for (const route of [
  '/api/v1/web/products', '/api/v1/ingredients', '/api/v1/web/toppings',
]) {
  const items = await json(route, owner);
  assert.ok(Array.isArray(items) && items.length > 0, route);
  console.log(`PASS ${route}: ${items.length}`);
}
await json('/api/v1/reports/dashboard', owner);
for (const token of [owner, manager]) {
  const receipts = await json('/api/v1/payments/online/cancelled-receipts', token);
  assert.ok(Number.isInteger(receipts.total) && receipts.total >= 0);
  assert.ok(Array.isArray(receipts.items) && receipts.items.length <= 100);
  if (token === manager) {
    assert.ok(receipts.items.every((item) => item.storeId === managerStores[0].id));
  }
}
assert.equal((await request('/api/v1/payments/online/cancelled-receipts')).status, 401);
const homeStore = managerStores[0].id;
const foreignStore = stores.find((store) => store.id !== homeStore)?.id;
assert.ok(foreignStore, 'Need a second demo store');
await json(`/api/v1/stores/${homeStore}/stock-balances`, manager);
assert.equal((await request(`/api/v1/stores/${foreignStore}/stock-balances`, manager)).status, 403);
assert.equal((await request('/api/v1/auth/stores')).status, 401);
for (const origin of [admin, 'https://untrusted.example']) {
  const response = await request('/api/v1/auth/web/login', undefined, {
    method: 'OPTIONS',
    headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' },
  });
  assert.equal(response.headers.get('access-control-allow-origin'), origin === admin ? admin : null);
}
for (const route of skipAdmin ? [] : ['/', '/login', '/inventory', '/menu']) {
  const response = await fetch(`${admin}${route}`, { signal: AbortSignal.timeout(20_000) });
  assert.equal(response.status, 200, `Admin ${route}`);
  assert.ok((await response.text()).includes('id="root"'), `SPA fallback ${route}`);
}
if (!skipAdmin && process.env.KAFFEIN_SMOKE_WEB_HOSTING === 'ecs-alb') {
  const response=await fetch(admin,{signal:AbortSignal.timeout(20_000)});
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal(response.headers.get('x-frame-options'),'DENY');
  const html=await response.text();
  const asset=html.match(/src="(\/assets\/[^\"]+\.js)"/)[1];
  const js=await fetch(admin+asset,{signal:AbortSignal.timeout(20_000)});
  assert.equal(js.status,200);assert.match(js.headers.get('content-type'),/javascript/);
  assert.match(js.headers.get('cache-control'),/immutable/);
  assert.ok((await js.text()).includes(`${api}/api/v1`),'Web bundle must call the AWS API');
  for(const route of ['/assets/missing-smoke.js','/.env','/api/v1/auth/me'])
    assert.equal((await fetch(admin+route,{signal:AbortSignal.timeout(20_000)})).status,404,route);
  const redirect=await fetch(admin.replace('https:','http:'),{redirect:'manual',signal:AbortSignal.timeout(20_000)});
  assert.equal(redirect.status,301);assert.ok(redirect.headers.get('location').startsWith(admin));
  console.log('PASS Web HTTPS, redirect, cache/security headers, assets and AWS API bundle.');
}
console.log('PASS health, OpenAPI, Owner/Manager login, store scope, dashboard, cancelled QR receipts, stock, 401/403 and CORS.');
console.log(skipAdmin ? 'SKIP Admin routes: API-only smoke requested.' : 'PASS Admin routes and SPA fallback.');
