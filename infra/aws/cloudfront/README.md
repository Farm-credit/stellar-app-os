# CloudFront CDN Deployment

Global CDN with edge locations for tree photos, map tiles, and static assets ensuring <100ms first byte time (TTFB).

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          CloudFront Edge Locations                      │
│                         (Global - 450+ locations)                       │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                ┌───────────────┴───────────────┐
                │                               │
        ┌───────▼────────┐            ┌────────▼─────────┐
        │   Origin 1:    │            │    Origin 2:     │
        │   S3 Photos    │            │  Vercel (API +   │
        │  (us-east-1)   │            │  Static Assets)  │
        │                │            │                  │
        │ + Origin Shield│            │ + Origin Shield  │
        └────────────────┘            └──────────────────┘
```

## Features

### 🌍 Global Edge Locations (PriceClass_All)
- 450+ edge locations across 100+ cities
- Automatic routing to nearest edge based on latency
- Origin Shield for additional caching layer

### 📸 Tree Photos (<100ms TTFB)
- **Path:** `planting-photos/*`
- **Cache TTL:** 1 day default, 1 year max
- **Origin:** S3 with Origin Access Control (OAC)
- **Optimization:** CloudFront Function for image format selection (AVIF/WebP)
- **Features:**
  - Query string support for transformations (`?w=800&h=600&q=85&format=webp`)
  - Automatic format negotiation based on `Accept` header
  - Compressed delivery (Gzip + Brotli)

### 🗺️ Map Tiles (<100ms TTFB)
- **Path:** `api/planting/map*`
- **Cache TTL:** 5 minutes default, 1 hour max
- **Origin:** Vercel (Next.js API routes)
- **Query params:** `region`, `zoom`, `bbox`
- **Features:**
  - Edge caching with stale-while-revalidate
  - Regional filtering cached separately
  - Compressed GeoJSON delivery

### 🎨 Static Assets (Immutable)
- **Paths:** `_next/static/*`, `assets/*`, `icons/*`
- **Cache TTL:** 1 year (immutable)
- **Origin:** Vercel
- **Features:**
  - Aggressive edge caching for versioned assets
  - HTTP/2 and HTTP/3 support
  - Brotli compression

## Cache Policies

### Photos Cache Policy
- **Default TTL:** 1 day (86,400s)
- **Max TTL:** 1 year (31,536,000s)
- **Min TTL:** 1 hour (3,600s)
- **Query strings:** `w`, `h`, `q`, `format`
- **Headers:** `Accept`, `Accept-Encoding`
- **Compression:** Gzip + Brotli

### Map Tiles Cache Policy
- **Default TTL:** 5 minutes (300s)
- **Max TTL:** 1 hour (3,600s)
- **Min TTL:** 1 minute (60s)
- **Query strings:** `region`, `zoom`, `bbox`
- **Compression:** Gzip + Brotli

### Static Assets Cache Policy
- **Default TTL:** 1 year (31,536,000s)
- **Max TTL:** 1 year (31,536,000s)
- **Min TTL:** 1 day (86,400s)
- **Headers:** `Cache-Control: public, max-age=31536000, immutable`
- **Compression:** Gzip + Brotli

## Deployment

### Prerequisites

1. **ACM Certificate (us-east-1):**
   ```bash
   aws acm request-certificate \
     --domain-name cdn.farmcredit.com \
     --subject-alternative-names "*.cdn.farmcredit.com" \
     --validation-method DNS \
     --region us-east-1
   ```

2. **Environment Variables:**
   ```bash
   # Production
   export AWS_S3_BUCKET_PROD=stellar-tree-photos-prod
   export VERCEL_DOMAIN_PROD=stellar-app-os.vercel.app
   export CDN_DOMAIN_PROD=cdn.farmcredit.com
   export ACM_CERT_ARN_PROD=arn:aws:acm:us-east-1:123456789012:certificate/abc123...

   # Staging
   export AWS_S3_BUCKET_STAGING=stellar-tree-photos-staging
   export VERCEL_DOMAIN_STAGING=stellar-app-os-staging.vercel.app
   export CDN_DOMAIN_STAGING=cdn-staging.farmcredit.com
   export ACM_CERT_ARN_STAGING=arn:aws:acm:us-east-1:123456789012:certificate/def456...
   ```

### Deploy

```bash
# Staging
cd infra/aws/cloudfront
chmod +x deploy-cdn.sh
./deploy-cdn.sh staging

# Production (after staging validation)
./deploy-cdn.sh production
```

### DNS Configuration

After deployment, create CNAME records:

```
# Staging
cdn-staging.farmcredit.com  CNAME  d1234567890abc.cloudfront.net

# Production
cdn.farmcredit.com  CNAME  d0987654321xyz.cloudfront.net
```

## Environment Variables

Add to `.env.local` and Vercel environment:

```bash
# CDN URLs
NEXT_PUBLIC_CDN_URL=https://cdn.farmcredit.com
CLOUDFRONT_DISTRIBUTION_ID=E1234567890ABC

# Keep existing S3 configuration for uploads
AWS_S3_BUCKET=stellar-tree-photos-prod
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
```

## Performance Testing

### TTFB Test (Target: <100ms)

```bash
# Create curl format file
cat > curl-format.txt << 'EOF'
    time_namelookup:  %{time_namelookup}s\n
       time_connect:  %{time_connect}s\n
    time_appconnect:  %{time_appconnect}s\n
   time_pretransfer:  %{time_pretransfer}s\n
      time_redirect:  %{time_redirect}s\n
 time_starttransfer:  %{time_starttransfer}s (TTFB)\n
                    ----------\n
         time_total:  %{time_total}s\n
EOF

# Test photo TTFB
curl -w '@curl-format.txt' -o /dev/null -s \
  https://cdn.farmcredit.com/planting-photos/test-photo.jpg

# Test map tiles TTFB
curl -w '@curl-format.txt' -o /dev/null -s \
  https://cdn.farmcredit.com/api/planting/map?region=kenya

# Test from multiple regions
for region in us-east-1 eu-west-1 ap-southeast-1; do
  echo "Testing from ${region}..."
  # Use EC2 instance or Lambda in each region
done
```

### Cache Hit Rate Monitoring

```bash
# CloudWatch metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/CloudFront \
  --metric-name CacheHitRate \
  --dimensions Name=DistributionId,Value=E1234567890ABC \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 3600 \
  --statistics Average
```

## Cache Invalidation

### Invalidate photos (after new upload):
```bash
aws cloudfront create-invalidation \
  --distribution-id E1234567890ABC \
  --paths "/planting-photos/*"
```

### Invalidate map tiles (after data update):
```bash
aws cloudfront create-invalidation \
  --distribution-id E1234567890ABC \
  --paths "/api/planting/map*"
```

### Invalidate specific photo:
```bash
aws cloudfront create-invalidation \
  --distribution-id E1234567890ABC \
  --paths "/planting-photos/farmer123/1699564800000.jpg"
```

## Monitoring

### CloudWatch Alarms

```bash
# TTFB > 200ms alarm
aws cloudwatch put-metric-alarm \
  --alarm-name stellar-cdn-high-ttfb \
  --alarm-description "CDN TTFB exceeds 200ms" \
  --metric-name OriginLatency \
  --namespace AWS/CloudFront \
  --statistic Average \
  --period 300 \
  --evaluation-periods 2 \
  --threshold 0.2 \
  --comparison-operator GreaterThanThreshold \
  --dimensions Name=DistributionId,Value=E1234567890ABC

# Low cache hit rate alarm (<80%)
aws cloudwatch put-metric-alarm \
  --alarm-name stellar-cdn-low-cache-hit \
  --alarm-description "CDN cache hit rate below 80%" \
  --metric-name CacheHitRate \
  --namespace AWS/CloudFront \
  --statistic Average \
  --period 3600 \
  --evaluation-periods 1 \
  --threshold 80 \
  --comparison-operator LessThanThreshold \
  --dimensions Name=DistributionId,Value=E1234567890ABC
```

## Integration with Application

### Photos API (lib/aws/s3.ts)

```typescript
// Use CDN URL for photo delivery
export function getPhotoUrl(s3Key: string): string {
  const cdnUrl = process.env.NEXT_PUBLIC_CDN_URL;
  if (cdnUrl) {
    return `${cdnUrl}/${s3Key}`;
  }
  // Fallback to signed URL
  return getSignedPrivateUrl(s3Key);
}

// Optimized photo URL with transformations
export function getOptimizedPhotoUrl(
  s3Key: string,
  options: { width?: number; height?: number; quality?: number; format?: 'webp' | 'avif' }
): string {
  const cdnUrl = process.env.NEXT_PUBLIC_CDN_URL;
  if (!cdnUrl) return getPhotoUrl(s3Key);

  const params = new URLSearchParams();
  if (options.width) params.set('w', options.width.toString());
  if (options.height) params.set('h', options.height.toString());
  if (options.quality) params.set('q', options.quality.toString());
  if (options.format) params.set('format', options.format);

  return `${cdnUrl}/${s3Key}?${params.toString()}`;
}
```

### Map Tiles API (app/api/planting/map/route.ts)

```typescript
// CDN headers already configured in CloudFront
// Existing Cache-Control headers will be respected at edge
export async function GET(request: Request) {
  // ... existing logic ...
  
  return NextResponse.json(
    { points },
    { 
      headers: { 
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=300',
        'CDN-Cache-Control': 'max-age=300', // CloudFront-specific
      }
    }
  );
}
```

## Costs

### Estimate (Production - 1M photos/month)

- **Data Transfer (100GB/month):**
  - First 10TB: $0.085/GB = $8.50
- **Requests (10M requests/month):**
  - HTTPS: $0.0075/10k = $7.50
- **Origin Shield:** $0.01/GB + $0.0075/10k
- **CloudFront Functions:** $0.10/1M invocations = $1.00

**Total:** ~$25-30/month

## Troubleshooting

### High TTFB (>100ms)

1. **Check origin health:**
   ```bash
   aws cloudfront get-distribution-config \
     --id E1234567890ABC \
     --query 'DistributionConfig.Origins[].OriginShield'
   ```

2. **Enable origin shield if not enabled**
3. **Check S3 bucket region vs. edge location**
4. **Verify cache hit rate** - low hit rate means more origin requests

### Cache Not Working

1. **Verify cache policy:**
   ```bash
   aws cloudfront get-cache-policy --id <policy-id>
   ```

2. **Check CloudFront logs in S3**
3. **Verify query strings are whitelisted**
4. **Check `Vary` headers from origin**

### 403 Errors on Photos

1. **Verify S3 bucket policy allows CloudFront OAC**
2. **Check Origin Access Control is attached**
3. **Validate distribution has correct source ARN**

## Rollback

```bash
# Delete stack
aws cloudformation delete-stack \
  --stack-name stellar-cdn-production \
  --region us-east-1

# Wait for deletion
aws cloudformation wait stack-delete-complete \
  --stack-name stellar-cdn-production \
  --region us-east-1

# Remove environment variables
# Revert to direct S3 signed URLs
```

## References

- [CloudFront Performance Best Practices](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/ConfiguringCaching.html)
- [Origin Shield](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/origin-shield.html)
- [CloudFront Functions](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cloudfront-functions.html)
