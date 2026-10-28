import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';

const migrationRoot = resolve(__dirname, '../prisma/migrations');
const migrationName = '20261023040000_unique_owner_employee_codes';
// The test owns a rollback transaction; production migration owns BEGIN/COMMIT.
const correction = readFileSync(
  resolve(migrationRoot, migrationName, 'migration.sql'),
  'utf8',
)
  .replace(/^BEGIN;\r?$/gm, '')
  .replace(/^COMMIT;\r?$/gm, '');

describe('employee code correction against the legacy schema', () => {
  let db: Client;
  beforeAll(async () => {
    db = new Client({ connectionString: process.env.DATABASE_URL });
    await db.connect();
  });
  beforeEach(async () => {
    await db.query('BEGIN');
    const schema = `codes_${randomUUID().replaceAll('-', '')}`;
    await db.query(
      `CREATE SCHEMA ${schema}; SET LOCAL search_path TO ${schema}`,
    );
    for (const name of readdirSync(migrationRoot)
      .filter((n) => n < migrationName)
      .sort()) {
      await db.query(
        readFileSync(resolve(migrationRoot, name, 'migration.sql'), 'utf8'),
      );
    }
    await db.query(`INSERT INTO stores(code,name,address,updated_at) VALUES ('S1','Test','Test',now());
      INSERT INTO users(full_name,role,home_store_id,updated_at) VALUES
        ('Owner','OWNER',NULL,now()), ('Manager Q1','STORE_MANAGER',1,now()),
        ('Cashier','EMPLOYEE',1,now()), ('Manager Q2','STORE_MANAGER',1,now());
      INSERT INTO web_credentials(user_id,email,password_hash) VALUES (1,'owner@example.test','unchanged');
      INSERT INTO employee_pin_credentials(user_id,pin_hash) VALUES (3,'unchanged-pin');`);
  });
  afterEach(async () => {
    await db.query('ROLLBACK');
  });
  afterAll(async () => {
    await db?.end();
  });

  it('repairs legacy codes, preserves identities/credentials, audits and publishes delta changes', async () => {
    await db.query(correction);
    expect(
      (
        await db.query(
          'SELECT id::text,employee_code::text FROM users ORDER BY id',
        )
      ).rows,
    ).toEqual([
      { id: '1', employee_code: '1000001' },
      { id: '2', employee_code: '1000701' },
      { id: '3', employee_code: '1000702' },
      { id: '4', employee_code: '1000703' },
    ]);
    expect(
      (await db.query('SELECT password_hash FROM web_credentials')).rows[0]
        .password_hash,
    ).toBe('unchanged');
    expect(
      (await db.query('SELECT pin_hash FROM employee_pin_credentials')).rows[0]
        .pin_hash,
    ).toBe('unchanged-pin');
    expect(
      (
        await db.query(
          "SELECT count(*)::int AS count FROM audit_logs WHERE action='EMPLOYEE_CODE_REASSIGNED'",
        )
      ).rows[0].count,
    ).toBe(4);
    const changes = (
      await db.query(
        "SELECT payload FROM sync_changes WHERE entity_type='employees' ORDER BY entity_id",
      )
    ).rows;
    expect(changes.map((c) => c.payload.employeeCode)).toEqual([
      '1000701',
      '1000702',
      '1000703',
    ]);
    expect(JSON.stringify(changes)).not.toContain('pinHash');
    const next =
      await db.query(`INSERT INTO users(full_name,role,home_store_id,updated_at)
      VALUES ('Next','EMPLOYEE',1,now()) RETURNING employee_code::text`);
    expect(next.rows[0].employee_code).toBe('1000704');
    await db.query('SAVEPOINT immutable_code');
    await expect(
      db.query('UPDATE users SET employee_code=1000800 WHERE id=2'),
    ).rejects.toThrow('employee_code is immutable');
    await db.query('ROLLBACK TO immutable_code');
    await expect(
      db.query(
        "INSERT INTO users(full_name,role,updated_at) VALUES ('Duplicate Owner','OWNER',now())",
      ),
    ).rejects.toMatchObject({
      code: '23505',
      constraint: 'users_employee_code_key',
    });
  });

  it('keeps high codes and never reuses sequence values consumed before correction', async () => {
    await db.query(
      "ALTER SEQUENCE employee_code_seq RESTART WITH 1000800; UPDATE users SET full_name='Existing staff' WHERE id=4;",
    );
    await db.query(`INSERT INTO users(full_name,role,home_store_id,updated_at) VALUES ('High code','EMPLOYEE',1,now());
      ALTER SEQUENCE employee_code_seq RESTART WITH 1000900; SELECT nextval('employee_code_seq');`);
    await db.query(correction);
    expect(
      (await db.query('SELECT employee_code::text FROM users WHERE id=5'))
        .rows[0].employee_code,
    ).toBe('1000800');
    expect(
      (await db.query('SELECT employee_code::text FROM users WHERE id=2'))
        .rows[0].employee_code,
    ).toBe('1000901');
    expect(
      (await db.query("SELECT nextval('employee_code_seq')::text AS code"))
        .rows[0].code,
    ).toBe('1000904');
  });

  it('refuses ambiguous multiple Owners before changing any identities', async () => {
    await db.query(
      "INSERT INTO users(full_name,role,updated_at) VALUES ('Second Owner','OWNER',now()); SAVEPOINT correction;",
    );
    await expect(db.query(correction)).rejects.toThrow(
      'requires at most one Owner',
    );
    await db.query('ROLLBACK TO correction');
    expect(
      (
        await db.query(
          'SELECT count(*)::int AS count FROM users WHERE employee_code IS NULL',
        )
      ).rows[0].count,
    ).toBe(2);
    expect(
      (await db.query('SELECT last_value::text FROM employee_code_seq')).rows[0]
        .last_value,
    ).toBe('1000003');
  });

  it('refuses correction while an active POS reports an unsynchronized outbox', async () => {
    await db.query(
      `INSERT INTO devices (id,store_id,display_name,credential_hash,has_pending_outbox,updated_at)
      VALUES ($1,1,'POS','test-only',true,now())`,
      [randomUUID()],
    );
    await db.query('SAVEPOINT correction');
    await expect(db.query(correction)).rejects.toThrow(
      'outboxes to be synchronized',
    );
    await db.query('ROLLBACK TO correction');
    expect(
      (await db.query('SELECT employee_code::text FROM users WHERE id=2'))
        .rows[0].employee_code,
    ).toBe('1000001');
  });

  it('rolls back code changes and trigger/constraints if the available range is exhausted', async () => {
    await db.query(
      "ALTER SEQUENCE employee_code_seq RESTART WITH 9999999; SELECT nextval('employee_code_seq'); SAVEPOINT correction;",
    );
    await expect(db.query(correction)).rejects.toThrow();
    await db.query('ROLLBACK TO correction');
    expect(
      (await db.query('SELECT employee_code::text FROM users WHERE id=2'))
        .rows[0].employee_code,
    ).toBe('1000001');
    expect(
      (await db.query('SELECT employee_code FROM users WHERE id=1')).rows[0]
        .employee_code,
    ).toBeNull();
    expect(
      (
        await db.query(
          "SELECT tgenabled FROM pg_trigger WHERE tgrelid='users'::regclass AND tgname='users_assign_employee_code'",
        )
      ).rows[0].tgenabled,
    ).toBe('O');
    expect(
      (await db.query('SELECT last_value::text FROM employee_code_seq')).rows[0]
        .last_value,
    ).toBe('9999999');
  });
});
