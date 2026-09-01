#!/bin/bash
set -euo pipefail

# ════════════════════════════════════════════════════════════════════════════════
# Test CloudFront TTFB (Time To First Byte)
# Target: <100ms from global edge locations
# Usage: ./test-ttfb.sh <cdn-url> [iterations]
# ════════════════════════════════════════════════════════════════════════════════

CDN_URL="${1:-}"
ITERATIONS="${2:-10}"

if [[ -z "${CDN_URL}" ]]; then
  echo "Usage: $0 <cdn-url> [iterations]"
  echo "Example: $0 https://cdn.farmcredit.com 10"
  exit 1
fi

echo "═══════════════════════════════════════════════════════════════════════════"
echo "CloudFront TTFB Performance Test"
echo "═══════════════════════════════════════════════════════════════════════════"
echo "CDN URL: ${CDN_URL}"
echo "Iterations: ${ITERATIONS}"
echo "═══════════════════════════════════════════════════════════════════════════"
echo ""

# Create curl format file
cat > /tmp/curl-format.txt << 'EOF'
    time_namelookup:  %{time_namelookup}s\n
       time_connect:  %{time_connect}s\n
    time_appconnect:  %{time_appconnect}s\n
   time_pretransfer:  %{time_pretransfer}s\n
      time_redirect:  %{time_redirect}s\n
 time_starttransfer:  %{time_starttransfer}s\n
                    ----------\n
         time_total:  %{time_total}s\n
         http_code:   %{http_code}\n
EOF

# Test endpoints
declare -a ENDPOINTS=(
  "${CDN_URL}/planting-photos/test.jpg"
  "${CDN_URL}/api/planting/map"
  "${CDN_URL}/assets/logo.svg"
  "${CDN_URL}/_next/static/chunks/main.js"
)

# Function to test TTFB
test_ttfb() {
  local url=$1
  local endpoint_name=$2
  
  echo "Testing: ${endpoint_name}"
  echo "URL: ${url}"
  echo "─────────────────────────────────────────────────────────────────────────"
  
  local ttfb_sum=0
  local ttfb_count=0
  local ttfb_min=99999
  local ttfb_max=0
  
  for ((i=1; i<=ITERATIONS; i++)); do
    # Extract TTFB (time_starttransfer)
    local output=$(curl -w '@/tmp/curl-format.txt' -o /dev/null -s "${url}" 2>&1)
    local ttfb=$(echo "${output}" | grep "time_starttransfer" | awk '{print $2}' | sed 's/s//')
    local http_code=$(echo "${output}" | grep "http_code" | awk '{print $2}')
    
    if [[ -z "${ttfb}" ]]; then
      echo "  Iteration ${i}: Failed to get TTFB"
      continue
    fi
    
    # Convert to milliseconds
    local ttfb_ms=$(echo "${ttfb} * 1000" | bc)
    ttfb_ms=${ttfb_ms%.*}  # Remove decimal part
    
    echo "  Iteration ${i}: ${ttfb_ms}ms (HTTP ${http_code})"
    
    # Update statistics
    ttfb_sum=$((ttfb_sum + ttfb_ms))
    ttfb_count=$((ttfb_count + 1))
    
    if (( ttfb_ms < ttfb_min )); then
      ttfb_min=$ttfb_ms
    fi
    
    if (( ttfb_ms > ttfb_max )); then
      ttfb_max=$ttfb_ms
    fi
    
    # Small delay between requests
    sleep 0.5
  done
  
  # Calculate average
  if (( ttfb_count > 0 )); then
    local ttfb_avg=$((ttfb_sum / ttfb_count))
    
    echo ""
    echo "📊 Statistics:"
    echo "  Average TTFB: ${ttfb_avg}ms"
    echo "  Min TTFB: ${ttfb_min}ms"
    echo "  Max TTFB: ${ttfb_max}ms"
    
    if (( ttfb_avg < 100 )); then
      echo "  ✅ PASS: Average TTFB < 100ms target"
    else
      echo "  ❌ FAIL: Average TTFB > 100ms target"
    fi
  else
    echo "  ❌ No successful requests"
  fi
  
  echo ""
}

# Test each endpoint
for endpoint in "${ENDPOINTS[@]}"; do
  endpoint_name=$(echo "${endpoint}" | sed "s|${CDN_URL}/||")
  test_ttfb "${endpoint}" "${endpoint_name}"
done

# Cleanup
rm -f /tmp/curl-format.txt

echo "═══════════════════════════════════════════════════════════════════════════"
echo "✅ TTFB Test Complete"
echo "═══════════════════════════════════════════════════════════════════════════"
echo ""
echo "Next Steps:"
echo "1. If TTFB > 100ms, check:"
echo "   - Edge location proximity (use CloudFront reports)"
echo "   - Origin Shield configuration"
echo "   - Origin server performance"
echo "2. Test from multiple global locations:"
echo "   - Use AWS Lambda in different regions"
echo "   - Use third-party tools (WebPageTest, Pingdom)"
echo "3. Monitor CloudFront metrics:"
echo "   - ./monitor-cdn.sh <distribution-id>"
