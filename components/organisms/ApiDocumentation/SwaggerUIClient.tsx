'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/atoms/Button';
import { Input } from '@/components/atoms/Input';

interface TryItOutState {
  endpointPath: string;
  method: string;
  queryParamString: string;
  requestBodyJson: string;
  loading: boolean;
  responseStatus: number | null;
  responseTimeMs: number | null;
  responseHeaders: Record<string, string> | null;
  responseBody: string | null;
}

const interactiveEndpoints = [
  {
    path: '/api/health',
    method: 'GET',
    name: 'Health Check',
    tag: 'Health',
    defaultQuery: '',
    defaultBody: '',
  },
  {
    path: '/api/healthz',
    method: 'GET',
    name: 'Readiness Probe',
    tag: 'Health',
    defaultQuery: '',
    defaultBody: '',
  },
  {
    path: '/api/trees',
    method: 'GET',
    name: 'List Trees',
    tag: 'Trees',
    defaultQuery: 'species=Mangrove&limit=10',
    defaultBody: '',
  },
  {
    path: '/api/trees/search',
    method: 'GET',
    name: 'Search Trees (Advanced)',
    tag: 'Trees',
    defaultQuery: 'q=Rift&status=verified&limit=10',
    defaultBody: '',
  },
  {
    path: '/api/wallet/create',
    method: 'POST',
    name: 'Create Custodial Wallet',
    tag: 'Wallet',
    defaultQuery: '',
    defaultBody: JSON.stringify({ network: 'testnet' }, null, 2),
  },
  {
    path: '/api/auth/nonce',
    method: 'GET',
    name: 'Get Auth Nonce',
    tag: 'Auth',
    defaultQuery: 'wallet=GABEMKJNR4GK7M4FROGA7I7PG63N2CKE3EGDSBSISG56SVL2O3KRNDXA',
    defaultBody: '',
  },
  {
    path: '/api/carbon/daily-summary',
    method: 'GET',
    name: 'Carbon Daily Summary',
    tag: 'Carbon',
    defaultQuery: 'days=7',
    defaultBody: '',
  },
  {
    path: '/api/impact',
    method: 'GET',
    name: 'Global Impact Overview',
    tag: 'Impact',
    defaultQuery: '',
    defaultBody: '',
  },
];

