import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';

type JsonSchema = {
  [key: string]: unknown;
  $ref?: string;
  type?: string;
  required?: string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  enum?: unknown[];
  nullable?: boolean;
  format?: string;
  minimum?: number;
  maximum?: number;
  pattern?: string;
  additionalProperties?: boolean | JsonSchema;
};

export type OpenApiSpec = {
  paths: Record<string, Record<string, { responses?: Record<string, unknown> }>>;
  components?: { schemas?: Record<string, JsonSchema>; responses?: Record<string, JsonSchema> };
  [key: string]: unknown;
};

export async function loadOpenApiSpec(path = 'docs/openapi.yaml'): Promise<OpenApiSpec> {
  const source = await readFile(path, 'utf8');
  const spec = parse(source) as OpenApiSpec;
  if (!spec.openapi || !spec.paths) {
    throw new Error(`Invalid OpenAPI document: ${path}`);
  }
  return spec;
}

export function parseOpenApiSpec(source: string): OpenApiSpec {
  const spec = parse(source) as OpenApiSpec;
  if (!spec.openapi || !spec.paths) {
    throw new Error('Invalid OpenAPI document');
  }
  return spec;
}

function resolveRef(spec: OpenApiSpec, schema: JsonSchema): JsonSchema {
  if (!schema.$ref) return schema;
  const prefix = '#/components/schemas/';
  if (!schema.$ref.startsWith(prefix)) {
    const responsesPrefix = '#/components/responses/';
    if (schema.$ref.startsWith(responsesPrefix)) {
      const name = schema.$ref.slice(responsesPrefix.length);
      return (spec.components?.responses?.[name] as JsonSchema) ?? schema;
    }
    throw new Error(`Unsupported $ref: ${schema.$ref}`);
  }
  const name = schema.$ref.slice(prefix.length);
  return spec.components?.schemas?.[name] ?? schema;
}

function validateValue(
  spec: OpenApiSpec,
  value: unknown,
  schema: JsonSchema,
  location: string
): string[] {
  schema = resolveRef(spec, schema);
  if (value === null) {
    return schema.nullable ? [] : [`${location}: expected a value, got null`];
  }

  if (schema.enum && !schema.enum.includes(value)) {
    return [`${location}: value "${String(value)}" is not one of ${schema.enum.join(', ')}`];
  }

  if (schema.type === 'object') {
    if (typeof value !== 'object' || Array.isArray(value)) {
      return [`${location}: expected object`];
    }
    const record = value as Record<string, unknown>;
    const errors: string[] = [];
    for (const required of schema.required ?? []) {
      if (!(required in record))
        errors.push(`${location}.${required}: required property is missing`);
    }

    for (const [key, property] of Object.entries(schema.properties ?? {})) {
      if (key in record)
        errors.push(...validateValue(spec, record[key], property, `${location}.${key}`));
    }

    const allowed = new Set(Object.keys(schema.properties ?? {}));
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(record)) {
        if (!allowed.has(key)) errors.push(`${location}.${key}: undocumented property`);
      }
    }
    return errors;
  }

  if (schema.type === 'array') {
    if (!Array.isArray(value)) return [`${location}: expected array`];
    if (!schema.items) return [];
    return value.flatMap((item, index) =>
      validateValue(spec, item, schema.items as JsonSchema, `${location}[${index}]`)
    );
  }

  if (schema.type === 'string' && typeof value !== 'string')
    return [`${location}: expected string`];
  if (schema.type === 'integer' && !Number.isInteger(value))
    return [`${location}: expected integer`];
  if (schema.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) {
    return [`${location}: expected number`];
  }
  if (schema.type === 'boolean' && typeof value !== 'boolean')
    return [`${location}: expected boolean`];
  if (typeof schema.minimum === 'number' && typeof value === 'number' && value < schema.minimum) {
    return [`${location}: value is below minimum ${schema.minimum}`];
  }
  if (typeof schema.maximum === 'number' && typeof value === 'number' && value > schema.maximum) {
    return [`${location}: value is above maximum ${schema.maximum}`];
  }
  if (schema.pattern && typeof value === 'string' && !new RegExp(schema.pattern).test(value)) {
    return [`${location}: value does not match ${schema.pattern}`];
  }
  return [];
}

export function validateResponseAgainstSpec(
  spec: OpenApiSpec,
  path: string,
  method: string,
  status: number,
  body: unknown
): string[] {
  const operation = spec.paths[path]?.[method.toLowerCase()];
  if (!operation) return [`${method.toUpperCase()} ${path}: path or operation is not documented`];

  const response = operation.responses?.[String(status)];
  if (!response) return [`${method.toUpperCase()} ${path}: status ${status} is not documented`];
  const responseObject = response as Record<string, unknown>;
  const content = responseObject.content as Record<string, { schema: JsonSchema }> | undefined;
  const schema = content?.['application/json']?.schema;
  if (!schema) return [];

  return validateValue(spec, body, schema, `body`);
}
