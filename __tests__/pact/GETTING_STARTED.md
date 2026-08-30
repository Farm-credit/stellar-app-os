# Getting Started with Contract Testing

A comprehensive guide to implementing consumer-driven contract testing using Pact and validating against OpenAPI specifications.

## What is Contract Testing?

Contract testing ensures that:

1. **API implementations deliver what consumers expect** - No breaking changes slip through
2. **OpenAPI specs stay accurate** - Documentation matches reality
3. **Both sides understand the contract** - Provider and consumer agree on the interface
4. **Integration issues are caught early** - Before code reaches production

### Benefits

✅ **Faster Feedback**: Tests run in seconds, not minutes  
✅ **Independent Testing**: Provider and consumer test in isolation  
✅ **Lower Risk Deployments**: Confidence that contracts won't break  
✅ **Living Documentation**: Tests serve as executable specs  
✅ **Compliance Validation**: Ensure OpenAPI spec compliance automatically  

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  Your Test Suite (Consumer Perspective)                        │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ *.pact.test.ts files                                     │  │
│  │ ├─ health.pact.test.ts                                  │  │
│  │ ├─ auth.pact.test.ts                                    │  │
│  │ ├─ trees.pact.test.ts                                   │  │
│  │ └─ comprehensive-example.pact.test.ts                   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                              ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Pact Test Runner (setup.ts)                             │  │
│  │ Creates mock server on localhost:8081                   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                              ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ OpenAPI Validator (openapi-validator.ts)               │  │
│  │ Checks response against docs/openapi.yaml              │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                              ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Test Reporter (reporter.ts)                             │  │
│  │ Generates JSON and HTML reports                         │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              ▼
                    ┌──────────────────┐
                    │  Test Reports    │
                    │ /pact/reports/   │
                    │ - JSON output    │
                    │ - HTML reports   │
                    └──────────────────┘
```

## Project Structure

```
__tests__/
├── pact/
│   ├── README.md                          # Main documentation
│   ├── QUICK_REFERENCE.md                 # Command cheat sheet
│   ├── verify-setup.ts                    # Setup verification script
│   │
│   ├── setup.ts                           # Pact configuration
│   ├── openapi-validator.ts               # OpenAPI validation
│   ├── matchers.ts                        # Pact matchers
│   ├── reporter.ts                        # Test reporting
│   │
│   ├── health.pact.test.ts               # Example: Health checks
│   ├── auth.pact.test.ts                 # Example: Authentication
│   ├── trees.pact.test.ts                # Example: Tree endpoints
│   ├── comprehensive-example.pact.test.ts # Full workflow
│   │
│   ├── pacts/                             # Generated Pact contracts (git tracked)
│   ├── logs/                              # Test logs
│   └── reports/                           # Generated reports (git ignored)
│
└── components/                             # Existing tests continue here
    └── *.test.ts
```

## Step 1: Verify Setup

First, verify that everything is installed and configured:

```bash
cd /workspaces/stellar-app-os

# Run verification
pnpm test:pact:verify

# Expected output:
# ✓ Pact Setup Configuration
# ✓ OpenAPI Validator
# ✓ OpenAPI Specification
# ✓ All dependencies installed
```

## Step 2: Understand Existing Examples

Review the example tests to understand the pattern:

```bash
# Read the examples
cat __tests__/pact/health.pact.test.ts
cat __tests__/pact/auth.pact.test.ts
cat __tests__/pact/trees.pact.test.ts
```

### Key Concepts

Each test follows this pattern:

```typescript
describe('Endpoint Contract Tests', () => {
  // 1. Setup: Create Pact provider and load OpenAPI spec
  const pact = createPactProvider();
  
  beforeAll(async () => {
    await loadOpenAPISpec();
  });

  // 2. Define interactions: What does consumer expect?
  it('should return correct response', async () => {
    const interaction = createInteraction(
      'description of what this tests',
      {
        method: 'GET',
        path: '/api/endpoint',
        headers: { /* optional headers */ },
        body: { /* optional body for POST/PUT */ },
      },
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: { /* expected response */ },
      }
    );

    await pact.addInteraction(interaction);

    // 3. Execute: Make the actual request
    const response = await fetch(`${getPactProviderUrl()}/api/endpoint`);
    const body = await response.json();

    // 4. Verify: Assert response matches
    expect(response.status).toBe(200);
    expect(body).toHaveProperty('expectedField');
  });

  // 5. Cleanup: Finalize Pact and generate reports
  afterAll(async () => {
    await pact.finalize();
  });
});
```

## Step 3: Run Existing Tests

```bash
# Run all contract tests
pnpm test:pact

