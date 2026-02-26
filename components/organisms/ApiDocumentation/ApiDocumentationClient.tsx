"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/atoms/Input";
import { Button } from "@/components/atoms/Button";

type HttpMethod = "GET" | "POST" | "HEAD";
type CodeLanguage = "curl" | "javascript" | "python";

interface EndpointErrorExample {
  status: number;
  body: Record<string, unknown>;
}

interface EndpointDoc {
  id: string;
  title: string;
  method: HttpMethod;
  path: string;
  description: string;
  tags: string[];
  requestExample?: Record<string, unknown>;
  responseExample?: Record<string, unknown> | null;
  errorExamples: EndpointErrorExample[];
}

interface RateLimitRule {
  route: string;
  limit: string;
  window: string;
  notes: string;
}

const endpointDocs: EndpointDoc[] = [
  {
    id: "health-get",
    title: "Health Check",
    method: "GET",
    path: "/api/health",
    description: "Returns API health status and the current server timestamp.",
    tags: ["health", "status", "monitoring"],
    responseExample: {
      status: "ok",
      timestamp: "2026-02-25T11:00:00.000Z",
    },
    errorExamples: [],
  },
  {
    id: "health-head",
    title: "Health Check (Headers Only)",
    method: "HEAD",
    path: "/api/health",
    description: "Returns status code only with no response body.",
    tags: ["health", "status", "monitoring"],
    responseExample: null,
    errorExamples: [],
  },
  {
    id: "wallet-create",
    title: "Create Custodial Wallet",
    method: "POST",
    path: "/api/wallet/create",
    description:
      "Creates a mock custodial wallet keypair and returns the public key and selected network.",
    tags: ["wallet", "onboarding", "custodial"],
    requestExample: {
      network: "testnet",
    },
    responseExample: {
      publicKey: "G1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF12345",
      network: "testnet",
    },
    errorExamples: [
      {
        status: 500,
        body: {
          error: "Failed to create custodial wallet",
        },
      },
    ],
  },
  {
    id: "transaction-build",
    title: "Build Payment Transaction",
    method: "POST",
    path: "/api/transaction/build",
    description:
      "Builds an unsigned Stellar payment transaction (XDR) from credit selection and wallet context.",
    tags: ["transaction", "payments", "stellar", "xdr"],
    requestExample: {
      selection: {
        projectId: "project-001",
        quantity: 12,
        calculatedPrice: 300,
      },
      walletPublicKey:
        "GABEMKJNR4GK7M4FROGA7I7PG63N2CKE3EGDSBSISG56SVL2O3KRNDXA",
      network: "testnet",
      idempotencyKey: "f2f399f0-c1b0-4df9-beb1-7eeb2b20c5e7",
    },
    responseExample: {
      transactionXdr: "AAAAAgAAAAB5...EXAMPLE...AAA=",
      networkPassphrase: "Test SDF Network ; September 2015",
    },
    errorExamples: [
      {
        status: 400,
        body: {
          error: "Invalid selection",
        },
      },
      {
        status: 400,
        body: {
          error: "Missing required parameters",
        },
      },
      {
        status: 500,
        body: {
          error: "Failed to build transaction",
        },
      },
    ],
  },
  {
    id: "transaction-submit",
    title: "Submit Signed Transaction",
    method: "POST",
    path: "/api/transaction/submit",
    description: "Submits a signed Stellar XDR transaction to the selected network Horizon instance.",
    tags: ["transaction", "payments", "stellar", "submission"],
    requestExample: {
      signedTransactionXdr: "AAAAAgAAAAB5...SIGNED...AAA=",
      network: "testnet",
    },
    responseExample: {
      transactionHash: "f3a8f48af7f0f8d6ea80a2be8d7ddf7896bc73dcb2ea8d8f85e5f8f65cbf8012",
    },
    errorExamples: [
      {
        status: 400,
        body: {
          error: "Missing required parameters",
        },
      },
      {
        status: 500,
        body: {
          error: "Transaction submission failed",
        },
      },
    ],
  },
  {
    id: "verify-email",
    title: "Verify Email Token",
    method: "POST",
    path: "/api/verify-email",
    description:
      "Validates a verification token and marks the mock verification state as complete.",
    tags: ["email", "verification", "auth"],
    requestExample: {
      token: "verification-token-value",
    },
    responseExample: {
      success: true,
      message: "Email verified successfully",
    },
    errorExamples: [
      {
        status: 400,
        body: {
          error: "missing",
          message: "Token is missing",
        },
      },
      {
        status: 400,
        body: {
          error: "expired",
          message: "Token has expired.",
        },
      },
      {
        status: 400,
        body: {
          error: "invalid",
          message: "Token is invalid.",
        },
      },
      {
        status: 500,
        body: {
          error: "server_error",
          message: "Internal server error",
        },
      },
    ],
  },
  {
    id: "verify-email-status",
    title: "Check Verification Status",
    method: "GET",
    path: "/api/verify-email/status",
    description: "Returns the current mock email verification status.",
    tags: ["email", "verification", "polling"],
    responseExample: {
      verified: true,
    },
    errorExamples: [
      {
        status: 500,
        body: {
          error: "server_error",
        },
      },
    ],
  },
  {
    id: "verify-email-resend",
    title: "Resend Verification Email",
    method: "POST",
    path: "/api/verify-email/resend",
    description:
      "Simulates resending a verification email and resets mock verification state to false.",
    tags: ["email", "verification", "resend"],
    responseExample: {
      success: true,
      message: "Verification email sent!",
    },
    errorExamples: [
      {
        status: 500,
        body: {
          error: "server_error",
          message: "Failed to resend email",
        },
      },
    ],
  },
];

