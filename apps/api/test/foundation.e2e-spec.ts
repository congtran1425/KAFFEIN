import { randomUUID } from 'node:crypto';
import { Client } from 'pg';

type IdRow = { id: string };
type CodeRow = { employee_code: string | null };

describe('foundation PostgreSQL constraints (integration)', () => {
  let client: Client;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for integration tests');
    }
    client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
  });

  beforeEach(async () => {
    await client.query('BEGIN');
  });

  afterEach(async () => {
    if (client) await client.query('ROLLBACK');
  });

  afterAll(async () => {
    await client?.end();
  });

  async function addStore(): Promise<string> {
    const result = await client.query<IdRow>(
      `INSERT INTO stores (code, name, address, updated_at)
       VALUES ($1, 'Test store', 'Test address', now()) RETURNING id`,
      [`TEST-${randomUUID()}`],
    );
    return result.rows[0].id;
  }

  async function addOwner(): Promise<string> {
    const result = await client.query<IdRow>(
      `INSERT INTO users (full_name, role, updated_at)
       VALUES ($1, 'OWNER', now())
       ON CONFLICT (employee_code) DO UPDATE SET full_name = users.full_name RETURNING id`,
      [`TEST Owner ${randomUUID()}`],
    );
    return result.rows[0].id;
  }

  it('reserves 1000001 for Owner and allocates staff codes from 1000701', async () => {
    const storeId = await addStore();
    const owner = await client.query<CodeRow>(
      `INSERT INTO users (full_name, role, updated_at)
       VALUES ('Test Owner', 'OWNER', now())
       ON CONFLICT (employee_code) DO UPDATE SET full_name = users.full_name RETURNING employee_code`,
    );
    const first = await client.query<CodeRow>(
      `INSERT INTO users (full_name, role, home_store_id, updated_at)
       VALUES ('Test SM', 'STORE_MANAGER', $1, now()) RETURNING employee_code`,
      [storeId],
    );
    const second = await client.query<CodeRow>(
      `INSERT INTO users (full_name, role, home_store_id, updated_at)
       VALUES ('Test employee', 'EMPLOYEE', $1, now()) RETURNING employee_code`,
      [storeId],
    );

    expect(owner.rows[0].employee_code).toBe('1000001');
    expect(first.rows[0].employee_code).toMatch(/^\d{7}$/);
    expect(BigInt(first.rows[0].employee_code!)).toBeGreaterThanOrEqual(
      1000701n,
    );
    expect(BigInt(second.rows[0].employee_code!)).toBe(
      BigInt(first.rows[0].employee_code!) + 1n,
    );
  });

  it('rejects a non-Owner without a home store', async () => {
    await expect(
      client.query(
        `INSERT INTO users (full_name, role, updated_at)
         VALUES ('No store', 'EMPLOYEE', now())`,
      ),
    ).rejects.toMatchObject({
      code: '23514',
      constraint: 'users_role_home_store_check',
    });
  });

  it('rejects a second ACTIVE POS at the same store', async () => {
    const storeId = await addStore();
    const insert = `INSERT INTO devices
      (id, store_id, display_name, status, credential_hash, updated_at)
      VALUES ($1, $2, 'Test POS', 'ACTIVE', 'test-only', now())`;

    await client.query(insert, [randomUUID(), storeId]);
    await expect(
      client.query(insert, [randomUUID(), storeId]),
    ).rejects.toMatchObject({
      code: '23505',
      constraint: 'devices_one_active_per_store_idx',
    });
  });

  it('keeps web emails unique regardless of letter case', async () => {
    const firstOwner = await addOwner();
    const storeId = await addStore();
    const secondUser = await client.query<IdRow>(
      `INSERT INTO users (full_name, role, home_store_id, updated_at)
       VALUES ('Test manager', 'STORE_MANAGER', $1, now()) RETURNING id`,
      [storeId],
    );
    await client.query(
      `INSERT INTO web_credentials (user_id, email, password_hash)
       VALUES ($1, 'owner@example.test', 'test-only')`,
      [firstOwner],
    );

    await expect(
      client.query(
        `INSERT INTO web_credentials (user_id, email, password_hash)
         VALUES ($1, 'OWNER@example.test', 'test-only')`,
        [secondUser.rows[0].id],
      ),
    ).rejects.toMatchObject({
      code: '23505',
      constraint: 'web_credentials_email_ci_key',
    });
  });
});
