#!/usr/bin/env bash
# Deploys Match N Catch CloudFormation stacks. The existing S3 bucket remains
# outside CloudFormation; the database is owned by the data stack.
set -Eeuo pipefail

readonly REGION='ap-southeast-1'
readonly RDS_IDENTIFIER='match-n-catch-database'
readonly S3_BUCKET='match-n-catch-bucket'
readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly TEMPLATE_DIR="$ROOT_DIR/infra/templates"
readonly PARAMETER_DIR="$ROOT_DIR/infra/parameters"
readonly PROJECT_NAME="$(jq -r '.[] | select(.ParameterKey == "ProjectName") | .ParameterValue' "$PARAMETER_DIR/network.json")"

export AWS_REGION="$REGION"
export AWS_DEFAULT_REGION="$REGION"

new_stacks=()

cleanup_failed_new_stacks() {
  local exit_code=$?
  trap - ERR EXIT
  if (( exit_code != 0 )); then
    local stack status
    for stack in "${new_stacks[@]}"; do
      status="$(aws cloudformation describe-stacks --stack-name "$stack" --query 'Stacks[0].StackStatus' --output text 2>/dev/null || true)"
      if [[ "$status" == *ROLLBACK* || "$status" == *FAILED* ]]; then
        printf 'New stack %s ended in %s; deleting it.\n' "$stack" "$status" >&2
        aws cloudformation delete-stack --stack-name "$stack" || true
        aws cloudformation wait stack-delete-complete --stack-name "$stack" || true
      fi
    done
  fi
  exit "$exit_code"
}
trap cleanup_failed_new_stacks ERR EXIT

require_command() {
  command -v "$1" >/dev/null 2>&1 || { printf 'Required command not found: %s\n' "$1" >&2; exit 1; }
}

stack_exists() {
  aws cloudformation describe-stacks --stack-name "$1" >/dev/null 2>&1
}

parameter_values() {
  jq -r '.[] | "\(.ParameterKey)=\(.ParameterValue)"' "$1"
}

deploy_stack() {
  local stack_name="$1" template="$2" parameter_file="$3"
  shift 3
  local -a parameters=()
  mapfile -t parameters < <(parameter_values "$parameter_file")
  local is_new=false
  if ! stack_exists "$stack_name"; then
    is_new=true
    new_stacks+=("$stack_name")
  fi

  printf 'Deploying %s (%s stack)...\n' "$stack_name" "$([[ "$is_new" == true ]] && echo new || echo existing)"
  aws cloudformation deploy \
    --stack-name "$stack_name" \
    --template-file "$template" \
    --parameter-overrides "${parameters[@]}" "$@" \
    --capabilities CAPABILITY_NAMED_IAM \
    --tags asbg=sguday \
    --no-fail-on-empty-changeset
  printf '%s is complete.\n' "$stack_name"
}

stack_output() {
  aws cloudformation describe-stacks --stack-name "$1" \
    --query "Stacks[0].Outputs[?OutputKey=='$2'].OutputValue | [0]" --output text
}

run_migrations() {
  local cluster service task_definition network_configuration task_arn exit_code
  cluster="$(stack_output "${PROJECT_NAME}-application" EcsClusterName)"
  service="$(stack_output "${PROJECT_NAME}-application" EcsServiceName)"
  task_definition="$(stack_output "${PROJECT_NAME}-application" TaskDefinitionArn)"
  network_configuration="$(aws ecs describe-services --cluster "$cluster" --services "$service" --query 'services[0].networkConfiguration' --output json)"
  task_arn="$(aws ecs run-task \
    --cluster "$cluster" \
    --task-definition "$task_definition" \
    --launch-type FARGATE \
    --network-configuration "$network_configuration" \
    --overrides '{"containerOverrides":[{"name":"Main","command":["python","manage.py","migrate","--noinput"]}]}' \
    --tags key=asbg,value=sguday \
    --query 'tasks[0].taskArn' --output text)"
  [[ "$task_arn" != 'None' && -n "$task_arn" ]] || { printf 'Could not start the ECS migration task.\n' >&2; return 1; }
  aws ecs wait tasks-stopped --cluster "$cluster" --tasks "$task_arn"
  exit_code="$(aws ecs describe-tasks --cluster "$cluster" --tasks "$task_arn" --query 'tasks[0].containers[?name==`Main`].exitCode | [0]' --output text)"
  [[ "$exit_code" == '0' ]] || { printf 'ECS migration task exited with %s.\n' "$exit_code" >&2; return 1; }
}

