#!/bin/bash
set -euo pipefail

# ════════════════════════════════════════════════════════════════════════════════
# Invalidate CloudFront cache for specific paths
# Usage: ./invalidate-cache.sh <distribution-id> <path1> [path2] [path3] ...
# ════════════════════════════════════════════════════════════════════════════════

DISTRIBUTION_ID="${1:-}"
shift || true
PATHS=("$@")

if [[ -z "${DISTRIBUTION_ID}" ]] || [[ ${#PATHS[@]} -eq 0 ]]; then
  echo "Usage: $0 <distribution-id> <path1> [path2] [path3] ..."
  echo ""
  echo "Examples:"
  echo "  # Invalidate all photos"
  echo "  $0 E1234567890ABC '/planting-photos/*'"
  echo ""
  echo "  # Invalidate specific photo"
  echo "  $0 E1234567890ABC '/planting-photos/farmer123/1699564800000.jpg'"
  echo ""
  echo "  # Invalidate map tiles"
  echo "  $0 E1234567890ABC '/api/planting/map*'"
  echo ""
  echo "  # Invalidate multiple paths"
  echo "  $0 E1234567890ABC '/planting-photos/*' '/api/planting/map*' '/_next/static/*'"
  exit 1
fi

echo "═══════════════════════════════════════════════════════════════════════════"
echo "CloudFront Cache Invalidation"
echo "═══════════════════════════════════════════════════════════════════════════"
echo "Distribution ID: ${DISTRIBUTION_ID}"
echo "Paths to invalidate:"
for path in "${PATHS[@]}"; do
  echo "  - ${path}"
done
echo "═══════════════════════════════════════════════════════════════════════════"
echo ""

# Create invalidation batch JSON
CALLER_REFERENCE="invalidation-$(date +%s)"
PATHS_JSON=$(printf '%s\n' "${PATHS[@]}" | jq -R . | jq -s .)

INVALIDATION_BATCH=$(cat <<EOF
{
  "Paths": {
    "Quantity": ${#PATHS[@]},
    "Items": ${PATHS_JSON}
  },
  "CallerReference": "${CALLER_REFERENCE}"
}
EOF
)

# Create invalidation
echo "Creating invalidation..."
INVALIDATION_OUTPUT=$(aws cloudfront create-invalidation \
  --distribution-id "${DISTRIBUTION_ID}" \
  --invalidation-batch "${INVALIDATION_BATCH}" \
  --output json)

INVALIDATION_ID=$(echo "${INVALIDATION_OUTPUT}" | jq -r '.Invalidation.Id')
INVALIDATION_STATUS=$(echo "${INVALIDATION_OUTPUT}" | jq -r '.Invalidation.Status')

echo "✅ Invalidation created successfully"
echo ""
echo "Invalidation ID: ${INVALIDATION_ID}"
echo "Status: ${INVALIDATION_STATUS}"
echo ""
echo "Monitoring invalidation progress..."
echo "(This typically takes 3-15 minutes)"
echo ""

# Poll invalidation status
while true; do
  STATUS=$(aws cloudfront get-invalidation \
    --distribution-id "${DISTRIBUTION_ID}" \
    --id "${INVALIDATION_ID}" \
    --query 'Invalidation.Status' \
    --output text)
  
  if [[ "${STATUS}" == "Completed" ]]; then
    echo ""
    echo "═══════════════════════════════════════════════════════════════════════════"
    echo "✅ Cache Invalidation Complete"
    echo "═══════════════════════════════════════════════════════════════════════════"
    break
  else
    echo -n "."
    sleep 10
  fi
done

echo ""
echo "Note: The first request after invalidation will have higher TTFB"
echo "as it fetches fresh content from origin. Subsequent requests will"
echo "be served from edge cache with <100ms TTFB."
