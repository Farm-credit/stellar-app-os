/**
 * Gift sponsorship certificates — Issue #1107
 *
 * Core, framework-free logic for tree sponsorship gift certificates:
 * validation, visual themes, stateless shareable links and the HTML/text
 * email body. PDF rendering lives in `./giftCertificatePdf`.
 *
 * Share links are stateless: the certificate is serialised into a base64url
 * token so a recipient can open `/gift/<token>` without a database lookup.
 */

import { CO2_KG_PER_TREE_PER_YEAR } from '@/lib/constants/impact';

export const GIFT_MESSAGE_MAX_LENGTH = 280;
export const GIFT_NAME_MAX_LENGTH = 60;
export const GIFT_MAX_TREES = 10_000;

export const GIFT_CO2_KG_PER_TREE_PER_YEAR = CO2_KG_PER_TREE_PER_YEAR;

export type GiftOccasion =
  'birthday' | 'wedding' | 'holiday' | 'thank-you' | 'memorial' | 'just-because';

export type GiftThemeId = 'forest' | 'sunrise' | 'ocean' | 'classic';

export interface GiftTheme {
  id: GiftThemeId;
  label: string;
  /** Hex colours shared by the web preview, the PDF and the email. */
  background: string;
  primary: string;
  accent: string;
  text: string;
}

export const GIFT_THEMES: Readonly<Record<GiftThemeId, GiftTheme>> = Object.freeze({
  forest: {
    id: 'forest',
    label: 'Forest',
    background: '#F3F8F1',
    primary: '#1F5E3B',
    accent: '#C9A227',
    text: '#1C2B22',
  },
  sunrise: {
    id: 'sunrise',
    label: 'Sunrise',
    background: '#FFF6EC',
    primary: '#B4532A',
    accent: '#E9A23B',
    text: '#3A2418',
  },
  ocean: {
    id: 'ocean',
    label: 'Ocean',
    background: '#EEF6FA',
    primary: '#1D4E6E',
    accent: '#3BA3B8',
    text: '#14283A',
  },
  classic: {
    id: 'classic',
    label: 'Classic',
    background: '#FBFAF6',
    primary: '#0D0B21',
    accent: '#B08D57',
    text: '#1A1A1A',
  },
});

export const GIFT_OCCASIONS: Readonly<Record<GiftOccasion, { label: string; headline: string }>> =
  Object.freeze({
    birthday: { label: 'Birthday', headline: 'A Birthday Gift That Grows' },
    wedding: { label: 'Wedding', headline: 'Rooted Together, Growing Forever' },
    holiday: { label: 'Holiday', headline: 'A Gift for the Planet This Season' },
    'thank-you': { label: 'Thank you', headline: 'Thank You, From the Roots Up' },
    memorial: { label: 'In memory', headline: 'A Living Tribute' },
    'just-because': { label: 'Just because', headline: 'A Gift That Keeps on Growing' },
  });

export interface GiftCertificateInput {
  recipientName: string;
  recipientEmail?: string;
  senderName: string;
  message?: string;
  treeCount: number;
  species?: string;
  region?: string;
  occasion: GiftOccasion;
  theme: GiftThemeId;
}

export interface GiftCertificate extends Required<Omit<GiftCertificateInput, 'recipientEmail'>> {
  recipientEmail?: string;
  code: string;
  issuedAt: string;
  co2KgPerYear: number;
}

export type GiftValidationResult =
  { ok: true; value: GiftCertificateInput } | { ok: false; errors: Record<string, string> };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_RE = /^GIFT-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;

function isOccasion(value: unknown): value is GiftOccasion {
  return typeof value === 'string' && value in GIFT_OCCASIONS;
}

function isTheme(value: unknown): value is GiftThemeId {
  return typeof value === 'string' && value in GIFT_THEMES;
}

function cleanText(value: unknown): string {
  // Collapse control characters so nothing odd reaches the PDF or email.
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').trim()
    : '';
}