tag_existing_bucket() {
  local existing_tags merged_tags
  existing_tags="$(aws s3api get-bucket-tagging --bucket "$S3_BUCKET" --query 'TagSet' --output json 2>/dev/null || printf '[]')"
  merged_tags="$(jq -cn --argjson tags "$existing_tags" '{TagSet: (($tags | map(select(.Key != "asbg"))) + [{Key:"asbg",Value:"sguday"}])}')"
  aws s3api put-bucket-tagging --bucket "$S3_BUCKET" --tagging "$merged_tags"
}

subnet_has_igw_route() {
  local subnet_id="$1" tables
  tables="$(aws ec2 describe-route-tables --filters "Name=association.subnet-id,Values=$subnet_id" --output json)"
  if [[ "$(jq '.RouteTables | length' <<<"$tables")" == '0' ]]; then
    tables="$(aws ec2 describe-route-tables --filters "Name=vpc-id,Values=$vpc_id" --output json)"
    tables="$(jq '{RouteTables: [.RouteTables[] | select(any(.Associations[]?; .Main == true))]}' <<<"$tables")"
  fi
  jq -e '[.RouteTables[].Routes[]? | select(.State == "active") | .GatewayId // ""] | any(startswith("igw-"))' <<<"$tables" >/dev/null
}

discover_github_repository() {
  if [[ -n "${GITHUB_REPOSITORY:-}" ]]; then
    printf '%s' "$GITHUB_REPOSITORY"
    return
  fi
  local origin repository
  origin="$(git -C "$ROOT_DIR" config --get remote.origin.url 2>/dev/null || true)"
  repository="$(sed -E -n 's#(git@github.com:|https://github.com/)([^/]+/[^/.]+)(\.git)?#\2#p' <<<"$origin")"
  [[ -n "$repository" ]] || { printf 'Set GITHUB_REPOSITORY to owner/repository, or configure origin as a GitHub remote.\n' >&2; exit 1; }
  printf '%s' "$repository"
}

for command in aws jq docker git; do require_command "$command"; done
aws sts get-caller-identity >/dev/null
aws cloudformation validate-template --template-body "file://$TEMPLATE_DIR/network.yml" >/dev/null
aws cloudformation validate-template --template-body "file://$TEMPLATE_DIR/data.yml" >/dev/null
aws cloudformation validate-template --template-body "file://$TEMPLATE_DIR/secrets.yml" >/dev/null
aws cloudformation validate-template --template-body "file://$TEMPLATE_DIR/registry.yml" >/dev/null
aws cloudformation validate-template --template-body "file://$TEMPLATE_DIR/application.yml" >/dev/null
aws cloudformation validate-template --template-body "file://$TEMPLATE_DIR/github-oidc.yml" >/dev/null

aws s3api head-bucket --bucket "$S3_BUCKET"
tag_existing_bucket

vpc_id="$(aws ec2 describe-vpcs --filters Name=is-default,Values=true --query 'Vpcs[0].VpcId' --output text)"
[[ "$vpc_id" != 'None' && -n "$vpc_id" ]] || { printf 'This cost-conscious deployment requires a default VPC in ap-southeast-1.\n' >&2; exit 1; }
if ! stack_exists "${PROJECT_NAME}-data" && aws rds describe-db-instances --db-instance-identifier "$RDS_IDENTIFIER" >/dev/null 2>&1; then
  printf 'RDS instance %s already exists outside the data stack. It will not be deleted or adopted automatically. Delete or rename that unmanaged instance before creating this stack.\n' "$RDS_IDENTIFIER" >&2
  exit 1
