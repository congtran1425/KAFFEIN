#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import {
  KaffeinStack,
  KaffeinBudgetStack,
  KaffeinWebStack,
} from "../lib/kaffein-stack";

const app = new cdk.App();

// Singapore region (ap-southeast-1) for lowest latency to Vietnam
const env = {
  account: "634393786371",
  region: "ap-southeast-1",
};
if (
  process.env.CDK_DEFAULT_ACCOUNT &&
  process.env.CDK_DEFAULT_ACCOUNT !== env.account
)
  throw new Error("Refusing deployment to a different AWS account");

const budget = new KaffeinBudgetStack(app, "KaffeinBudgetStack", { env });
const stack = new KaffeinStack(app, "KaffeinStack", {
  env,
  description:
    "KAFFEIN POS & Inventory (ECS Fargate API/Web, ALB, RDS PostgreSQL, private S3)",
});
stack.addStackDependency(budget);
const web = new KaffeinWebStack(app, "KaffeinWebStack", { env });
web.addStackDependency(budget);