export function validateGiftCertificateInput(raw: unknown): GiftValidationResult {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const errors: Record<string, string> = {};

  const recipientName = cleanText(data.recipientName);
  if (!recipientName) errors.recipientName = 'Recipient name is required';
  else if (recipientName.length > GIFT_NAME_MAX_LENGTH)
    errors.recipientName = `Recipient name must be ${GIFT_NAME_MAX_LENGTH} characters or fewer`;

  const senderName = cleanText(data.senderName);
  if (!senderName) errors.senderName = 'Your name is required';
  else if (senderName.length > GIFT_NAME_MAX_LENGTH)
    errors.senderName = `Your name must be ${GIFT_NAME_MAX_LENGTH} characters or fewer`;

  const recipientEmail = cleanText(data.recipientEmail);
  if (recipientEmail && !EMAIL_RE.test(recipientEmail))
    errors.recipientEmail = 'Enter a valid email address';

  const message = cleanText(data.message);
  if (message.length > GIFT_MESSAGE_MAX_LENGTH)
    errors.message = `Message must be ${GIFT_MESSAGE_MAX_LENGTH} characters or fewer`;

  const treeCount = typeof data.treeCount === 'number' ? data.treeCount : Number(data.treeCount);
  if (!Number.isInteger(treeCount) || treeCount < 1 || treeCount > GIFT_MAX_TREES)
    errors.treeCount = `Tree count must be a whole number between 1 and ${GIFT_MAX_TREES}`;

  if (!isOccasion(data.occasion)) errors.occasion = 'Choose an occasion';
  if (!isTheme(data.theme)) errors.theme = 'Choose a certificate design';

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      recipientName,
      recipientEmail: recipientEmail || undefined,
      senderName,
      message,
      treeCount,
      species: cleanText(data.species) || undefined,
      region: cleanText(data.region) || undefined,
      occasion: data.occasion as GiftOccasion,
      theme: data.theme as GiftThemeId,
    },
  };
}

export function generateGiftCode(random: (n: number) => Uint8Array = randomBytes): string {
  const bytes = random(8);
  const chars = Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
  return `GIFT-${chars.slice(0, 4)}-${chars.slice(4, 8)}`;
}

