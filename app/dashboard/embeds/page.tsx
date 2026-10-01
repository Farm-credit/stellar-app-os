'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  Check,
  Clipboard,
  Code2,
  ExternalLink,
  KeyRound,
  LoaderCircle,
  Plus,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/atoms/Button';

type EmbedKey = {
  id: string;
  name: string;
  allowed_domains: string[];
  theme: 'light' | 'dark' | 'auto';
  primary_color: string;
  currency: string;
  widget_title?: string;
  brand_name?: string;
  show_branding: boolean;
  active: boolean;
  created_at: string;
};

const defaultForm = {
  name: '',
  allowedDomains: '',
  brandName: '',
  widgetTitle: 'Offset your carbon footprint',
  primaryColor: '#00b36b',
  theme: 'light' as EmbedKey['theme'],
  currency: 'USD',
  showBranding: false,
};

export default function CarbonOffsetEmbedPage() {
  const [keys, setKeys] = useState<EmbedKey[]>([]);
  const [form, setForm] = useState(defaultForm);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [appOrigin, setAppOrigin] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadKeys = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/embed/keys', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not load integrations.');
      setKeys(result.keys as EmbedKey[]);
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load integrations.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setAppOrigin(window.location.origin);
    void loadKeys();
  }, [loadKeys]);

  const installSnippet = createdKey
    ? `<div id="farm-credit-offset"></div>\n<script src="${appOrigin}/api/embed/script?key=${createdKey}"></script>\n<script>\n  FarmCreditOffset.init({ key: '${createdKey}', mode: 'widget', containerId: 'farm-credit-offset' });\n</script>`
    : '';

  async function createIntegration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');
    setCreatedKey(null);

    const domains = form.allowedDomains
      .split(/[\n,]/)
      .map((domain) => domain.trim().toLowerCase())
      .filter(Boolean);

    if (!form.name.trim() || domains.length === 0) {
      setError('Add an integration name and at least one allowed website domain.');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/embed/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          allowedDomains: domains,
          brandName: form.brandName.trim() || undefined,
          widgetTitle: form.widgetTitle.trim() || undefined,
          primaryColor: form.primaryColor,
          theme: form.theme,
          currency: form.currency,
          showBranding: form.showBranding,
          showProjectSelector: true,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not create integration.');
      setCreatedKey(result.apiKey as string);
      setForm(defaultForm);
      setNotice(
        'Integration created. Copy the install code now; this API key will not be shown again.'
      );
      await loadKeys();
    } catch (createError) {
      setError(
        createError instanceof Error ? createError.message : 'Could not create integration.'
      );
    } finally {
      setSaving(false);
    }
  }

  async function revokeKey(key: EmbedKey) {
    if (
      !window.confirm(`Revoke “${key.name}”? The embed will stop accepting purchases immediately.`)
    )
      return;
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/embed/keys/${encodeURIComponent(key.id)}`, {
        method: 'DELETE',
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not revoke this key.');
      setNotice(`${key.name} was revoked.`);
      await loadKeys();
    } catch (revokeError) {
      setError(revokeError instanceof Error ? revokeError.message : 'Could not revoke this key.');
    }
  }

  async function copySnippet() {
    await navigator.clipboard.writeText(installSnippet);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <main className="min-h-screen bg-background px-4 pb-16 pt-24 text-foreground sm:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-10 border-b border-border pb-7">
          <div className="mb-4 flex items-center gap-2 text-sm font-medium text-stellar-green">
            <Code2 className="size-4" /> Merchant tools{' '}
            <span className="text-muted-foreground">/</span> Carbon offset embed
          </div>
          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div className="max-w-2xl">
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Put carbon offsets in your checkout
              </h1>
              <p className="mt-3 text-base leading-7 text-muted-foreground">
                Add a branded offset experience to your storefront. Customers choose a verified
                project and amount, then complete payment through secure hosted checkout.
              </p>
            </div>
            <a
              className="inline-flex items-center gap-2 text-sm font-medium text-stellar-blue hover:underline"
              href="/api/embed/script"
              target="_blank"
              rel="noreferrer"
            >
              SDK endpoint <ExternalLink className="size-4" />
            </a>
          </div>
        </header>

        {(error || notice) && (
          <div
            role={error ? 'alert' : 'status'}
            className={`mb-6 border-l-4 px-4 py-3 text-sm ${error ? 'border-red-500 bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-200' : 'border-stellar-green bg-emerald-50 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200'}`}
          >
            {error || notice}
          </div>
        )}

        {createdKey && (
          <section
            className="mb-8 border border-stellar-green/40 bg-stellar-green/5 p-5 sm:p-6"
            aria-labelledby="install-code-title"
          >
            <div className="mb-4 flex items-start gap-3">
              <div className="rounded-sm bg-stellar-green/15 p-2 text-stellar-green">
                <Check className="size-5" />
              </div>
              <div>
                <h2 id="install-code-title" className="font-semibold">
                  Your integration is ready
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  The public embed key is restricted to your allowed domains. Save this snippet in
                  your storefront template.
                </p>
              </div>
            </div>
            <pre className="overflow-x-auto border border-border bg-black/[0.04] p-4 text-xs leading-6 dark:bg-black/30">
              <code>{installSnippet}</code>
            </pre>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button onClick={copySnippet} className="gap-2">
                {copied ? <Check className="size-4" /> : <Clipboard className="size-4" />}
                {copied ? 'Copied' : 'Copy install code'}
              </Button>
              <span className="text-xs text-muted-foreground">
                Treat the key as public, but never remove its domain restrictions.
              </span>
            </div>
          </section>
        )}

        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
          <section aria-labelledby="create-title">
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-sm bg-stellar-blue/10 p-2 text-stellar-blue">
                <Plus className="size-5" />
              </div>
              <div>
                <h2 id="create-title" className="text-xl font-semibold">
                  Create an integration
                </h2>
                <p className="text-sm text-muted-foreground">
                  Configure how the embed appears on your site.
                </p>
              </div>
            </div>
            <form className="space-y-5" onSubmit={createIntegration}>
              <label className="block text-sm font-medium">
                Integration name
                <input
                  required
                  maxLength={80}
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  placeholder="Storefront checkout"
                  className="mt-2 h-11 w-full border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue"
                />
              </label>
              <label className="block text-sm font-medium">
                Allowed website domains
                <textarea
                  required
                  rows={2}
                  value={form.allowedDomains}
                  onChange={(event) => setForm({ ...form, allowedDomains: event.target.value })}
                  placeholder={'shop.example.com\ncheckout.example.com'}
                  className="mt-2 w-full resize-y border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue"
                />
                <span className="mt-1 block text-xs font-normal text-muted-foreground">
                  Enter hostnames only, one per line. HTTPS is required outside localhost.
                </span>
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium">
                  Widget title
                  <input
                    maxLength={80}
                    value={form.widgetTitle}
                    onChange={(event) => setForm({ ...form, widgetTitle: event.target.value })}
                    className="mt-2 h-11 w-full border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue"
                  />
                </label>
                <label className="block text-sm font-medium">
                  Brand name
                  <input
                    maxLength={80}
                    value={form.brandName}
                    onChange={(event) => setForm({ ...form, brandName: event.target.value })}
                    placeholder="Your company"
                    className="mt-2 h-11 w-full border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue"
                  />
                </label>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <label className="block text-sm font-medium">
                  Accent color
                  <span className="mt-2 flex h-11 items-center gap-3 border border-input px-3">
                    <input
                      aria-label="Widget accent color"
                      type="color"
                      value={form.primaryColor}
                      onChange={(event) => setForm({ ...form, primaryColor: event.target.value })}
                      className="size-7 cursor-pointer border-0 bg-transparent p-0"
                    />
                    <span className="font-mono text-xs uppercase">{form.primaryColor}</span>
                  </span>
                </label>
                <label className="block text-sm font-medium">
                  Appearance
                  <select
                    value={form.theme}
                    onChange={(event) =>
                      setForm({ ...form, theme: event.target.value as EmbedKey['theme'] })
                    }
                    className="mt-2 h-11 w-full border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue"
                  >
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                    <option value="auto">Match visitor</option>
                  </select>
                </label>
                <label className="block text-sm font-medium">
                  Currency
                  <select
                    value={form.currency}
                    onChange={(event) => setForm({ ...form, currency: event.target.value })}
                    className="mt-2 h-11 w-full border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue"
                  >
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="GBP">GBP</option>
                  </select>
                </label>
              </div>
              <label className="flex cursor-pointer items-start gap-3 border-y border-border py-4 text-sm">
                <input
                  type="checkbox"
                  checked={form.showBranding}
                  onChange={(event) => setForm({ ...form, showBranding: event.target.checked })}
                  className="mt-0.5 size-4 accent-stellar-green"
                />
                <span>
                  <span className="font-medium">Show Farm-credit attribution</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Leave off for a fully white-label presentation.
                  </span>
                </span>
              </label>
              <Button type="submit" disabled={saving} className="gap-2">
                {saving ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <KeyRound className="size-4" />
                )}
                {saving ? 'Creating integration…' : 'Create integration'}
              </Button>
            </form>
          </section>

          <aside className="space-y-8">
            <section className="border border-border p-5 sm:p-6" aria-labelledby="security-title">
              <div className="flex items-center gap-3">
                <ShieldCheck className="size-5 text-stellar-green" />
                <h2 id="security-title" className="font-semibold">
                  Domain-restricted by default
                </h2>
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Each integration gets its own public key. Requests and return URLs are checked
                against the allowed domains, and payment details stay on hosted checkout.
              </p>
            </section>

            <section aria-labelledby="integrations-title">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 id="integrations-title" className="text-xl font-semibold">
                    Your integrations
                  </h2>
                  <p className="text-sm text-muted-foreground">Manage active storefront embeds.</p>
                </div>
                <span className="border border-border px-2.5 py-1 text-xs tabular-nums">
                  {keys.filter((key) => key.active).length} active
                </span>
              </div>
              {loading ? (
                <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                  <LoaderCircle className="size-4 animate-spin" /> Loading integrations
                </div>
              ) : keys.length === 0 ? (
                <div className="border border-dashed border-border px-4 py-8 text-center">
                  <KeyRound className="mx-auto mb-3 size-5 text-muted-foreground" />
                  <p className="text-sm font-medium">No integrations yet</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Create one to get your website install code.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-border border-y border-border">
                  {keys.map((key) => (
                    <li key={key.id} className="py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="truncate font-medium">{key.name}</h3>
                            <span
                              className={`text-xs ${key.active ? 'text-stellar-green' : 'text-muted-foreground'}`}
                            >
                              {key.active ? 'Active' : 'Revoked'}
                            </span>
                          </div>
                          <p className="mt-1 break-words text-xs text-muted-foreground">
                            {key.allowed_domains.join(', ')}
                          </p>
                          <p className="mt-2 text-xs text-muted-foreground">
                            {key.currency} · {key.theme} theme · Created{' '}
                            {new Date(key.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        {key.active && (
                          <Button
                            variant="outline"
                            size="sm"
                            aria-label={`Revoke ${key.name}`}
                            onClick={() => void revokeKey(key)}
                            className="shrink-0 gap-1.5 text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/40"
                          >
                            <Trash2 className="size-3.5" /> Revoke
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
