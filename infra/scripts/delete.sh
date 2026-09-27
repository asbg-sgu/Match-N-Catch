#!/usr/bin/env bash
# Completely deletes the infrastructure created or used by deploy.sh, in reverse
# dependency order. This includes the pre-existing frontend bucket and the
# retained database-export bucket, along with all of their object versions.
set -Eeuo pipefail

readonly REGION='ap-southeast-1'
readonly FRONTEND_BUCKET='match-n-catch-bucket'
readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly PARAMETER_DIR="$ROOT_DIR/infra/parameters"
readonly PROJECT_NAME="$(jq -r '.[] | select(.ParameterKey == "ProjectName") | .ParameterValue' "$PARAMETER_DIR/network.json")"
export AWS_REGION="$REGION"
export AWS_DEFAULT_REGION="$REGION"

command -v aws >/dev/null 2>&1 || { printf 'Required command not found: aws\n' >&2; exit 1; }
command -v jq >/dev/null 2>&1 || { printf 'Required command not found: jq\n' >&2; exit 1; }
aws sts get-caller-identity >/dev/null

stack_output() {
  local stack_name="$1" output_key="$2"
  aws cloudformation describe-stacks --stack-name "$stack_name" \
    --query "Stacks[0].Outputs[?OutputKey=='$output_key'].OutputValue | [0]" --output text
}

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

empty_and_delete_bucket() {
  local bucket="$1" versions_file request_file count offset head_error
  if ! head_error="$(aws s3api head-bucket --bucket "$bucket" 2>&1)"; then
    if [[ "$head_error" == *'(404)'* || "$head_error" == *'Not Found'* ]]; then
      printf 'Bucket %s does not exist; skipping.\n' "$bucket"
      return
    fi
    printf 'Cannot verify access to bucket %s: %s\n' "$bucket" "$head_error" >&2
    return 1
  fi

  versions_file="$(mktemp)"
  request_file="$(mktemp)"
  # Clean temporary request files even if an AWS command fails.
  trap 'rm -f "$versions_file" "$request_file"' RETURN

  # list-object-versions is deliberately used instead of `s3 rm --recursive`:
  # the latter leaves noncurrent versions and delete markers behind.
  aws s3api list-object-versions --bucket "$bucket" --output json > "$versions_file"
  count="$(jq '[((.Versions // [])[]), ((.DeleteMarkers // [])[])] | length' "$versions_file")"

  for ((offset = 0; offset < count; offset += 1000)); do
    jq --argjson offset "$offset" \
      '[((.Versions // [])[]), ((.DeleteMarkers // [])[])] | .[$offset:$offset + 1000] | {Objects: map({Key, VersionId}), Quiet: true}' \
      "$versions_file" > "$request_file"
    aws s3api delete-objects --bucket "$bucket" --delete "file://$request_file" >/dev/null
  done

  printf 'Deleting bucket %s...\n' "$bucket"
  aws s3api delete-bucket --bucket "$bucket"
  trap - RETURN
  rm -f "$versions_file" "$request_file"
}

# The application stack deliberately retains this bucket, so save its generated
# name before deleting the stack. This also avoids deleting an unrelated bucket.
export_bucket=''
if aws cloudformation describe-stacks --stack-name "${PROJECT_NAME}-application" >/dev/null 2>&1; then
  export_bucket="$(stack_output "${PROJECT_NAME}-application" DatabaseExportBucketName)"
  [[ "$export_bucket" != 'None' ]] || export_bucket=''
fi

delete_stack "${PROJECT_NAME}-github-oidc"
delete_stack "${PROJECT_NAME}-application"
if [[ -n "$export_bucket" ]]; then
  empty_and_delete_bucket "$export_bucket"
fi
delete_stack "${PROJECT_NAME}-registry"
delete_stack "${PROJECT_NAME}-secrets"
delete_stack "${PROJECT_NAME}-network"
delete_stack "${PROJECT_NAME}-data"
empty_and_delete_bucket "$FRONTEND_BUCKET"
printf 'Complete deletion succeeded: stacks, database, container images, secrets, logs, and both S3 buckets were removed.\n'