const languageLabels: Record<CodeLanguage, string> = {
  curl: "cURL",
  javascript: "JavaScript",
  python: "Python",
};

const rateLimitRules: RateLimitRule[] = [
  {
    route: "/api/health",
    limit: "120 requests",
    window: "1 minute",
    notes: "High-frequency health checks are allowed.",
  },
  {
    route: "/api/wallet/create",
    limit: "30 requests",
    window: "1 minute",
    notes: "Protect against wallet creation abuse.",
  },
  {
    route: "/api/transaction/*",
    limit: "20 requests",
    window: "1 minute",
    notes: "Includes build and submit endpoints.",
  },
  {
    route: "/api/verify-email",
    limit: "10 requests",
    window: "5 minutes",
    notes: "Token verification attempts.",
  },
  {
    route: "/api/verify-email/resend",
    limit: "3 requests",
    window: "15 minutes",
    notes: "Prevents repeated resend attempts.",
  },
];

function methodStyle(method: HttpMethod): string {
  if (method === "GET") {
    return "bg-emerald-100 text-emerald-800";
  }

  if (method === "POST") {
    return "bg-blue-100 text-blue-800";
  }

  return "bg-amber-100 text-amber-800";
}

function formatJson(value: Record<string, unknown> | null): string {
  if (value === null) {
    return "// No response body";
  }

  return JSON.stringify(value, null, 2);
}

function buildCurlSnippet(endpoint: EndpointDoc): string {
  const methodPart = `-X ${endpoint.method}`;
  const urlPart = `"$BASE_URL${endpoint.path}"`;

  if (!endpoint.requestExample) {
    return `curl ${methodPart} ${urlPart}`;
  }

  const body = JSON.stringify(endpoint.requestExample, null, 2);

  return [
    `curl ${methodPart} ${urlPart} \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -d '${body}'`,
  ].join("\n");
}

