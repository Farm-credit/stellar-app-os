'use client';

import { useState } from 'react';
import { Button } from '@/components/atoms/Button';
import { Input } from '@/components/atoms/Input';

interface EndpointConfig {
  id: string;
  name: string;
  method: 'GET' | 'POST';
  path: string;
  description: string;
  defaultParams: Record<string, string>;
}

const AVAILABLE_ENDPOINTS: EndpointConfig[] = [
  {
    id: 'trees',
    name: 'Trees Sponsorship Data',
    method: 'GET',
    path: '/api/v1/trees',
    description: 'Read registered trees with on-chain sponsorship status, species, and carbon offset rates.',
    defaultParams: {
      species: '',
      sponsored: 'true',
      page: '1',
      per_page: '10',
    },
  },
  {
    id: 'projects',
    name: 'Reforestation Projects',
    method: 'GET',
    path: '/api/v1/projects',
    description: 'Explore tree planting projects, target counts, regional boundaries, and active sponsors.',
    defaultParams: {
      country: '',
      status: 'active',
    },
  },
  {
    id: 'species',
    name: 'Tree Species Catalogue',
    method: 'GET',
    path: '/api/v1/species',
    description: 'Access botanical metadata, annual CO2 absorption metrics, growth rates, and ecological benefits.',
    defaultParams: {
      min_co2: '',
      growth_rate: '',
    },
  },
  {
    id: 'co2-stats',
    name: 'CO2 Sequestration Stats',
    method: 'GET',
    path: '/api/v1/co2/stats',
    description: 'Aggregated real-time carbon offset totals, species/project breakdowns, and real-world equivalencies.',
    defaultParams: {},
  },
];

