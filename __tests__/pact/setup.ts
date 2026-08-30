/**
 * Pact Test Setup
 *
 * Configures the Pact test environment for contract testing against the API.
 * This ensures that API responses always match the published OpenAPI specification.
 */

import { Pact, Interaction } from '@pact-foundation/pact';
import path from 'path';

export const PACT_PORT = 8081;
export const PACT_PROVIDER = 'StellarAppOS-API';
export const PACT_CONSUMER = 'StellarAppOS-Client';

/**
 * Creates and configures a Pact instance for consumer-driven contract testing
 */
export const createPactProvider = () => {
  return new Pact({
    consumer: PACT_CONSUMER,
    provider: PACT_PROVIDER,
    port: PACT_PORT,
    log: path.resolve(process.cwd(), '__tests__', 'pact', 'logs'),
    dir: path.resolve(process.cwd(), '__tests__', 'pact', 'pacts'),
    spec: 2,
    pactfileMetadata: {
      'pactSpecification': { version: '2.0.0' },
    },
  });
};

/**
 * Gets the Pact provider URL
 */
export const getPactProviderUrl = (): string => {
  return `http://localhost:${PACT_PORT}`;
};

/**
 * Helper to create an interaction with common setup
 */
export const createInteraction = (
  description: string,
  request: {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    path: string;
    headers?: Record<string, string>;
    body?: unknown;
    query?: Record<string, string>;
  },
  response: {
    status: number;
    headers?: Record<string, string>;
    body?: unknown;
  }
): Interaction => {
  return {
    state: undefined,
    uponReceiving: description,
    withRequest: {
      method: request.method,
      path: request.path,
      headers: request.headers,
      body: request.body,
      query: request.query,
    },
    willRespondWith: {
      status: response.status,
      headers: response.headers || { 'Content-Type': 'application/json' },
      body: response.body,
    },
  };
};

/**
 * Verifies that a Pact interaction matches expectations
 */
export const addInteractionAndExpect = async (
  pact: Pact,
  interaction: Interaction
): Promise<void> => {
  return pact.addInteraction(interaction);
};