# Expected output shows:
# - Tests passed/failed count
# - Compliance percentage
# - Any validation errors
# - Report file location
```

## Step 4: Create Your First Test

Create a new file `__tests__/pact/users.pact.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createPactProvider, getPactProviderUrl, createInteraction } from '../pact/setup';
import { loadOpenAPISpec } from '../pact/openapi-validator';
import { uuidMatcher, isoDateMatcher } from '../pact/matchers';
import fetch from 'node-fetch';

describe('User Endpoint Contract Tests', () => {
  const pact = createPactProvider();

  beforeAll(async () => {
    await loadOpenAPISpec();
  });

  afterAll(async () => {
    await pact.finalize();
  });

  describe('GET /api/users/{id}', () => {
    it('should return user profile', async () => {
      const userId = 'user-123';
      
      const interaction = createInteraction(
        'a GET request to retrieve user profile',
        {
          method: 'GET',
          path: `/api/users/${userId}`,
        },
        {
          status: 200,
          body: {
            id: uuidMatcher(),
            name: 'John Doe',
            email: 'john@example.com',
            createdAt: isoDateMatcher(),
          },
        }
      );

      await pact.addInteraction(interaction);

      const response = await fetch(
        `${getPactProviderUrl()}/api/users/${userId}`
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.id).toBeDefined();
      expect(body.name).toBe('John Doe');
      expect(body.email).toBe('john@example.com');
    });

    it('should return 404 for non-existent user', async () => {
      const interaction = createInteraction(
        'a GET request for non-existent user',
        {
          method: 'GET',
          path: '/api/users/nonexistent',
        },
        {
          status: 404,
          body: {
            error: {
              code: 'USER_NOT_FOUND',
              message: 'User not found',
              status: 404,
              timestamp: new Date().toISOString(),
            },
          },
        }
      );

      await pact.addInteraction(interaction);

      const response = await fetch(
        `${getPactProviderUrl()}/api/users/nonexistent`
      );

      expect(response.status).toBe(404);
    });
  });
});
```

## Step 5: View Test Reports

After running tests, view the generated report:

```bash
# View latest report in browser (macOS)
open __tests__/pact/reports/validation-report-*.html

# Linux
xdg-open __tests__/pact/reports/validation-report-*.html

# Or directly view JSON report
cat __tests__/pact/reports/validation-report-*.json
```

## Step 6: Integrate with CI/CD

Add contract testing to your GitHub Actions workflow:

Create `.github/workflows/contract-tests.yml`:

```yaml
name: Contract Tests

on: [push, pull_request]

jobs:
  contract-tests:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - uses: pnpm/action-setup@v2
        with:
          version: 10
      
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'pnpm'
      
      - name: Install dependencies
        run: pnpm install
      
      - name: Verify setup
        run: pnpm test:pact:verify
      
      - name: Run contract tests
        run: pnpm test:pact
      
      - name: Upload reports
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: contract-test-reports
          path: __tests__/pact/reports/
      
      - name: Comment PR with results
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v6
        with:
          script: |
            const fs = require('fs');
            const report = JSON.parse(
              fs.readFileSync('__tests__/pact/reports/validation-report-*.json')
            );
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: `## Contract Test Results\n\n**Compliance: ${report.compliancePercentage}%**\n\nTests: ${report.passedTests}/${report.totalTests} passed`
            });
```

## Step 7: Keep Pacts in Sync with OpenAPI

Regular maintenance checklist:

```bash
# Before committing
pnpm test:pact

# If tests fail
# 1. Check if OpenAPI spec changed
# 2. Update Pact interactions or OpenAPI spec
# 3. Re-run tests

# Commit Pact contracts (git tracked)
git add __tests__/pact/pacts/
git commit -m "Update API contracts"

