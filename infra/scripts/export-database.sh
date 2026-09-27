#!/usr/bin/env bash
# Creates a point-in-time CSV archive from the private RDS database through a
# one-off ECS task, then downloads the archive locally. Run from Git Bash, WSL,
# macOS, or Linux after ./infra/scripts/deploy.sh has deployed the exporter.
set -Eeuo pipefail

readonly REGION='ap-southeast-1'
readonly PROJECT_NAME='match-n-catch'
readonly EXPORT_KEY="database-exports/match-n-catch-$(date -u +%Y%m%dT%H%M%SZ).zip"
readonly OUTPUT_FILE="match-n-catch-database-$(date -u +%Y%m%dT%H%M%SZ).zip"

for command in aws jq; do
  command -v "$command" >/dev/null 2>&1 || {
    printf 'Required command is unavailable: %s\n' "$command" >&2
    exit 1
  }
done

stack_output() {
  aws cloudformation describe-stacks --region "$REGION" --stack-name "$1" \
    --query "Stacks[0].Outputs[?OutputKey=='$2'].OutputValue | [0]" --output text
}

cluster="$(stack_output "${PROJECT_NAME}-application" EcsClusterName)"
service="$(stack_output "${PROJECT_NAME}-application" EcsServiceName)"
export_bucket="$(stack_output "${PROJECT_NAME}-application" DatabaseExportBucketName)"
task_definition="$(aws ecs describe-services --region "$REGION" --cluster "$cluster" --services "$service" \
  --query 'services[0].taskDefinition' --output text)"
network_configuration="$(aws ecs describe-services --region "$REGION" --cluster "$cluster" --services "$service" \
  --query 'services[0].networkConfiguration' --output json)"
overrides="$(jq -cn --arg key "$EXPORT_KEY" \
  '{containerOverrides: [{name: "Main", command: ["python", "manage.py", "export_database", "--key", $key]}]}')"

task_arn="$(aws ecs run-task --region "$REGION" --cluster "$cluster" --task-definition "$task_definition" \
  --launch-type FARGATE --network-configuration "$network_configuration" --overrides "$overrides" \
  --tags key=asbg,value=sguday --query 'tasks[0].taskArn' --output text)"
[[ "$task_arn" != 'None' && -n "$task_arn" ]] || {
  printf 'Could not start the database export task.\n' >&2
  exit 1
}

aws ecs wait tasks-stopped --region "$REGION" --cluster "$cluster" --tasks "$task_arn"
exit_code="$(aws ecs describe-tasks --region "$REGION" --cluster "$cluster" --tasks "$task_arn" \
  --query 'tasks[0].containers[?name==`Main`].exitCode | [0]' --output text)"
[[ "$exit_code" == '0' ]] || {
  printf 'Database export task failed (exit code %s). Task ARN: %s\n' "$exit_code" "$task_arn" >&2
  exit 1
}

aws s3 cp --region "$REGION" "s3://${export_bucket}/${EXPORT_KEY}" "$OUTPUT_FILE"
printf 'Downloaded database export to %s\n' "$OUTPUT_FILE"
