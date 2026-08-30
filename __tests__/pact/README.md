# Contract Testing with Pact and OpenAPI

This guide explains how to use Pact and OpenAPI validation to ensure your API responses always match your published specification.

## Overview

Contract testing is a technique that ensures:

1. **API Contracts are Honored**: The API provider delivers what consumers expect
2. **OpenAPI Spec Accuracy**: Your specification stays in sync with implementation
3. **Consumer-Driven Development**: Consumers define what they need from the API
4. **Regression Prevention**: Changes that break contracts are caught early

### Why Pact + OpenAPI?

- **Pact**: Ensures consumer-driven contracts are met
- **OpenAPI**: Documents the API contract formally
- **Together**: Validate that implementation matches both the Pact contracts AND the OpenAPI spec

## Project Structure

```
__tests__/
├── pact/
│   ├── setup.ts                      # Pact configuration
│   ├── openapi-validator.ts          # OpenAPI spec loading and validation
│   ├── matchers.ts                   # Pact matchers for flexible testing
│   ├── reporter.ts                   # Test reporting and HTML generation
│   ├── health.pact.test.ts          # Health check endpoint tests
│   ├── auth.pact.test.ts            # Authentication endpoint tests
│   ├── trees.pact.test.ts           # Tree inventory endpoint tests
│   ├── comprehensive-example.pact.test.ts  # Full workflow example
│   ├── pacts/                        # Generated Pact contracts
│   ├── logs/                         # Test logs
│   └── reports/                      # Validation reports
```

## Quick Start

### 1. Running Contract Tests

```bash
# Run all Pact contract tests
pnpm test -- --run __tests__/pact

# Run specific contract test file
pnpm test -- --run __tests__/pact/health.pact.test.ts

# Run tests in watch mode
pnpm test:watch __tests__/pact
```

### 2. Viewing Test Reports

After running tests, view the HTML report:

```bash
# Open the latest report in your browser
open __tests__/pact/reports/validation-report-*.html
```

### 3. Understanding Test Results

Each test report shows:
- **Compliance %**: How many endpoints match the spec
- **Test Statistics**: Passed/failed test counts
- **Endpoint Details**: Status for each API path
- **Visual Indicators**: Color-coded results for quick scanning

## Core Concepts

### Pact Interactions

A Pact interaction defines a consumer's expectation of how an API should behave:

```typescript
import { createInteraction } from '../pact/setup';

const interaction = createInteraction(
  'a GET request to retrieve user profile',
  {
    method: 'GET',
    path: '/api/users/123',
    headers: { 'Authorization': 'Bearer token' },
  },
  {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: {
      id: 'user-123',
      name: 'John Doe',
      email: 'john@example.com',
      createdAt: '2024-01-15T10:30:00Z',
    },
  }
);

await pact.addInteraction(interaction);
```

### Pact Matchers

Matchers allow flexible validation while maintaining type contracts:

```typescript
import { stringMatcher, numberMatcher, isoDateMatcher, uuidMatcher } from '../pact/matchers';

const response = {
  id: uuidMatcher(),                    // Must be valid UUID format
  name: stringMatcher('John'),          // Must be string
  age: numberMatcher(30),               // Must be number
  createdAt: isoDateMatcher(),          // Must be ISO 8601 datetime
  active: booleanMatcher(true),         // Must be boolean
};
```

### OpenAPI Validation

Responses are validated against the OpenAPI specification:

```typescript
import { validateResponse, loadOpenAPISpec } from '../pact/openapi-validator';

const spec = await loadOpenAPISpec(); // Loads docs/openapi.yaml
const validation = await validateResponse(
  { method: 'GET', path: '/api/health' },
  {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: { status: 'ok', timestamp: '2024-01-15T10:30:00Z' },
  }
);

if (validation.valid) {
  console.log('✓ Response matches OpenAPI spec');
} else {
  console.error('✗ Validation errors:', validation.errors);
}
```

## Writing Contract Tests

### Example 1: Simple GET Endpoint

