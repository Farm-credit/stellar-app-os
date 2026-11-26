// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

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
  TreePine,
  Sparkles,
  Coins,
  LayoutTemplate,
} from 'lucide-react';
import { Button } from '@/components/atoms/Button';
import { SponsorWidget } from '@/components/organisms/SponsorWidget';
import type { WidgetTheme, WidgetLayout } from '@/lib/types/sponsor-widget';

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
  const [activeTab, setActiveTab] = useState<'checkout' | 'sponsor_widget'>('checkout');

  // Checkout embed state
  const [keys, setKeys] = useState<EmbedKey[]>([]);
  const [form, setForm] = useState(defaultForm);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [appOrigin, setAppOrigin] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Sponsor widget builder state
  const [widgetSponsor, setWidgetSponsor] = useState('acme-corp');
  const [widgetTitle, setWidgetTitle] = useState('Acme Corp Ecological Impact');
  const [widgetLayout, setWidgetLayout] = useState<WidgetLayout>('card');
  const [widgetTheme, setWidgetTheme] = useState<WidgetTheme>('auto');
  const [widgetAccent, setWidgetAccent] = useState('#10b981');
  const [widgetShowBranding, setWidgetShowBranding] = useState(true);
  const [widgetShowRewards, setWidgetShowRewards] = useState(true);
  const [copiedIframe, setCopiedIframe] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);

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

  // Sponsor widget code snippets
  const sponsorIframeSnippet = `<iframe\n  src="${appOrigin}/embed/sponsor-widget?sponsor=${encodeURIComponent(widgetSponsor)}&theme=${widgetTheme}&layout=${widgetLayout}&accent=${encodeURIComponent(widgetAccent)}&showBranding=${widgetShowBranding}&rewards=${widgetShowRewards}"\n  width="100%"\n  height="${widgetLayout === 'compact' ? '320' : widgetLayout === 'banner' ? '180' : '480'}"\n  frameborder="0"\n  style="border: none; max-width: ${widgetLayout === 'banner' ? '100%' : '440px'}; width: 100%; border-radius: 16px; overflow: hidden;"\n  title="${widgetTitle}"\n></iframe>`;

  const sponsorScriptSnippet = `<!-- Place where you want the widget to appear -->\n<div id="sponsor-impact-widget"></div>\n<script\n  src="${appOrigin}/embed/sponsor-widget.js"\n  data-sponsor="${widgetSponsor}"\n  data-theme="${widgetTheme}"\n  data-layout="${widgetLayout}"\n  data-accent="${widgetAccent}"\n  data-show-branding="${widgetShowBranding}"\n></script>`;

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

  async function copyIframeSnippet() {
    await navigator.clipboard.writeText(sponsorIframeSnippet);
    setCopiedIframe(true);
    window.setTimeout(() => setCopiedIframe(false), 1800);
  }

  async function copyScriptSnippet() {
    await navigator.clipboard.writeText(sponsorScriptSnippet);
    setCopiedScript(true);
    window.setTimeout(() => setCopiedScript(false), 1800);
  }

  return (
    <main className="min-h-screen bg-background px-4 pb-16 pt-24 text-foreground sm:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 border-b border-border pb-7">
          <div className="mb-4 flex items-center gap-2 text-sm font-medium text-stellar-green">
            <Code2 className="size-4" /> Integrations & Embeds{' '}
            <span className="text-muted-foreground">/</span> External Widgets
          </div>
          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div className="max-w-2xl">
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Embed Farm Credit On Your Website
              </h1>
              <p className="mt-3 text-base leading-7 text-muted-foreground">
                Display live funded tree metrics, community rewards distributed, and verifiable on-chain impact across your corporate storefronts, blogs, and CSR reports.
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="mt-8 flex border-b border-border space-x-8">
            <button
              type="button"
              onClick={() => setActiveTab('checkout')}
              className={`pb-3 font-semibold text-sm transition-all border-b-2 ${
                activeTab === 'checkout'
                  ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              Carbon Offset Checkout Embed
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('sponsor_widget')}
              className={`pb-3 font-semibold text-sm transition-all border-b-2 flex items-center gap-2 ${
                activeTab === 'sponsor_widget'
                  ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <ShieldCheck className="size-4" />
              White-Label Sponsor Impact Widget
            </button>
          </div>
        </header>

        {(error || notice) && activeTab === 'checkout' && (
          <div
            role={error ? 'alert' : 'status'}
            className={`mb-6 border-l-4 px-4 py-3 text-sm ${error ? 'border-red-500 bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-200' : 'border-stellar-green bg-emerald-50 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200'}`}
          >
            {error || notice}
          </div>
        )}

        {/* TAB 1: Carbon Offset Checkout */}
        {activeTab === 'checkout' && (
          <div>
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

            <div className="grid gap-10 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <form
                  onSubmit={createIntegration}
                  className="space-y-6 border border-border p-6 sm:p-8"
                >
                  <h2 className="text-lg font-semibold">New merchant integration</h2>
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="form-name" className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Integration name
                      </label>
                      <input
                        id="form-name"
                        type="text"
                        required
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        placeholder="e.g. Shopify US Store"
                        className="mt-1.5 w-full rounded border border-border bg-background px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label htmlFor="form-domains" className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Allowed domains
                      </label>
                      <textarea
                        id="form-domains"
                        required
                        rows={2}
                        value={form.allowedDomains}
                        onChange={(e) => setForm({ ...form, allowedDomains: e.target.value })}
                        placeholder="example.com, store.example.com"
                        className="mt-1.5 w-full rounded border border-border bg-background px-3 py-2 text-sm font-mono"
                      />
                    </div>
                  </div>
                  <Button type="submit" disabled={saving} className="gap-2">
                    {saving && <LoaderCircle className="size-4 animate-spin" />}
                    <Plus className="size-4" /> Create Integration
                  </Button>
                </form>
              </div>

              <aside className="border border-border p-6 sm:p-8">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Active keys</h2>
                  <span className="rounded-full bg-border px-2 py-0.5 text-xs font-medium">
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
                  </div>
                ) : (
                  <ul className="divide-y divide-border border-y border-border">
                    {keys.map((key) => (
                      <li key={key.id} className="py-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="truncate font-medium">{key.name}</h3>
                            <p className="mt-1 break-words text-xs text-muted-foreground">{key.allowed_domains.join(', ')}</p>
                          </div>
                          {key.active && (
                            <Button
                              variant="outline"
                              size="sm"
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
              </aside>
            </div>
          </div>
        )}

        {/* TAB 2: White-Label Sponsor Impact Widget Generator & Preview */}
        {activeTab === 'sponsor_widget' && (
          <div className="space-y-8">
            <div className="grid gap-8 lg:grid-cols-12">
              {/* Configuration Controls */}
              <div className="lg:col-span-6 space-y-6">
                <div className="border border-border rounded-2xl p-6 bg-card space-y-5">
                  <div>
                    <h2 className="text-lg font-bold tracking-tight">Widget Customization</h2>
                    <p className="text-xs text-muted-foreground mt-1">
                      Configure white-label appearance, colors, and live ecological & reward metrics.
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Sponsor Identifier (Wallet or Slug)
                      </label>
                      <input
                        type="text"
                        value={widgetSponsor}
                        onChange={(e) => setWidgetSponsor(e.target.value)}
                        placeholder="acme-corp or G..."
                        className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-mono"
                      />
                      <span className="text-[11px] text-muted-foreground">
                        Try <code>acme-corp</code> or <code>apex-logistics</code>
                      </span>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Custom Title
                      </label>
                      <input
                        type="text"
                        value={widgetTitle}
                        onChange={(e) => setWidgetTitle(e.target.value)}
                        placeholder="e.g. Acme Corp Impact"
                        className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Layout Style
                        </label>
                        <select
                          value={widgetLayout}
                          onChange={(e) => setWidgetLayout(e.target.value as WidgetLayout)}
                          className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                        >
                          <option value="card">Standard Card</option>
                          <option value="compact">Compact Widget</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Theme Mode
                        </label>
                        <select
                          value={widgetTheme}
                          onChange={(e) => setWidgetTheme(e.target.value as WidgetTheme)}
                          className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                        >
                          <option value="auto">Auto (System)</option>
                          <option value="light">Light</option>
                          <option value="dark">Dark</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Brand Accent Color
                      </label>
                      <div className="mt-1 flex items-center gap-2">
                        <input
                          type="color"
                          value={widgetAccent}
                          onChange={(e) => setWidgetAccent(e.target.value)}
                          className="w-10 h-10 rounded-lg cursor-pointer border border-border"
                        />
                        <input
                          type="text"
                          value={widgetAccent}
                          onChange={(e) => setWidgetAccent(e.target.value)}
                          className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm font-mono"
                        />
                      </div>
                    </div>

                    <div className="pt-2 border-t border-border space-y-3">
                      <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                        <input
                          type="checkbox"
                          checked={widgetShowRewards}
                          onChange={(e) => setWidgetShowRewards(e.target.checked)}
                          className="rounded border-border"
                        />
                        <span>Display Community Rewards Distributed (CARBON Tokens & NFTs)</span>
                      </label>

                      <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!widgetShowBranding}
                          onChange={(e) => setWidgetShowBranding(!e.target.checked)}
                          className="rounded border-border"
                        />
                        <span>White-Label Mode (Hide platform branding)</span>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Embed Code Snippets */}
                <div className="border border-border rounded-2xl p-6 bg-card space-y-4">
                  <h3 className="font-bold text-sm">Copy Embed Code</h3>

                  {/* Option 1: iframe */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-muted-foreground">Option 1: iframe Embed</span>
                      <Button size="sm" variant="outline" onClick={copyIframeSnippet} className="gap-1 h-7 text-xs">
                        {copiedIframe ? <Check className="size-3.5" /> : <Clipboard className="size-3.5" />}
                        {copiedIframe ? 'Copied' : 'Copy iframe'}
                      </Button>
                    </div>
                    <pre className="overflow-x-auto rounded-xl border border-border bg-black/[0.04] dark:bg-black/40 p-3 text-[11px] leading-5 font-mono">
                      <code>{sponsorIframeSnippet}</code>
                    </pre>
                  </div>

                  {/* Option 2: Script */}
                  <div className="space-y-2 pt-2 border-t border-border">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-muted-foreground">Option 2: Vanilla JS Script</span>
                      <Button size="sm" variant="outline" onClick={copyScriptSnippet} className="gap-1 h-7 text-xs">
                        {copiedScript ? <Check className="size-3.5" /> : <Clipboard className="size-3.5" />}
                        {copiedScript ? 'Copied' : 'Copy Script'}
                      </Button>
                    </div>
                    <pre className="overflow-x-auto rounded-xl border border-border bg-black/[0.04] dark:bg-black/40 p-3 text-[11px] leading-5 font-mono">
                      <code>{sponsorScriptSnippet}</code>
                    </pre>
                  </div>
                </div>
              </div>

              {/* Live Preview Container */}
              <div className="lg:col-span-6 flex flex-col items-center">
                <div className="w-full sticky top-28 space-y-3">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="font-semibold uppercase tracking-wider">Live Preview</span>
                    <span className="flex items-center gap-1 text-emerald-500">
                      <ShieldCheck className="size-3.5" /> Live Soroban Escrow Stats
                    </span>
                  </div>

                  <div className="p-6 rounded-2xl border border-dashed border-border bg-slate-50/50 dark:bg-slate-900/30 flex items-center justify-center min-h-[460px]">
                    <div className="w-full max-w-md">
                      <SponsorWidget
                        key={`${widgetSponsor}-${widgetTheme}-${widgetLayout}-${widgetAccent}-${widgetShowBranding}-${widgetShowRewards}`}
                        sponsor={widgetSponsor}
                        theme={widgetTheme}
                        layout={widgetLayout}
                        primaryColor={widgetAccent}
                        title={widgetTitle}
                        showBranding={widgetShowBranding}
                        showRecentRewards={widgetShowRewards}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
