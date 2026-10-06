#!/usr/bin/env bash
# =============================================================================
# Harvesta — AWS WAF Deployment Script
# Protects against: SQL Injection, XSS, Path Traversal, Request Smuggling
# Scope: REGIONAL (use with ALB or API Gateway)
#        Change SCOPE to CLOUDFRONT and REGION to us-east-1 for CloudFront
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration — adjust as needed
# ---------------------------------------------------------------------------
SCOPE="REGIONAL"           # REGIONAL | CLOUDFRONT
REGION="us-east-1"
WEBACL_NAME="harvesta-waf"
DESCRIPTION="Harvesta WAF: SQLi, XSS, Path Traversal, Request Smuggling protection"
RULES_FILE="$(dirname "$0")/webacl-rules.json"
TAGS='[{"Key":"Project","Value":"Harvesta"},{"Key":"Environment","Value":"production"},{"Key":"ManagedBy","Value":"waf-deploy-script"}]'

# ALB / API Gateway / CloudFront ARN to associate after creation (optional)
# Set this if you want the script to auto-associate the WebACL.
# Example for ALB:     arn:aws:elasticloadbalancing:us-east-1:123456789:loadbalancer/app/harvesta/abc123
# Example for API GW:  arn:aws:apigateway:us-east-1::/restapis/abc123/stages/prod
RESOURCE_ARN=""

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------
command -v aws >/dev/null 2>&1 || { echo "ERROR: aws CLI not found. Install with: pip install awscli"; exit 1; }
aws sts get-caller-identity --region "$REGION" >/dev/null 2>&1 || {
  echo "ERROR: No valid AWS credentials. Run 'aws configure' or set AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY/AWS_SESSION_TOKEN."
  exit 1
}
[[ -f "$RULES_FILE" ]] || { echo "ERROR: Rules file not found at $RULES_FILE"; exit 1; }

echo "============================================================"
echo "  Harvesta AWS WAF Deployment"
echo "  Account : $(aws sts get-caller-identity --query Account --output text --region "$REGION")"
echo "  Region  : $REGION"
echo "  Scope   : $SCOPE"
echo "  WebACL  : $WEBACL_NAME"
echo "============================================================"

# ---------------------------------------------------------------------------
# Step 1 — Check for existing WebACL with the same name
# ---------------------------------------------------------------------------
echo ""
echo "[1/5] Checking for existing WebACL..."

EXISTING_ARN=$(aws wafv2 list-web-acls \
  --scope "$SCOPE" \
  --region "$REGION" \
  --query "WebACLs[?Name=='${WEBACL_NAME}'].ARN | [0]" \
  --output text 2>/dev/null || true)

if [[ -n "$EXISTING_ARN" && "$EXISTING_ARN" != "None" ]]; then
  echo "  WebACL '$WEBACL_NAME' already exists: $EXISTING_ARN"
  echo "  To update it, run: $0 --update"
  echo "  Skipping creation. Exporting existing ARN."
  WEBACL_ARN="$EXISTING_ARN"
else
  # -------------------------------------------------------------------------
  # Step 2 — Create the WebACL
  # -------------------------------------------------------------------------
  echo ""
  echo "[2/5] Creating WebACL '$WEBACL_NAME'..."

  RULES_JSON=$(cat "$RULES_FILE")

  CREATE_OUTPUT=$(aws wafv2 create-web-acl \
    --name "$WEBACL_NAME" \
    --scope "$SCOPE" \
    --region "$REGION" \
    --description "$DESCRIPTION" \
    --default-action '{"Allow":{}}' \
    --rules "$RULES_JSON" \
    --visibility-config '{
      "SampledRequestsEnabled": true,
      "CloudWatchMetricsEnabled": true,
      "MetricName": "HarvestaWAFMetric"
    }' \
    --tags "$TAGS" \
    --output json)

  WEBACL_ARN=$(echo "$CREATE_OUTPUT" | python3 -c "import sys,json; print(json.load(sys.stdin)['Summary']['ARN'])")
  WEBACL_ID=$(echo "$CREATE_OUTPUT"  | python3 -c "import sys,json; print(json.load(sys.stdin)['Summary']['Id'])")

  echo "  ✓ WebACL created successfully"
  echo "    ARN : $WEBACL_ARN"
  echo "    ID  : $WEBACL_ID"
fi