fi

declare -A selected_azs=()
public_subnets=()
while IFS=$'\t' read -r subnet_id availability_zone; do
  [[ -n "$subnet_id" && -z "${selected_azs[$availability_zone]:-}" ]] || continue
  if subnet_has_igw_route "$subnet_id"; then
    public_subnets+=("$subnet_id")
    selected_azs["$availability_zone"]=1
  fi
  (( ${#public_subnets[@]} == 2 )) && break
done < <(aws ec2 describe-subnets --filters "Name=vpc-id,Values=$vpc_id" "Name=state,Values=available" --query 'Subnets[].[SubnetId,AvailabilityZone]' --output text)
(( ${#public_subnets[@]} == 2 )) || { printf 'RDS VPC %s needs two public subnets in distinct AZs with an IGW route; no NAT is created by design.\n' "$vpc_id" >&2; exit 1; }
public_subnet_ids="$(IFS=,; printf '%s' "${public_subnets[*]}")"

github_repository="$(discover_github_repository)"
github_oidc_subject="${GITHUB_OIDC_SUBJECT:-}"
oidc_provider_arn="arn:aws:iam::$(aws sts get-caller-identity --query Account --output text):oidc-provider/token.actions.githubusercontent.com"
create_oidc_provider=false
if ! aws iam get-open-id-connect-provider --open-id-connect-provider-arn "$oidc_provider_arn" >/dev/null 2>&1; then
  create_oidc_provider=true
fi

deploy_stack "${PROJECT_NAME}-data" "$TEMPLATE_DIR/data.yml" "$PARAMETER_DIR/data.json" \
  "VpcId=$vpc_id" "DbSubnetIds=$public_subnet_ids"
aws secretsmanager tag-resource --secret-id "$(stack_output "${PROJECT_NAME}-data" MasterUserSecretArn)" --tags Key=asbg,Value=sguday
deploy_stack "${PROJECT_NAME}-network" "$TEMPLATE_DIR/network.yml" "$PARAMETER_DIR/network.json" \
  "VpcId=$vpc_id" "PublicSubnetIds=$public_subnet_ids"
deploy_stack "${PROJECT_NAME}-secrets" "$TEMPLATE_DIR/secrets.yml" "$PARAMETER_DIR/secrets.json"
deploy_stack "${PROJECT_NAME}-registry" "$TEMPLATE_DIR/registry.yml" "$PARAMETER_DIR/registry.json"

repository_uri="$(stack_output "${PROJECT_NAME}-registry" BackendRepositoryUri)"
aws ecr get-login-password | docker login --username AWS --password-stdin "${repository_uri%%/*}"
docker build --platform linux/amd64 --tag "${repository_uri}:latest" "$ROOT_DIR/backend"
docker push "${repository_uri}:latest"

deploy_stack "${PROJECT_NAME}-application" "$TEMPLATE_DIR/application.yml" "$PARAMETER_DIR/application.json"
run_migrations
oidc_parameter_overrides=(
  "GitHubRepository=$github_repository"
  "CreateGitHubOidcProvider=$create_oidc_provider"
)
if [[ -n "$github_oidc_subject" ]]; then
  oidc_parameter_overrides+=("GitHubOidcSubject=$github_oidc_subject")
fi
deploy_stack "${PROJECT_NAME}-github-oidc" "$TEMPLATE_DIR/github-oidc.yml" "$PARAMETER_DIR/github-oidc.json" \
  "${oidc_parameter_overrides[@]}"

printf 'Deployment succeeded. Configure GitHub Actions secret AWS_ACCOUNT_ID=%s before pushing to main.\n' "$(aws sts get-caller-identity --query Account --output text)"