export function SwaggerUIClient() {
  const [selectedEndpointIndex, setSelectedEndpointIndex] = useState(0);
  const [state, setState] = useState<TryItOutState>({
    endpointPath: interactiveEndpoints[0].path,
    method: interactiveEndpoints[0].method,
    queryParamString: interactiveEndpoints[0].defaultQuery,
    requestBodyJson: interactiveEndpoints[0].defaultBody,
    loading: false,
    responseStatus: null,
    responseTimeMs: null,
    responseHeaders: null,
    responseBody: null,
  });

  const [swaggerUiLoaded, setSwaggerUiLoaded] = useState(false);

  useEffect(() => {
    // Load Swagger UI Bundle CSS & JS dynamically
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui.css';
    document.head.appendChild(link);

    const script = document.createElement('script');
    script.src = 'https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-bundle.js';
    script.async = true;
    script.onload = () => {
      setSwaggerUiLoaded(true);
      if ((window as any).SwaggerUIBundle) {
        (window as any).SwaggerUIBundle({
          url: '/api/openapi.json',
          dom_id: '#swagger-ui-container',
          deepLinking: true,
          presets: [
            (window as any).SwaggerUIBundle.presets.apis,
            (window as any).SwaggerUIBundle.SwaggerUIStandalonePreset,
          ],
          layout: 'BaseLayout',
          tryItOutEnabled: true,
        });
      }
    };
    document.body.appendChild(script);

    return () => {
      try {
        document.head.removeChild(link);
        document.body.removeChild(script);
      } catch {}
    };
  }, []);

  function handleSelectEndpoint(index: number) {
    const ep = interactiveEndpoints[index];
    setSelectedEndpointIndex(index);
    setState({
      endpointPath: ep.path,
      method: ep.method,
      queryParamString: ep.defaultQuery,
      requestBodyJson: ep.defaultBody,
      loading: false,
      responseStatus: null,
      responseTimeMs: null,
      responseHeaders: null,
      responseBody: null,
    });
  }

  async function handleExecuteRequest() {
    setState((prev) => ({ ...prev, loading: true }));
    const startTime = performance.now();

    try {
      const fullUrl = state.queryParamString
        ? `${state.endpointPath}?${state.queryParamString}`
        : state.endpointPath;

      const fetchOptions: RequestInit = {
        method: state.method,
        headers: {
          'Content-Type': 'application/json',
        },
      };

      if (state.method === 'POST' || state.method === 'PUT') {
        fetchOptions.body = state.requestBodyJson;
      }

      const res = await fetch(fullUrl, fetchOptions);
      const endTime = performance.now();

      const headersObj: Record<string, string> = {};
      res.headers.forEach((val, key) => {
        headersObj[key] = val;
      });

      let textBody = '';
      try {
        const json = await res.json();
        textBody = JSON.stringify(json, null, 2);
      } catch {
        textBody = await res.text();
      }

      setState((prev) => ({
        ...prev,
        loading: false,
        responseStatus: res.status,
        responseTimeMs: Math.round(endTime - startTime),
        responseHeaders: headersObj,
        responseBody: textBody,
      }));
    } catch (err) {
      const endTime = performance.now();
      setState((prev) => ({
        ...prev,
        loading: false,
        responseStatus: 0,
        responseTimeMs: Math.round(endTime - startTime),
        responseHeaders: {},
        responseBody: JSON.stringify(
          { error: err instanceof Error ? err.message : 'Network / Connection Failed' },
          null,
          2
        ),
      }));
    }
  }

  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
        {/* Header navigation bar */}
        <header className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-stellar-blue">
                Interactive API Docs
              </span>
              <h1 className="mt-1 text-3xl font-bold tracking-tight text-foreground">
                Swagger UI &amp; Live API Console
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Test Stellar App OS REST API endpoints live directly in your browser.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/api-docs">
                <Button variant="outline" size="sm">
                  &larr; Standard Docs
                </Button>
              </Link>
              <a href="/api/openapi.json" target="_blank" rel="noopener noreferrer">
                <Button variant="default" size="sm">
                  Raw OpenAPI Spec (YAML/JSON)
                </Button>
              </a>
            </div>
          </div>
        </header>

        {/* Live Try-It-Out Sandbox Console */}
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-xl font-bold text-foreground">Quick Live "Try-It-Out" Sandbox</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Select an endpoint preset below to test request execution and inspect real-time responses.
          </p>

          {/* Endpoint selection pills */}
          <div className="mt-4 flex flex-wrap gap-2">
            {interactiveEndpoints.map((ep, idx) => (
              <Button
                key={`${ep.method}-${ep.path}`}
                type="button"
                variant={selectedEndpointIndex === idx ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleSelectEndpoint(idx)}
              >
                <span className="font-mono text-xs uppercase">{ep.method}</span>
                <span className="ml-1 text-xs">{ep.name}</span>
              </Button>
            ))}
          </div>

          {/* Execution Form */}
          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold uppercase text-muted-foreground">
                  Endpoint Path
                </label>
                <Input value={state.endpointPath} readOnly className="font-mono text-sm" />
              </div>

              <div>
                <label className="text-xs font-semibold uppercase text-muted-foreground">
                  Query String Parameters
                </label>
                <Input
                  value={state.queryParamString}
                  onChange={(e) =>
                    setState((prev) => ({ ...prev, queryParamString: e.target.value }))
                  }
                  placeholder="e.g. species=Mangrove&limit=10"
                  className="font-mono text-sm"
                />
              </div>

              {(state.method === 'POST' || state.method === 'PUT') && (
                <div>
                  <label className="text-xs font-semibold uppercase text-muted-foreground">
                    Request JSON Body
                  </label>
                  <textarea
                    rows={6}
                    value={state.requestBodyJson}
                    onChange={(e) =>
                      setState((prev) => ({ ...prev, requestBodyJson: e.target.value }))
                    }
                    className="w-full rounded-lg border border-border bg-muted/20 p-3 font-mono text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-stellar-blue"
                  />
                </div>
              )}

              <Button
                type="button"
                variant="default"
                onClick={handleExecuteRequest}
                disabled={state.loading}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {state.loading ? 'Executing Request...' : '⚡ Execute Live Request ("Try It Out")'}
              </Button>
            </div>

            {/* Response Console */}
            <div className="flex flex-col justify-between rounded-xl border border-border bg-black/90 p-4 text-white font-mono text-xs">
              <div>
                <div className="flex items-center justify-between border-b border-gray-800 pb-2">
                  <span className="font-semibold text-gray-400">Response Inspector</span>
                  {state.responseStatus !== null && (
                    <div className="flex items-center gap-3">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-bold ${
                          state.responseStatus >= 200 && state.responseStatus < 300
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-red-500/20 text-red-400'
                        }`}
                      >
                        HTTP {state.responseStatus}
                      </span>
                      <span className="text-gray-400">{state.responseTimeMs} ms</span>
                    </div>
                  )}
                </div>

                <div className="mt-3 overflow-auto max-h-[350px]">
                  {state.responseBody ? (
                    <pre className="whitespace-pre-wrap text-emerald-300">
                      {state.responseBody}
                    </pre>
                  ) : (
                    <p className="text-gray-500 italic">
                      Click "Execute Live Request" to run request and display live JSON output.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Embedded Full Swagger UI Container */}
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-2xl font-bold text-foreground">Complete Swagger UI Explorer</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Full OpenAPI 3.0 specification rendering all 25+ tags, 60+ endpoints, parameters, and models.
          </p>

          <div className="mt-6 min-h-[600px] rounded-xl border border-border bg-white p-4">
            {!swaggerUiLoaded && (
              <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                Loading Swagger UI Bundle...
              </div>
            )}
            <div id="swagger-ui-container" />
          </div>
        </section>
      </div>
    </main>
  );
}
