# Harvesta — AWS WAF Configuration

Protects the Harvesta API / ALB against:

| Attack Type | Rule |
|---|---|
| SQL Injection | `AWSManagedRulesSQLiRuleSet` (AWS Managed) |
| XSS | `AWSManagedRulesCommonRuleSet` (AWS Managed) |
| Path Traversal | `AWSManagedRulesCommonRuleSet` + `AWSManagedRulesKnownBadInputsRuleSet` |
| Request Smuggling | `AWSManagedRulesKnownBadInputsRuleSet` + custom `BlockRequestSmuggling` rule |
| Suspicious headers | Custom `BlockSuspiciousTransferEncodingHeader` rule |
| Rate / DDoS | `RateLimitPerIP` — 2000 req/5min per IP |

---

## Files

| File | Purpose |
|---|---|
| `deploy-waf.sh` | Creates the WebACL, enables logging, optionally associates with a resource |
| `webacl-rules.json` | Full rule definitions (managed groups + custom rules) |
| `tune-rule.sh` | Switch any rule to COUNT (observe) or BLOCK mode |
| `teardown-waf.sh` | Delete the WebACL (destructive, confirms before running) |

---

## Quick Start

### 1. Configure AWS credentials

```bash
aws configure
# or
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
export AWS_SESSION_TOKEN=...   # if using temporary credentials
```

### 2. Deploy

```bash
cd waf/
chmod +x deploy-waf.sh tune-rule.sh teardown-waf.sh
./deploy-waf.sh
```

### 3. Associate with your ALB or API Gateway

Edit `RESOURCE_ARN` in `deploy-waf.sh` before running, or run manually:

```bash
# For ALB
aws wafv2 associate-web-acl \
  --web-acl-arn "$(cat waf/webacl-arn.txt)" \
  --resource-arn "arn:aws:elasticloadbalancing:us-east-1:ACCOUNT_ID:loadbalancer/app/harvesta/XXXX" \
  --region us-east-1

# For API Gateway stage
aws wafv2 associate-web-acl \
  --web-acl-arn "$(cat waf/webacl-arn.txt)" \
  --resource-arn "arn:aws:apigateway:us-east-1::/restapis/API_ID/stages/prod" \
  --region us-east-1
```

### 4. Tune rules (avoid false positives)

Start by observing traffic with a rule in COUNT mode:

```bash
./waf/tune-rule.sh AWSManagedRulesCommonRuleSet count
# After reviewing CloudWatch logs, switch back to block:
./waf/tune-rule.sh AWSManagedRulesCommonRuleSet block
```

---

## Rule Priority Order

| Priority | Rule | Action |
|---|---|---|
| 1 | RateLimitPerIP | Block (>2000 req/5min per IP) |
| 5 | BlockRequestSmuggling | Block (chunked Transfer-Encoding + Content-Length) |
| 6 | BlockSuspiciousTransferEncodingHeader | Block (forwarded/override header abuse) |
| 10 | AWSManagedRulesCommonRuleSet | Block (XSS, path traversal, bad bots) |
| 20 | AWSManagedRulesSQLiRuleSet | Block (SQL injection) |
| 30 | AWSManagedRulesKnownBadInputsRuleSet | Block (request smuggling, Log4Shell, Spring4Shell) |

Lower priority number = evaluated first.

---

## Scope

The WebACL uses `REGIONAL` scope, which works with:
- Application Load Balancers (ALB)
- API Gateway REST APIs
- App Runner services
- Cognito User Pools

For **CloudFront**, change `SCOPE=CLOUDFRONT` and `REGION=us-east-1` in `deploy-waf.sh`.

---

## Monitoring

Logs are sent to CloudWatch Logs group: `aws-waf-logs-harvesta` (90-day retention).

View in AWS Console → WAF & Shield → `harvesta-waf` → Sampled requests / Logging.
