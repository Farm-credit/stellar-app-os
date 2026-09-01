#!/usr/bin/env bash
set -euo pipefail

ENVIRONMENT="${1:-production}"
STACK_NAME="${STACK_NAME:-stellar-app-${ENVIRONMENT}-waf}"
REGION="${AWS_REGION:-us-east-1}"
DISTRIBUTION_ARN="${DISTRIBUTION_ARN:-}"
WEB_ACL_NAME="${WEB_ACL_NAME:-stellar-app-${ENVIRONMENT}-waf}"
METRICS_NAME="${METRICS_NAME:-StellarApp${ENVIRONMENT^}Waf}"

if [[ -z "$DISTRIBUTION_ARN" ]]; then
  echo "DISTRIBUTION_ARN is required. Export it before running this script."
  echo "Example: export DISTRIBUTION_ARN=arn:aws:cloudfront::123456789012:distribution/ABC123DEF456"
  exit 1
fi

aws cloudformation deploy \
  --region "$REGION" \
  --template-file infra/aws/waf/web-acl.yaml \
  --stack-name "$STACK_NAME" \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides \
    EnvironmentName="$ENVIRONMENT" \
    DistributionArn="$DISTRIBUTION_ARN" \
    WebAclName="$WEB_ACL_NAME" \
    MetricsName="$METRICS_NAME"

echo "WAF deployment complete for $DISTRIBUTION_ARN"