function randomBytes(n: number): Uint8Array {
  const bytes = new Uint8Array(n);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

export function createGiftCertificate(
  input: GiftCertificateInput,
  options: { now?: Date; code?: string } = {}
): GiftCertificate {
  return {
    recipientName: input.recipientName,
    recipientEmail: input.recipientEmail,
    senderName: input.senderName,
    message: input.message ?? '',
    treeCount: input.treeCount,
    species: input.species ?? 'Native mixed species',
    region: input.region ?? 'Farm-credit partner farms',
    occasion: input.occasion,
    theme: input.theme,
    code: options.code ?? generateGiftCode(),
    issuedAt: (options.now ?? new Date()).toISOString(),
    co2KgPerYear: input.treeCount * GIFT_CO2_KG_PER_TREE_PER_YEAR,
  };
}

export function giftHeadline(certificate: Pick<GiftCertificate, 'occasion'>): string {
  return GIFT_OCCASIONS[certificate.occasion].headline;
}

export function formatTreeCount(count: number): string {
  return `${count.toLocaleString('en-US')} ${count === 1 ? 'tree' : 'trees'}`;
}

// ── Share tokens ────────────────────────────────────────────────────────────

/** Compact, versioned wire format so share links stay short. */
interface ShareTokenPayload {
  v: 1;
  c: string; // code
  r: string; // recipientName
  s: string; // senderName
  m: string; // message
  t: number; // treeCount
  sp: string; // species
  rg: string; // region
  o: GiftOccasion;
  th: GiftThemeId;
  i: string; // issuedAt
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(token: string): string {
  const base64 = token.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Recipient email is deliberately left out of share links. */
export function encodeGiftShareToken(certificate: GiftCertificate): string {
  const payload: ShareTokenPayload = {
    v: 1,
    c: certificate.code,
    r: certificate.recipientName,
    s: certificate.senderName,
    m: certificate.message,
    t: certificate.treeCount,
    sp: certificate.species,
    rg: certificate.region,
    o: certificate.occasion,
    th: certificate.theme,
    i: certificate.issuedAt,
  };
  return toBase64Url(JSON.stringify(payload));
}

/** Returns null for any token that is malformed or fails validation. */
export function decodeGiftShareToken(token: string): GiftCertificate | null {
  if (!token || token.length > 4096 || !/^[A-Za-z0-9_-]+$/.test(token)) return null;

  let payload: Partial<ShareTokenPayload>;
  try {
    payload = JSON.parse(fromBase64Url(token));
  } catch {
    return null;
  }
  if (!payload || payload.v !== 1 || typeof payload.c !== 'string' || !CODE_RE.test(payload.c)) {
    return null;
  }
  if (typeof payload.i !== 'string' || Number.isNaN(Date.parse(payload.i))) return null;

  const validated = validateGiftCertificateInput({
    recipientName: payload.r,
    senderName: payload.s,
    message: payload.m,
    treeCount: payload.t,
    species: payload.sp,
    region: payload.rg,
    occasion: payload.o,
    theme: payload.th,
  });
  if (!validated.ok) return null;

  return createGiftCertificate(validated.value, { code: payload.c, now: new Date(payload.i) });
}

export function buildGiftShareUrl(certificate: GiftCertificate, baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/gift/${encodeGiftShareToken(certificate)}`;
}

// ── Email ───────────────────────────────────────────────────────────────────

export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>'"]/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[ch] ?? ch
  );
}

export interface GiftEmail {
  subject: string;
  text: string;
  html: string;
}

export function renderGiftCertificateEmail(
  certificate: GiftCertificate,
  shareUrl: string
): GiftEmail {
  const theme = GIFT_THEMES[certificate.theme];
  const headline = giftHeadline(certificate);
  const trees = formatTreeCount(certificate.treeCount);
  const co2 = certificate.co2KgPerYear.toLocaleString('en-US');

  const subject = `${certificate.senderName} sponsored ${trees} in your name 🌳`;

  const text = [
    `Dear ${certificate.recipientName},`,
    '',
    `${certificate.senderName} has sponsored ${trees} in your name.`,
    certificate.message ? `\n"${certificate.message}"\n` : '',
    `Species: ${certificate.species}`,
    `Planted in: ${certificate.region}`,
    `Estimated impact: ${co2} kg of CO₂ absorbed every year`,
    `Certificate: ${certificate.code}`,
    '',
    `View and download your certificate: ${shareUrl}`,
    '',
    'With gratitude,',
    'The Harvesta Team',
  ]
    .filter((line, index, lines) => line !== '' || lines[index - 1] !== '')
    .join('\n');

  const e = escapeHtml;
  const message = certificate.message
    ? `<p style="margin:24px 0;font-family:Georgia,serif;font-size:18px;font-style:italic;line-height:1.6;color:${theme.text};">&ldquo;${e(certificate.message)}&rdquo;</p>`
    : '';

  const html = `<!doctype html>
<html lang="en">
<body style="margin:0;padding:24px;background:#ececec;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:${theme.background};border:2px solid ${theme.accent};border-radius:12px;">
    <tr><td style="padding:40px 36px;text-align:center;font-family:Helvetica,Arial,sans-serif;color:${theme.text};">
      <p style="margin:0;font-size:12px;letter-spacing:3px;text-transform:uppercase;color:${theme.accent};">Gift Certificate</p>
      <h1 style="margin:12px 0 0;font-family:Georgia,serif;font-size:28px;font-weight:normal;color:${theme.primary};">${e(headline)}</h1>
      <p style="margin:28px 0 4px;font-size:14px;">Presented to</p>
      <p style="margin:0;font-family:Georgia,serif;font-size:26px;color:${theme.primary};">${e(certificate.recipientName)}</p>
      <p style="margin:20px 0 0;font-size:16px;line-height:1.5;">${e(certificate.senderName)} has sponsored <strong>${e(trees)}</strong> in your name.</p>
      ${message}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 28px;font-size:14px;">
        <tr>
          <td style="padding:8px;"><strong style="display:block;font-size:20px;color:${theme.primary};">${e(trees)}</strong>sponsored</td>
          <td style="padding:8px;"><strong style="display:block;font-size:20px;color:${theme.primary};">${e(co2)} kg</strong>CO₂ per year</td>
        </tr>
      </table>
      <p style="margin:0 0 4px;font-size:13px;">${e(certificate.species)} &middot; ${e(certificate.region)}</p>
      <a href="${e(shareUrl)}" style="display:inline-block;margin-top:24px;padding:12px 28px;background:${theme.primary};color:#ffffff;text-decoration:none;border-radius:999px;font-weight:bold;">View your certificate</a>
      <p style="margin:28px 0 0;font-size:11px;color:#6b7280;">Certificate ${e(certificate.code)}</p>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}
