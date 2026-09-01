# CDN Deployment Guide

This guide covers the complete deployment of CloudFront CDN with global edge locations for tree photos, map tiles, and static assets ensuring <100ms first byte time (TTFB).

## Overview

The CDN implementation provides:
- **450+ global edge locations** across 100+ cities
- **<100ms TTFB** for tree photos, map tiles, and static assets
- **Origin Shield** for additional caching layer
- **Automatic image optimization** (WebP/AVIF)
- **Compressed delivery** (Gzip + Brotli)
- **Security headers** (HSTS, CSP, CORS)

## Architecture

```
User Request → CloudFront Edge (450+ locations) → Origin Shield → Origin (S3/Vercel)
   ↓
  <100ms TTFB (cached at edge)
   ↓
  Response with optimized assets
```

## Prerequisites

### 1. AWS Account Setup

```bash
# Install AWS CLI
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# Configure credentials
aws configure
# Enter:
#   AWS Access Key ID
#   AWS Secret Access Key
#   Default region: us-east-1
#   Default output format: json
```

### 2. Create ACM Certificate (us-east-1)

CloudFront requires ACM certificates in us-east-1:

```bash
# Request certificate
aws acm request-certificate \
  --domain-name cdn.farmcredit.com \
  --subject-alternative-names "*.cdn.farmcredit.com" \
  --validation-method DNS \
  --region us-east-1

# Get certificate ARN
CERT_ARN=$(aws acm list-certificates \
  --region us-east-1 \
  --query 'CertificateSummaryList[?DomainName==`cdn.farmcredit.com`].CertificateArn' \
  --output text)

echo "Certificate ARN: ${CERT_ARN}"
```

Add DNS validation record from ACM console.

### 3. Create S3 Bucket for Photos (if not exists)

```bash
# Production
aws s3 mb s3://stellar-tree-photos-prod --region us-east-1

# Staging
aws s3 mb s3://stellar-tree-photos-staging --region us-east-1

# Enable versioning
aws s3api put-bucket-versioning \
  --bucket stellar-tree-photos-prod \
  --versioning-configuration Status=Enabled
```

## Deployment Steps

### Step 1: Configure Environment Variables

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

### Step 2: Deploy CloudFront Stack

```bash
cd infra/aws/cloudfront

# Make scripts executable
chmod +x deploy-cdn.sh
chmod +x test-ttfb.sh
chmod +x monitor-cdn.sh
chmod +x invalidate-cache.sh

# Deploy to staging
./deploy-cdn.sh staging

# Wait for deployment (15-20 minutes)
# Monitor status:
aws cloudfront get-distribution --id <DISTRIBUTION_ID> \
  --query 'Distribution.Status' \
  --output text

# Test staging
./test-ttfb.sh https://cdn-staging.farmcredit.com

# Deploy to production (after staging validation)
./deploy-cdn.sh production
```

### Step 3: Configure DNS

Add CNAME records in your DNS provider:

```
# Get CloudFront domain name
CLOUDFRONT_DOMAIN=$(aws cloudformation describe-stacks \
  --stack-name stellar-cdn-production \
  --region us-east-1 \
  --query 'Stacks[0].Outputs[?OutputKey==`DistributionDomainName`].OutputValue' \
  --output text)

echo "Add CNAME: cdn.farmcredit.com → ${CLOUDFRONT_DOMAIN}"
```

**DNS Records:**
```
cdn.farmcredit.com          CNAME  d0987654321xyz.cloudfront.net
cdn-staging.farmcredit.com  CNAME  d1234567890abc.cloudfront.net
```

### Step 4: Update Application Environment

Add to Vercel environment variables:

```bash
# Vercel CLI
vercel env add NEXT_PUBLIC_CDN_URL production
# Value: https://cdn.farmcredit.com

vercel env add CLOUDFRONT_DISTRIBUTION_ID production
# Value: E1234567890ABC

# Or via Vercel dashboard:
# Settings → Environment Variables
```

Update `.env.local`:
```bash
NEXT_PUBLIC_CDN_URL=https://cdn.farmcredit.com
CLOUDFRONT_DISTRIBUTION_ID=E1234567890ABC
```

### Step 5: Deploy Application

