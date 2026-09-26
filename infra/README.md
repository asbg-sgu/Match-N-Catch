# Match N Catch AWS deployment

The stacks are deliberately separated so that the existing `match-n-catch-bucket` and `match-n-catch-database` are never CloudFormation resources:

1. `match-n-catch-network` creates the ALB and task security groups in the RDS VPC and opens the existing RDS security group only to the task security group.
2. `match-n-catch-secrets` generates the Django secret in Secrets Manager and exports the existing RDS managed-secret ARN plus connection metadata.
3. `match-n-catch-registry` creates the private ECR repository.
4. `match-n-catch-application` imports the preceding exports and creates the ALB, CloudWatch log group, ECS cluster, Fargate service, roles, and task definition.
5. `match-n-catch-github-oidc` imports the ECR/ECS role outputs and creates the GitHub Actions OIDC role. It creates the account OIDC provider only when absent.

The deployment script is intentionally for Bash (Git Bash, WSL, macOS, or Linux), not PowerShell. It needs AWS CLI v2 credentials with permissions to deploy the stacks, inspect/tag the existing S3/RDS resources, and push the bootstrap image; Docker; `jq`; and Git. It uses `ap-southeast-1` unconditionally.

```bash
chmod +x infra/scripts/deploy.sh infra/scripts/delete.sh
./infra/scripts/deploy.sh
```

The script validates every template first, discovers the RDS VPC and endpoint, requires two public subnets in distinct AZs with active internet-gateway routes, then runs the Fargate migration task. Fargate tasks receive public IPs in those subnets so ECR, CloudWatch Logs, and Secrets Manager remain reachable without a NAT Gateway. It enables RDS-managed master credentials when necessary, without retrieving the password. If a newly created stack rolls back or fails, the script deletes that failed new stack only; existing stacks are left intact for normal CloudFormation rollback handling.

Set the non-sensitive GitHub Actions repository variable `AWS_ACCOUNT_ID` to the AWS account ID printed by the script. The workflows use this value solely to form the OIDC role ARN; no AWS access-key secrets are used. The GitHub repository is inferred from `origin` during deployment, or from a non-sensitive `GITHUB_REPOSITORY=owner/repository` shell environment variable.

To remove only stack-managed resources:

```bash
./infra/scripts/delete.sh
```

It deletes the stacks in reverse dependency order and does not call an S3 or RDS deletion API. The existing bucket and RDS instance remain in place.
