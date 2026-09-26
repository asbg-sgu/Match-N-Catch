# Match N Catch AWS deployment

The stacks are deliberately separated. The existing `match-n-catch-bucket` stays outside CloudFormation; the MySQL database is created and owned by its own stack:

1. `match-n-catch-data` creates a private, encrypted, single-AZ `db.t4g.micro` MySQL RDS instance, its two-AZ subnet group, and database security group. RDS generates and retains its master password in Secrets Manager.
2. `match-n-catch-network` creates the ALB and task security groups in the same VPC and opens MySQL only from the task security group.
3. `match-n-catch-secrets` generates the Django secret in Secrets Manager and re-exports the database secret and connection metadata.
4. `match-n-catch-registry` creates the private ECR repository.
5. `match-n-catch-application` imports the preceding exports and creates the ALB, CloudFront HTTPS API endpoint, CloudWatch log group, ECS cluster, Fargate service, roles, and task definition. CloudFront terminates browser TLS and forwards uncached API requests to the ALB over HTTP.
6. `match-n-catch-github-oidc` imports the ECR/ECS role outputs and creates the GitHub Actions OIDC role. It creates the account OIDC provider only when absent.

The deployment script is intentionally for Bash (Git Bash, WSL, macOS, or Linux), not PowerShell. It needs AWS CLI v2 credentials with permissions to deploy the stacks, inspect/tag the existing S3/RDS resources, and push the bootstrap image; Docker; `jq`; and Git. It uses `ap-southeast-1` unconditionally.

```bash
chmod +x infra/scripts/deploy.sh infra/scripts/delete.sh
./infra/scripts/deploy.sh
```

The script validates every template first, discovers the default VPC, requires two public subnets in distinct AZs with active internet-gateway routes, creates the database, then runs the Fargate migration task. Fargate tasks receive public IPs in those subnets so ECR, CloudWatch Logs, and Secrets Manager remain reachable without a NAT Gateway. The database uses RDS-managed master credentials without the script retrieving the password. If a newly created stack rolls back or fails, the script deletes that failed new stack only; existing stacks are left intact for normal CloudFormation rollback handling.

Set the GitHub Actions repository secret `AWS_ACCOUNT_ID` to the AWS account ID printed by the script. The workflows use it solely to form the OIDC role ARN; no AWS access-key secrets are used. The GitHub repository is inferred from `origin` during deployment, or from a non-sensitive `GITHUB_REPOSITORY=owner/repository` shell environment variable.

GitHub repositories created after July 15, 2026 use an immutable OIDC subject that includes the numeric owner and repository IDs. For such repositories, deploy the OIDC stack with the exact subject (the value has this form: `repo:OWNER@OWNER_ID/REPOSITORY@REPOSITORY_ID:ref:refs/heads/main`):

```bash
GITHUB_OIDC_SUBJECT='repo:OWNER@OWNER_ID/REPOSITORY@REPOSITORY_ID:ref:refs/heads/main' \
  ./infra/scripts/deploy.sh
```

The value is an identity selector, not a credential. The template uses it as an exact trust-policy match and still supports the legacy name-only subject when the variable is omitted.

To remove only stack-managed resources:

```bash
./infra/scripts/delete.sh
```

It deletes the stacks in reverse dependency order. It never deletes the existing bucket. It does delete the RDS instance created by `match-n-catch-data`; deletion protection is intentionally disabled and no final snapshot is retained.
