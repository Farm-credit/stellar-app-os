#!/usr/bin/env bash
# =============================================================================
# Switch a WAF rule to COUNT mode (non-blocking) for tuning / false-positive review
# Usage: ./tune-rule.sh <RULE_NAME> [count|block]
# Example: ./tune-rule.sh AWSManagedRulesCommonRuleSet count
# =============================================================================

set -euo pipefail

SCOPE="REGIONAL"
REGION="us-east-1"
WEBACL_NAME="harvesta-waf"
RULE_NAME="${1:-}"
MODE="${2:-count}"   # count | block

if [[ -z "$RULE_NAME" ]]; then
  echo "Usage: $0 <RULE_NAME> [count|block]"
  echo ""
  echo "Available rule names:"
  echo "  RateLimitPerIP"
  echo "  BlockRequestSmuggling"
  echo "  BlockSuspiciousTransferEncodingHeader"
  echo "  AWSManagedRulesCommonRuleSet"
  echo "  AWSManagedRulesSQLiRuleSet"
  echo "  AWSManagedRulesKnownBadInputsRuleSet"
  exit 1
fi

echo "Fetching current WebACL state..."
WEBACL_ID=$(aws wafv2 list-web-acls \
  --scope "$SCOPE" --region "$REGION" \
  --query "WebACLs[?Name=='${WEBACL_NAME}'].Id | [0]" \
  --output text)

WEBACL_JSON=$(aws wafv2 get-web-acl \
  --name "$WEBACL_NAME" --id "$WEBACL_ID" \
  --scope "$SCOPE" --region "$REGION" --output json)

LOCK_TOKEN=$(echo "$WEBACL_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['LockToken'])")

# Patch the rule action using Python
UPDATED_RULES=$(echo "$WEBACL_JSON" | python3 - "$RULE_NAME" "$MODE" << 'PYEOF'
import sys, json

data = json.load(open('/dev/stdin') if False else sys.stdin)  # handled by pipe
# args already read via sys.argv when called as python3 - arg1 arg2
# Re-read from first arg stdin workaround:
PYEOF
)

# More reliable: use Python to patch the rules JSON inline
UPDATED_RULES=$(echo "$WEBACL_JSON" | python3 -c "
import sys, json

args = sys.argv[1:]
rule_name = args[0]
mode = args[1]  # 'count' or 'block'

data = json.load(sys.stdin)
rules = data['WebACL']['Rules']

for rule in rules:
    if rule['Name'] == rule_name:
        if mode == 'count':
            # Managed rule groups use OverrideAction
            if 'OverrideAction' in rule:
                rule['OverrideAction'] = {'Count': {}}
            elif 'Action' in rule:
                rule['Action'] = {'Count': {}}
        else:
            # Restore block
            if 'OverrideAction' in rule:
                rule['OverrideAction'] = {'None': {}}
            elif 'Action' in rule:
                rule['Action'] = {'Block': {}}
        print(f'  Patched rule: {rule_name} -> {mode}', file=sys.stderr)

print(json.dumps(rules))
" "$RULE_NAME" "$MODE")

VISIBILITY_CONFIG=$(echo "$WEBACL_JSON" | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin)['WebACL']['VisibilityConfig']))")
DESCRIPTION=$(echo "$WEBACL_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['WebACL'].get('Description',''))")

echo "Updating WebACL with rule '$RULE_NAME' set to '$MODE' mode..."
aws wafv2 update-web-acl \
  --name "$WEBACL_NAME" \
  --id "$WEBACL_ID" \
  --scope "$SCOPE" \
  --region "$REGION" \
  --default-action '{"Allow":{}}' \
  --rules "$UPDATED_RULES" \
  --visibility-config "$VISIBILITY_CONFIG" \
  --lock-token "$LOCK_TOKEN" \
  --description "$DESCRIPTION" \
  --output json > /dev/null

echo "✓ Done. Rule '$RULE_NAME' is now in '$MODE' mode."
