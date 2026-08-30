/**
 * Pact Matchers for OpenAPI Contract Testing
 *
 * Provides flexible matchers that validate responses against types and patterns
 * while allowing flexibility in actual values.
 */

import { Matchers } from '@pact-foundation/pact';

/**
 * Creates a matcher for HTTP status responses
 */
export const statusMatcher = (statusCode: number) => statusCode;

/**
 * Creates a matcher for string fields that must exist
 */
export const stringMatcher = (example: string = 'example') => {
  return Matchers.like(example);
};

/**
 * Creates a matcher for numeric fields
 */
export const numberMatcher = (example: number = 0) => {
  return Matchers.like(example);
};

/**
 * Creates a matcher for boolean fields
 */
export const booleanMatcher = (example: boolean = true) => {
  return Matchers.like(example);
};

/**
 * Creates a matcher for ISO date strings
 */
export const isoDateMatcher = (example: string = new Date().toISOString()) => {
  return Matchers.regex({
    generate: example,
    matcher: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$',
  });
};

/**
 * Creates a matcher for UUID/GUID fields
 */
export const uuidMatcher = (example: string = '550e8400-e29b-41d4-a716-446655440000') => {
  return Matchers.regex({
    generate: example,
    matcher: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
  });
};

/**
 * Creates a matcher for email fields
 */
export const emailMatcher = (example: string = 'test@example.com') => {
  return Matchers.regex({
    generate: example,
    matcher: '^[^@]+@[^@]+\\.[^@]+$',
  });
};

/**
 * Creates a matcher for URL fields
 */
export const urlMatcher = (example: string = 'https://example.com') => {
  return Matchers.regex({
    generate: example,
    matcher: '^https?:\\/\\/.+',
  });
};

/**
 * Creates a matcher for array types
 */
export const arrayMatcher = <T>(items: T[], minItems: number = 1) => {
  return Matchers.eachLike(items[0] || {}, { min: minItems });
};

/**
 * Creates a matcher for pagination response
 */
export const paginationMatcher = (items: any[] = []) => {
  return {
    data: Matchers.eachLike(items[0] || {}, { min: 0 }),
    total: Matchers.like(items.length),
    page: Matchers.like(1),
    pageSize: Matchers.like(10),
    hasMore: Matchers.like(false),
  };
};

/**
 * Creates a matcher for error response
 */
export const errorResponseMatcher = (status: number = 400, code: string = 'BAD_REQUEST') => {
  return {
    error: {
      code: Matchers.like(code),
      message: Matchers.like('Error message'),
      status: Matchers.like(status),
      timestamp: isoDateMatcher(),
    },
  };
};

/**
 * Creates a matcher for success response with data
 */
export const successResponseMatcher = <T>(data: T) => {
  return {
    success: Matchers.like(true),
    data: Matchers.like(data),
    timestamp: isoDateMatcher(),
  };
};

/**
 * Creates a matcher for health check response
 */
export const healthCheckMatcher = () => {
  return {
    status: Matchers.like('ok'),
    timestamp: isoDateMatcher(),
  };
};

/**
 * Creates a matcher that accepts any string value
 */
export const anyString = () => Matchers.regex({ generate: 'test', matcher: '.*' });

/**
 * Creates a matcher that accepts any integer value
 */
export const anyInteger = () => Matchers.like(0);

/**
 * Creates a matcher that accepts any object
 */
export const anyObject = () => Matchers.like({});

/**
 * Creates a matcher with type-only validation
 */
export const typeOnlyMatcher = (template: Record<string, any>) => {
  return Matchers.like(template);
};
