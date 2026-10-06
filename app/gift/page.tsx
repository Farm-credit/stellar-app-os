'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { Check, Copy, Download, Gift, Loader2, Mail } from 'lucide-react';
import { Button } from '@/components/atoms/Button';
import { Input } from '@/components/atoms/Input';
import { Select } from '@/components/atoms/Select';
import { Text } from '@/components/atoms/Text';
import { Textarea } from '@/components/atoms/Textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/molecules/Card';
import { GiftCertificateCard } from '@/components/organisms/GiftCertificateCard/GiftCertificateCard';
import {
  GIFT_MESSAGE_MAX_LENGTH,
  GIFT_OCCASIONS,
  GIFT_THEMES,
  createGiftCertificate,
  type GiftCertificate,
  type GiftOccasion,
  type GiftThemeId,
} from '@/lib/gift/giftCertificate';

const SPECIES = [
  'Native mixed species',
  'Mango',
  'Grevillea robusta',
  'Moringa',
  'Mangrove',
  'Acacia',
];

interface FormState {
  recipientName: string;
  recipientEmail: string;
  senderName: string;
  message: string;
  treeCount: string;
  species: string;
  occasion: GiftOccasion;
  theme: GiftThemeId;
  sendEmail: boolean;
}

interface CreatedGift {
  certificate: GiftCertificate;
  shareUrl: string;
  pdfUrl: string;
  emailSent: boolean;
}

const INITIAL: FormState = {
  recipientName: '',
  recipientEmail: '',
  senderName: '',
  message: '',
  treeCount: '5',
  species: SPECIES[0],
  occasion: 'birthday',
  theme: 'forest',
  sendEmail: true,
};

/**
 * Gift sponsorship builder — Issue #1107
 *
 * Lets a sponsor design a tree gift certificate with a live preview, then
 * share it by link, email it to the recipient, or download it as a PDF.
 */