function buildJavaScriptSnippet(endpoint: EndpointDoc): string {
  const headers = endpoint.requestExample ? "headers: { \"Content-Type\": \"application/json\" }," : "";
  const body = endpoint.requestExample
    ? `body: JSON.stringify(${JSON.stringify(endpoint.requestExample, null, 2)}),`
    : "";

  return [
    "const BASE_URL = \"https://your-domain.com\";",
    "",
    `const response = await fetch(\`${"${BASE_URL}"}${endpoint.path}\`, {`,
    `  method: \"${endpoint.method}\",`,
    headers ? `  ${headers}` : "",
    body ? `  ${body}` : "",
    "});",
    "",
    endpoint.method === "HEAD"
      ? "console.log(response.status);"
      : "console.log(await response.json());",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildPythonSnippet(endpoint: EndpointDoc): string {
  const methodLower = endpoint.method.toLowerCase();

  if (!endpoint.requestExample) {
    return [
      "import requests",
      "",
      'BASE_URL = "https://your-domain.com"',
      "",
      `response = requests.${methodLower}(f"{BASE_URL}${endpoint.path}", timeout=10)`,
      endpoint.method === "HEAD"
        ? "print(response.status_code)"
        : "print(response.json())",
    ].join("\n");
  }

  return [
    "import requests",
    "",
    'BASE_URL = "https://your-domain.com"',
    `payload = ${JSON.stringify(endpoint.requestExample, null, 2)}`,
    "",
    `response = requests.${methodLower}(`,
    `    f"{BASE_URL}${endpoint.path}",`,
    "    json=payload,",
    "    timeout=10,",
    ")",
    "print(response.json())",
  ].join("\n");
}

function buildCodeSamples(endpoint: EndpointDoc): Record<CodeLanguage, string> {
  return {
    curl: buildCurlSnippet(endpoint),
    javascript: buildJavaScriptSnippet(endpoint),
    python: buildPythonSnippet(endpoint),
  };
}

async function copyText(value: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return true;
  }

  if (typeof document === "undefined") {
    return false;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "absolute";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  const successful = document.execCommand("copy");
  document.body.removeChild(textarea);
  return successful;
}

export function ApiDocumentationClient() {
  const [query, setQuery] = useState("");
  const [activeLanguage, setActiveLanguage] = useState<CodeLanguage>("curl");
  const [copiedSnippetId, setCopiedSnippetId] = useState<string | null>(null);

  const filteredEndpoints = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    if (!normalized) {
      return endpointDocs;
    }

    return endpointDocs.filter((endpoint) => {
      const searchableText = [
        endpoint.title,
        endpoint.method,
        endpoint.path,
        endpoint.description,
        endpoint.tags.join(" "),
      ]
        .join(" ")
        .toLowerCase();

      return searchableText.includes(normalized);
    });
  }, [query]);

  async function handleCopy(snippetId: string, content: string) {
    try {
      const successful = await copyText(content);

      if (!successful) {
        return;
      }

      setCopiedSnippetId(snippetId);
      setTimeout(() => {
        setCopiedSnippetId((current) => (current === snippetId ? null : current));
      }, 2000);
    } catch {
      setCopiedSnippetId(null);
    }
  }

  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <header className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-wide text-stellar-blue">
            Developer Docs
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            FarmCredit API Documentation
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
            Public API reference for integrations. Use the search to filter endpoints by
            name, method, path, or tags.
          </p>
          <div className="mt-4 rounded-lg border border-stellar-blue/20 bg-stellar-blue/5 p-4">
            <p className="text-sm text-foreground">
              <span className="font-semibold">Base URL:</span>{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">https://your-domain.com</code>
            </p>
          </div>
        </header>

        <section
          className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8"
          aria-labelledby="authentication-heading"
        >
          <h2 id="authentication-heading" className="text-2xl font-semibold text-foreground">
            Authentication
          </h2>
          <div className="mt-4 space-y-3 text-sm text-muted-foreground sm:text-base">
            <p>
              Current API routes are public and do not require an API key or bearer token.
            </p>
            <p>
              Clients should still use HTTPS and avoid embedding secrets in request bodies.
            </p>
            <p>
              For write-sensitive operations, authentication and signed request validation are
              recommended before production rollout.
            </p>
          </div>
        </section>

        <section
          className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8"
          aria-labelledby="rate-limits-heading"
        >
          <h2 id="rate-limits-heading" className="text-2xl font-semibold text-foreground">
            Rate Limits
          </h2>
          <p className="mt-3 text-sm text-muted-foreground sm:text-base">
            Documented consumption limits by route group. Use exponential backoff on HTTP 429.
          </p>
          <p className="mt-2 text-sm text-muted-foreground sm:text-base">
            Current implementation does not hard-enforce all limits yet; treat these values as
            integration guidance until centralized throttling is enabled.
          </p>
          <div className="mt-5 overflow-x-auto">
            <table className="min-w-full border-collapse text-left text-sm">
              <caption className="sr-only">API route rate limits</caption>
              <thead>
                <tr className="border-b border-border">
                  <th scope="col" className="px-3 py-2 font-semibold text-foreground">
                    Route
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold text-foreground">
                    Limit
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold text-foreground">
                    Window
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold text-foreground">
                    Notes
                  </th>
                </tr>
              </thead>
              <tbody>
                {rateLimitRules.map((rule) => (
                  <tr key={rule.route} className="border-b border-border/60">
                    <td className="px-3 py-2 align-top font-mono text-xs text-foreground sm:text-sm">
                      {rule.route}
                    </td>
                    <td className="px-3 py-2 align-top text-foreground">{rule.limit}</td>
                    <td className="px-3 py-2 align-top text-foreground">{rule.window}</td>
                    <td className="px-3 py-2 align-top text-muted-foreground">{rule.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section
          className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8"
          aria-labelledby="endpoints-heading"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 id="endpoints-heading" className="text-2xl font-semibold text-foreground">
                Endpoints
              </h2>
              <p className="mt-2 text-sm text-muted-foreground sm:text-base">
                {filteredEndpoints.length} endpoint
                {filteredEndpoints.length === 1 ? "" : "s"} shown
              </p>
            </div>
            <div className="w-full sm:max-w-sm">
              <label htmlFor="endpoint-search" className="sr-only">
                Search endpoints
              </label>
              <Input
                id="endpoint-search"
                type="search"
                placeholder="Search by path, method, or tag"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                variant="primary"
                inputSize="md"
              />
            </div>
          </div>

          <div className="mt-6 overflow-x-auto rounded-xl border border-border">
            <table className="min-w-full border-collapse text-left text-sm">
              <caption className="sr-only">Endpoint reference list</caption>
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th scope="col" className="px-3 py-2 font-semibold text-foreground">
                    Method
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold text-foreground">
                    Path
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold text-foreground">
                    Description
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredEndpoints.map((endpoint) => (
                  <tr key={endpoint.id} className="border-b border-border/60">
                    <td className="px-3 py-2 align-top">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${methodStyle(endpoint.method)}`}
                      >
                        {endpoint.method}
                      </span>
                    </td>
                    <td className="px-3 py-2 align-top font-mono text-xs text-foreground sm:text-sm">
                      {endpoint.path}
                    </td>
                    <td className="px-3 py-2 align-top text-muted-foreground">{endpoint.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-8 flex flex-wrap gap-2" aria-label="Code sample language selector">
            {(Object.keys(languageLabels) as CodeLanguage[]).map((language) => (
              <Button
                key={language}
                type="button"
                variant={activeLanguage === language ? "default" : "outline"}
                size="sm"
                aria-pressed={activeLanguage === language}
                onClick={() => setActiveLanguage(language)}
              >
                {languageLabels[language]}
              </Button>
            ))}
          </div>

          <div className="mt-6 space-y-6">
            {filteredEndpoints.map((endpoint) => {
              const snippets = buildCodeSamples(endpoint);
              const snippetId = `${endpoint.id}-${activeLanguage}`;
              const isCopied = copiedSnippetId === snippetId;

              return (
                <article
                  key={endpoint.id}
                  className="rounded-xl border border-border bg-background p-5"
                  aria-label={`${endpoint.method} ${endpoint.path}`}
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${methodStyle(endpoint.method)}`}
                    >
                      {endpoint.method}
                    </span>
                    <h3 className="text-lg font-semibold text-foreground">{endpoint.title}</h3>
                  </div>
                  <p className="mt-1 font-mono text-xs text-muted-foreground sm:text-sm">
                    {endpoint.path}
                  </p>
                  <p className="mt-3 text-sm text-muted-foreground sm:text-base">
                    {endpoint.description}
                  </p>

                  {endpoint.requestExample && (
                    <div className="mt-4">
                      <h4 className="text-sm font-semibold text-foreground">Request JSON</h4>
                      <pre className="mt-2 overflow-x-auto rounded-lg border border-border bg-muted/30 p-3 text-xs text-foreground sm:text-sm">
                        <code>{formatJson(endpoint.requestExample)}</code>
                      </pre>
                    </div>
                  )}

                  <div className="mt-4">
                    <h4 className="text-sm font-semibold text-foreground">Response JSON</h4>
                    <pre className="mt-2 overflow-x-auto rounded-lg border border-border bg-muted/30 p-3 text-xs text-foreground sm:text-sm">
                      <code>{formatJson(endpoint.responseExample ?? null)}</code>
                    </pre>
                  </div>

                  {endpoint.errorExamples.length > 0 && (
                    <div className="mt-4">
                      <h4 className="text-sm font-semibold text-foreground">Error responses</h4>
                      <div className="mt-2 space-y-2">
                        {endpoint.errorExamples.map((example) => (
                          <pre
                            key={`${endpoint.id}-${example.status}-${JSON.stringify(example.body)}`}
                            className="overflow-x-auto rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-900 sm:text-sm"
                          >
                            <code>{`HTTP ${example.status}\n${formatJson(example.body)}`}</code>
                          </pre>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="mt-4">
                    <div className="flex items-center justify-between gap-3">
                      <h4 className="text-sm font-semibold text-foreground">
                        {languageLabels[activeLanguage]} sample
                      </h4>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleCopy(snippetId, snippets[activeLanguage])}
                        aria-label={`Copy ${languageLabels[activeLanguage]} sample for ${endpoint.path}`}
                      >
                        {isCopied ? "Copied" : "Copy"}
                      </Button>
                    </div>
                    <pre className="mt-2 overflow-x-auto rounded-lg border border-border bg-stellar-navy p-3 text-xs text-white sm:text-sm">
                      <code>{snippets[activeLanguage]}</code>
                    </pre>
                  </div>
                </article>
              );
            })}

            {filteredEndpoints.length === 0 && (
              <p className="rounded-lg border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
                No endpoints matched your search query.
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
