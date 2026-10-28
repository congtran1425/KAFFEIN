// Read-only RDS inspection through the existing private-network tooling task.
// No DB credentials leave ECS. Evidence stays in recovery/private/.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { projectEnvironment } from './project-environment.mjs';

const env = projectEnvironment();
function aws(args) {
  return JSON.parse(execFileSync('aws', [...args, '--region', 'ap-southeast-1', '--output', 'json', '--no-cli-pager'],
    { env, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }));
}
assert.equal(aws(['sts', 'get-caller-identity']).Account, '634393786371');
const stack = aws(['cloudformation', 'describe-stacks', '--stack-name', 'KaffeinStack']).Stacks[0];
const out = Object.fromEntries(stack.Outputs.map(o => [o.OutputKey, o.OutputValue]));
assert.equal(out.ClusterName, 'kaffein-cluster');
const source = `
const assert = require('node:assert/strict');
const { Client } = require('pg');
(async () => {
  assert.equal(process.env.DB_NAME, 'kaffein_pos');
  assert.equal(process.env.DB_HOST, ${JSON.stringify(out.RdsEndpointAddress)});
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const users = (await client.query('SELECT u.id::text, u.full_name, u.role, u.home_store_id::text, u.employee_code::text, u.status, w.email FROM users u LEFT JOIN web_credentials w ON w.user_id=u.id ORDER BY u.id')).rows;
    const sequence = (await client.query('SELECT last_value::text, is_called FROM employee_code_seq')).rows;
    const constraints = (await client.query("SELECT conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='users'::regclass ORDER BY conname")).rows;
    const preserved = (await client.query("SELECT (SELECT count(*)::text FROM sales) AS sales, (SELECT count(*)::text FROM attendance_records) AS attendances, (SELECT count(*)::text FROM payments) AS payments, (SELECT count(*)::text FROM cashier_sessions) AS cashier_sessions, (SELECT count(*)::text FROM stock_movements) AS stock_movements, (SELECT count(*)::text FROM devices) AS devices, (SELECT md5(coalesce(string_agg((to_jsonb(w)-'failed_attempts'-'locked_until')::text, ',' ORDER BY user_id), '')) FROM web_credentials w) AS web_credentials_digest, (SELECT md5(coalesce(string_agg(to_jsonb(p)::text, ',' ORDER BY user_id), '')) FROM employee_pin_credentials p) AS pins_digest, (SELECT md5(coalesce(string_agg((to_jsonb(d)-'last_synced_at'-'last_heartbeat_at'-'updated_at')::text, ',' ORDER BY id), '')) FROM devices d) AS enrollment_digest")).rows[0];
    const changes = (await client.query("SELECT cursor::text, store_id::text, entity_type, entity_id, payload FROM sync_changes WHERE entity_type='employees' ORDER BY cursor DESC LIMIT 30")).rows;
    const audits = (await client.query("SELECT entity_id, metadata FROM audit_logs WHERE action='EMPLOYEE_CODE_REASSIGNED' ORDER BY id")).rows;
    const migrations = (await client.query('SELECT migration_name, finished_at IS NOT NULL AS finished FROM _prisma_migrations ORDER BY started_at')).rows;
    await client.query('COMMIT');
    console.log('EMPLOYEE_INSPECTION:' + JSON.stringify({ users, sequence, constraints, preserved, changes, audits, migrations }));
  } finally { await client.end(); }
})().catch(error => { console.error(error.message); process.exitCode=1; });
`;
const result = aws(['ecs', 'run-task', '--cluster', out.ClusterName, '--task-definition', out.MigrationTaskArn,
  '--launch-type', 'FARGATE', '--started-by', 'kaffein-employee-inspect', '--network-configuration', JSON.stringify({
    awsvpcConfiguration: { subnets: out.PublicSubnets.split(','), securityGroups: [out.TaskSecurityGroup], assignPublicIp: 'ENABLED' },
  }), '--overrides', JSON.stringify({ containerOverrides: [{ name: 'Migration', command: ['node', '-e', source] }] })]);
assert.equal(result.failures?.length ?? 0, 0);
const taskArn = result.tasks[0].taskArn;
console.log(`Inspection task: ${taskArn}`);
for (let i = 0; i < 120; i++) {
  const task = aws(['ecs', 'describe-tasks', '--cluster', out.ClusterName, '--tasks', taskArn]).tasks[0];
  if (task.lastStatus === 'STOPPED') {
    const stream = `migration/Migration/${taskArn.split('/').at(-1)}`;
    let events;
    for (let attempt = 0; attempt < 6; attempt++) {
      try { events = aws(['logs', 'get-log-events', '--log-group-name', '/ecs/kaffein-api', '--log-stream-name', stream]).events; }
      catch { events = []; }
      if (events.some(e => e.message.startsWith('EMPLOYEE_INSPECTION:'))) break;
      await new Promise(r => setTimeout(r, 2000));
    }
    assert.equal(task.containers[0].exitCode, 0, `Inspection failed: ${events.map(e => e.message).join('\n')}`);
    const line = events.find(e => e.message.startsWith('EMPLOYEE_INSPECTION:'));
    assert.ok(line, 'Inspection result missing');
    const evidence = { at: new Date().toISOString(), taskArn, ...JSON.parse(line.message.slice('EMPLOYEE_INSPECTION:'.length)) };
    const dir = join(env.KAFFEIN_ARTIFACTS_DIR, 'employee-codes-20261023');
    mkdirSync(dir, { recursive: true });
    const path = join(dir, `rds-${Date.now()}.json`);
    writeFileSync(path, JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify({ path, users: evidence.users, sequence: evidence.sequence, preserved: evidence.preserved, migrations: evidence.migrations.length }));
    process.exit(0);
  }
  if (i % 6 === 0) console.log(`Inspection: ${task.lastStatus}`);
  await new Promise(r => setTimeout(r, 5000));
}
throw new Error('Task timed out; inspect the existing task before retrying.');
