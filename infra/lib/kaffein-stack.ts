import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as logs from "aws-cdk-lib/aws-logs";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as cw from "aws-cdk-lib/aws-cloudwatch";
import * as actions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subscriptions from "aws-cdk-lib/aws-sns-subscriptions";
import * as budgets from "aws-cdk-lib/aws-budgets";

export class KaffeinBudgetStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props);
    const email = this.node.tryGetContext("alertEmail") as string | undefined;
    new budgets.CfnBudget(this, "MonthlyBudget", {
      budget: {
        budgetName: "kaffein-demo-monthly",
        budgetType: "COST",
        timeUnit: "MONTHLY",
        budgetLimit: { amount: 20, unit: "USD" },
      },
      notificationsWithSubscribers: email
        ? [10, 20, 30].map((amount) => ({
            notification: {
              notificationType: "ACTUAL",
              comparisonOperator: "GREATER_THAN",
              thresholdType: "ABSOLUTE_VALUE",
              threshold: amount,
            },
            subscribers: [{ subscriptionType: "EMAIL", address: email }],
          }))
        : undefined,
    });
  }
}

export class KaffeinStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    cdk.Tags.of(this).add("Project", "kaffein");
    cdk.Tags.of(this).add("Environment", "aws-demo");
    const apiDomain =
      this.node.tryGetContext("apiDomain") ?? "api-aws.congtc145.id.vn";
    const webDomain =
      this.node.tryGetContext("webDomain") ?? "admin-aws.congtc145.id.vn";
    const apiCertArn = this.node.tryGetContext("apiCertArn");
    const enableWeb = [true, "true"].includes(this.node.tryGetContext("enableWeb"));
    const webImageTag = this.node.tryGetContext("webImageTag") ?? "bootstrap";
    if (enableWeb && (!apiCertArn || webImageTag === "bootstrap"))
      throw new Error("Web hosting requires API HTTPS and a published webImageTag");
    const imageTag = this.node.tryGetContext("imageTag") ?? "bootstrap";
    // Releases update parameters in the existing template; infrastructure stays
    // managed by CDK without giving the GitHub release role infrastructure rights.
    const tagOptions = {
      type: "String",
      allowedPattern: "[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}",
    };
    const apiTag = new cdk.CfnParameter(this, "ApiImageTag", {
      ...tagOptions, default: imageTag,
    }).valueAsString;
    const toolingTag = new cdk.CfnParameter(this, "ToolingImageTag", {
      ...tagOptions, default: `${imageTag}-tooling`,
    }).valueAsString;
    const webTag = new cdk.CfnParameter(this, "WebImageTag", {
      ...tagOptions, default: webImageTag,
    }).valueAsString;
    const desiredCount = Number(this.node.tryGetContext("desiredCount") ?? 0);
    if (![0, 1].includes(desiredCount))
      throw new Error("Demo desiredCount must be 0 or 1");
    const vpc = new ec2.Vpc(this, "KaffeinVpc", {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        { name: "Public", subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        {
          name: "DatabaseIsolated",
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
    });
    const dbSg = new ec2.SecurityGroup(this, "KaffeinDbSecurityGroup", {
      vpc,
      allowAllOutbound: false,
    });
    const taskSg = new ec2.SecurityGroup(this, "KaffeinEcsSecurityGroup", {
      vpc,
    });
    const albSg = new ec2.SecurityGroup(this, "KaffeinAlbSecurityGroup", {
      vpc,
    });
    taskSg.addIngressRule(albSg, ec2.Port.tcp(3000), "ALB only");
    dbSg.addIngressRule(
      taskSg,
      ec2.Port.tcp(5432),
      "API and one-off migration tasks only",
    );
    const dbSecret = new rds.DatabaseSecret(this, "KaffeinRdsSecret", {
      username: "kaffein_admin",
      excludeCharacters: '"@/\\ ',
    });
    dbSecret.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE);
    const db = new rds.DatabaseInstance(this, "KaffeinDatabase", {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_17_6,
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T4G,
        ec2.InstanceSize.MICRO,
      ),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [dbSg],
      credentials: rds.Credentials.fromSecret(dbSecret),
      databaseName: "kaffein_pos",
      allocatedStorage: 20,
      maxAllocatedStorage: 50,
      storageType: rds.StorageType.GP3,
      storageEncrypted: true,
      publiclyAccessible: false,
      multiAz: false,
      // New AWS Free plans limit automated backup retention; keep it enabled.
      autoMinorVersionUpgrade: true,
      backupRetention: cdk.Duration.days(1),
      deletionProtection: true,
      removalPolicy: cdk.RemovalPolicy.SNAPSHOT,
    });
    const runtimeSecret = new secretsmanager.Secret(this, "RuntimeSecret", {
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          ZALOPAY_APP_ID: "",
          ZALOPAY_KEY1: "",
          ZALOPAY_KEY2: "",
          MOMO_PARTNER_CODE: "",
          MOMO_ACCESS_KEY: "",
          MOMO_SECRET_KEY: "",
        }),
        generateStringKey: "JWT_ACCESS_SECRET",
        passwordLength: 64,
        excludePunctuation: true,
      },
    });
    runtimeSecret.applyRemovalPolicy(
      cdk.RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE,
    );
    const seedSecret = new secretsmanager.Secret(this, "BootstrapSecret", {
      generateSecretString: {
        secretStringTemplate: "{}",
        generateStringKey: "DEMO_WEB_PASSWORD",
        passwordLength: 32,
        excludePunctuation: true,
      },
    });
    seedSecret.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE);
    const repo = new ecr.Repository(this, "KaffeinApiRepo", {
      repositoryName: "kaffein-api",
      imageScanOnPush: true,
      imageTagMutability: ecr.TagMutability.IMMUTABLE,
      removalPolicy: cdk.RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE,
      lifecycleRules: [
        {
          tagStatus: ecr.TagStatus.UNTAGGED,
          maxImageAge: cdk.Duration.days(7),
          description: "Expire untagged images; preserve tagged runtime and rollback images",
        },
      ],
    });
    const webRepo = new ecr.Repository(this, "KaffeinWebRepo", {
      repositoryName: "kaffein-web",
      imageScanOnPush: true,
      imageTagMutability: ecr.TagMutability.IMMUTABLE,
      removalPolicy: cdk.RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE,
      lifecycleRules: [{
        tagStatus: ecr.TagStatus.UNTAGGED,
        maxImageAge: cdk.Duration.days(7),
        description: "Expire untagged images; preserve tagged runtime and rollback images",
      }],
    });
    // ALB certificates must be in its region. Existing ACM DNS validation is
    // reusable across regions; preserve the old us-east-1 certificate separately.
    const webCertificate = new acm.Certificate(this, "WebAlbCertificate", {
      domainName: webDomain,
      validation: acm.CertificateValidation.fromDns(),
    });
    const cluster = new ecs.Cluster(this, "KaffeinCluster", {
      vpc,
      clusterName: "kaffein-cluster",
    });
    const logGroup = new logs.LogGroup(this, "KaffeinApiLogGroup", {
      logGroupName: "/ecs/kaffein-api",
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    const secretBindings: Record<string, ecs.Secret> = {
      DB_USER: ecs.Secret.fromSecretsManager(dbSecret, "username"),
      DB_PASSWORD: ecs.Secret.fromSecretsManager(dbSecret, "password"),
    };
    for (const key of [
      "JWT_ACCESS_SECRET",
      "ZALOPAY_APP_ID",
      "ZALOPAY_KEY1",
      "ZALOPAY_KEY2",
      "MOMO_PARTNER_CODE",
      "MOMO_ACCESS_KEY",
      "MOMO_SECRET_KEY",
    ])
      secretBindings[key] = ecs.Secret.fromSecretsManager(runtimeSecret, key);
    const environment = {
      NODE_ENV: "production",
      PORT: "3000",
      TZ: "UTC",
      APP_TIMEZONE: "Asia/Ho_Chi_Minh",
      DB_HOST: db.dbInstanceEndpointAddress,
      DB_PORT: "5432",
      DB_NAME: "kaffein_pos",
      DB_SSL_ROOT_CERT: "/app/rds-global-bundle.pem",
      CORS_ALLOWED_ORIGINS: `https://${webDomain}`,
      ZALOPAY_CALLBACK_URL: `https://${apiDomain}/api/v1/webhooks/zalopay`,
      MOMO_IPN_URL: `https://${apiDomain}/api/v1/webhooks/momo`,
      MOMO_REDIRECT_URL: `https://${webDomain}`,
    };
    const task = new ecs.FargateTaskDefinition(this, "KaffeinApiTaskDef", {
      cpu: 256,
      memoryLimitMiB: 512,
    });
    task.addContainer("KaffeinApiContainer", {
      image: ecs.ContainerImage.fromEcrRepository(repo, apiTag),
      user: "node",
      environment,
      secrets: secretBindings,
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: "api", logGroup }),
      portMappings: [{ containerPort: 3000 }],
      healthCheck: {
        command: [
          "CMD-SHELL",
          "wget -q --spider http://127.0.0.1:3000/health || exit 1",
        ],
        startPeriod: cdk.Duration.seconds(30),
      },
    });
    if (enableWeb) {
      taskSg.addIngressRule(albSg, ec2.Port.tcp(8080), "Web from ALB only");
      task.addContainer("KaffeinWebContainer", {
        image: ecs.ContainerImage.fromEcrRepository(webRepo, webTag),
        user: "101",
        essential: true,
        memoryLimitMiB: 64,
        logging: ecs.LogDrivers.awsLogs({ streamPrefix: "web", logGroup }),
        portMappings: [{ containerPort: 8080 }],
        healthCheck: {
          command: ["CMD-SHELL", "wget -q --spider http://127.0.0.1:8080/health || exit 1"],
          startPeriod: cdk.Duration.seconds(15),
        },
      });
    }
    const migrationTask = new ecs.FargateTaskDefinition(this, "MigrationTask", {
      cpu: 256,
      memoryLimitMiB: 1024,
    });
    migrationTask.addContainer("Migration", {
      image: ecs.ContainerImage.fromEcrRepository(repo, toolingTag),
      environment: {
        ...environment,
        SSL_CERT_FILE: "/app/rds-global-bundle.pem",
      },
      secrets: {
        ...secretBindings,
        DEMO_WEB_PASSWORD: ecs.Secret.fromSecretsManager(
          seedSecret,
          "DEMO_WEB_PASSWORD",
        ),
      },
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: "migration", logGroup }),
      command: ["npm", "run", "db:deploy"],
    });
    const serviceName = "kaffein-api-service";
    const service = new ecs.FargateService(this, "KaffeinApiService", {
      cluster,
      taskDefinition: task,
      desiredCount,
      assignPublicIp: true,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      securityGroups: [taskSg],
      serviceName,
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
      circuitBreaker: { rollback: true },
      healthCheckGracePeriod: cdk.Duration.seconds(60),
    });
    const alb = new elbv2.ApplicationLoadBalancer(this, "KaffeinAlb", {
      vpc,
      internetFacing: true,
      loadBalancerName: "kaffein-alb",
      securityGroup: albSg,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      dropInvalidHeaderFields: true,
    });
    // Keep the original port-80 listener logical ID during HTTPS activation.
    // Replacing it with a new listener would collide on port 80 before deletion.
    const httpListener = alb.addListener("BootstrapHttp", {
      port: 80,
      ...(apiCertArn
        ? {
            defaultAction: elbv2.ListenerAction.redirect({
              protocol: "HTTPS",
              port: "443",
              permanent: true,
            }),
          }
        : {}),
    });
    const listener = apiCertArn
      ? alb.addListener("Https", {
          port: 443,
          certificates: [
            acm.Certificate.fromCertificateArn(this, "ApiCert", apiCertArn),
          ],
          sslPolicy: elbv2.SslPolicy.RECOMMENDED_TLS,
        })
      : httpListener;
    const targets = listener.addTargets("ApiTarget", {
      port: 3000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [service],
      healthCheck: {
        path: "/health",
        healthyHttpCodes: "200",
        healthyThresholdCount: 2,
      },
      deregistrationDelay: cdk.Duration.seconds(10),
    });
    const webTargets = enableWeb
      ? listener.addTargets("WebTarget", {
          priority: 10,
          conditions: [elbv2.ListenerCondition.hostHeaders([webDomain])],
          port: 8080,
          protocol: elbv2.ApplicationProtocol.HTTP,
          targets: [service.loadBalancerTarget({ containerName: "KaffeinWebContainer", containerPort: 8080 })],
          healthCheck: { path: "/health", healthyHttpCodes: "200", healthyThresholdCount: 2 },
          deregistrationDelay: cdk.Duration.seconds(10),
        })
      : undefined;
    if (enableWeb) listener.addCertificates("WebHttpsCertificate", [webCertificate]);
    const topic = new sns.Topic(this, "Alerts", {
      displayName: "KAFFEIN AWS alerts",
    });
    const email = this.node.tryGetContext("alertEmail");
    if (email)
      topic.addSubscription(new subscriptions.EmailSubscription(email));
    const metrics: Array<[string, cw.IMetric, number]> = [
      [
        "Alb5xx",
        alb.metrics.httpCodeTarget(elbv2.HttpCodeTarget.TARGET_5XX_COUNT, {
          statistic: "Sum",
          period: cdk.Duration.minutes(5),
        }),
        5,
      ],
      [
        "ApiLatency",
        alb.metrics.targetResponseTime({
          statistic: "p95",
          period: cdk.Duration.minutes(5),
        }),
        2,
      ],
      // The physical name is explicit and stable. GetAtt(Service.Name) would
      // make every image release also schedule alarm/dashboard updates.
      ["ApiCpu", service.metricCpuUtilization({ dimensionsMap: { ClusterName: cluster.clusterName, ServiceName: serviceName } }), 80],
      ["ApiMemory", service.metricMemoryUtilization({ dimensionsMap: { ClusterName: cluster.clusterName, ServiceName: serviceName } }), 85],
      ["DbConnections", db.metricDatabaseConnections(), 50],
      ["DbFreeStorage", db.metricFreeStorageSpace(), 2 * 1024 ** 3],
    ];
    for (const [name, metric, threshold] of metrics) {
      const alarm = new cw.Alarm(this, name, {
        metric,
        threshold,
        evaluationPeriods: 2,
        treatMissingData: cw.TreatMissingData.NOT_BREACHING,
        comparisonOperator:
          name === "DbFreeStorage"
            ? cw.ComparisonOperator.LESS_THAN_THRESHOLD
            : cw.ComparisonOperator.GREATER_THAN_THRESHOLD,
      });
      alarm.addAlarmAction(new actions.SnsAction(topic));
    }
    new cw.Dashboard(this, "Dashboard", {
      dashboardName: "kaffein-demo",
      widgets: [
        metrics.map(
          ([title, metric]) =>
            new cw.GraphWidget({ title, left: [metric], width: 8 }),
        ),
      ],
    });
    const outputs: Record<string, string> = {
      AlbDnsName: alb.loadBalancerDnsName,
      EcrRepoUri: repo.repositoryUri,
      WebEcrRepoUri: webRepo.repositoryUri,
      WebAlbCertificateArn: webCertificate.certificateArn,
      RdsEndpointAddress: db.dbInstanceEndpointAddress,
      DatabaseIdentifier: db.instanceIdentifier,
      DatabaseSecretArn: dbSecret.secretArn,
      RuntimeSecretArn: runtimeSecret.secretArn,
      BootstrapSecretArn: seedSecret.secretArn,
      ClusterName: cluster.clusterName,
      ServiceName: service.serviceName,
      MigrationTaskArn: migrationTask.taskDefinitionArn,
      ApiTaskArn: task.taskDefinitionArn,
      PublicSubnets: vpc.publicSubnets.map((s) => s.subnetId).join(","),
      TaskSecurityGroup: taskSg.securityGroupId,
      TargetGroupArn: targets.targetGroupArn,
      ...(webTargets ? { WebTargetGroupArn: webTargets.targetGroupArn, WebUrl: `https://${webDomain}` } : {}),
    };
    for (const [name, value] of Object.entries(outputs))
      new cdk.CfnOutput(this, name, { value });
  }
}

export class KaffeinWebStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    cdk.Tags.of(this).add("Project", "kaffein");
    const webBucket = new s3.Bucket(this, "KaffeinWebBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE,
    });
    const artifactsBucket = new s3.Bucket(this, "ArtifactsBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE,
    });
    for (const [name, value] of Object.entries({
      WebBucketNameOutput: webBucket.bucketName,
      ArtifactsBucketName: artifactsBucket.bucketName,
    }))
      new cdk.CfnOutput(this, name, { value });
  }
}
