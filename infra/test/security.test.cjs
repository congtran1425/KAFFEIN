const { test } = require("node:test");
const assert = require("node:assert/strict");
const cdk = require("aws-cdk-lib");
const { Template, Match } = require("aws-cdk-lib/assertions");
const {
  KaffeinStack,
  KaffeinBudgetStack,
  KaffeinWebStack,
} = require("../dist/lib/kaffein-stack");
const env = { account: "111111111111", region: "ap-southeast-1" };
function template(context = {}) {
  return Template.fromStack(
    new KaffeinStack(new cdk.App({ context }), "Test", { env }),
  );
}

test("failed builds cannot expire the deployed or rollback tagged images", () => {
  const t = template();
  for (const r of Object.values(t.findResources("AWS::ECR::Repository"))) {
    assert.equal(r.Properties.ImageTagMutability, "IMMUTABLE");
    const policy = JSON.parse(r.Properties.LifecyclePolicy.LifecyclePolicyText);
    assert.ok(policy.rules.every(rule => rule.selection.tagStatus === "untagged"));
    assert.ok(policy.rules.every(rule => rule.selection.countType === "sinceImagePushed" && rule.selection.countNumber === 7));
  }
});

test("ECS image changes do not create alarm or dashboard dependencies on the service resource", () => {
  const t = template();
  const alarms = Object.values(t.findResources("AWS::CloudWatch::Alarm"));
  for (const r of alarms.filter(r => r.Properties.Namespace === "AWS/ECS")) {
    assert.equal(r.Properties.Dimensions.find(d => d.Name === "ServiceName").Value, "kaffein-api-service");
  }
  assert.ok(!JSON.stringify(t.findResources("AWS::CloudWatch::Dashboard")).includes('"KaffeinApiService'));
});
test("isolated encrypted database, no NAT and no public database ingress", () => {
  const t = template();
  t.resourceCountIs("AWS::EC2::NatGateway", 0);
  t.hasResourceProperties("AWS::RDS::DBInstance", {
    PubliclyAccessible: false,
    StorageEncrypted: true,
    MultiAZ: false,
    DeletionProtection: true,
    DBInstanceClass: "db.t4g.micro",
    AllocatedStorage: "20",
    BackupRetentionPeriod: 1,
  });
  const ingress = Object.values(
    t.findResources("AWS::EC2::SecurityGroupIngress"),
  );
  assert.ok(
    ingress.some(
      (r) =>
        r.Properties.FromPort === 5432 && r.Properties.SourceSecurityGroupId,
    ),
  );
  assert.ok(
    ingress
      .filter((r) => [3000, 5432, 8080].includes(r.Properties.FromPort))
      .every((r) => !r.Properties.CidrIp),
  );
});
test("bootstrap starts zero tasks and uses real health endpoint and separate DB secret fields", () => {
  const t = template();
  t.hasResourceProperties("AWS::ECS::Service", {
    DesiredCount: 0,
    NetworkConfiguration: {
      AwsvpcConfiguration: Match.objectLike({ AssignPublicIp: "ENABLED" }),
    },
  });
  const defs = Object.values(t.findResources("AWS::ECS::TaskDefinition"));
  const api = defs.find((r) => r.Properties.Memory === "512").Properties
    .ContainerDefinitions[0];
  assert.match(api.HealthCheck.Command.join(" "), /3000\/health/);
  assert.equal(api.User, "node");
  assert.ok(api.Secrets.some((s) => s.Name === "DB_PASSWORD"));
  assert.ok(!api.Secrets.some((s) => s.Name === "DATABASE_URL"));
  assert.equal(
    Object.values(
      t.findResources("AWS::ElasticLoadBalancingV2::TargetGroup"),
    )[0].Properties.HealthCheckPath,
    "/health",
  );
});
test("private S3, HTTPS, telemetry and no CloudFront", () => {
  const t = template({
    apiCertArn: "arn:aws:acm:ap-southeast-1:111111111111:certificate/api",
    desiredCount: 1,
  });
  const web = Template.fromStack(
    new KaffeinWebStack(
      new cdk.App(),
      "Web",
      { env },
    ),
  );
  web.resourceCountIs("AWS::CloudFront::OriginAccessControl", 0);
  web.resourceCountIs("AWS::CloudFront::Distribution", 0);
  for (const b of Object.values(web.findResources("AWS::S3::Bucket")))
    assert.equal(
      b.Properties.PublicAccessBlockConfiguration.BlockPublicPolicy,
      true,
    );
  t.hasResourceProperties("AWS::ElasticLoadBalancingV2::Listener", {
    Port: 80,
    DefaultActions: Match.arrayWith([
      Match.objectLike({
        Type: "redirect",
        RedirectConfig: Match.objectLike({
          Protocol: "HTTPS",
          StatusCode: "HTTP_301",
        }),
      }),
    ]),
  });
  t.resourceCountIs("AWS::CloudWatch::Alarm", 6);
  t.resourceCountIs("AWS::CloudWatch::Dashboard", 1);
});
test("budget uses actual USD 10/20/30 thresholds and supplied recipient", () => {
  const t = Template.fromStack(
    new KaffeinBudgetStack(
      new cdk.App({ context: { alertEmail: "alerts@example.test" } }),
      "Budget",
      { env },
    ),
  );
  const budget = Object.values(t.findResources("AWS::Budgets::Budget"))[0]
    .Properties;
  assert.deepEqual(
    budget.NotificationsWithSubscribers.map((n) => n.Notification.Threshold),
    [10, 20, 30],
  );
  assert.ok(
    budget.NotificationsWithSubscribers.every(
      (n) => n.Subscribers[0].Address === "alerts@example.test",
    ),
  );
});

