// Application releases only. CDK owns the template; CI uses its previous template
// and changes only the three image parameters. No seed, secret value or DB reset.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectEnvironment, projectRoot } from './project-environment.mjs';

export const account = '634393786371';
export const region = 'ap-southeast-1';
export const stackName = 'KaffeinStack';
const cfRole = `arn:aws:iam::${account}:role/kaffein-cloudformation-release`;
const imageKeys = ['ApiImageTag', 'WebImageTag', 'ToolingImageTag'];
const pause = ms => new Promise(r => setTimeout(r, ms));
export function releaseTags(tag) {
  assert.match(tag, /^git-[0-9a-f]{40}-[0-9]+-[0-9]+$/, 'Use the immutable GitHub SHA/run/attempt tag');
  return { ApiImageTag: tag, WebImageTag: tag, ToolingImageTag: `${tag}-tooling` };
}
export function parameterUpdates(parameters, changes) {
  assert.ok(Object.keys(changes).length > 0);
  for (const [key, value] of Object.entries(changes)) {
    assert.ok(imageKeys.includes(key), `Not an image parameter: ${key}`);
    assert.match(value, /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/);
    assert.ok(parameters.some(p => p.ParameterKey === key), `Deploy CDK image parameters first: ${key}`);
  }
  return parameters.map(({ ParameterKey }) => changes[ParameterKey]
    ? { ParameterKey, ParameterValue: changes[ParameterKey] }
    : { ParameterKey, UsePreviousValue: true });
}
export function validateChanges(changes) {
  assert.ok(changes.length > 0, 'No release changes');
  for (const { ResourceChange: r } of changes) {
    assert.ok(['AWS::ECS::TaskDefinition', 'AWS::ECS::Service'].includes(r.ResourceType), `Release cannot change ${r.ResourceType}`);
    assert.equal(r.Action, 'Modify', 'Release cannot add or delete resources');
    if (r.ResourceType === 'AWS::ECS::Service') assert.equal(r.Replacement, 'False', 'Never replace the service');
  }
}
const env = projectEnvironment();
function aws(args) {
  return JSON.parse(execFileSync('aws', [...args, '--region', region, '--output', 'json', '--no-cli-pager'],
    { env, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }) || 'null');
}
function stack() {
  return aws(['cloudformation', 'describe-stacks', '--stack-name', stackName]).Stacks[0];
}
const outputs = s => Object.fromEntries(s.Outputs.map(o => [o.OutputKey, o.OutputValue]));
const parameters = s => Object.fromEntries(s.Parameters.filter(p => imageKeys.includes(p.ParameterKey)).map(p => [p.ParameterKey, p.ParameterValue]));
const evidenceDir = resolve(projectRoot, 'recovery/private/artifacts/aws-release');
function evidence(name, value) {
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(resolve(evidenceDir, `${name}.json`), JSON.stringify(value, null, 2) + '\n');
}
async function waitFor(check, label, attempts = 180) {
  for (let i = 0; i < attempts; i++) {
    const result = check();
    if (result) return result;
    if (i % 6 === 0) console.log(`Waiting: ${label}`);
    await pause(10_000);
  }
  throw new Error(`Timed out: ${label}; inspect AWS before retrying`);
}
async function update(changes) {
  const current = stack();
  assert.ok(['CREATE_COMPLETE', 'UPDATE_COMPLETE', 'UPDATE_ROLLBACK_COMPLETE'].includes(current.StackStatus), 'Stack is busy or needs operator recovery');
  const wanted = parameterUpdates(current.Parameters, changes);
  if (Object.entries(changes).every(([k, v]) => parameters(current)[k] === v)) return;
  const name = `kaffein-release-${Date.now()}`;
  const created = aws(['cloudformation', 'create-change-set', '--stack-name', stackName,
    '--change-set-name', name, '--change-set-type', 'UPDATE', '--use-previous-template',
    '--role-arn', cfRole, '--capabilities', 'CAPABILITY_IAM', '--parameters', JSON.stringify(wanted)]);
  let executed = false;
  try {
    const plan = await waitFor(() => {
      const c = aws(['cloudformation', 'describe-change-set', '--stack-name', stackName, '--change-set-name', name]);
      if (c.Status === 'FAILED') throw new Error(`Change set failed: ${c.StatusReason}`);
      return c.Status === 'CREATE_COMPLETE' ? c : null;
    }, 'change set');
    validateChanges(plan.Changes);
    evidence(name, { parameters: changes, changes: plan.Changes });
    aws(['cloudformation', 'execute-change-set', '--stack-name', stackName, '--change-set-name', name]);
    executed = true;
    await waitFor(() => {
      const s = stack();
      // ExecuteChangeSet is asynchronous; a first read may still see the
      // previous completed update rather than this execution.
      if (s.LastUpdatedTime === current.LastUpdatedTime) return null;
      if (s.StackStatus.endsWith('IN_PROGRESS')) return null;
      if (s.StackStatus !== 'UPDATE_COMPLETE') {
        const events = aws(['cloudformation', 'describe-stack-events', '--stack-name', stackName]).StackEvents
          .filter(e => e.ResourceStatus.endsWith('FAILED')).slice(0, 5)
          .map(e => ({ resource: e.LogicalResourceId, status: e.ResourceStatus, reason: e.ResourceStatusReason }));
        evidence('cloudformation-failure', { status: s.StackStatus, events });
        console.error(JSON.stringify({ status: s.StackStatus, events }));
      }
      assert.equal(s.StackStatus, 'UPDATE_COMPLETE', `CloudFormation rolled back: ${s.StackStatus}`);
      assert.ok(Object.entries(changes).every(([k, v]) => parameters(s)[k] === v));
      return s;
    }, 'CloudFormation release');
  } finally {
    if (!executed) {
      // Cleanup must never replace the release failure, and AWS refuses to
      // delete a change set while it is still being created.
      try {
        const c = aws(['cloudformation', 'describe-change-set', '--stack-name', stackName, '--change-set-name', name]);
        if (!c.Status.endsWith('IN_PROGRESS'))
          aws(['cloudformation', 'delete-change-set', '--stack-name', stackName, '--change-set-name', name]);
        else console.warn(`Unexecuted change set retained for inspection: ${created.Id}`);
      } catch { console.warn(`Could not clean up unexecuted change set: ${created.Id}`); }
    }
  }
}
async function migrate(out) {
  const started = aws(['ecs', 'run-task', '--cluster', out.ClusterName, '--task-definition', out.MigrationTaskArn,
    '--launch-type', 'FARGATE', '--started-by', `github-${process.env.GITHUB_RUN_ID ?? 'manual'}`,
    '--network-configuration', JSON.stringify({ awsvpcConfiguration: {
      subnets: out.PublicSubnets.split(','), securityGroups: [out.TaskSecurityGroup], assignPublicIp: 'ENABLED',
    } })]);
  assert.equal(started.failures?.length ?? 0, 0, 'Migration task rejected');
  assert.equal(started.tasks?.length, 1);
  const taskArn = started.tasks[0].taskArn;
  evidence('migration', { taskArn });
  console.log(`Migration task: ${taskArn}`);
  await waitFor(() => {
    const t = aws(['ecs', 'describe-tasks', '--cluster', out.ClusterName, '--tasks', taskArn]).tasks[0];
    if (t.lastStatus !== 'STOPPED') return null;
    evidence('migration', { taskArn, stoppedReason: t.stoppedReason, containers: t.containers.map(c => ({ name: c.name, exitCode: c.exitCode })) });
    assert.equal(t.containers.find(c => c.name === 'Migration')?.exitCode, 0, `Migration failed: ${t.stoppedReason}; API was not updated`);
    return t;
  }, 'database migration', 90);
}
async function verify(out, tags) {
  const service = aws(['ecs', 'describe-services', '--cluster', out.ClusterName, '--services', out.ServiceName]).services[0];
  assert.equal(service.desiredCount, 1);
  assert.equal(service.runningCount, 1);
  assert.equal(service.pendingCount, 0);
  assert.equal(service.taskDefinition, out.ApiTaskArn);
  assert.equal(service.deployments.length, 1);
  assert.equal(service.deployments[0].rolloutState, 'COMPLETED');
  const def = aws(['ecs', 'describe-task-definition', '--task-definition', service.taskDefinition]).taskDefinition;
  for (const [name, repo, key] of [['KaffeinApiContainer', out.EcrRepoUri, 'ApiImageTag'], ['KaffeinWebContainer', out.WebEcrRepoUri, 'WebImageTag']])
    assert.equal(def.containerDefinitions.find(c => c.name === name)?.image, `${repo}:${tags[key]}`);
  for (const arn of [out.TargetGroupArn, out.WebTargetGroupArn]) {
    const health = aws(['elbv2', 'describe-target-health', '--target-group-arn', arn]).TargetHealthDescriptions;
    assert.ok(health.some(t => t.TargetHealth.State === 'healthy'), 'ALB needs a healthy target');
  }
  // Only the bootstrap demo-login secret is readable by CI; DB/JWT/provider
  // secrets remain exclusively with the ECS execution roles.
  const password = JSON.parse(aws(['secretsmanager', 'get-secret-value', '--secret-id', out.BootstrapSecretArn]).SecretString).DEMO_WEB_PASSWORD;
  execFileSync(process.execPath, [resolve(projectRoot, 'scripts/smoke-deployment.mjs')], { stdio: 'inherit', env: {
    ...env, DEMO_WEB_PASSWORD: password, KAFFEIN_SMOKE_API: 'https://api-aws.congtc145.id.vn',
    KAFFEIN_SMOKE_ADMIN: 'https://admin-aws.congtc145.id.vn', KAFFEIN_SMOKE_WEB_HOSTING: 'ecs-alb',
  } });
  evidence('verified', { at: new Date().toISOString(), tags, taskDefinition: service.taskDefinition, githubSha: process.env.GITHUB_SHA });
}
export async function rollout(tags, previous, operations) {
  try {
    await operations.update({ ToolingImageTag: tags.ToolingImageTag });
    await operations.migrate();
    await operations.update({ ApiImageTag: tags.ApiImageTag, WebImageTag: tags.WebImageTag });
    await operations.verify(tags);
  } catch (error) {
    operations.reportFailure(error);
    // Restore images, never run SQL down-migrations or a database restore.
    try {
      await operations.update(previous);
      await operations.verify(previous);
    } catch (recoveryError) {
      throw new AggregateError([error, recoveryError], 'Release and image recovery failed; operator action required');
    }
    throw error;
  }
}
export async function release(tag) {
  const tags = releaseTags(tag);
  assert.equal(aws(['sts', 'get-caller-identity']).Account, account);
  const before = stack();
  assert.equal(aws(['ecs', 'describe-services', '--cluster', outputs(before).ClusterName, '--services', outputs(before).ServiceName]).services[0].desiredCount, 1, 'Do not restart a stopped demo from CI');
  const previous = parameters(before);
  assert.equal(Object.keys(previous).length, 3, 'Deploy CDK image parameters before releasing');
  evidence('previous', { parameters: previous, taskDefinition: outputs(before).ApiTaskArn });
  for (const [repo, imageTag] of [['kaffein-api', tags.ApiImageTag], ['kaffein-api', tags.ToolingImageTag], ['kaffein-web', tags.WebImageTag]])
    assert.equal(aws(['ecr', 'describe-images', '--repository-name', repo, '--image-ids', `imageTag=${imageTag}`]).imageDetails.length, 1);
  await rollout(tags, previous, {
    update,
    migrate: () => migrate(outputs(stack())),
    verify: tags => verify(outputs(stack()), tags),
    reportFailure: error => {
      evidence('failure', { message: error.message, previous, wanted: tags });
      console.error('Release failed; restoring previous application images. Database migrations are not reversed.');
    },
  });
  console.log(`PASS AWS release: ${tag}`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv[2], 'release', 'Usage: node scripts/aws-release.mjs release git-<sha>-<run>-<attempt>');
  await release(process.argv[3]);
}
