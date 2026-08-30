# Contract Testing Quick Reference

This is a quick reference guide for contract testing with Pact and OpenAPI.

## Common Commands

```bash
# Run all contract tests
pnpm test -- --run __tests__/pact

# Run specific test file
pnpm test -- --run __tests__/pact/health.pact.test.ts

# Run in watch mode for development
pnpm test:watch __tests__/pact

# Verify setup is complete
npx tsx __tests__/pact/verify-setup.ts

# View latest test report (macOS)
open __tests__/pact/reports/validation-report-*.html

# View test reports (Linux)
xdg-open __tests__/pact/reports/validation-report-*.html
```

## Quick Test Template

Copy and modify this to create new contract tests:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createPactProvider, getPactProviderUrl, createInteraction } from '../pact/setup';
import { loadOpenAPISpec, validateResponse } from '../pact/openapi-validator';
import { isoDateMatcher, uuidMatcher } from '../pact/matchers';
import fetch from 'node-fetch';

describe('My Endpoint Contract Tests', () => {
  const pact = createPactProvider();

  beforeAll(async () => {
    await loadOpenAPISpec();
  });

  afterAll(async () => {
    await pact.finalize();
  });

  describe('GET /api/my-endpoint', () => {
    it('should return data matching spec', async () => {
      const interaction = createInteraction(
        'a GET request to my endpoint',
        {
          method: 'GET',
          path: '/api/my-endpoint',
        },
        {
          status: 200,
          body: {
            id: uuidMatcher(),
            name: 'Example',
            createdAt: isoDateMatcher(),
          },
        }
      );

      await pact.addInteraction(interaction);

      const response = await fetch(`${getPactProviderUrl()}/api/my-endpoint`);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('name');
      expect(body).toHaveProperty('createdAt');
    });
  });
});
```

## Matchers Cheat Sheet

```typescript
import { 
  stringMatcher,
  numberMatcher,
  booleanMatcher,
  isoDateMatcher,
  uuidMatcher,
  emailMatcher,
  urlMatcher,
  arrayMatcher,
  paginationMatcher,
  errorResponseMatcher,
  healthCheckMatcher,
} from '../pact/matchers';

// Basic types
stringMatcher('value')        // Validates string type
numberMatcher(42)             // Validates number type
booleanMatcher(true)          // Validates boolean type

// Formats
isoDateMatcher()              // ISO 8601 datetime
uuidMatcher()                 // UUID format
emailMatcher()                // Email format
urlMatcher()                  // URL format

// Complex types
arrayMatcher([item], 1)       // Array with min items
paginationMatcher([])         // Standard pagination response
errorResponseMatcher()        // Standard error response
healthCheckMatcher()          // Health check response
```

## Error Response Format

All error responses should follow this format:

```typescript
{
  error: {
    code: 'ERROR_CODE',           // Machine-readable error code
    message: 'Human readable',    // User-facing message
    status: 400,                  // HTTP status code
    timestamp: '2024-01-15T...',  // ISO 8601 datetime
    details?: {                   // Optional: validation details
      field: 'error message'
    }
  }
}
```

## Test Structure

### 1. Setup
- Load OpenAPI spec
- Create Pact provider

### 2. Test Groups
- Group related tests with `describe()`
- Test both success and error cases

### 3. Individual Tests
- Define Pact interaction (expected behavior)
- Execute actual request
- Assert response matches expectations
- Verify OpenAPI compliance

### 4. Cleanup
- Finalize Pact (write contracts)
- Generate reports

## Report Interpretation

### Compliance %
- **100%**: All tests pass, all endpoints match spec
- **90-99%**: Most tests pass, some warnings
- **<90%**: Multiple failures, review immediately

### Status Indicators
- 🟢 **Pass**: Endpoint matches spec
- 🔴 **Fail**: Endpoint doesn't match spec
- 🟡 **Partial**: Some tests pass, some fail

## Debugging Tips

### Test fails but looks correct?

1. Check error message for specific validation failure
2. Print actual response: `console.log(JSON.stringify(body, null, 2))`
3. Compare against OpenAPI spec in `docs/openapi.yaml`
4. Verify matchers match actual data format

### Matcher not matching?

```typescript
// Debug matcher with actual value
const actual = response.body.createdAt;
const pattern = '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}';

console.log(`Value: ${actual}`);
console.log(`Pattern: ${pattern}`);
console.log(`Matches: ${new RegExp(pattern).test(actual)}`);
```

### OpenAPI spec errors?

```bash
# Validate OpenAPI spec syntax
npm install -g @swagger-cli/swagger-cli
swagger-cli validate docs/openapi.yaml
```

## Best Practices

✅ **DO:**
- Test both success (200, 201) and error (400, 404, 500) cases
- Use descriptive interaction descriptions
- Keep Pacts and OpenAPI spec in sync
- Run tests before committing
- Review test reports regularly

❌ **DON'T:**
- Hardcode auth tokens in tests
- Use real database data in Pact contracts
- Ignore test failures
- Commit code that breaks contracts
- Let Pact contracts diverge from OpenAPI spec

## File Locations

| File | Purpose |
|------|---------|
| `__tests__/pact/setup.ts` | Pact configuration |
| `__tests__/pact/openapi-validator.ts` | OpenAPI validation logic |
| `__tests__/pact/matchers.ts` | Pact matchers and patterns |
| `__tests__/pact/reporter.ts` | Test reporting |
| `__tests__/pact/*.pact.test.ts` | Contract tests |
| `__tests__/pact/pacts/` | Generated Pact files (git tracked) |
| `__tests__/pact/reports/` | Test reports (not git tracked) |
| `docs/openapi.yaml` | OpenAPI specification |

## Integration with CI/CD

Add to `.github/workflows/test.yml`:

```yaml
- name: Run contract tests
  run: pnpm test -- --run __tests__/pact

- name: Upload test reports
  if: always()
  uses: actions/upload-artifact@v3
  with:
    name: contract-test-reports
    path: __tests__/pact/reports/
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| OpenAPI spec not found | Verify `docs/openapi.yaml` exists |
| Dependency not installed | Run `pnpm install` |
| Port 8081 in use | Change PACT_PORT in `setup.ts` |
| Tests timeout | Increase Jest timeout in vitest.config.ts |
| Matcher not matching | Debug with `console.log()` and test regex |

## Resources

- 📚 [Pact Docs](https://docs.pact.foundation/)
- 📘 [OpenAPI Spec](https://spec.openapis.org/)
- 🔧 [OpenAPI Enforcer](https://www.npmjs.com/package/openapi-enforcer)
- 🧪 [Vitest Documentation](https://vitest.dev/)
