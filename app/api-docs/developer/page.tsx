'use client';

import Link from 'next/link';
import { useState } from 'react';

type AuthMethod = 'oauth2' | 'apikey';

export default function DeveloperApiDocsPage() {
  const [authMethod, setAuthMethod] = useState<AuthMethod>('oauth2');

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <header className="mb-10">
        <h1 className="text-3xl font-bold">Developer API Documentation</h1>
        <p className="mt-3 text-gray-700">
          The Tree Sponsorship REST API lets third-party integrations query tree data, create
          sponsorships, and receive webhook events. This page covers authentication setup, sandbox
          credentials, and rate limiting with the quota dashboard.
        </p>
        <nav className="mt-4 flex flex-wrap gap-4 text-sm">
          <a href="#authentication" className="text-blue-600 hover:underline">
            Authentication
          </a>
          <a href="#sandbox" className="text-blue-600 hover:underline">
            Sandbox credentials
          </a>
          <a href="#rate-limiting" className="text-blue-600 hover:underline">
            Rate limiting &amp; quotas
          </a>
          <a href="#openapi" className="text-blue-600 hover:underline">
            OpenAPI 3.0 spec
          </a>
        </nav>
      </header>

      <section id="authentication" className="mb-12">
        <h2 className="text-2xl font-semibold">Authentication</h2>
        <p className="mt-2 text-gray-700">
          The API supports two authentication methods: OAuth2 (client credentials) for
          server-to-server integrations, and API keys for simpler or lower-trust use cases. Choose
          the method that fits your integration.
        </p>

        <div className="mt-4 flex gap-2" role="tablist" aria-label="Authentication method">
          <button
            type="button"
            role="tab"
            aria-selected={authMethod === 'oauth2'}
            onClick={() => setAuthMethod('oauth2')}
            className={`rounded px-4 py-2 text-sm font-medium ${
              authMethod === 'oauth2'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
            }`}
          >
            OAuth2 (client credentials)
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={authMethod === 'apikey'}
            onClick={() => setAuthMethod('apikey')}
            className={`rounded px-4 py-2 text-sm font-medium ${
              authMethod === 'apikey'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
            }`}
          >
            API key
          </button>
        </div>

        {authMethod === 'oauth2' ? (
          <div className="mt-4 rounded border border-gray-200 p-4">
            <h3 className="text-lg font-semibold">OAuth2 client-credentials flow</h3>
            <ol className="mt-2 list-decimal space-y-2 pl-5 text-gray-700">
              <li>
                Register your application in the developer portal to receive a{' '}
                <code className="rounded bg-gray-100 px-1">client_id</code> and{' '}
                <code className="rounded bg-gray-100 px-1">client_secret</code>.
              </li>
              <li>
                Request an access token from the token endpoint using the client-credentials grant:
                <pre className="mt-2 overflow-x-auto rounded bg-gray-900 p-3 text-sm text-gray-100">
                  {`POST /oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials
&client_id=YOUR_CLIENT_ID
&client_secret=YOUR_CLIENT_SECRET
&scope=trees:read sponsorships:write webhooks:manage`}
                </pre>
              </li>
              <li>
                Include the returned token in the{' '}
                <code className="rounded bg-gray-100 px-1">Authorization</code> header of each
                request:
                <pre className="mt-2 overflow-x-auto rounded bg-gray-900 p-3 text-sm text-gray-100">
                  {`Authorization: Bearer ACCESS_TOKEN`}
                </pre>
              </li>
              <li>
                Tokens expire after 3600 seconds. Request a new token before expiry; do not
                hard-code tokens in client-side code.
              </li>
            </ol>
          </div>
        ) : (
          <div className="mt-4 rounded border border-gray-200 p-4">
            <h3 className="text-lg font-semibold">API key authentication</h3>
            <ol className="mt-2 list-decimal space-y-2 pl-5 text-gray-700">
              <li>
                Generate an API key from the developer portal. Keys are shown only once — store them
                securely.
              </li>
              <li>
                Send the key in the <code className="rounded bg-gray-100 px-1">X-API-Key</code>{' '}
                header:
                <pre className="mt-2 overflow-x-auto rounded bg-gray-900 p-3 text-sm text-gray-100">
                  {`X-API-Key: YOUR_API_KEY`}
                </pre>
              </li>
              <li>
                API keys inherit the scopes assigned at creation. Rotate keys regularly and revoke
                compromised keys immediately.
              </li>
            </ol>
          </div>
        )}
      </section>

      <section id="sandbox" className="mb-12">
        <h2 className="text-2xl font-semibold">Sandbox credentials</h2>
        <p className="mt-2 text-gray-700">
          Use the sandbox environment to develop and test your integration without affecting
          production data. Sandbox requests are served from{' '}
          <code className="rounded bg-gray-100 px-1">https://sandbox-api.example.org/v1</code> and
          return synthetic tree and sponsorship data.
        </p>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-gray-700">
          <li>
            Sandbox <code className="rounded bg-gray-100 px-1">client_id</code>:{' '}
            <code className="rounded bg-gray-100 px-1">sandbox-client</code>
          </li>
          <li>
            Sandbox <code className="rounded bg-gray-100 px-1">client_secret</code>:{' '}
            <code className="rounded bg-gray-100 px-1">sandbox-secret</code>
          </li>
          <li>
            Sandbox API key: <code className="rounded bg-gray-100 px-1">sandbox-api-key</code>
          </li>
        </ul>
        <p className="mt-3 text-sm text-gray-600">
          Sandbox credentials are public and rate-limited. Never use them in production. Webhook
          events in the sandbox can be triggered via the sandbox test endpoint.
        </p>
      </section>

      <section id="rate-limiting" className="mb-12">
        <h2 className="text-2xl font-semibold">Rate limiting &amp; quotas</h2>
        <p className="mt-2 text-gray-700">
          Requests are rate-limited per client. Default quotas are 60 requests per minute and 10,000
          requests per day. Responses include the following headers:
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-gray-700">
          <li>
            <code className="rounded bg-gray-100 px-1">X-RateLimit-Limit</code> — quota for the
            current window
          </li>
          <li>
            <code className="rounded bg-gray-100 px-1">X-RateLimit-Remaining</code> — requests
            remaining
          </li>
          <li>
            <code className="rounded bg-gray-100 px-1">X-RateLimit-Reset</code> — Unix timestamp
            when the window resets
          </li>
        </ul>
        <p className="mt-3 text-gray-700">
          When a quota is exceeded the API returns{' '}
          <code className="rounded bg-gray-100 px-1">429 Too Many Requests</code> with a{' '}
          <code className="rounded bg-gray-100 px-1">Retry-After</code> header.
        </p>
        <p className="mt-4">
          <Link
            href="/developer/quota"
            className="inline-block rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Open the quota dashboard
          </Link>
        </p>
        <p className="mt-2 text-sm text-gray-600">
          The quota dashboard shows real-time usage, historical consumption, and lets you request
          quota increases.
        </p>
      </section>

      <section id="openapi" className="mb-12">
        <h2 className="text-2xl font-semibold">OpenAPI 3.0 spec</h2>
        <p className="mt-2 text-gray-700">
          The full API is described by an OpenAPI 3.0 specification, available for download and
          import into tools such as Postman or Swagger UI.
        </p>
        <p className="mt-3">
          <Link href="/api-docs/openapi.json" className="text-blue-600 hover:underline">
            Download the OpenAPI 3.0 specification
          </Link>
        </p>
      </section>
    </main>
  );
}
