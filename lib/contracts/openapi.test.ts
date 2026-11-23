import { describe, expect, it } from 'vitest';
import { parseOpenApiSpec, validateResponseAgainstSpec } from './openapi';

const spec = parseOpenApiSpec(`
openapi: 3.0.3
paths:
  /api/example:
    get:
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Example'
components:
  schemas:
    Example:
      type: object
      required: [status]
      additionalProperties: false
      properties:
        status:
          type: string
          enum: [ok]
        count:
          type: integer
`);

describe('OpenAPI response contract validator', () => {
  it('accepts a response that matches the documented schema', () => {
    expect(
      validateResponseAgainstSpec(spec, '/api/example', 'GET', 200, {
        status: 'ok',
        count: 2,
      })
    ).toEqual([]);
  });

  it('rejects wrong types, enum values, missing fields, and undocumented fields', () => {
    expect(
      validateResponseAgainstSpec(spec, '/api/example', 'GET', 200, {
        status: 'failed',
        count: 'two',
        secret: true,
      })
    ).toHaveLength(3);
  });

  it('rejects undocumented operations and status codes', () => {
    expect(validateResponseAgainstSpec(spec, '/api/example', 'POST', 200, {})).toHaveLength(1);
    expect(validateResponseAgainstSpec(spec, '/api/example', 'GET', 404, {})).toHaveLength(1);
  });
});
