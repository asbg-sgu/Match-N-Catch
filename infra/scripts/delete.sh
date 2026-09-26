#!/usr/bin/env bash
# Deletes only CloudFormation stacks created by deploy.sh, in reverse dependency order.
# It never calls an S3 deletion API. The stack-managed RDS database is deleted last.
set -Eeuo pipefail

readonly REGION='ap-southeast-1'
readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly PARAMETER_DIR="$ROOT_DIR/infra/parameters"
readonly PROJECT_NAME="$(jq -r '.[] | select(.ParameterKey == "ProjectName") | .ParameterValue' "$PARAMETER_DIR/network.json")"
export AWS_REGION="$REGION"
export AWS_DEFAULT_REGION="$REGION"

command -v aws >/dev/null 2>&1 || { printf 'Required command not found: aws\n' >&2; exit 1; }
command -v jq >/dev/null 2>&1 || { printf 'Required command not found: jq\n' >&2; exit 1; }
aws sts get-caller-identity >/dev/null

delete_stack() {
  local stack_name="$1"
  if ! aws cloudformation describe-stacks --stack-name "$stack_name" >/dev/null 2>&1; then
    printf '%s does not exist; skipping.\n' "$stack_name"
    return
  fi
  printf 'Deleting %s...\n' "$stack_name"
  aws cloudformation delete-stack --stack-name "$stack_name"
  aws cloudformation wait stack-delete-complete --stack-name "$stack_name"
}

delete_stack "${PROJECT_NAME}-github-oidc"
delete_stack "${PROJECT_NAME}-application"
delete_stack "${PROJECT_NAME}-registry"
delete_stack "${PROJECT_NAME}-secrets"
delete_stack "${PROJECT_NAME}-network"
delete_stack "${PROJECT_NAME}-data"
printf 'Stack deletion succeeded. Existing match-n-catch-bucket was not touched; the stack-managed database was deleted.\n'