test("Web storage preserves both private buckets", () => {
  const t = Template.fromStack(
    new KaffeinWebStack(
      new cdk.App({ context: { enableCloudFront: false } }),
      "PendingWeb",
      { env },
    ),
  );
  t.resourceCountIs("AWS::CloudFront::Distribution", 0);
  t.resourceCountIs("AWS::S3::Bucket", 2);
  for (const b of Object.values(t.findResources("AWS::S3::Bucket")))
    assert.equal(
      b.Properties.PublicAccessBlockConfiguration.BlockPublicPolicy,
      true,
    );
});

test("Web uses SNI, a host rule and a second container in the same restricted service", () => {
  const t = template({
    enableWeb: true, webImageTag: "release-web",
    apiCertArn: "arn:aws:acm:ap-southeast-1:111111111111:certificate/api",
  });
  t.resourceCountIs("AWS::ECS::Service", 1);
  t.hasResourceProperties("AWS::ECR::Repository", { RepositoryName: "kaffein-web", ImageTagMutability: "IMMUTABLE" });
  t.resourceCountIs("AWS::ElasticLoadBalancingV2::LoadBalancer", 1);
  t.resourceCountIs("AWS::CloudFront::Distribution", 0);
  t.hasResourceProperties("AWS::CertificateManager::Certificate", {
    DomainName: "admin-aws.congtc145.id.vn", ValidationMethod: "DNS",
  });
  t.hasResourceProperties("AWS::ElasticLoadBalancingV2::ListenerCertificate", {
    Certificates: Match.arrayWith([Match.objectLike({ CertificateArn: Match.anyValue() })]),
  });
  t.hasResourceProperties("AWS::ElasticLoadBalancingV2::ListenerRule", {
    Priority: 10,
    Conditions: [{ Field: "host-header", HostHeaderConfig: { Values: ["admin-aws.congtc145.id.vn"] } }],
  });
  const service = Object.values(t.findResources("AWS::ECS::Service"))[0].Properties;
  assert.deepEqual(service.LoadBalancers.map(b=>b.ContainerPort).sort(),[3000,8080]);
  const task = Object.values(t.findResources("AWS::ECS::TaskDefinition")).find(r=>r.Properties.Memory==="512").Properties;
  assert.equal(task.Cpu,"256");
  const web = task.ContainerDefinitions.find(c=>c.Name==="KaffeinWebContainer");
  assert.equal(web.User,"101"); assert.equal(web.Memory,64);
  assert.equal(web.Secrets,undefined); assert.equal(web.Essential,true);
  assert.match(web.HealthCheck.Command.join(" "),/8080\/health/);
  const ingress = Object.values(t.findResources("AWS::EC2::SecurityGroupIngress"));
  assert.ok(ingress.some(r=>r.Properties.FromPort===8080&&r.Properties.SourceSecurityGroupId&&!r.Properties.CidrIp));
});

test("Web activation preserves stateful resources and API listener/target logical IDs", () => {
  const context={apiCertArn:"arn:aws:acm:ap-southeast-1:111111111111:certificate/api"};
  const before=template(context), after=template({...context,enableWeb:true,webImageTag:"web-v1"});
  for(const type of ["AWS::RDS::DBInstance","AWS::SecretsManager::Secret","AWS::SNS::Topic","AWS::ElasticLoadBalancingV2::Listener"])
    assert.deepEqual(after.findResources(type),before.findResources(type));
  for(const [id,resource] of Object.entries(before.findResources("AWS::ElasticLoadBalancingV2::TargetGroup")))
    assert.deepEqual(after.findResources("AWS::ElasticLoadBalancingV2::TargetGroup")[id],resource);
  assert.throws(()=>template({enableWeb:true,webImageTag:"v1"}),/requires API HTTPS/);
  assert.throws(()=>template({...context,enableWeb:true}),/published webImageTag/);
});

test("HTTPS activation updates the existing port-80 listener without replacing it", () => {
  const before = template().findResources(
    "AWS::ElasticLoadBalancingV2::Listener",
  );
  const after = template({
    apiCertArn: "arn:aws:acm:ap-southeast-1:111111111111:certificate/api",
  }).findResources("AWS::ElasticLoadBalancingV2::Listener");
  const httpId = (resources) =>
    Object.entries(resources).find(([, r]) => r.Properties.Port === 80)[0];
  assert.equal(httpId(before), httpId(after));
  assert.equal(
    after[httpId(after)].Properties.DefaultActions[0].Type,
    "redirect",
  );
});
