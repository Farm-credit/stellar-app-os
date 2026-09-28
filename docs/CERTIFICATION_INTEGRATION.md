# Verra and Gold Standard certification integration

Issue #1410 adds a server-only provider adapter layer for synchronizing registry projects, verifying credit serials, and tracking renewal status/document metadata.

## Configuration

No registry URL or credential is hardcoded, and the routes do **not** fall back to sample data. A provider returns `503 PROVIDER_NOT_CONFIGURED` until its base URL is configured.

| Variable                                | Purpose                                                             |
| --------------------------------------- | ------------------------------------------------------------------- |
| `VERRA_API_BASE_URL`                    | Base URL of the authorized Verra-compatible API gateway             |
| `VERRA_API_TOKEN`                       | Optional bearer token for that gateway                              |
| `GOLD_STANDARD_API_BASE_URL`            | Base URL of the authorized Gold Standard-compatible API gateway     |
| `GOLD_STANDARD_API_TOKEN`               | Optional bearer token for that gateway                              |
| `CERTIFICATION_API_TIMEOUT_MS`          | Shared request timeout; default `8000`, range 100–120000            |
| `CERTIFICATION_API_MAX_RETRIES`         | Retries for network, 408, 429, and 5xx errors; default `2`, max `5` |
| `CERTIFICATION_API_RETRY_BASE_DELAY_MS` | Exponential retry delay; default `200`                              |

Provider-specific timeout/retry variables can override shared values, for example `VERRA_API_TIMEOUT_MS` and `GOLD_STANDARD_API_MAX_RETRIES`.

The base URLs must be `http`/`https` URLs without embedded credentials. Tokens are sent only in the `Authorization` header and are never returned in route responses.

> Verra and Gold Standard registry access and schemas depend on the commercial/partner API made available to the deployment. Obtain authorized endpoints and credentials from each registry. The adapters make real HTTP requests but cannot claim connectivity until those endpoints are supplied and contract-tested.

## Expected upstream endpoints

The provider-specific clients intentionally isolate upstream field names from marketplace types:

| Operation      | Relative endpoint                   |
| -------------- | ----------------------------------- |
| Project detail | `GET /projects/{projectId}`         |
| Credit lookup  | `GET /credits/{serialNumber}`       |
| Renewal status | `GET /projects/{projectId}/renewal` |

`lib/certification/providers/verra.ts` and `gold-standard.ts` contain strict Zod schemas for their respective payloads. If a registry's authorized API uses different paths or envelopes, change only that adapter (or place a translation gateway at the configured base URL); normalized service and route contracts remain stable.

## Marketplace API

All endpoints require an active Farm Credit `x-api-key`, consistent with the existing v2 verification API. Responses are private and `no-store`.

| Method and route                                                             | Purpose                                                                   |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `POST /api/v2/marketplace/certifications/projects/sync`                      | Fetch, validate, normalize, and persist `{ provider, projectId }`         |
| `GET /api/v2/marketplace/certifications/projects/{provider}/{projectId}`     | Read the latest stored normalized project                                 |
| `POST /api/v2/marketplace/certifications/credits/verify`                     | Compare a registry serial against expected project, vintage, and quantity |
| `POST /api/v2/marketplace/certifications/renewals`                           | Sync renewal status and create missing required document metadata         |
| `GET /api/v2/marketplace/certifications/renewals?provider=...&projectId=...` | Read stored renewal/document metadata                                     |

Supported provider values are `verra` and `gold-standard`. Input objects reject unknown properties. A credit is `verified` only when it is active and every supplied expected field matches; otherwise the response is `mismatch` or `not_verifiable`.

Renewal generation is idempotent: document IDs are deterministic for provider, project, due-date cycle, and document type. Generated records are metadata/templates only; no registry submission is fabricated.

## Persistence and production next step

`CertificationRepository` provides a storage boundary, currently backed by a process-local `InMemoryCertificationRepository`. This repository has hand-numbered SQL migrations with duplicate sequence numbers and no deployment-safe allocator, so this change deliberately does not add a migration. In-memory state is appropriate for tests and local integration work but is lost on restart and is not shared between application instances.

Before enabling this in a multi-instance production deployment:

1. Allocate an approved migration number and add project, verification, renewal, and document tables with uniqueness on `(provider, project_id)` and renewal document id.
2. Implement `CertificationRepository` with the existing PostgreSQL pool.
3. Replace the runtime repository binding in `lib/certification/runtime.ts`.
4. Add scheduled/background renewal syncing only after provider rate limits and deployment scheduling are agreed; the request routes themselves perform no hidden polling.

## Operational verification

Before enabling a provider in a deployment, verify the following with a non-production API key and provider test project:

1. `GET /api/v2/marketplace/certifications/projects/{provider}/{projectId}` returns `503 PROVIDER_NOT_CONFIGURED` when the provider base URL is absent.
2. Project synchronization normalizes a valid provider response and rejects malformed or unknown provider payloads without exposing upstream credentials.
3. Credit verification returns `verified` only when the serial, project, vintage, quantity, and active status match the request; mismatches remain non-verifying responses.
4. A transient `429` or `5xx` response is retried within the configured limit, while repeated failure is returned as a normalized provider error.
5. Renewal synchronization is idempotent: repeating the same provider/project request does not create duplicate document metadata.

These checks confirm configuration and adapter compatibility without implying that registry data was submitted or that an on-chain certification transfer occurred.

## Security review notes

Provider tokens must remain server-side secrets. Review deployments for secret-manager injection, HTTPS-only endpoints, redacted request logging, and separate credentials for each registry. Provider responses should be treated as untrusted input and remain subject to the adapter schemas and normalized error boundary.

## Maintainer handoff checklist

Before promoting this integration from draft to production, confirm that provider credentials are injected only through the deployment secret manager, provider requests use TLS, and renewal jobs are idempotent. Keep this checklist alongside the adapter review so registry responses remain schema-validated and normalized before application use.
