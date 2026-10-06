#!/bin/bash
set -euo pipefail

# ════════════════════════════════════════════════════════════════════════════════
# Deploy CloudFront CDN with global edge locations
# Usage: ./deploy-cdn.sh <staging|production>
# ════════════════════════════════════════════════════════════════════════════════

ENVIRONMENT="${1:-staging}"
STACK_NAME="stellar-cdn-${ENVIRONMENT}"
REGION="us-east-1"  # CloudFront requires us-east-1 for ACM certificates

if [[ "$ENVIRONMENT" != "staging" && "$ENVIRONMENT" != "production" ]]; then
  echo "Error: Environment must be 'staging' or 'production'"
  exit 1
fi

# Load environment-specific configuration
if [[ "$ENVIRONMENT" == "production" ]]; then
  S3_BUCKET="${AWS_S3_BUCKET_PROD:-stellar-tree-photos-prod}"
  VERCEL_DOMAIN="${VERCEL_DOMAIN_PROD:-stellar-app-os.vercel.app}"
  CDN_DOMAIN="${CDN_DOMAIN_PROD:-cdn.farmcredit.com}"
  ACM_CERT_ARN="${ACM_CERT_ARN_PROD}"
else
  S3_BUCKET="${AWS_S3_BUCKET_STAGING:-stellar-tree-photos-staging}"
  VERCEL_DOMAIN="${VERCEL_DOMAIN_STAGING:-stellar-app-os-staging.vercel.app}"
  CDN_DOMAIN="${CDN_DOMAIN_STAGING:-cdn-staging.farmcredit.com}"
  ACM_CERT_ARN="${ACM_CERT_ARN_STAGING}"
fi

# Validate required variables
if [[ -z "${S3_BUCKET}" ]]; then
  echo "Error: S3 bucket name not configured"
  exit 1
fi

if [[ -z "${VERCEL_DOMAIN}" ]]; then
  echo "Error: Vercel domain not configured"
  exit 1
fi

if [[ -z "${ACM_CERT_ARN}" ]]; then
  echo "Error: ACM certificate ARN not configured"
  echo "Create an ACM certificate in us-east-1 for ${CDN_DOMAIN}"
  exit 1
fi

echo "═══════════════════════════════════════════════════════════════════════════"
echo "Deploying CloudFront CDN Stack"
echo "═══════════════════════════════════════════════════════════════════════════"
echo "Environment: ${ENVIRONMENT}"
echo "Region: ${REGION}"
echo "Stack: ${STACK_NAME}"
echo "S3 Bucket: ${S3_BUCKET}"
echo "Vercel Domain: ${VERCEL_DOMAIN}"
echo "CDN Domain: ${CDN_DOMAIN}"
echo "═══════════════════════════════════════════════════════════════════════════"

# Deploy CloudFormation stack
aws cloudformation deploy \
  --template-file cdn-stack.yaml \
  --stack-name "${STACK_NAME}" \
  --region "${REGION}" \
  --parameter-overrides \
    Environment="${ENVIRONMENT}" \
    S3PhotosBucketName="${S3_BUCKET}" \
    VercelDomain="${VERCEL_DOMAIN}" \
    DomainName="${CDN_DOMAIN}" \
    ACMCertificateArn="${ACM_CERT_ARN}" \
  --capabilities CAPABILITY_IAM \
  --no-fail-on-empty-changeset

# Get distribution ID and URL
DISTRIBUTION_ID=$(aws cloudformation describe-stacks \
  --stack-name "${STACK_NAME}" \
  --region "${REGION}" \
  --query 'Stacks[0].Outputs[?OutputKey==`DistributionId`].OutputValue' \
  --output text)

CDN_URL=$(aws cloudformation describe-stacks \
  --stack-name "${STACK_NAME}" \
  --region "${REGION}" \
  --query 'Stacks[0].Outputs[?OutputKey==`CDNUrl`].OutputValue' \
  --output text)

echo "═══════════════════════════════════════════════════════════════════════════"
echo "✅ CDN Deployment Complete"
echo "═══════════════════════════════════════════════════════════════════════════"
echo "Distribution ID: ${DISTRIBUTION_ID}"
echo "CDN URL: ${CDN_URL}"
echo ""
echo "Next steps:"
echo "1. Update DNS: Create CNAME record for ${CDN_DOMAIN} pointing to CloudFront domain"
echo "2. Update environment variables:"
echo "   - NEXT_PUBLIC_CDN_URL=${CDN_URL}"
echo "   - CLOUDFRONT_DISTRIBUTION_ID=${DISTRIBUTION_ID}"
echo "3. Wait for CloudFront distribution to deploy (15-20 minutes)"
echo "4. Test TTFB: curl -w '@curl-format.txt' -o /dev/null -s ${CDN_URL}/planting-photos/test.jpg"
echo "═══════════════════════════════════════════════════════════════════════════"
