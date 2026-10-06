'use client';

import { type FormEvent, useState } from 'react';
import { Alert } from '@/components/atoms/Alert';
import { Badge } from '@/components/atoms/Badge';
import { Button } from '@/components/atoms/Button';
import { Input } from '@/components/atoms/Input';
import { Select } from '@/components/atoms/Select';
import { Text } from '@/components/atoms/Text';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/molecules/Card';
import { CERTIFICATION_PROVIDERS } from '@/lib/certification/types';
import type {
  CertificationProject,
  CertificationProvider,
  CertificationRenewal,
  CreditVerification,
} from '@/lib/certification/types';

const PROVIDER_LABELS: Record<CertificationProvider, string> = {
  verra: 'Verra',
  'gold-standard': 'Gold Standard',
};

interface ApiErrorBody {
  error?: string;
  code?: string;
  details?: string[];
}

async function callCertificationApi<T>(
  path: string,
  apiKey: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(`/api/v2/marketplace/certifications${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      ...init?.headers,
    },
  });

  const body = (await response.json().catch(() => ({}))) as ApiErrorBody & T;

  if (!response.ok) {
    const message = body.details?.length ? `${body.error}: ${body.details.join('; ')}` : body.error;
    const suffix = body.code ? ` (${body.code})` : '';
    throw new Error(`${message ?? `Request failed with ${response.status}`}${suffix}`);
  }

  return body as T;
}

function formatCredits(project: CertificationProject): string {
  return `${project.availableCredits.toLocaleString()} available · ${project.issuedCredits.toLocaleString()} issued · ${project.retiredCredits.toLocaleString()} retired`;
}

function outcomeVariant(
  outcome: CreditVerification['outcome']
): 'success' | 'destructive' | 'default' {
  if (outcome === 'verified') return 'success';
  if (outcome === 'mismatch') return 'destructive';
  return 'default';
}

function renewalVariant(
  status: CertificationRenewal['status']
): 'success' | 'destructive' | 'default' {
  if (status === 'accepted') return 'success';
  if (status === 'overdue' || status === 'rejected') return 'destructive';
  return 'default';
}

/**
 * Internal ops tool for the Verra / Gold Standard registry integration
 * (lib/certification/*). The certification API is a partner-facing endpoint
 * authenticated with a client API key (x-api-key), separate from the admin
 * dashboard session — so this panel asks for that key rather than assuming
 * one. The key is kept in component state only; it is never persisted.
 */
export function CertificationRegistryPanel() {
  const [apiKey, setApiKey] = useState('');

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Partner API key</CardTitle>
          <CardDescription>
            Certification registry requests are authenticated as a marketplace partner client, not
            with your admin session. Enter a partner API key to use the panels below.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Input
            type="password"
            aria-label="Partner API key"
            placeholder="fc_..."
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            autoComplete="off"
          />
        </CardContent>
      </Card>

      <SyncProjectCard apiKey={apiKey} />
      <VerifyCreditCard apiKey={apiKey} />
      <RenewalCard apiKey={apiKey} />
    </div>
  );
}

function ProviderSelect({
  value,
  onChange,
  id,
}: {
  value: CertificationProvider;
  onChange: (value: CertificationProvider) => void;
  id: string;
}) {
  return (
    <Select
      id={id}
      aria-label="Registry provider"
      value={value}
      onChange={(event) => onChange(event.target.value as CertificationProvider)}
    >
      {CERTIFICATION_PROVIDERS.map((provider) => (
        <option key={provider} value={provider}>
          {PROVIDER_LABELS[provider]}
        </option>
      ))}
    </Select>
  );
}

function SyncProjectCard({ apiKey }: { apiKey: string }) {
  const [provider, setProvider] = useState<CertificationProvider>('verra');
  const [projectId, setProjectId] = useState('');
  const [project, setProject] = useState<CertificationProject | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await callCertificationApi<{ project: CertificationProject }>(
        '/projects/sync',
        apiKey,
        { method: 'POST', body: JSON.stringify({ provider, projectId }) }
      );
      setProject(data.project);
    } catch (err) {
      setProject(null);
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sync project</CardTitle>
        <CardDescription>
          Pull the latest project data from a registry and store it locally.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="w-full sm:w-48">
            <Text as="span" variant="label">
              Provider
            </Text>
            <ProviderSelect id="sync-provider" value={provider} onChange={setProvider} />
          </div>
          <div className="w-full flex-1">
            <Text as="span" variant="label">
              Project ID
            </Text>
            <Input
              aria-label="Project ID"
              placeholder="VCS-1913"
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              required
            />
          </div>
          <Button type="submit" disabled={loading || !apiKey || !projectId}>
            {loading ? 'Syncing…' : 'Sync project'}
          </Button>
        </form>

        {error && <Alert variant="destructive">{error}</Alert>}

        {project && (
          <div className="rounded-lg border border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Text as="h4" variant="h4">
                {project.name}
              </Text>
              <Badge variant="secondary">{project.status}</Badge>
            </div>
            <Text as="p" variant="muted" className="mt-1">
              {PROVIDER_LABELS[project.provider]} · {project.projectId}
              {project.countryCode ? ` · ${project.countryCode}` : ''}
            </Text>
            <Text as="p" variant="small" className="mt-3">
              {formatCredits(project)}
            </Text>
            {project.methodologyName && (
              <Text as="p" variant="muted" className="mt-1">
                Methodology: {project.methodologyName}
              </Text>
            )}
            {project.documents.length > 0 && (
              <ul className="mt-3 space-y-1">
                {project.documents.map((document) => (
                  <li key={document.externalId} className="text-sm">
                    <Badge variant="outline" className="mr-2">
                      {document.status}
                    </Badge>
                    {document.name}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function VerifyCreditCard({ apiKey }: { apiKey: string }) {
  const [provider, setProvider] = useState<CertificationProvider>('verra');
  const [projectId, setProjectId] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [vintage, setVintage] = useState('');
  const [quantity, setQuantity] = useState('');
  const [verification, setVerification] = useState<CreditVerification | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await callCertificationApi<{ verification: CreditVerification }>(
        '/credits/verify',
        apiKey,
        {
          method: 'POST',
          body: JSON.stringify({
            provider,
            projectId,
            serialNumber,
            ...(vintage ? { vintage: Number(vintage) } : {}),
            ...(quantity ? { quantity: Number(quantity) } : {}),
          }),
        }
      );
      setVerification(data.verification);
    } catch (err) {
      setVerification(null);
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Verify credit</CardTitle>
        <CardDescription>
          Check a credit serial number against the registry. Provide expected vintage and/or
          quantity to flag mismatches.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <Text as="span" variant="label">
              Provider
            </Text>
            <ProviderSelect id="verify-provider" value={provider} onChange={setProvider} />
          </div>
          <div>
            <Text as="span" variant="label">
              Project ID
            </Text>
            <Input
              aria-label="Project ID"
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              required
            />
          </div>
          <div>
            <Text as="span" variant="label">
              Serial number
            </Text>
            <Input
              aria-label="Serial number"
              value={serialNumber}
              onChange={(event) => setSerialNumber(event.target.value)}
              required
            />
          </div>
          <div>
            <Text as="span" variant="label">
              Vintage (optional)
            </Text>
            <Input
              aria-label="Vintage"
              type="number"
              value={vintage}
              onChange={(event) => setVintage(event.target.value)}
            />
          </div>
          <div>
            <Text as="span" variant="label">
              Quantity (optional)
            </Text>
            <Input
              aria-label="Quantity"
              type="number"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-5">
            <Button type="submit" disabled={loading || !apiKey || !projectId || !serialNumber}>
              {loading ? 'Verifying…' : 'Verify credit'}
            </Button>
          </div>
        </form>

        {error && <Alert variant="destructive">{error}</Alert>}

        {verification && (
          <div className="rounded-lg border border-border p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={outcomeVariant(verification.outcome)}>{verification.outcome}</Badge>
              <Text as="span" variant="muted">
                provider status: {verification.providerStatus}
              </Text>
            </div>
            {verification.mismatches.length > 0 && (
              <ul className="mt-3 space-y-1">
                {verification.mismatches.map((mismatch) => (
                  <li key={mismatch.field} className="text-sm text-destructive">
                    {mismatch.field}: expected {mismatch.expected}, got {mismatch.actual ?? '—'}
                  </li>
                ))}
              </ul>
            )}
            <Text as="p" variant="muted" className="mt-3">
              Checked {new Date(verification.checkedAt).toLocaleString()}
            </Text>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RenewalCard({ apiKey }: { apiKey: string }) {
  const [provider, setProvider] = useState<CertificationProvider>('verra');
  const [projectId, setProjectId] = useState('');
  const [renewal, setRenewal] = useState<CertificationRenewal | null>(null);
  const [loading, setLoading] = useState<'check' | 'sync' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load(mode: 'check' | 'sync') {
    setError(null);
    setLoading(mode);
    try {
      const data =
        mode === 'check'
          ? await callCertificationApi<{ renewal: CertificationRenewal }>(
              `/renewals?provider=${encodeURIComponent(provider)}&projectId=${encodeURIComponent(projectId)}`,
              apiKey
            )
          : await callCertificationApi<{ renewal: CertificationRenewal }>('/renewals', apiKey, {
              method: 'POST',
              body: JSON.stringify({ provider, projectId }),
            });
      setRenewal(data.renewal);
    } catch (err) {
      setRenewal(null);
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Renewal documentation</CardTitle>
        <CardDescription>
          Check the last known renewal status, or sync it fresh from the registry. Syncing also
          fills in any missing required documents (monitoring report, verification statement) as
          placeholders to complete.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="w-full sm:w-48">
            <Text as="span" variant="label">
              Provider
            </Text>
            <ProviderSelect id="renewal-provider" value={provider} onChange={setProvider} />
          </div>
          <div className="w-full flex-1">
            <Text as="span" variant="label">
              Project ID
            </Text>
            <Input
              aria-label="Project ID"
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={loading !== null || !apiKey || !projectId}
              onClick={() => load('check')}
            >
              {loading === 'check' ? 'Checking…' : 'Check status'}
            </Button>
            <Button
              type="button"
              disabled={loading !== null || !apiKey || !projectId}
              onClick={() => load('sync')}
            >
              {loading === 'sync' ? 'Syncing…' : 'Sync from registry'}
            </Button>
          </div>
        </div>

        {error && <Alert variant="destructive">{error}</Alert>}

        {renewal && (
          <div className="rounded-lg border border-border p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={renewalVariant(renewal.status)}>{renewal.status}</Badge>
              {renewal.dueAt && (
                <Text as="span" variant="muted">
                  due {new Date(renewal.dueAt).toLocaleDateString()}
                </Text>
              )}
            </div>
            <ul className="mt-3 space-y-1">
              {renewal.documents.map((document) => (
                <li key={document.externalId} className="text-sm">
                  <Badge variant="outline" className="mr-2">
                    {document.status}
                  </Badge>
                  {document.name}
                  {document.generated && (
                    <span className="ml-2 text-xs text-muted-foreground">(placeholder)</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