export function ApiSandbox() {
  const [clientId, setClientId] = useState('sandbox_client_id');
  const [clientSecret, setClientSecret] = useState('sandbox_secret');
  const [accessToken, setAccessToken] = useState('sandbox_bearer_token');
  const [tokenScopes, setTokenScopes] = useState('trees:read projects:read species:read co2:read');
  const [isGeneratingToken, setIsGeneratingToken] = useState(false);
  const [tokenMsg, setTokenMsg] = useState<string | null>(null);

  const [selectedEndpoint, setSelectedEndpoint] = useState<EndpointConfig>(AVAILABLE_ENDPOINTS[0]);
  const [queryParams, setQueryParams] = useState<Record<string, string>>(AVAILABLE_ENDPOINTS[0].defaultParams);
  const [isLoading, setIsLoading] = useState(false);
  const [responseStatus, setResponseStatus] = useState<number | null>(null);
  const [responseHeaders, setResponseHeaders] = useState<Record<string, string>>({});
  const [responseBody, setResponseBody] = useState<unknown | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [copiedLang, setCopiedLang] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'sandbox' | 'oauth' | 'docs'>('sandbox');

  const handleEndpointChange = (endpoint: EndpointConfig) => {
    setSelectedEndpoint(endpoint);
    setQueryParams(endpoint.defaultParams);
    setResponseBody(null);
    setResponseStatus(null);
  };

  const handleParamChange = (key: string, value: string) => {
    setQueryParams((prev) => ({ ...prev, [key]: value }));
  };

  const buildUrl = () => {
    const search = new URLSearchParams();
    for (const [k, v] of Object.entries(queryParams)) {
      if (v.trim()) search.append(k, v.trim());
    }
    const queryStr = search.toString();
    return `${selectedEndpoint.path}${queryStr ? `?${queryStr}` : ''}`;
  };

  const handleGenerateToken = async () => {
    setIsGeneratingToken(true);
    setTokenMsg(null);
    try {
      const res = await fetch('/api/v1/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'client_credentials',
          client_id: clientId,
          client_secret: clientSecret,
          scope: 'trees:read projects:read species:read co2:read',
        }),
      });
      const data = await res.json();
      if (res.ok && data.access_token) {
        setAccessToken(data.access_token);
        setTokenScopes(data.scope ?? 'trees:read projects:read species:read co2:read');
        setTokenMsg('Token successfully generated and applied to the sandbox.');
      } else {
        setTokenMsg(`Failed to generate token: ${data.error_description ?? data.error ?? 'Unknown error'}`);
      }
    } catch {
      // Fallback to local sandbox token
      setAccessToken('sandbox_bearer_token');
      setTokenMsg('Using sandbox fallback token (connected to test fixtures).');
    } finally {
      setIsGeneratingToken(false);
    }
  };

  const handleExecuteRequest = async () => {
    setIsLoading(true);
    setResponseStatus(null);
    setResponseBody(null);
    const start = performance.now();

    try {
      const url = buildUrl();
      const res = await fetch(url, {
        method: selectedEndpoint.method,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      });

      const end = performance.now();
      setLatencyMs(Math.round(end - start));
      setResponseStatus(res.status);

      const headersObj: Record<string, string> = {};
      res.headers.forEach((val, key) => {
        if (key.startsWith('x-') || key.startsWith('rate') || key === 'content-type') {
          headersObj[key] = val;
        }
      });
      setResponseHeaders(headersObj);

      const json = await res.json();
      setResponseBody(json);
    } catch (err: unknown) {
      setResponseStatus(500);
      setResponseBody({ error: 'Request failed', message: String(err) });
    } finally {
      setIsLoading(false);
    }
  };

  const buildSnippet = (lang: 'curl' | 'js' | 'python') => {
    const url = `https://api.farmcredit.org${buildUrl()}`;
    if (lang === 'curl') {
      return `curl -X ${selectedEndpoint.method} "${url}" \\\n  -H "Authorization: Bearer ${accessToken}" \\\n  -H "Accept: application/json"`;
    }
    if (lang === 'js') {
      return `const response = await fetch("${url}", {\n  headers: {\n    "Authorization": "Bearer ${accessToken}",\n    "Accept": "application/json"\n  }\n});\nconst data = await response.json();\nconsole.log(data);`;
    }
    return `import requests\n\nurl = "${url}"\nheaders = {\n    "Authorization": "Bearer ${accessToken}",\n    "Accept": "application/json"\n}\nresponse = requests.get(url, headers=headers)\nprint(response.json())`;
  };

  const handleCopy = (lang: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedLang(lang);
    setTimeout(() => setCopiedLang(null), 2000);
  };

  return (
    <div className="w-full max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Header Banner */}
      <div className="rounded-2xl bg-gradient-to-r from-emerald-800 via-teal-900 to-slate-900 p-8 text-white shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-300 ring-1 ring-emerald-500/40">
              <span>● Live REST API</span>
              <span>·</span>
              <span>OAuth 2.0</span>
            </div>
            <h1 className="mt-3 text-3xl font-extrabold sm:text-4xl tracking-tight">
              Tree Sponsorship Developer Portal & Sandbox
            </h1>
            <p className="mt-2 text-slate-300 max-w-2xl text-sm sm:text-base">
              Integrate sponsored tree records, reforestation projects, species metrics, and verified CO2 statistics into your third-party applications.
            </p>
          </div>
          <div className="flex items-center gap-2 bg-white/10 backdrop-blur-md rounded-xl p-2 border border-white/20">
            <button
              onClick={() => setActiveTab('sandbox')}
              className={`px-4 py-2 text-xs font-semibold rounded-lg transition ${activeTab === 'sandbox' ? 'bg-white text-slate-900 shadow' : 'text-slate-200 hover:text-white'}`}
            >
              Interactive Sandbox
            </button>
            <button
              onClick={() => setActiveTab('oauth')}
              className={`px-4 py-2 text-xs font-semibold rounded-lg transition ${activeTab === 'oauth' ? 'bg-white text-slate-900 shadow' : 'text-slate-200 hover:text-white'}`}
            >
              OAuth2 Credentials
            </button>
            <button
              onClick={() => setActiveTab('docs')}
              className={`px-4 py-2 text-xs font-semibold rounded-lg transition ${activeTab === 'docs' ? 'bg-white text-slate-900 shadow' : 'text-slate-200 hover:text-white'}`}
            >
              API Reference
            </button>
          </div>
        </div>
      </div>

      {/* OAuth2 Token Management Tab */}
      {activeTab === 'oauth' && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-xl font-bold text-slate-900">OAuth 2.0 Client Credentials Grant</h2>
          <p className="text-sm text-slate-600">
            Third-party systems authenticate using RFC 6749 client credentials to obtain a time-limited Bearer token.
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Client ID</label>
              <Input
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="sandbox_client_id"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Client Secret</label>
              <Input
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder="sandbox_secret"
              />
            </div>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <Button
              onClick={handleGenerateToken}
              disabled={isGeneratingToken}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {isGeneratingToken ? 'Requesting Token...' : 'Generate Sandbox Token (POST /api/v1/oauth/token)'}
            </Button>
            {tokenMsg && <span className="text-xs font-medium text-emerald-700">{tokenMsg}</span>}
          </div>
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 space-y-2">
            <div className="flex items-center justify-between text-xs font-mono text-slate-600">
              <span>Active Bearer Token:</span>
              <span className="text-emerald-700 font-bold">Valid (3600s)</span>
            </div>
            <p className="font-mono text-xs text-slate-900 break-all bg-white p-2 rounded border border-slate-200">
              {accessToken}
            </p>
            <p className="text-xs text-slate-500">Granted Scopes: <code className="text-slate-800">{tokenScopes}</code></p>
          </div>
        </div>
      )}

      {/* Documentation Overview Tab */}
      {activeTab === 'docs' && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
          <h2 className="text-xl font-bold text-slate-900">Developer Integration Reference</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="p-4 rounded-lg border border-slate-200 bg-slate-50">
              <span className="text-xs font-bold text-emerald-600 uppercase tracking-wide">Endpoint 1</span>
              <h3 className="font-bold text-slate-900 mt-1">GET /api/v1/trees</h3>
              <p className="text-xs text-slate-600 mt-1">
                Returns paginated list of sponsored trees with species, coordinates, carbon offset, and NFT token ownership metadata.
              </p>
            </div>
            <div className="p-4 rounded-lg border border-slate-200 bg-slate-50">
              <span className="text-xs font-bold text-emerald-600 uppercase tracking-wide">Endpoint 2</span>
              <h3 className="font-bold text-slate-900 mt-1">GET /api/v1/projects</h3>
              <p className="text-xs text-slate-600 mt-1">
                Returns active reforestation projects, sponsored count vs target, countries, and primary tree species.
              </p>
            </div>
            <div className="p-4 rounded-lg border border-slate-200 bg-slate-50">
              <span className="text-xs font-bold text-emerald-600 uppercase tracking-wide">Endpoint 3</span>
              <h3 className="font-bold text-slate-900 mt-1">GET /api/v1/species</h3>
              <p className="text-xs text-slate-600 mt-1">
                Catalog of botanical species with annual CO2 absorption ratings, growth speeds, and ecological benefits.
              </p>
            </div>
            <div className="p-4 rounded-lg border border-slate-200 bg-slate-50">
              <span className="text-xs font-bold text-emerald-600 uppercase tracking-wide">Endpoint 4</span>
              <h3 className="font-bold text-slate-900 mt-1">GET /api/v1/co2/stats</h3>
              <p className="text-xs text-slate-600 mt-1">
                Real-time aggregated carbon sequestration totals, project/species breakdowns, and EPA-standard vehicle/flight offsets.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Sandbox Tab */}
      {activeTab === 'sandbox' && (
        <div className="grid lg:grid-cols-12 gap-6">
          {/* Left Column: Endpoint selector & Query builder */}
          <div className="lg:col-span-5 space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Select Endpoint</h3>
              <div className="space-y-2">
                {AVAILABLE_ENDPOINTS.map((endpoint) => (
                  <button
                    key={endpoint.id}
                    onClick={() => handleEndpointChange(endpoint)}
                    className={`w-full text-left p-3 rounded-lg border transition ${selectedEndpoint.id === endpoint.id ? 'border-emerald-600 bg-emerald-50/50 ring-1 ring-emerald-500' : 'border-slate-200 hover:border-slate-300'}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm text-slate-900">{endpoint.name}</span>
                      <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                        {endpoint.method}
                      </span>
                    </div>
                    <p className="text-xs font-mono text-slate-500 mt-1">{endpoint.path}</p>
                    <p className="text-xs text-slate-600 mt-1">{endpoint.description}</p>
                  </button>
                ))}
              </div>

              {/* Query Parameters Config */}
              <div className="pt-2 border-t border-slate-100 space-y-3">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Query Parameters</h4>
                {Object.keys(selectedEndpoint.defaultParams).length === 0 ? (
                  <p className="text-xs text-slate-500 italic">No query parameters required for this endpoint.</p>
                ) : (
                  Object.keys(selectedEndpoint.defaultParams).map((paramKey) => (
                    <div key={paramKey}>
                      <label className="block text-xs font-mono text-slate-700 mb-1">{paramKey}</label>
                      <Input
                        value={queryParams[paramKey] ?? ''}
                        onChange={(e) => handleParamChange(paramKey, e.target.value)}
                        placeholder={paramKey}
                        className="text-xs"
                      />
                    </div>
                  ))
                )}
              </div>

              <div className="pt-2">
                <Button
                  onClick={handleExecuteRequest}
                  disabled={isLoading}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5"
                >
                  {isLoading ? 'Executing Request...' : 'Send Live Sandbox Request'}
                </Button>
              </div>
            </div>
          </div>

          {/* Right Column: Response Viewer & Code Snippets */}
          <div className="lg:col-span-7 space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Live Response</h3>
                {responseStatus !== null && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">{latencyMs} ms</span>
                    <span
                      className={`px-2.5 py-0.5 text-xs font-bold rounded-full ${responseStatus === 200 ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}
                    >
                      HTTP {responseStatus}
                    </span>
                  </div>
                )}
              </div>

              <div className="font-mono text-xs bg-slate-900 text-emerald-400 p-2.5 rounded-lg flex items-center justify-between">
                <span>{selectedEndpoint.method} {buildUrl()}</span>
                <span className="text-slate-400">Bearer Auth</span>
              </div>

              {responseBody ? (
                <div className="space-y-2">
                  <pre className="max-h-96 overflow-auto p-4 rounded-lg bg-slate-950 text-slate-100 font-mono text-xs leading-relaxed border border-slate-800">
                    <code>{JSON.stringify(responseBody, null, 2)}</code>
                  </pre>
                  {Object.keys(responseHeaders).length > 0 && (
                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs font-mono space-y-1">
                      <p className="font-semibold text-slate-700">Response Headers:</p>
                      {Object.entries(responseHeaders).map(([k, v]) => (
                        <div key={k} className="text-slate-600">
                          <span className="text-slate-800 font-medium">{k}:</span> {v}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-12 text-center text-slate-400 rounded-lg border-2 border-dashed border-slate-200">
                  <p className="text-sm">Click "Send Live Sandbox Request" to test this endpoint live.</p>
                </div>
              )}

              {/* Code Snippets */}
              <div className="pt-4 border-t border-slate-100 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 uppercase">Integration Snippets</span>
                  <div className="flex gap-2">
                    {(['curl', 'js', 'python'] as const).map((lang) => (
                      <button
                        key={lang}
                        onClick={() => handleCopy(lang, buildSnippet(lang))}
                        className="text-xs px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium transition"
                      >
                        {copiedLang === lang ? 'Copied!' : lang.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
                <pre className="p-3 rounded-lg bg-slate-900 text-slate-200 font-mono text-xs overflow-x-auto">
                  <code>{buildSnippet('curl')}</code>
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