```bash
# Trigger Vercel deployment
git push origin main

# Or manual deploy
vercel --prod
```

### Step 6: Verify Deployment

```bash
# Test TTFB from edge locations
./test-ttfb.sh https://cdn.farmcredit.com

# Test specific endpoints
curl -w '@curl-format.txt' -o /dev/null -s \
  https://cdn.farmcredit.com/planting-photos/test.jpg

# Test map tiles
curl -s https://cdn.farmcredit.com/api/planting/map?region=kenya | jq .

# Check cache headers
curl -I https://cdn.farmcredit.com/planting-photos/test.jpg
```

## Performance Testing

### Test TTFB Target (<100ms)

```bash
# Local test
./test-ttfb.sh https://cdn.farmcredit.com 20

# Test from multiple regions (requires EC2 instances)
for region in us-east-1 eu-west-1 ap-southeast-1 sa-east-1; do
  echo "Testing from ${region}..."
  aws ec2 run-instances \
    --image-id ami-0c55b159cbfafe1f0 \
    --instance-type t3.micro \
    --region ${region} \
    --user-data "#!/bin/bash
      curl -w '@curl-format.txt' -o /dev/null -s https://cdn.farmcredit.com/planting-photos/test.jpg
    "
done
```

### Monitor Cache Performance

```bash
# Get distribution ID
DIST_ID=$(aws cloudformation describe-stacks \
  --stack-name stellar-cdn-production \
  --region us-east-1 \
  --query 'Stacks[0].Outputs[?OutputKey==`DistributionId`].OutputValue' \
  --output text)

# Monitor CDN performance
./monitor-cdn.sh ${DIST_ID} 24
```

### Expected Results

- **TTFB:** <100ms from global locations
- **Cache Hit Rate:** >85%
- **Origin Latency:** <50ms (with Origin Shield)
- **4xx Error Rate:** <1%
- **5xx Error Rate:** <0.1%

## Cache Management

### Invalidate Cache After Updates

```bash
# Get distribution ID
DIST_ID=E1234567890ABC

# Invalidate all photos
./invalidate-cache.sh ${DIST_ID} '/planting-photos/*'

# Invalidate specific photo
./invalidate-cache.sh ${DIST_ID} '/planting-photos/farmer123/1699564800000.jpg'

# Invalidate map tiles
./invalidate-cache.sh ${DIST_ID} '/api/planting/map*'

# Invalidate multiple paths
./invalidate-cache.sh ${DIST_ID} \
  '/planting-photos/*' \
  '/api/planting/map*' \
  '/_next/static/*'
```

### Programmatic Invalidation

