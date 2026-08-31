# AWS WAF Configuration

This directory contains an AWS WAF v2 configuration for CloudFront that blocks the following classes of attacks:

- SQL injection
- XSS
- path traversal
- request smuggling

## Files

- `web-acl.yaml` — CloudFormation template for the Web ACL and association.
- `README.md` — deployment and usage guide.

## Deploy

Set the CloudFront distribution ARN for the protected application and deploy the stack.

```bash
export AWS_REGION=us-east-1
export DISTRIBUTION_ARN=arn:aws:cloudfront::123456789012:distribution/ABC123DEF456
bash scripts/deploy-waf.sh production
```

## Included protections

- AWS managed SQLi rule group (`AWSManagedRulesSQLiRuleSet`)
- AWS managed bad input rule group (`AWSManagedRulesKnownBadInputsRuleSet`)
- AWS managed common rule group (`AWSManagedRulesCommonRuleSet`)
- Custom regex-based protection for SQLi, XSS, path traversal, and request smuggling attempts

## Notes

The default action is `ALLOW`, and detection rules are set to `BLOCK` via the WAF logic built into AWS managed and custom rules. Update the rule action if you need a `COUNT`-only deployment for staged validation.
