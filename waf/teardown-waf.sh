#!/usr/bin/env bash
# =============================================================================
# Harvesta WAF Teardown — deletes the WebACL (irreversible)
# Usage: ./teardown-waf.sh
# =============================================================================

set -euo pipefail

SCOPE="REGIONAL"
REGION="us-east-1"
WEBACL_NAME="harvesta-waf"

echo "⚠  WARNING: This will permanently delete the '$WEBACL_NAME' WebACL."
read -r -p "Type 'yes' to confirm: " CONFIRM
[[ "$CONFIRM" == "yes" ]] || { echo "Aborted."; exit 0; }

echo "Fetching WebACL..."
WEBACL_ID=$(aws wafv2 list-web-acls \
  --scope "$SCOPE" --region "$REGION" \
  --query "WebACLs[?Name=='${WEBACL_NAME}'].Id | [0]" \
  --output text)

[[ -n "$WEBACL_ID" && "$WEBACL_ID" != "None" ]] || { echo "WebACL not found. Nothing to delete."; exit 0; }

LOCK_TOKEN=$(aws wafv2 get-web-acl \
  --name "$WEBACL_NAME" --id "$WEBACL_ID" \
  --scope "$SCOPE" --region "$REGION" \
  --query LockToken --output text)

echo "Deleting WebACL '$WEBACL_NAME' (ID: $WEBACL_ID)..."
aws wafv2 delete-web-acl \
  --name "$WEBACL_NAME" \
  --id "$WEBACL_ID" \
  --scope "$SCOPE" \
  --region "$REGION" \
  --lock-token "$LOCK_TOKEN"

echo "✓ WebACL deleted."