# Ignore test reports (git ignored)
# Reports are generated, not committed
```

## Common Workflows

### Adding a New Endpoint

1. **Update OpenAPI spec** (`docs/openapi.yaml`)
2. **Create test file** (`__tests__/pact/my-endpoint.pact.test.ts`)
3. **Write Pact interactions** (define consumer expectations)
4. **Run tests**: `pnpm test:pact:watch`
5. **Implement endpoint** (provider-side)
6. **Verify tests pass**: `pnpm test:pact`
7. **Commit**: `git add docs/openapi.yaml __tests__/pact/`

### Fixing a Failed Test

```bash
# 1. Run tests to see failures
pnpm test:pact

# 2. Check the specific test
pnpm test:pact -- --grep "my failing test"

# 3. Compare with OpenAPI spec
cat docs/openapi.yaml | grep -A 20 "/api/endpoint"

# 4. Update test or endpoint
# 5. Re-run tests
pnpm test:pact -- --grep "my failing test"

# 6. Commit fix
git add __tests__/pact/my-endpoint.pact.test.ts
git commit -m "Fix: endpoint contract validation"
```

### Validating Spec Compliance

```bash
# Check if all OpenAPI endpoints have tests
pnpm test:pact -- --grep "OpenAPI Compliance"

# View which endpoints are tested
cat __tests__/pact/reports/validation-report-*.json | jq '.endpoints'

# Add missing tests for untested endpoints
```

## Troubleshooting

### Issue: "Port 8081 already in use"

```bash
# Find process using port
lsof -i :8081

# Kill process
kill -9 <PID>

# Or change port in __tests__/pact/setup.ts
export const PACT_PORT = 8082;
```

### Issue: "OpenAPI spec not valid"

```bash
# Validate YAML syntax
npx swagger-parser validate docs/openapi.yaml

# Check for required fields
# Each operation should have:
# - operationId
# - description or summary
# - responses with 200, 400, 404, 500 as needed
```

### Issue: "Matcher doesn't match my data"

```typescript
// Debug the matcher
import { isoDateMatcher } from '../pact/matchers';

const pattern = isoDateMatcher();
const actual = response.body.createdAt;

console.log('Matcher:', pattern);
console.log('Actual:', actual);
console.log('Match:', new RegExp('pattern').test(actual));
```

## Best Practices

### 1. Test Consumer Behavior
```typescript
✅ Describe what the consumer needs
❌ Don't just echo the API response
```

### 2. Test Both Happy and Sad Paths
```typescript
✅ Test 200 OK and 404 Not Found
❌ Only test the success case
```

### 3. Use Meaningful Descriptions
```typescript
✅ "a customer retrieves their recent orders"
❌ "GET request"
```

### 4. Keep Pacts Small and Focused
```typescript
✅ One test file per endpoint or feature
❌ Huge test file with unrelated tests
```

### 5. Update Specs Together
```bash
✅ Change OpenAPI spec + Pact test at same time
❌ Only update one or the other
```

## Cheat Sheet

```bash
# Quick commands
pnpm test:pact              # Run all tests
pnpm test:pact:watch       # Watch mode (development)
pnpm test:pact:verify      # Verify setup
pnpm test:pact -- --grep "pattern"  # Run specific tests

# View reports
open __tests__/pact/reports/validation-report-*.html

# Manage git
git add __tests__/pact/pacts/  # Track contracts
git add docs/openapi.yaml       # Track spec
git add __tests__/pact/*.test.ts  # Track tests

# Don't commit
# __tests__/pact/reports/  - auto-generated
# __tests__/pact/logs/     - auto-generated
```

## Next Steps

1. ✅ Run `pnpm test:pact:verify` to confirm setup
2. ✅ Review example tests: `__tests__/pact/health.pact.test.ts`
3. ✅ Run `pnpm test:pact` to execute tests
4. ✅ View reports: `open __tests__/pact/reports/validation-report-*.html`
5. ✅ Create your first test by copying a template
6. ✅ Add CI/CD integration
7. ✅ Monitor compliance over time

## Resources

📚 Full Documentation: [__tests__/pact/README.md]  
📋 Quick Reference: [__tests__/pact/QUICK_REFERENCE.md]  
🔗 Pact Docs: https://docs.pact.foundation/  
🔗 OpenAPI Spec: https://spec.openapis.org/  

## Questions?

- Check [QUICK_REFERENCE.md](QUICK_REFERENCE.md) for common commands
- Review [README.md](README.md) for detailed documentation
- Look at example tests for patterns and usage
- Open an issue if you find problems