```typescript
import { invalidateCdnCache } from '@/lib/cdn/cdn-url';

// After photo upload
await invalidateCdnCache([`/planting-photos/${farmerId}/*`]);

// After map data update
await invalidateCdnCache(['/api/planting/map*']);
```

## Monitoring & Alerts

### CloudWatch Alarms

```bash
# High TTFB alarm (>200ms)
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
  --dimensions Name=DistributionId,Value=${DIST_ID}

# Low cache hit rate (<80%)
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
  --dimensions Name=DistributionId,Value=${DIST_ID}

# High 5xx error rate (>1%)
aws cloudwatch put-metric-alarm \
  --alarm-name stellar-cdn-high-5xx \
  --alarm-description "CDN 5xx error rate above 1%" \
  --metric-name 5xxErrorRate \
  --namespace AWS/CloudFront \
  --statistic Average \
  --period 300 \
  --evaluation-periods 2 \
  --threshold 1 \
  --comparison-operator GreaterThanThreshold \
  --dimensions Name=DistributionId,Value=${DIST_ID}
```

### Dashboard

Create CloudWatch dashboard:

```bash
aws cloudwatch put-dashboard \
  --dashboard-name stellar-cdn-prod \
  --dashboard-body file://cloudwatch-dashboard.json
```

## Troubleshooting

### Issue: TTFB > 100ms

**Causes:**
1. Origin server slow
2. Origin Shield not enabled
3. Cache miss (first request)
4. Wrong edge location

**Solutions:**
```bash
# Check distribution config
aws cloudfront get-distribution-config --id ${DIST_ID}

# Verify Origin Shield
aws cloudfront get-distribution-config --id ${DIST_ID} \
  --query 'DistributionConfig.Origins[].OriginShield'

# Check origin performance
curl -w '@curl-format.txt' -o /dev/null -s \
  https://stellar-app-os.vercel.app/api/planting/map
```

### Issue: Cache Hit Rate < 80%

**Causes:**
1. Query strings not whitelisted
2. Dynamic content
3. Vary headers from origin
4. Short cache TTL

**Solutions:**
```bash
# Check cache policy
aws cloudfront get-cache-policy --id <policy-id>

# Review CloudFront logs
aws s3 sync s3://stellar-cdn-logs-production/cloudfront/ ./logs/
gunzip -c logs/*.gz | awk '{print $8, $9, $13}' | sort | uniq -c
```

### Issue: 403 Errors on Photos

**Causes:**
1. S3 bucket policy missing CloudFront OAC
2. Origin Access Control not attached
3. Invalid distribution ARN in bucket policy

**Solutions:**
```bash
# Verify bucket policy
aws s3api get-bucket-policy --bucket stellar-tree-photos-prod

# Update bucket policy
aws cloudformation update-stack \
  --stack-name stellar-cdn-production \
  --use-previous-template \
  --parameters ParameterKey=S3PhotosBucketName,ParameterValue=stellar-tree-photos-prod
```

### Issue: High Origin Latency

**Solutions:**
1. Enable Origin Shield (if not enabled)
2. Use S3 Transfer Acceleration
3. Optimize origin server
4. Add Lambda@Edge for edge compute

## Cost Optimization

### Estimate Monthly Costs

**Assumptions:**
- 1M photos/month
- 100GB data transfer
- 10M requests
- 450+ edge locations (PriceClass_All)

**Breakdown:**
```
Data Transfer (First 10TB): $0.085/GB × 100GB = $8.50
HTTPS Requests: $0.0075/10k × 10M = $7.50
Origin Shield: $0.01/GB × 100GB = $1.00
CloudFront Functions: $0.10/1M × 10M = $1.00
-----------------------------------------------
Total: ~$18/month
```

### Reduce Costs

1. **Use PriceClass_100** (US, Europe, Asia only):
   ```yaml
   PriceClass: PriceClass_100  # Saves ~30%
   ```

2. **Increase Cache TTL:**
   ```yaml
   DefaultTTL: 604800  # 7 days
   ```

3. **Compress responses:**
   ```yaml
   Compress: true  # Reduces data transfer
   ```

## Rollback Plan

### Complete Rollback

```bash
# 1. Remove CDN URLs from application
vercel env rm NEXT_PUBLIC_CDN_URL production
vercel env rm CLOUDFRONT_DISTRIBUTION_ID production

# 2. Redeploy application
vercel --prod

# 3. Delete CloudFront stack
aws cloudformation delete-stack \
  --stack-name stellar-cdn-production \
  --region us-east-1

# 4. Wait for deletion
aws cloudformation wait stack-delete-complete \
  --stack-name stellar-cdn-production \
  --region us-east-1

# 5. Clean up DNS
# Remove CNAME: cdn.farmcredit.com
```

### Partial Rollback (Keep infrastructure, disable CDN)

```bash
# Just remove CDN URL from application
vercel env rm NEXT_PUBLIC_CDN_URL production
vercel --prod

# Photos will fall back to signed S3 URLs
# Map tiles will serve directly from Vercel
```

## Next Steps

1. **Performance Monitoring:**
   - Set up CloudWatch alarms
   - Create performance dashboard
   - Monitor TTFB from different regions

2. **Optimization:**
   - Add Lambda@Edge for advanced image optimization
   - Implement smart cache warming
   - Add failover origins

3. **Security:**
   - Enable AWS WAF (already configured in `infra/aws/waf/`)
   - Add rate limiting rules
   - Configure geo-blocking if needed

4. **Cost Management:**
   - Review CloudFront pricing reports
   - Optimize cache policies
   - Consider Reserved Capacity for predictable traffic

## References

- [CloudFront Developer Guide](https://docs.aws.amazon.com/cloudfront/)
- [Origin Shield](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/origin-shield.html)
- [Cache Policies](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/controlling-the-cache-key.html)
- [CloudFront Functions](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cloudfront-functions.html)
