#!/usr/bin/env bash
# Deploys only the Match N Catch CloudFormation stacks. Existing S3 and RDS are
# discovered and tagged, but are never placed in a stack or deleted.
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
aws cloudformation validate-template --template-body "file://$TEMPLATE_DIR/secrets.yml" >/dev/null
aws cloudformation validate-template --template-body "file://$TEMPLATE_DIR/registry.yml" >/dev/null
aws cloudformation validate-template --template-body "file://$TEMPLATE_DIR/application.yml" >/dev/null
aws cloudformation validate-template --template-body "file://$TEMPLATE_DIR/github-oidc.yml" >/dev/null

aws s3api head-bucket --bucket "$S3_BUCKET"
tag_existing_bucket

rds="$(aws rds describe-db-instances --db-instance-identifier "$RDS_IDENTIFIER" --query 'DBInstances[0]' --output json)"
[[ "$(jq -r '.DBInstanceStatus' <<<"$rds")" == 'available' ]] || { printf 'Existing RDS instance must be available.\n' >&2; exit 1; }
engine="$(jq -r '.Engine' <<<"$rds")"
[[ "$engine" == *mysql* || "$engine" == mariadb* ]] || { printf 'RDS engine %s is not supported by this Django MySQL configuration.\n' "$engine" >&2; exit 1; }
vpc_id="$(jq -r '.DBSubnetGroup.VpcId' <<<"$rds")"
rds_security_groups="$(jq -r '[.VpcSecurityGroups[].VpcSecurityGroupId] | join(",")' <<<"$rds")"
rds_arn="$(jq -r '.DBInstanceArn' <<<"$rds")"
rds_endpoint="$(jq -r '.Endpoint.Address' <<<"$rds")"
rds_port="$(jq -r '.Endpoint.Port' <<<"$rds")"
database_name="$(jq -r '.DBName // empty' <<<"$rds")"
database_name="${database_name:-match_n_catch}"
[[ -n "$vpc_id" && -n "$rds_security_groups" && -n "$rds_endpoint" ]] || { printf 'RDS networking metadata is incomplete.\n' >&2; exit 1; }
aws rds add-tags-to-resource --resource-name "$rds_arn" --tags Key=asbg,Value=sguday

rds_master_secret="$(jq -r '.MasterUserSecret.SecretArn // empty' <<<"$rds")"
if [[ -z "$rds_master_secret" ]]; then
  printf 'Enabling RDS-managed master credentials in Secrets Manager (no secret is displayed).\n'
  aws rds modify-db-instance --db-instance-identifier "$RDS_IDENTIFIER" --manage-master-user-password --apply-immediately >/dev/null
  aws rds wait db-instance-available --db-instance-identifier "$RDS_IDENTIFIER"
  rds_master_secret="$(aws rds describe-db-instances --db-instance-identifier "$RDS_IDENTIFIER" --query 'DBInstances[0].MasterUserSecret.SecretArn' --output text)"
fi
[[ "$rds_master_secret" != 'None' && -n "$rds_master_secret" ]] || { printf 'RDS did not provide a Secrets Manager master secret.\n' >&2; exit 1; }

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
oidc_provider_arn="arn:aws:iam::$(aws sts get-caller-identity --query Account --output text):oidc-provider/token.actions.githubusercontent.com"
create_oidc_provider=false
if ! aws iam get-open-id-connect-provider --open-id-connect-provider-arn "$oidc_provider_arn" >/dev/null 2>&1; then
  create_oidc_provider=true
fi

deploy_stack "${PROJECT_NAME}-network" "$TEMPLATE_DIR/network.yml" "$PARAMETER_DIR/network.json" \
  "VpcId=$vpc_id" "PublicSubnetIds=$public_subnet_ids" "RdsSecurityGroupIds=$rds_security_groups" "RdsPort=$rds_port"
deploy_stack "${PROJECT_NAME}-secrets" "$TEMPLATE_DIR/secrets.yml" "$PARAMETER_DIR/secrets.json" \
  "RdsMasterSecretArn=$rds_master_secret" "RdsEndpointAddress=$rds_endpoint" "RdsEndpointPort=$rds_port" "DatabaseName=$database_name"
deploy_stack "${PROJECT_NAME}-registry" "$TEMPLATE_DIR/registry.yml" "$PARAMETER_DIR/registry.json"

repository_uri="$(stack_output "${PROJECT_NAME}-registry" BackendRepositoryUri)"
aws ecr get-login-password | docker login --username AWS --password-stdin "${repository_uri%%/*}"
docker build --platform linux/amd64 --tag "${repository_uri}:latest" "$ROOT_DIR/backend"
docker push "${repository_uri}:latest"

deploy_stack "${PROJECT_NAME}-application" "$TEMPLATE_DIR/application.yml" "$PARAMETER_DIR/application.json"
run_migrations
deploy_stack "${PROJECT_NAME}-github-oidc" "$TEMPLATE_DIR/github-oidc.yml" "$PARAMETER_DIR/github-oidc.json" \
  "GitHubRepository=$github_repository" "CreateGitHubOidcProvider=$create_oidc_provider"

printf 'Deployment succeeded. Configure GitHub Actions variable AWS_ACCOUNT_ID=%s before pushing to main.\n' "$(aws sts get-caller-identity --query Account --output text)"