export default function GiftSponsorshipPage() {
  const [form, setForm] = useState<FormState>(INITIAL);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<CreatedGift | null>(null);
  const [copied, setCopied] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  const preview = useMemo(() => {
    const count = Number.parseInt(form.treeCount, 10);
    return createGiftCertificate(
      {
        recipientName: form.recipientName.trim(),
        senderName: form.senderName.trim(),
        message: form.message.trim(),
        treeCount: Number.isFinite(count) && count > 0 ? count : 1,
        species: form.species,
        occasion: form.occasion,
        theme: form.theme,
      },
      { code: 'GIFT-XXXX-XXXX', now: new Date() }
    );
  }, [form]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setCreated(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setRequestError(null);
    try {
      const response = await fetch('/api/gift-certificates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          treeCount: Number(form.treeCount),
          recipientEmail: form.recipientEmail || undefined,
          sendEmail: form.sendEmail && Boolean(form.recipientEmail),
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setErrors(body.errors ?? {});
        setRequestError(body.error ?? 'Could not create the gift certificate');
        return;
      }
      setCreated(body as CreatedGift);
    } catch {
      setRequestError('Network error — please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function downloadPdf(gift: CreatedGift) {
    const { renderGiftCertificatePdf, giftCertificateFileName } =
      await import('@/lib/gift/giftCertificatePdf');
    renderGiftCertificatePdf(gift.certificate, gift.shareUrl).save(
      giftCertificateFileName(gift.certificate)
    );
  }

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setRequestError('Could not copy — select the link and copy it manually.');
    }
  }

  const fieldError = (key: string) =>
    errors[key] ? (
      <p id={`${key}-error`} className="mt-1 text-xs text-destructive">
        {errors[key]}
      </p>
    ) : null;

  return (
    <main className="container mx-auto max-w-6xl px-4 py-10">
      <header className="mb-8 text-center">
        <Gift className="mx-auto mb-3 size-10 text-stellar-green" aria-hidden />
        <Text variant="h1" as="h1">
          Gift a Tree Sponsorship
        </Text>
        <Text variant="muted" className="mx-auto mt-2 max-w-2xl">
          Plant trees in someone&apos;s name and send them a beautiful certificate they can keep,
          print or share.
        </Text>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Personalise your gift</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium">
                  Recipient name
                  <Input
                    className="mt-1"
                    value={form.recipientName}
                    onChange={(e) => update('recipientName', e.target.value)}
                    maxLength={60}
                    aria-invalid={Boolean(errors.recipientName)}
                    aria-describedby={errors.recipientName ? 'recipientName-error' : undefined}
                    required
                  />
                  {fieldError('recipientName')}
                </label>
                <label className="block text-sm font-medium">
                  Your name
                  <Input
                    className="mt-1"
                    value={form.senderName}
                    onChange={(e) => update('senderName', e.target.value)}
                    maxLength={60}
                    aria-invalid={Boolean(errors.senderName)}
                    aria-describedby={errors.senderName ? 'senderName-error' : undefined}
                    required
                  />
                  {fieldError('senderName')}
                </label>
              </div>

              <label className="block text-sm font-medium">
                Recipient email <span className="text-muted-foreground">(optional)</span>
                <Input
                  className="mt-1"
                  type="email"
                  value={form.recipientEmail}
                  onChange={(e) => update('recipientEmail', e.target.value)}
                  aria-invalid={Boolean(errors.recipientEmail)}
                  aria-describedby={errors.recipientEmail ? 'recipientEmail-error' : undefined}
                />
                {fieldError('recipientEmail')}
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium">
                  Number of trees
                  <Input
                    className="mt-1"
                    type="number"
                    min={1}
                    max={10000}
                    value={form.treeCount}
                    onChange={(e) => update('treeCount', e.target.value)}
                    aria-invalid={Boolean(errors.treeCount)}
                    aria-describedby={errors.treeCount ? 'treeCount-error' : undefined}
                  />
                  {fieldError('treeCount')}
                </label>
                <label className="block text-sm font-medium">
                  Species
                  <Select
                    className="mt-1"
                    value={form.species}
                    onChange={(e) => update('species', e.target.value)}
                  >
                    {SPECIES.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </Select>
                </label>
              </div>

              <label className="block text-sm font-medium">
                Occasion
                <Select
                  className="mt-1"
                  value={form.occasion}
                  onChange={(e) => update('occasion', e.target.value as GiftOccasion)}
                >
                  {Object.entries(GIFT_OCCASIONS).map(([id, { label }]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </Select>
              </label>

              <label className="block text-sm font-medium">
                Personal message
                <Textarea
                  className="mt-1"
                  rows={3}
                  value={form.message}
                  maxLength={GIFT_MESSAGE_MAX_LENGTH}
                  onChange={(e) => update('message', e.target.value)}
                  aria-describedby="message-count"
                />
                <span
                  id="message-count"
                  className="mt-1 block text-right text-xs text-muted-foreground"
                >
                  {form.message.length}/{GIFT_MESSAGE_MAX_LENGTH}
                </span>
              </label>

              <fieldset>
                <legend className="text-sm font-medium">Design</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {Object.values(GIFT_THEMES).map((theme) => (
                    <button
                      key={theme.id}
                      type="button"
                      onClick={() => update('theme', theme.id)}
                      aria-pressed={form.theme === theme.id}
                      className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors aria-pressed:border-foreground aria-pressed:bg-muted"
                    >
                      <span
                        className="size-4 rounded-full border"
                        style={{ background: theme.primary, borderColor: theme.accent }}
                        aria-hidden
                      />
                      {theme.label}
                    </button>
                  ))}
                </div>
              </fieldset>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.sendEmail}
                  disabled={!form.recipientEmail}
                  onChange={(e) => update('sendEmail', e.target.checked)}
                />
                Email the certificate to the recipient
              </label>

              {requestError && (
                <p role="alert" className="text-sm text-destructive">
                  {requestError}
                </p>
              )}

              <Button type="submit" stellar="success" width="full" disabled={submitting}>
                {submitting ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Gift className="size-4" aria-hidden />
                )}
                Create gift certificate
              </Button>
            </form>
          </CardContent>
        </Card>

        <section aria-label="Certificate preview" className="space-y-4">
          <GiftCertificateCard certificate={created?.certificate ?? preview} />

          {created ? (
            <Card>
              <CardContent className="space-y-3 pt-6">
                <Text variant="h4" as="h2">
                  Your gift is ready 🎉
                </Text>
                {created.emailSent && (
                  <p className="flex items-center gap-2 text-sm text-stellar-green">
                    <Mail className="size-4" aria-hidden /> Sent to{' '}
                    {created.certificate.recipientEmail}
                  </p>
                )}
                <div className="flex gap-2">
                  <Input readOnly value={created.shareUrl} aria-label="Shareable link" />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => copyLink(created.shareUrl)}
                  >
                    {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
                <Button type="button" stellar="primary" onClick={() => downloadPdf(created)}>
                  <Download className="size-4" aria-hidden /> Download PDF
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Text variant="muted" className="text-center">
              Live preview: your certificate updates as you type.
            </Text>
          )}
        </section>
      </div>
    </main>
  );
}
