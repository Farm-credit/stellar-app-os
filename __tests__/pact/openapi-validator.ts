/**
 * OpenAPI Validator
 *
 * Validates API responses against the published OpenAPI specification.
 * Ensures contract consistency between implementation and specification.
 */

import SwaggerParser from 'swagger-parser';
import path from 'path';
import { describe, it, expect, beforeAll } from 'vitest';
import Enforcer from 'openapi-enforcer';

interface OpenAPIResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

interface OpenAPIRequest {
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: unknown;
}

let apiDefinition: any;
let enforcer: InstanceType<typeof Enforcer>;

/**
 * Loads and parses the OpenAPI specification
 */
export async function loadOpenAPISpec(): Promise<any> {
  if (apiDefinition) {
    return apiDefinition;
  }

  const specPath = path.resolve(process.cwd(), 'docs', 'openapi.yaml');
  
  try {
    apiDefinition = await SwaggerParser.bundle(specPath);
    console.log(`✓ OpenAPI spec loaded from ${specPath}`);
    return apiDefinition;
  } catch (error) {
    console.error(`✗ Failed to load OpenAPI spec: ${error}`);
    throw error;
  }
}

/**
 * Initializes the OpenAPI Enforcer for validation
 */
export async function initializeEnforcer(): Promise<InstanceType<typeof Enforcer>> {
  if (enforcer) {
    return enforcer;
  }

  const spec = await loadOpenAPISpec();
  
  try {
    enforcer = new Enforcer(spec, { fullCircuit: true });
    console.log('✓ OpenAPI Enforcer initialized');
    return enforcer;
  } catch (error) {
    console.error(`✗ Failed to initialize OpenAPI Enforcer: ${error}`);
    throw error;
  }
}

/**
 * Validates a request against the OpenAPI specification
 */
export async function validateRequest(request: OpenAPIRequest): Promise<boolean> {
  const enforcer = await initializeEnforcer();
  
  try {
    const operation = enforcer.paths[request.path][request.method.toLowerCase()];
    
    if (!operation) {
      console.warn(`⚠ No operation found for ${request.method} ${request.path}`);
      return false;
    }

    return true;
  } catch (error) {
    console.error(`✗ Request validation failed: ${error}`);
    return false;
  }
}

/**
 * Validates a response against the OpenAPI specification
 */
export async function validateResponse(
  request: OpenAPIRequest,
  response: OpenAPIResponse
): Promise<{ valid: boolean; errors: string[] }> {
  const enforcer = await initializeEnforcer();
  const errors: string[] = [];

  try {
    const operation = enforcer.paths[request.path][request.method.toLowerCase()];
    
    if (!operation) {
      return {
        valid: false,
        errors: [`No operation found for ${request.method} ${request.path}`],
      };
    }

    const responseSchema = operation.responses?.[response.status];
    
    if (!responseSchema) {
      return {
        valid: false,
        errors: [`No response schema found for ${response.status} status`],
      };
    }

    // Validate response body against schema
    try {
      const validated = operation.responses[response.status].enforcer.validate(response.body);
      if (validated && validated.error) {
        errors.push(`Response body validation failed: ${validated.error.message}`);
        return { valid: false, errors };
      }
    } catch (validationError: any) {
      errors.push(`Response validation error: ${validationError.message}`);
      return { valid: false, errors };
    }

    // Validate response headers
    const requiredHeaders = Object.keys(responseSchema.headers || {});
    for (const header of requiredHeaders) {
      if (!(header in response.headers)) {
        errors.push(`Missing required response header: ${header}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  } catch (error: any) {
    return {
      valid: false,
      errors: [`Unexpected validation error: ${error.message}`],
    };
  }
}

/**
 * Gets all paths defined in the OpenAPI specification
 */
export async function getOpenAPIPaths(): Promise<string[]> {
  const spec = await loadOpenAPISpec();
  return Object.keys(spec.paths || {});
}

/**
 * Gets all operations for a specific path
 */
export async function getPathOperations(
  path: string
): Promise<Array<{ method: string; operationId?: string; description?: string }>> {
  const spec = await loadOpenAPISpec();
  const pathItem = spec.paths?.[path];
  
  if (!pathItem) {
    return [];
  }

  const operations: Array<{ method: string; operationId?: string; description?: string }> = [];
  
  for (const [method, operation] of Object.entries(pathItem)) {
    if (['get', 'post', 'put', 'delete', 'patch', 'head', 'options'].includes(method.toLowerCase())) {
      operations.push({
        method: method.toUpperCase(),
        operationId: (operation as any).operationId,
        description: (operation as any).description || (operation as any).summary,
      });
    }
  }

  return operations;
}

/**
 * Generates test description for an OpenAPI path
 */
export function getOpenAPIPathDescription(path: string, method: string, spec: any): string {
  const operation = spec.paths?.[path]?.[method.toLowerCase()];
  return operation?.summary || operation?.description || `${method} ${path}`;
}

/**
 * Helper to extract example responses from OpenAPI spec
 */
export function getExampleResponse(spec: any, path: string, method: string, status: number = 200): any {
  const operation = spec.paths?.[path]?.[method.toLowerCase()];
  const responseSpec = operation?.responses?.[status];
  
  if (!responseSpec) {
    return null;
  }

  // Try to get example from content
  const content = responseSpec.content?.['application/json'];
  if (content?.examples) {
    const firstExample = Object.values(content.examples)[0] as any;
    return firstExample?.value;
  }

  // Try to get from schema
  if (content?.schema?.example) {
    return content.schema.example;
  }

  return null;
}
