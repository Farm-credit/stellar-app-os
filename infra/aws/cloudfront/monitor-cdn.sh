#!/bin/bash
set -euo pipefail

# ════════════════════════════════════════════════════════════════════════════════
# Monitor CloudFront CDN Performance
# Usage: ./monitor-cdn.sh <distribution-id> [duration-hours]
# ════════════════════════════════════════════════════════════════════════════════

DISTRIBUTION_ID="${1:-}"
DURATION_HOURS="${2:-1}"
REGION="us-east-1"

if [[ -z "${DISTRIBUTION_ID}" ]]; then
  echo "Usage: $0 <distribution-id> [duration-hours]"
  echo "Example: $0 E1234567890ABC 24"
  exit 1
fi

echo "═══════════════════════════════════════════════════════════════════════════"
echo "CloudFront CDN Performance Monitor"
echo "═══════════════════════════════════════════════════════════════════════════"
echo "Distribution ID: ${DISTRIBUTION_ID}"
echo "Duration: ${DURATION_HOURS} hour(s)"
echo "═══════════════════════════════════════════════════════════════════════════"
echo ""

# Calculate time range
END_TIME=$(date -u +%Y-%m-%dT%H:%M:%S)
START_TIME=$(date -u -d "${DURATION_HOURS} hours ago" +%Y-%m-%dT%H:%M:%S)

# Function to get metric statistics
get_metric() {
  local metric_name=$1
  local statistic=$2
  local unit=${3:-None}
  
  aws cloudwatch get-metric-statistics \
    --namespace AWS/CloudFront \
    --metric-name "${metric_name}" \
    --dimensions "Name=DistributionId,Value=${DISTRIBUTION_ID}" \
    --start-time "${START_TIME}" \
    --end-time "${END_TIME}" \
    --period 3600 \
    --statistics "${statistic}" \
    --region us-east-1 \
    --output json \
    | jq -r ".Datapoints | sort_by(.Timestamp) | .[-1].${statistic} // 0"
}

# Get metrics
echo "📊 Cache Performance"
echo "─────────────────────────────────────────────────────────────────────────"
CACHE_HIT_RATE=$(get_metric "CacheHitRate" "Average")
echo "Cache Hit Rate: ${CACHE_HIT_RATE}%"
if (( $(echo "${CACHE_HIT_RATE} < 80" | bc -l) )); then
  echo "⚠️  Warning: Cache hit rate below 80% target"
fi
echo ""

echo "📈 Request Volume"
echo "─────────────────────────────────────────────────────────────────────────"
REQUESTS=$(get_metric "Requests" "Sum")
echo "Total Requests: ${REQUESTS}"
echo ""

echo "⚡ Performance Metrics"
echo "─────────────────────────────────────────────────────────────────────────"
ORIGIN_LATENCY=$(get_metric "OriginLatency" "Average")
echo "Origin Latency: ${ORIGIN_LATENCY}ms"
if (( $(echo "${ORIGIN_LATENCY} > 100" | bc -l) )); then
  echo "⚠️  Warning: Origin latency above 100ms target"
fi

BYTES_DOWNLOADED=$(get_metric "BytesDownloaded" "Sum")
BYTES_GB=$(echo "scale=2; ${BYTES_DOWNLOADED} / 1073741824" | bc)
echo "Data Transfer: ${BYTES_GB} GB"
echo ""

echo "❌ Error Rates"
echo "─────────────────────────────────────────────────────────────────────────"
ERROR_RATE_4XX=$(get_metric "4xxErrorRate" "Average")
ERROR_RATE_5XX=$(get_metric "5xxErrorRate" "Average")
echo "4xx Error Rate: ${ERROR_RATE_4XX}%"
echo "5xx Error Rate: ${ERROR_RATE_5XX}%"

if (( $(echo "${ERROR_RATE_4XX} > 5" | bc -l) )); then
  echo "⚠️  Warning: 4xx error rate above 5%"
fi
if (( $(echo "${ERROR_RATE_5XX} > 1" | bc -l) )); then
  echo "🚨 Critical: 5xx error rate above 1%"
fi
echo ""

# Popular requests from CloudFront logs (if available)
echo "📋 Recent CloudFront Logs"
echo "─────────────────────────────────────────────────────────────────────────"

# Get logs bucket from distribution config
LOGS_BUCKET=$(aws cloudfront get-distribution-config \
  --id "${DISTRIBUTION_ID}" \
  --region us-east-1 \
  --query 'DistributionConfig.Logging.Bucket' \
  --output text)

if [[ "${LOGS_BUCKET}" != "None" ]] && [[ -n "${LOGS_BUCKET}" ]]; then
  echo "Logs Bucket: ${LOGS_BUCKET}"
  
  # Get latest log file
  LATEST_LOG=$(aws s3 ls "s3://${LOGS_BUCKET}/cloudfront/" \
    --recursive \
    | sort \
    | tail -n 1 \
    | awk '{print $4}')
  
  if [[ -n "${LATEST_LOG}" ]]; then
    echo "Latest Log: ${LATEST_LOG}"
    
    # Download and analyze latest log
    aws s3 cp "s3://${LOGS_BUCKET}/${LATEST_LOG}" /tmp/latest-cf-log.gz --quiet
    
    echo ""
    echo "Top 10 Requested Paths:"
    gunzip -c /tmp/latest-cf-log.gz \
      | awk '{print $8}' \
      | sort \
      | uniq -c \
      | sort -rn \
      | head -10
    
    echo ""
    echo "Top 10 Status Codes:"
    gunzip -c /tmp/latest-cf-log.gz \
      | awk '{print $9}' \
      | sort \
      | uniq -c \
      | sort -rn \
      | head -10
    
    rm -f /tmp/latest-cf-log.gz
  fi
else
  echo "Logging not enabled for this distribution"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════════════════"
echo "✅ Monitoring Complete"
echo "═══════════════════════════════════════════════════════════════════════════"
echo ""
echo "Recommendations:"
if (( $(echo "${CACHE_HIT_RATE} < 80" | bc -l) )); then
  echo "- Review cache policies to improve hit rate"
  echo "- Check if query strings are properly whitelisted"
  echo "- Verify origin Cache-Control headers"
fi
if (( $(echo "${ORIGIN_LATENCY} > 100" | bc -l) )); then
  echo "- Enable Origin Shield if not already enabled"
  echo "- Check origin server performance"
  echo "- Consider using Lambda@Edge for optimization"
fi
if (( $(echo "${ERROR_RATE_5XX} > 1" | bc -l) )); then
  echo "- Investigate origin server errors"
  echo "- Check CloudFront error responses configuration"
fi