```typescript
import { describe, it, expect } from 'vitest';
import { createPactProvider, getPactProviderUrl, createInteraction } from '../pact/setup';
import { loadOpenAPISpec } from '../pact/openapi-validator';
import fetch from 'node-fetch';

describe('My API Contract', () => {
  const pact = createPactProvider();

  beforeAll(async () => {
    await loadOpenAPISpec();
  });

  afterAll(async () => {
    await pact.finalize();
  });

  it('should return list of items', async () => {
    const interaction = createInteraction(
      'a GET request to retrieve items',
      {
        method: 'GET',
        path: '/api/items',
        query: { page: '1', limit: '10' },
      },
      {
        status: 200,
        body: {
          data: [
            { id: '1', name: 'Item 1' },
          ],
          pagination: { page: 1, total: 1, hasMore: false },
        },
      }
    );

    await pact.addInteraction(interaction);

    const response = await fetch(
      `${getPactProviderUrl()}/api/items?page=1&limit=10`
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toHaveProperty('data');
    expect(body).toHaveProperty('pagination');
  });
});
```

### Example 2: POST Endpoint with Request Validation

```typescript
it('should create a new item with validation', async () => {
  const interaction = createInteraction(
    'a POST request to create an item',
    {
      method: 'POST',
      path: '/api/items',
      headers: { 'Content-Type': 'application/json' },
      body: {
        name: 'New Item',
        description: 'Item description',
      },
    },
    {
      status: 201,
      body: {
        id: 'item-123',
        name: 'New Item',
        description: 'Item description',
        createdAt: new Date().toISOString(),
      },
    }
  );

  await pact.addInteraction(interaction);

  const response = await fetch(`${getPactProviderUrl()}/api/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'New Item',
      description: 'Item description',
    }),
  });

  const body = await response.json();

  expect(response.status).toBe(201);
  expect(body.id).toBeDefined();
  expect(body.createdAt).toBeDefined();
});
```

### Example 3: Error Handling

```typescript
it('should return 404 for non-existent item', async () => {
  const interaction = createInteraction(
    'a GET request for non-existent item',
    {
      method: 'GET',
      path: '/api/items/nonexistent',
    },
    {
      status: 404,
      body: {
        error: {
          code: 'NOT_FOUND',
          message: 'Item not found',
          status: 404,
          timestamp: new Date().toISOString(),
        },
      },
    }
  );

  await pact.addInteraction(interaction);

  const response = await fetch(`${getPactProviderUrl()}/api/items/nonexistent`);
  expect(response.status).toBe(404);
});
```

## Using Matchers for Flexible Validation

```typescript
import { 
  uuidMatcher, 
  isoDateMatcher, 
  emailMatcher, 
  urlMatcher,
  arrayMatcher,
  paginationMatcher,
} from '../pact/matchers';

// UUID field
const userId = uuidMatcher('550e8400-e29b-41d4-a716-446655440000');

// ISO datetime
const createdAt = isoDateMatcher();

// Email validation
const email = emailMatcher('user@example.com');

// URL validation
const website = urlMatcher('https://example.com');

// Array with minimum items
const tags = arrayMatcher(['tag1', 'tag2'], 1);

// Pagination structure
const paginated = paginationMatcher([
  { id: '1', name: 'Item' },
]);
```

## Test Reporting

### Understanding Reports

Reports include:

1. **Compliance Percentage**: Overall match with OpenAPI spec
2. **Passed/Failed Tests**: Quantitative results
3. **Endpoint Breakdown**: Status for each endpoint
4. **Error Details**: Specific validation failures
5. **HTML Visualization**: Color-coded results for easy scanning

### Accessing Reports

```typescript
import { reporter } from '../pact/reporter';

