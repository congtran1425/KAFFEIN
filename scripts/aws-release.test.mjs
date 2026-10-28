import { test } from 'node:test';
import assert from 'node:assert/strict';
import { releaseTags, parameterUpdates, validateChanges, rollout } from './aws-release.mjs';
const tag = `git-${'a'.repeat(40)}-123-1`;
test('immutable release tags require SHA, run and attempt; retries do not overwrite', () => {
  assert.equal(releaseTags(tag).ToolingImageTag, `${tag}-tooling`);
  for (const bad of ['latest', 'main', 'git-deadbeef-1-1', `${tag};echo`]) assert.throws(() => releaseTags(bad));
  assert.notEqual(releaseTags(tag).ApiImageTag, releaseTags(tag.replace(/-1$/, '-2')).ApiImageTag);
});
test('migration preparation preserves runtime images and every non-image parameter', () => {
  const p = ['ApiImageTag', 'WebImageTag', 'ToolingImageTag', 'BootstrapVersion'].map(ParameterKey => ({ ParameterKey, ParameterValue: 'old' }));
  const next = parameterUpdates(p, { ToolingImageTag: `${tag}-tooling` });
  assert.ok(next.filter(p => p.ParameterKey !== 'ToolingImageTag').every(p => p.UsePreviousValue));
  assert.equal(next.find(p => p.ParameterKey === 'ToolingImageTag').ParameterValue, `${tag}-tooling`);
  assert.throws(() => parameterUpdates(p, { DesiredCount: '0' }));
  assert.throws(() => parameterUpdates([], { ApiImageTag: tag }));
});
test('release refuses stateful, IAM and network changes or service replacement', () => {
  const change = (ResourceType, Action = 'Modify', Replacement = 'False') => ({ ResourceChange: { ResourceType, Action, Replacement } });
  validateChanges([change('AWS::ECS::TaskDefinition', 'Modify', 'True'), change('AWS::ECS::Service')]);
  for (const type of ['AWS::RDS::DBInstance', 'AWS::IAM::Role', 'AWS::EC2::SecurityGroup', 'AWS::S3::Bucket'])
    assert.throws(() => validateChanges([change(type)]));
  assert.throws(() => validateChanges([change('AWS::ECS::Service', 'Modify', 'True')]));
  assert.throws(() => validateChanges([change('AWS::ECS::TaskDefinition', 'Remove')]));
  assert.throws(() => validateChanges([]));
});
const previous = { ApiImageTag: 'old-api', ToolingImageTag: 'old-tooling', WebImageTag: 'old-web' };
test('migration must finish before either runtime image changes', async () => {
  const calls = [];
  await rollout(releaseTags(tag), previous, {
    update: async p => calls.push(['update', p]),
    migrate: async () => calls.push(['migrate']),
    verify: async p => calls.push(['verify', p]),
    reportFailure: () => assert.fail('Should not fail'),
  });
  assert.deepEqual(calls.map(c => c[0]), ['update', 'migrate', 'update', 'verify']);
  assert.deepEqual(Object.keys(calls[0][1]), ['ToolingImageTag']);
  assert.deepEqual(Object.keys(calls[2][1]), ['ApiImageTag', 'WebImageTag']);
});
test('failed migration leaves runtime untouched and restores the previous tooling', async () => {
  const updates = []; const failure = new Error('migration failed');
  await assert.rejects(rollout(releaseTags(tag), previous, {
    update: async p => updates.push(p), migrate: async () => { throw failure; },
    verify: async p => assert.deepEqual(p, previous), reportFailure: e => assert.equal(e, failure),
  }), e => e === failure);
  assert.deepEqual(updates, [{ ToolingImageTag: `${tag}-tooling` }, previous]);
});
test('failed public smoke rolls back all images without running migration again', async () => {
  let migrations = 0; const updates = []; const checked = [];
  await assert.rejects(rollout(releaseTags(tag), previous, {
    update: async p => updates.push(p), migrate: async () => { migrations++; },
    verify: async p => { checked.push(p); if (p.ApiImageTag !== previous.ApiImageTag) throw new Error('smoke failed'); },
    reportFailure: () => {},
  }), /smoke failed/);
  assert.equal(migrations, 1); assert.deepEqual(updates.at(-1), previous);
  assert.deepEqual(checked.at(-1), previous);
});
test('failed recovery preserves both failures for the operator', async () => {
  let calls = 0;
  await assert.rejects(rollout(releaseTags(tag), previous, {
    update: async () => { if (++calls > 1) throw new Error('recovery denied'); },
    migrate: async () => { throw new Error('migration failed'); }, verify: async () => {}, reportFailure: () => {},
  }), e => e instanceof AggregateError && e.errors[0].message === 'migration failed' && e.errors[1].message === 'recovery denied');
});
