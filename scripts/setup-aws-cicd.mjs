// One-time/update administration using the project-local AWS profile. The
// resulting GitHub role has no IAM administration, DB or runtime-secret access.
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { projectEnvironment, projectRoot } from './project-environment.mjs';
const env = projectEnvironment();
const account = '634393786371', region = 'ap-southeast-1';
const aws = args => JSON.parse(execFileSync('aws', [...args, '--region', region, '--output', 'json', '--no-cli-pager'], { env, encoding: 'utf8' }) || 'null');
assert.equal(aws(['sts', 'get-caller-identity']).Account, account);
const app = aws(['cloudformation', 'describe-stacks', '--stack-name', 'KaffeinStack']).Stacks[0];
const out = Object.fromEntries(app.Outputs.map(o => [o.OutputKey, o.OutputValue]));
const taskRoles = [...new Set([out.ApiTaskArn, out.MigrationTaskArn].flatMap(arn => {
  const t = aws(['ecs', 'describe-task-definition', '--task-definition', arn]).taskDefinition;
  return [t.executionRoleArn, t.taskRoleArn];
}))];
const arn = (service, tail) => `arn:aws:${service}:${region}:${account}:${tail}`;
const ecsService = arn('ecs', 'service/kaffein-cluster/kaffein-api-service');
const taskDefs = [out.ApiTaskArn, out.MigrationTaskArn].map(s => s.replace(/:[0-9]+$/, ':*'));
const stmt = (Action, Resource, Condition) => ({ Effect: 'Allow', Action, Resource, ...(Condition ? { Condition } : {}) });
const policy = Statement => ({ Version: '2012-10-17', Statement });
const serviceTrust = service => policy([{ Effect: 'Allow', Action: 'sts:AssumeRole', Principal: { Service: service } }]);
const cfArn = `arn:aws:iam::${account}:role/kaffein-cloudformation-release`;
const template = {
  AWSTemplateFormatVersion: '2010-09-09',
  Description: 'KAFFEIN GitHub OIDC and restricted application release roles',
  Resources: {
    GitHubOidc: { Type: 'AWS::IAM::OIDCProvider', Properties: { Url: 'https://token.actions.githubusercontent.com', ClientIdList: ['sts.amazonaws.com'] } },
    CloudFormationRelease: { Type: 'AWS::IAM::Role', Properties: {
      RoleName: 'kaffein-cloudformation-release', AssumeRolePolicyDocument: serviceTrust('cloudformation.amazonaws.com'),
      Policies: [{ PolicyName: 'ExistingEcsReleaseOnly', PolicyDocument: policy([
        stmt(['ecs:RegisterTaskDefinition', 'ecs:DeregisterTaskDefinition', 'ecs:DescribeTaskDefinition'], '*'), // These legacy ECS APIs do not support resource scoping.
        stmt(['ecs:TagResource', 'ecs:UntagResource', 'ecs:ListTagsForResource'], taskDefs),
        stmt(['ecs:DescribeServices', 'ecs:UpdateService', 'ecs:ListTagsForResource', 'ecs:TagResource', 'ecs:UntagResource'], ecsService),
        stmt(['iam:PassRole'], taskRoles, { StringEquals: { 'iam:PassedToService': 'ecs-tasks.amazonaws.com' } }),
        stmt(['iam:GetRole'], taskRoles),
        // CloudFormation re-reads GetAtt dependencies even when those
        // infrastructure resources themselves are not being updated.
        stmt(['rds:DescribeDBInstances', 'rds:ListTagsForResource'], arn('rds', `db:${out.DatabaseIdentifier}`)),
        stmt(['ecr:DescribeRepositories', 'ecr:ListTagsForResource'], ['kaffein-api', 'kaffein-web'].map(r => arn('ecr', `repository/${r}`))),
        stmt(['ec2:DescribeSecurityGroups', 'elasticloadbalancing:DescribeLoadBalancers', 'elasticloadbalancing:DescribeLoadBalancerAttributes', 'elasticloadbalancing:DescribeTags'], '*'),
        stmt(['acm:DescribeCertificate'], out.WebAlbCertificateArn),
        stmt(['ssm:GetParameters', 'ssm:GetParameter'], arn('ssm', 'parameter/cdk-bootstrap/hnb659fds/version')),
      ]) }],
    } },
    GitHubRelease: { Type: 'AWS::IAM::Role', Properties: {
      RoleName: 'kaffein-github-release', MaxSessionDuration: 3600,
      AssumeRolePolicyDocument: policy([{ Effect: 'Allow', Action: 'sts:AssumeRoleWithWebIdentity',
        Principal: { Federated: { Ref: 'GitHubOidc' } }, Condition: { StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          'token.actions.githubusercontent.com:sub': 'repo:congtran1425@225727441/Final-Project@1349050572:ref:refs/heads/desktop-work',
        } } }]),
      Policies: [{ PolicyName: 'ProjectApplicationRelease', PolicyDocument: policy([
        stmt(['ecr:GetAuthorizationToken'], '*'),
        stmt(['ecr:BatchCheckLayerAvailability', 'ecr:GetDownloadUrlForLayer', 'ecr:BatchGetImage', 'ecr:InitiateLayerUpload', 'ecr:UploadLayerPart', 'ecr:CompleteLayerUpload', 'ecr:PutImage', 'ecr:DescribeImages'], ['kaffein-api', 'kaffein-web'].map(r => arn('ecr', `repository/${r}`))),
        stmt(['cloudformation:DescribeStacks', 'cloudformation:DescribeStackEvents', 'cloudformation:DescribeStackResources', 'cloudformation:ListStackResources', 'cloudformation:GetTemplate'], app.StackId),
        stmt(['cloudformation:CreateChangeSet'], app.StackId, { StringEquals: { 'cloudformation:RoleArn': cfArn } }),
        stmt(['cloudformation:DescribeChangeSet'], app.StackId),
        stmt(['cloudformation:ExecuteChangeSet', 'cloudformation:DeleteChangeSet'], app.StackId,
          { StringLike: { 'cloudformation:ChangeSetName': ['kaffein-release-*', arn('cloudformation', 'changeSet/kaffein-release-*/*')] } }),
        stmt(['iam:PassRole'], cfArn, { StringEquals: { 'iam:PassedToService': 'cloudformation.amazonaws.com' } }),
        stmt(['ecs:RunTask'], taskDefs[1], { ArnEquals: { 'ecs:cluster': arn('ecs', 'cluster/kaffein-cluster') } }),
        stmt(['ecs:DescribeTasks'], arn('ecs', 'task/kaffein-cluster/*')),
        stmt(['ecs:DescribeServices'], ecsService),
        stmt(['ecs:DescribeTaskDefinition'], '*'), // Read-only API without resource-level authorization.
        stmt(['iam:PassRole'], taskRoles.filter(r => r.includes('-MigrationTask')), { StringEquals: { 'iam:PassedToService': 'ecs-tasks.amazonaws.com' } }),
        stmt(['elasticloadbalancing:DescribeTargetHealth'], '*'), // AWS requires '*'; read-only.
        stmt(['secretsmanager:GetSecretValue'], out.BootstrapSecretArn),
      ]) }],
    } },
  },
  Outputs: { ReleaseRoleArn: { Value: { 'Fn::GetAtt': ['GitHubRelease', 'Arn'] } }, CloudFormationRoleArn: { Value: { 'Fn::GetAtt': ['CloudFormationRelease', 'Arn'] } } },
};
const directory = resolve(projectRoot, 'recovery/private/aws/cicd');
mkdirSync(directory, { recursive: true });
const path = resolve(directory, 'roles-template.json');
writeFileSync(path, JSON.stringify(template, null, 2));
if (process.argv.includes('--apply')) {
  execFileSync('aws', ['cloudformation', 'deploy', '--stack-name', 'KaffeinCicdStack', '--template-file', path,
    '--capabilities', 'CAPABILITY_NAMED_IAM', '--no-fail-on-empty-changeset', '--region', region, '--no-cli-pager'], { env, stdio: 'inherit' });
} else console.log(`Prepared ${path}; run with --apply to provision the OIDC roles.`);