describe('My Tests', () => {
  beforeAll(() => {
    reporter.startReport();
  });

  afterAll(() => {
    const report = reporter.finishReport();
    reporter.saveHTMLReport(report);
    console.log(`Compliance: ${report.compliancePercentage}%`);
  });

  it('should pass test', () => {
    reporter.addTestResult('/api/endpoint', 'GET', 'Test description', {
      name: 'Test description',
      status: 'pass',
      statusCode: 200,
      timestamp: new Date().toISOString(),
    });
  });
});
```

## Integration with CI/CD

### GitHub Actions Example

```yaml
name: Contract Tests

on: [push, pull_request]

jobs:
  contract-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'pnpm'
      
      - run: pnpm install
      - run: pnpm test -- --run __tests__/pact
      
      - name: Upload test reports
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: pact-reports
          path: __tests__/pact/reports/
```

## Best Practices

### 1. Keep Pacts Synchronized with OpenAPI

```bash
# Always verify spec changes update Pact tests
pnpm test -- --run __tests__/pact
```

### 2. Test Both Success and Error Cases

```typescript
describe('API Endpoint', () => {
  it('should succeed when valid', async () => {
    // Test happy path
  });

  it('should fail with 400 on invalid input', async () => {
    // Test error handling
  });
});
```

### 3. Use Meaningful Descriptions

```typescript
// Good: Describes the consumer's intent
createInteraction(
  'a customer retrieves their order details',
  ...
);

// Avoid: Too generic
createInteraction('GET request', ...);
```

### 4. Version Your Pacts

Pact contracts are stored in `__tests__/pact/pacts/`. Version control them to track changes:

```bash
git add __tests__/pact/pacts/
git commit -m "Update consumer contracts"
```

### 5. Run Tests Regularly

```bash
# Before commits
git hook: pnpm test -- --run __tests__/pact

# In CI/CD
# Every PR should verify contract compliance
```

## Troubleshooting

### Issue: "OpenAPI spec not found"

**Solution**: Ensure `docs/openapi.yaml` exists and is valid:

```bash
# Validate OpenAPI spec
docker run -v $(pwd):/spec openapitools/openapi-generator-cli \
  validate -i /spec/docs/openapi.yaml
```

### Issue: "Matchers not matching actual values"

**Solution**: Check that the matcher pattern matches your data:

```typescript
// If your UUID format differs, adjust the regex
export const customUuidMatcher = () => {
  return Matchers.regex({
    generate: 'custom-uuid-12345',
    matcher: 'custom-uuid-\\d+',
  });
};
```

### Issue: "Tests pass locally but fail in CI"

**Solution**: Ensure CI has the same dependencies and environment:

```bash
# Use lock file (pnpm-lock.yaml)
git add pnpm-lock.yaml
pnpm ci  # Use ci instead of install in CI
```

## Advanced Topics

### Custom Validators

```typescript
export async function validateCustomFormat(
  response: OpenAPIResponse,
  customRules: Record<string, any>
): Promise<boolean> {
  // Implement custom validation logic
  return true;
}
```

### Provider States

For stateful API interactions:

```typescript
const interaction = {
  state: 'user with id 123 exists',
  uponReceiving: 'a GET request for user 123',
  // ... rest of interaction
};
```

### Multiple Consumers

Create separate Pact files for different consumers:

```typescript
// For web client
const pactWeb = new Pact({
  consumer: 'WebClient',
  provider: 'API',
  // ...
});

// For mobile client
const pactMobile = new Pact({
  consumer: 'MobileClient',
  provider: 'API',
  // ...
});
```

## References

- [Pact Documentation](https://docs.pact.foundation/)
- [OpenAPI Specification](https://spec.openapis.org/)
- [OpenAPI Enforcer](https://www.npmjs.com/package/openapi-enforcer)
- [Swagger Parser](https://www.npmjs.com/package/swagger-parser)

## Next Steps

1. ✅ Review the example tests in `__tests__/pact/`
2. ✅ Run contract tests: `pnpm test -- --run __tests__/pact`
3. ✅ Review generated reports: `__tests__/pact/reports/`
4. ✅ Add more endpoint tests as needed
5. ✅ Integrate into CI/CD pipeline
6. ✅ Monitor compliance over time