# ---------------------------------------------------------------------------
# Step 3 — Enable logging to CloudWatch Logs (optional but recommended)
# ---------------------------------------------------------------------------
echo ""
echo "[3/5] Setting up WAF logging (CloudWatch Logs)..."

LOG_GROUP_NAME="aws-waf-logs-harvesta"

# Create log group if it doesn't exist
aws logs create-log-group \
  --log-group-name "$LOG_GROUP_NAME" \
  --region "$REGION" 2>/dev/null || true

# Retain logs for 90 days
aws logs put-retention-policy \
  --log-group-name "$LOG_GROUP_NAME" \
  --retention-in-days 90 \
  --region "$REGION" 2>/dev/null || true

LOG_GROUP_ARN="arn:aws:logs:${REGION}:$(aws sts get-caller-identity --query Account --output text --region "$REGION"):log-group:${LOG_GROUP_NAME}"

aws wafv2 put-logging-configuration \
  --logging-configuration "{
    \"ResourceArn\": \"${WEBACL_ARN}\",
    \"LogDestinationConfigs\": [\"${LOG_GROUP_ARN}\"]
  }" \
  --region "$REGION" 2>/dev/null && echo "  ✓ Logging enabled → $LOG_GROUP_NAME" || \
  echo "  ⚠ Logging setup skipped (may need waf-regional.amazonaws.com log delivery permission)"

# ---------------------------------------------------------------------------
# Step 4 — Associate with resource (if ARN provided)
# ---------------------------------------------------------------------------
echo ""
echo "[4/5] Resource association..."

if [[ -n "$RESOURCE_ARN" ]]; then
  echo "  Associating WebACL with: $RESOURCE_ARN"
  aws wafv2 associate-web-acl \
    --web-acl-arn "$WEBACL_ARN" \
    --resource-arn "$RESOURCE_ARN" \
    --region "$REGION"
  echo "  ✓ WebACL associated with resource"
else
  echo "  ℹ RESOURCE_ARN not set — skipping association."
  echo "    To associate manually, run:"
  echo "    aws wafv2 associate-web-acl \\"
  echo "      --web-acl-arn \"$WEBACL_ARN\" \\"
  echo "      --resource-arn \"<YOUR_ALB_OR_APIGATEWAY_ARN>\" \\"
  echo "      --region $REGION"
fi

# ---------------------------------------------------------------------------
# Step 5 — Verify: describe the WebACL and list rules
# ---------------------------------------------------------------------------
echo ""
echo "[5/5] Verifying WebACL configuration..."

WEBACL_ID=$(aws wafv2 list-web-acls \
  --scope "$SCOPE" \
  --region "$REGION" \
  --query "WebACLs[?Name=='${WEBACL_NAME}'].Id | [0]" \
  --output text)

WEBACL_DETAILS=$(aws wafv2 get-web-acl \
  --name "$WEBACL_NAME" \
  --id "$WEBACL_ID" \
  --scope "$SCOPE" \
  --region "$REGION" \
  --output json)

RULE_COUNT=$(echo "$WEBACL_DETAILS" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['WebACL']['Rules']))")
RULE_NAMES=$(echo "$WEBACL_DETAILS" | python3 -c "
import sys, json
acl = json.load(sys.stdin)['WebACL']['Rules']
for r in acl:
    action = list(r.get('Action', r.get('OverrideAction', {'?': {}})).keys())[0]
    print(f'  Priority {r[\"Priority\"]:>3} | {action:<14} | {r[\"Name\"]}')
")

echo "  WebACL: $WEBACL_NAME"
echo "  Rules ($RULE_COUNT total):"
echo "$RULE_NAMES"

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "============================================================"
echo "  DEPLOYMENT COMPLETE"
echo "============================================================"
echo "  WebACL ARN:"
echo "  $WEBACL_ARN"
echo ""
echo "  Next steps:"
echo "  1. Associate with your ALB/API Gateway (see Step 4 above)"
echo "  2. Monitor WAF in CloudWatch: aws-waf-logs-harvesta log group"
echo "  3. Review sampled requests in AWS Console → WAF → '$WEBACL_NAME'"
echo "  4. Tune rules to COUNT mode first if false positives occur:"
echo "     aws wafv2 update-web-acl ... (see waf/update-rule-to-count.sh)"
echo "============================================================"

# Export ARN to a file for use in CI/CD pipelines
echo "$WEBACL_ARN" > "$(dirname "$0")/webacl-arn.txt"
echo ""
echo "  ARN saved to: waf/webacl-arn.txt"
