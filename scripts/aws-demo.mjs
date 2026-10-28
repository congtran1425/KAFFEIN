// AWS demo operations. Credentials come only from the configured AWS CLI profile.
// Run: node scripts/aws-demo.mjs status|migrate|seed|smoke-api|start|stop|web|sandbox|smoke
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import assert from "node:assert/strict";
import { projectEnvironment } from './project-environment.mjs';
import { parse } from "dotenv";
Object.assign(process.env, projectEnvironment());

const region = "ap-southeast-1";
const account = "634393786371";
const root = resolve(import.meta.dirname, "..");
function aws(args) {
  return JSON.parse(
    execFileSync(
      "aws",
      [...args, "--region", region, "--output", "json", "--no-cli-pager"],
      {
        encoding: "utf8",
        env: { ...process.env, AWS_PAGER: "" },
        maxBuffer: 8 * 1024 * 1024,
      },
    ) || "null",
  );
}
assert.equal(
  aws(["sts", "get-caller-identity"]).Account,
  account,
  "Refusing a different AWS account",
);
const stacks = aws([
  "cloudformation",
  "describe-stacks",
  "--stack-name",
  "KaffeinStack",
]).Stacks;
assert.equal(stacks.length, 1);
const out = Object.fromEntries(
  stacks[0].Outputs.map((o) => [o.OutputKey, o.OutputValue]),
);
assert.equal(out.ClusterName, "kaffein-cluster");
assert.equal(out.ServiceName, "kaffein-api-service");
const command = process.argv[2] || "status";
if (["web", "smoke"].includes(command)) {
  const web = aws([
    "cloudformation",
    "describe-stacks",
    "--stack-name",
    "KaffeinWebStack",
  ]).Stacks[0];
  Object.assign(
    out,
    Object.fromEntries(web.Outputs.map((o) => [o.OutputKey, o.OutputValue])),
  );
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const secret = (arn) =>
  JSON.parse(
    aws(["secretsmanager", "get-secret-value", "--secret-id", arn])
      .SecretString,
  );
async function oneOff(action) {
  const seedAction = ["seed", "verify-seed-guard"].includes(action);
  const overrides = {
    containerOverrides: [
      {
        name: "Migration",
        command:
          action === "smoke-api"
            ? [
                "node",
                "-e",
                readFileSync(join(root, "scripts/smoke-aws-api.cjs"), "utf8"),
              ]
            : ["npm", "run", seedAction ? "db:seed:master" : "db:deploy"],
        environment: [
          { name: "SSL_CERT_FILE", value: "/app/rds-global-bundle.pem" },
          ...(seedAction
            ? [
                {
                  name: "KAFFEIN_INITIALIZE_EMPTY_DB",
                  value: "YES_INITIALIZE_EMPTY_DEMO_DB",
                },
                { name: "KAFFEIN_AWS_DB_HOST", value: out.RdsEndpointAddress },
              ]
            : []),
        ],
      },
    ],
  };
  const result = aws([
    "ecs",
    "run-task",
    "--cluster",
    out.ClusterName,
    "--task-definition",
    out.MigrationTaskArn,
    "--launch-type",
    "FARGATE",
    "--network-configuration",
    JSON.stringify({
      awsvpcConfiguration: {
        subnets: out.PublicSubnets.split(","),
        securityGroups: [out.TaskSecurityGroup],
        assignPublicIp: "ENABLED",
      },
    }),
    "--overrides",
    JSON.stringify(overrides),
    "--started-by",
    `kaffein-${action}`,
  ]);
  assert.equal(result.failures?.length || 0, 0, "ECS rejected one-off task");
  const arn = result.tasks[0].taskArn;
  console.log(`Started ${action}: ${arn}`);
  for (let i = 0; i < 120; i++) {
    const task = aws([
      "ecs",
      "describe-tasks",
      "--cluster",
      out.ClusterName,
      "--tasks",
      arn,
    ]).tasks[0];
    if (task.lastStatus === "STOPPED") {
      const c = task.containers[0];
      console.log(
        JSON.stringify({
          action,
          status: task.lastStatus,
          exitCode: c.exitCode,
          stoppedReason: task.stoppedReason,
        }),
      );
      assert.equal(
        c.exitCode,
        action === "verify-seed-guard" ? 1 : 0,
        `${action} failed; inspect private CloudWatch logs for this task`,
      );
      if (action === "verify-seed-guard") {
        const id = arn.split("/").at(-1);
        const events = aws([
          "logs",
          "get-log-events",
          "--log-group-name",
          "/ecs/kaffein-api",
          "--log-stream-name",
          `migration/Migration/${id}`,
        ]).events;
        assert.ok(
          events.some((e) =>
            e.message.includes(
              "Refusing cloud seed: database already contains application data",
            ),
          ),
          "Must refuse specifically because the database is nonempty",
        );
        console.log(
          "PASS: repeated seed refused before modifying existing AWS data.",
        );
      }
      return;
    }
    if (i % 6 === 0) console.log(`${action}: ${task.lastStatus}`);
    await sleep(10_000);
  }
  throw new Error("One-off task timeout; inspect task before retrying");
}
if (["migrate", "seed", "verify-seed-guard", "smoke-api"].includes(command))
  await oneOff(command);
else if (command === "status") {
  const service = aws([
    "ecs",
    "describe-services",
    "--cluster",
    out.ClusterName,
    "--services",
    out.ServiceName,
  ]).services[0];
  const db = aws([
    "rds",
    "describe-db-instances",
    "--db-instance-identifier",
    out.DatabaseIdentifier,
  ]).DBInstances[0];
  console.log(
    JSON.stringify(
      {
        stack: stacks[0].StackStatus,
        database: db.DBInstanceStatus,
        desired: service.desiredCount,
        running: service.runningCount,
        targets: aws([
          "elbv2",
          "describe-target-health",
          "--target-group-arn",
          out.TargetGroupArn,
        ]).TargetHealthDescriptions.map((t) => t.TargetHealth),
        alb: out.AlbDnsName,
        web: out.WebUrl,
        webTargets: out.WebTargetGroupArn ? aws([
          "elbv2", "describe-target-health", "--target-group-arn", out.WebTargetGroupArn,
        ]).TargetHealthDescriptions.map(t=>t.TargetHealth) : [],
        events: service.events.slice(0, 3).map((e) => e.message),
      },
      null,
      2,
    ),
  );
} else if (command === "sandbox") {
  const local = parse(readFileSync(join(root, ".env")));
  const value = secret(out.RuntimeSecretArn);
  for (const key of [
    "ZALOPAY_APP_ID",
    "ZALOPAY_KEY1",
    "ZALOPAY_KEY2",
    "MOMO_PARTNER_CODE",
    "MOMO_ACCESS_KEY",
    "MOMO_SECRET_KEY",
  ]) {
    assert.ok(local[key], `Missing local sandbox setting ${key}`);
    value[key] = local[key];
  }
  const privateWork = join(process.env.KAFFEIN_RECOVERY_DIR, "work");
  mkdirSync(privateWork, { recursive: true });
  const dir = mkdtempSync(join(privateWork, "aws-secret-"));
  const file = join(dir, "runtime.json");
  try {
    writeFileSync(file, JSON.stringify(value), { mode: 0o600 });
    aws([
      "secretsmanager",
      "put-secret-value",
      "--secret-id",
      out.RuntimeSecretArn,
      "--secret-string",
      `file://${file}`,
    ]);
  } finally {
    rmSync(file);
    (await import("node:fs")).rmdirSync(dir);
  }
  console.log(
    "Sandbox credentials stored in Secrets Manager; JWT preserved. Redeploy API to load them.",
  );
} else if (command === "web") {
  assert.equal(out.WebEcrRepoUri, `${account}.dkr.ecr.${region}.amazonaws.com/kaffein-web`,
    "Provision the Web ECR repository and regional certificate through CDK first");
  const certificate=aws(["acm","describe-certificate","--certificate-arn",out.WebAlbCertificateArn]).Certificate;
  assert.equal(certificate.Status,"ISSUED","Web ALB certificate must be ISSUED before deployment");
  const configFile=join(root,"infra/cdk.json");
  const config=JSON.parse(readFileSync(configFile,"utf8"));
  const tag=process.argv[3] || config.context.webImageTag;
  assert.match(tag,/^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,127}$/,"Supply a safe immutable Web release tag");
  assert.ok(!["latest","bootstrap"].includes(tag),"Use a versioned Web release tag");
  const releases=aws(["ecr","describe-images","--repository-name","kaffein-web","--filter","tagStatus=TAGGED"]).imageDetails;
  assert.ok(!releases.some(i=>i.imageTags?.includes(tag)),"Web release tag already exists; use a new tag, or deploy the existing tag directly through CDK to retry/rollback");
  const onPath=process.platform==="win32" ? spawnSync("where.exe",["docker"],{encoding:"utf8"}) : undefined;
  const docker=process.platform==="win32"
    ? onPath.status===0 ? onPath.stdout.trim().split(/\r?\n/)[0] : join(process.env.LOCALAPPDATA,"Programs/DockerDesktop/resources/bin/docker.exe") : "docker";
  assert.ok(process.platform!=="win32"||existsSync(docker),"Docker CLI not found");
  const dockerConfig=join(process.env.KAFFEIN_RECOVERY_DIR,"docker");
  mkdirSync(dockerConfig,{recursive:true});
  const dockerConfigFile=join(dockerConfig,"config.json");
  const settings=existsSync(dockerConfigFile) ? JSON.parse(readFileSync(dockerConfigFile,"utf8")) : {auths:{}};
  const pluginDir=resolve(dirname(docker),"../cli-plugins");
  if(process.platform==="win32"&&existsSync(pluginDir))settings.cliPluginsExtraDirs=[pluginDir];
  writeFileSync(dockerConfigFile,JSON.stringify(settings,null,2)+"\n",{mode:0o600});
  const dockerHost=process.env.DOCKER_HOST || execFileSync(docker,["context","inspect","--format","{{.Endpoints.docker.Host}}"],{encoding:"utf8"}).trim();
  const dockerEnv={...process.env,DOCKER_CONFIG:dockerConfig,DOCKER_HOST:dockerHost,DOCKER_CONTEXT:"",DOCKER_BUILDKIT:"1"};
  const runDocker=(args,input)=>{
    const result=spawnSync(docker,args,{cwd:root,env:dockerEnv,input,stdio:input?["pipe","pipe","pipe"]:"inherit",encoding:"utf8"});
    assert.equal(result.status,0,`Docker ${args[0]} failed`);
  };
  const image=`${out.WebEcrRepoUri}:${tag}`;
  runDocker(["buildx","build","--load","-f","apps/web/Dockerfile","-t",image,"."]);
  const password=execFileSync("aws",["ecr","get-login-password","--region",region],{encoding:"utf8"}).trim();
  try {
    runDocker(["login","--username","AWS","--password-stdin",`${account}.dkr.ecr.${region}.amazonaws.com`],password+"\n");
    runDocker(["push",image]);
  } finally {
    // ECR tokens expire; do not leave a workstation credential-store dependency.
    runDocker(["logout",`${account}.dkr.ecr.${region}.amazonaws.com`]);
  }
  const result=spawnSync(process.execPath,[join(root,"node_modules/aws-cdk/bin/cdk"),"deploy","KaffeinStack","--require-approval","never","-c","enableWeb=true","-c",`webImageTag=${tag}`,"--parameters",`KaffeinStack:WebImageTag=${tag}`],{cwd:join(root,"infra"),env:process.env,stdio:"inherit"});
  assert.equal(result.status,0,"Web deployment failed; CDK context preserved for recovery");
  config.context.enableWeb=true;config.context.webImageTag=tag;
  writeFileSync(configFile,JSON.stringify(config,null,2)+"\n");
  console.log(`Web deployed through ECS/ALB: https://admin-aws.congtc145.id.vn (${tag})`);
} else if (["smoke", "smoke-api-public"].includes(command)) {
  if (command === "smoke")
    assert.ok(
      out.WebUrl && out.WebTargetGroupArn,
      "ECS/ALB Web hosting must be enabled before the full public smoke test",
    );
  const password = secret(out.BootstrapSecretArn).DEMO_WEB_PASSWORD;
  const r = spawnSync(
    process.execPath,
    [join(root, "scripts/smoke-deployment.mjs")],
    {
      cwd: root,
      stdio: "inherit",
      env: {
        ...process.env,
        DEMO_WEB_PASSWORD: password,
        KAFFEIN_SMOKE_API: "https://api-aws.congtc145.id.vn",
        KAFFEIN_SMOKE_ADMIN: "https://admin-aws.congtc145.id.vn",
        KAFFEIN_SMOKE_SKIP_ADMIN: command === "smoke-api-public" ? "1" : "0",
        KAFFEIN_SMOKE_WEB_HOSTING: "ecs-alb",
      },
    },
  );
  assert.equal(r.status, 0, "AWS business smoke failed");
} else if (["start", "stop"].includes(command)) {
  const current = aws([
    "rds",
    "describe-db-instances",
    "--db-instance-identifier",
    out.DatabaseIdentifier,
  ]).DBInstances[0].DBInstanceStatus;
  if (command === "start") {
    const groups = aws([
      "elbv2",
      "describe-target-groups",
      "--target-group-arns",
      out.TargetGroupArn,
    ]).TargetGroups;
    const listeners = aws([
      "elbv2",
      "describe-listeners",
      "--load-balancer-arn",
      groups[0].LoadBalancerArns[0],
    ]).Listeners;
    assert.ok(
      listeners.some(
        (l) =>
          l.Protocol === "HTTPS" && l.Port === 443 && l.Certificates?.length,
      ),
      "Configure an ACM-backed HTTPS listener before starting the public API",
    );
    if (current === "stopped")
      aws([
        "rds",
        "start-db-instance",
        "--db-instance-identifier",
        out.DatabaseIdentifier,
      ]);
    assert.ok(
      [
        "available",
        "stopped",
        "starting",
        "configuring-enhanced-monitoring",
        "backing-up",
      ].includes(current),
      `Database is ${current}`,
    );
    console.log("Waiting for database availability...");
    execFileSync(
      "aws",
      [
        "rds",
        "wait",
        "db-instance-available",
        "--db-instance-identifier",
        out.DatabaseIdentifier,
        "--region",
        region,
      ],
      { stdio: "ignore" },
    );
  }
  aws([
    "ecs",
    "update-service",
    "--cluster",
    out.ClusterName,
    "--service",
    out.ServiceName,
    "--desired-count",
    command === "start" ? "1" : "0",
    ...(command === "start" ? ["--force-new-deployment"] : []),
  ]);
  console.log("Waiting for ECS stability...");
  execFileSync(
    "aws",
    [
      "ecs",
      "wait",
      "services-stable",
      "--cluster",
      out.ClusterName,
      "--services",
      out.ServiceName,
      "--region",
      region,
    ],
    { stdio: "ignore" },
  );
  if (command === "stop" && current === "available")
    aws([
      "rds",
      "stop-db-instance",
      "--db-instance-identifier",
      out.DatabaseIdentifier,
    ]);
  if (command === "stop") {
    assert.ok(
      ["available", "stopping", "stopped"].includes(current),
      `Database is ${current}; stop was not requested`,
    );
    let stopped = false;
    for (let i = 0; i < 120; i++) {
      const state = aws([
        "rds",
        "describe-db-instances",
        "--db-instance-identifier",
        out.DatabaseIdentifier,
      ]).DBInstances[0].DBInstanceStatus;
      if (state === "stopped") {
        stopped = true;
        break;
      }
      if (i % 6 === 0) console.log(`Waiting for RDS stop: ${state}`);
      await sleep(10_000);
    }
    assert.ok(stopped, "RDS stop timeout; inspect database status");
  }
  console.log(
    command === "stop"
      ? "stop complete. ALB, storage and retained resources still incur costs. RDS automatically restarts after seven days."
      : "start complete. API and database are running; demo resources consume credit/cost while active.",
  );
} else throw new Error("Unknown operation");
