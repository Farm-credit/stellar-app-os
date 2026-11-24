function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

function randomHex(length: number): string {
  return Array.from(randomBytes(length), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export interface GiftCardDenomination {
  id: string;
  amountUsd: number;
  treeCount: number;
  label: string;
  description: string;
}

export const GIFT_CARD_DENOMINATIONS: readonly GiftCardDenomination[] = [
  {
    id: 'starter-15',
    amountUsd: 15,
    treeCount: 1,
    label: '$15 — 1 Tree',
    description: 'Sponsor 1 native tree and track its growth.',
  },
  {
    id: 'duo-30',
    amountUsd: 30,
    treeCount: 2,
    label: '$30 — 2 Trees',
    description: 'Sponsor 2 native trees for a lasting green gift.',
  },
  {
    id: 'grove-75',
    amountUsd: 75,
    treeCount: 5,
    label: '$75 — 5 Trees',
    description: 'Sponsor a mini grove of 5 native trees.',
  },
  {
    id: 'canopy-150',
    amountUsd: 150,
    treeCount: 10,
    label: '$150 — 10 Trees',
    description: 'Sponsor 10 trees supporting local reforestation.',
  },
  {
    id: 'forest-300',
    amountUsd: 300,
    treeCount: 20,
    label: '$300 — 20 Trees',
    description: 'Sponsor 20 trees for maximum climate impact.',
  },
] as const;

export const GIFT_CARD_SPECIES = [
  'Native mixed species',
  'Mango',
  'Grevillea robusta',
  'Moringa',
  'Mangrove',
  'Acacia',
] as const;

export const GIFT_CARD_REGIONS = [
  'Rift Valley, Kenya',
  'Kilimanjaro Foothills, Tanzania',
  'Western Ghats, India',
  'Amazon Basin, Peru',
  'Cross River, Nigeria',
] as const;

export const GIFT_CARD_MESSAGE_MAX_LENGTH = 400;

export type GiftCardStatus = 'active' | 'redeemed';

export interface GiftCardRedemption {
  redeemedByName: string;
  redeemedByEmail: string;
  species: string;
  region: string;
  treeName?: string;
  assignedTreeIds: string[];
  redeemedAt: string;
}

export interface GiftCard {
  id: string;
  code: string;
  denominationId: string;
  amountUsd: number;
  treeCount: number;
  currency: 'USD';
  purchaserName: string;
  purchaserEmail: string;
  recipientName: string;
  recipientEmail: string;
  personalMessage: string;
  status: GiftCardStatus;
  purchasedAt: string;
  redemption?: GiftCardRedemption;
}

export interface GiftCardPurchaseInput {
  denominationId: string;
  purchaserName: string;
  purchaserEmail: string;
  recipientName: string;
  recipientEmail: string;
  personalMessage?: string;
}

export interface GiftCardRedemptionInput {
  redeemedByName: string;
  redeemedByEmail: string;
  species: string;
  region: string;
  treeName?: string;
}

export type ValidationResult<T> =
  { ok: true; value: T } | { ok: false; errors: Record<string, string> };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function getDenominationById(id: string): GiftCardDenomination | undefined {
  return GIFT_CARD_DENOMINATIONS.find((item) => item.id === id);
}

export function normalizeGiftCardCode(code: string): string {
  return code.trim().toUpperCase();
}

export function generateGiftCardCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(8);
  const chars = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
  return `TREE-${chars.slice(0, 4)}-${chars.slice(4, 8)}`;
}

function generateAssignedTreeIds(treeCount: number): string[] {
  const ids: string[] = [];
  for (let i = 0; i < treeCount; i += 1) {
    const suffix = randomHex(3).toUpperCase();
    ids.push(`ST-TREE-${suffix}`);
  }
  return ids;
}

export function validateGiftCardPurchaseInput(
  raw: Record<string, unknown>
): ValidationResult<GiftCardPurchaseInput> {
  const errors: Record<string, string> = {};

  const denominationId = typeof raw.denominationId === 'string' ? raw.denominationId.trim() : '';
  if (!denominationId || !getDenominationById(denominationId)) {
    errors.denominationId = 'Please select a valid gift card denomination.';
  }

  const purchaserName = typeof raw.purchaserName === 'string' ? raw.purchaserName.trim() : '';
  if (!purchaserName) {
    errors.purchaserName = 'Your name is required.';
  } else if (purchaserName.length > 100) {
    errors.purchaserName = 'Your name must be 100 characters or fewer.';
  }

  const purchaserEmail = typeof raw.purchaserEmail === 'string' ? raw.purchaserEmail.trim() : '';
  if (!purchaserEmail || !EMAIL_RE.test(purchaserEmail)) {
    errors.purchaserEmail = 'A valid purchaser email address is required.';
  }

  const recipientName = typeof raw.recipientName === 'string' ? raw.recipientName.trim() : '';
  if (!recipientName) {
    errors.recipientName = 'Recipient name is required.';
  } else if (recipientName.length > 100) {
    errors.recipientName = 'Recipient name must be 100 characters or fewer.';
  }

  const recipientEmail = typeof raw.recipientEmail === 'string' ? raw.recipientEmail.trim() : '';
  if (!recipientEmail || !EMAIL_RE.test(recipientEmail)) {
    errors.recipientEmail = 'A valid recipient email address is required.';
  }

  const personalMessage = typeof raw.personalMessage === 'string' ? raw.personalMessage.trim() : '';
  if (personalMessage.length > GIFT_CARD_MESSAGE_MAX_LENGTH) {
    errors.personalMessage = `Personalised message must be ${GIFT_CARD_MESSAGE_MAX_LENGTH} characters or fewer.`;
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      denominationId,
      purchaserName,
      purchaserEmail,
      recipientName,
      recipientEmail,
      personalMessage,
    },
  };
}

export function validateGiftCardRedemptionInput(
  raw: Record<string, unknown>
): ValidationResult<GiftCardRedemptionInput> {
  const errors: Record<string, string> = {};

  const redeemedByName = typeof raw.redeemedByName === 'string' ? raw.redeemedByName.trim() : '';
  if (!redeemedByName) {
    errors.redeemedByName = 'Your name is required to assign your sponsored tree.';
  } else if (redeemedByName.length > 100) {
    errors.redeemedByName = 'Name must be 100 characters or fewer.';
  }

  const redeemedByEmail = typeof raw.redeemedByEmail === 'string' ? raw.redeemedByEmail.trim() : '';
  if (!redeemedByEmail || !EMAIL_RE.test(redeemedByEmail)) {
    errors.redeemedByEmail = 'A valid email address is required.';
  }

  const species = typeof raw.species === 'string' ? raw.species.trim() : '';
  if (!species || !(GIFT_CARD_SPECIES as readonly string[]).includes(species)) {
    errors.species = 'Please select a valid tree species.';
  }

  const region = typeof raw.region === 'string' ? raw.region.trim() : '';
  if (!region || !(GIFT_CARD_REGIONS as readonly string[]).includes(region)) {
    errors.region = 'Please select a valid planting region.';
  }

  const treeName = typeof raw.treeName === 'string' ? raw.treeName.trim() : '';
  if (treeName.length > 80) {
    errors.treeName = 'Tree dedication name must be 80 characters or fewer.';
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      redeemedByName,
      redeemedByEmail,
      species,
      region,
      treeName: treeName || undefined,
    },
  };
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] ??
      character
  );
}

export function buildGiftCardRedeemUrl(code: string, baseUrl: string): string {
  const normalizedBase = baseUrl.replace(/\/+$/, '');
  return `${normalizedBase}/gift-cards/redeem?code=${encodeURIComponent(code)}`;
}

export function renderGiftCardEmail(
  card: GiftCard,
  redeemUrl: string
): { subject: string; text: string; html: string } {
  const treeLabel = card.treeCount === 1 ? '1 tree' : `${card.treeCount} trees`;
  const subject = `${card.purchaserName} sent you a $${card.amountUsd} Tree Sponsorship Gift Card`;

  const textLines = [
    `Hi ${card.recipientName},`,
    '',
    `${card.purchaserName} has gifted you a $${card.amountUsd} (${treeLabel}) Tree Sponsorship Gift Card!`,
  ];

  if (card.personalMessage) {
    textLines.push('', `Personal message from ${card.purchaserName}:`, `"${card.personalMessage}"`);
  }

  textLines.push(
    '',
    `Gift Card Code: ${card.code}`,
    `Redeem your gift card and assign your sponsored tree here: ${redeemUrl}`,
    '',
    'Thank you for growing a greener future,',
    'The Harvesta Team'
  );

  const messageBlockHtml = card.personalMessage
    ? `<blockquote style="margin:16px 0;padding:12px 16px;border-left:4px solid #16a34a;background:#f0fdf4;color:#14532d;font-style:italic;">${escapeHtml(card.personalMessage).replace(/\n/g, '<br/>')}</blockquote>`
    : '';

  const html = [
    `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;color:#1f2937;">`,
    `<h2 style="color:#15803d;">You received a $${card.amountUsd} Tree Sponsorship Gift Card!</h2>`,
    `<p>Hi ${escapeHtml(card.recipientName)},</p>`,
    `<p><strong>${escapeHtml(card.purchaserName)}</strong> gifted you a <strong>$${card.amountUsd}</strong> gift card good for sponsoring <strong>${escapeHtml(treeLabel)}</strong>.</p>`,
    messageBlockHtml,
    `<div style="margin:20px 0;padding:16px;border:1px dashed #16a34a;border-radius:8px;text-align:center;background:#f9fafb;">`,
    `<div style="font-size:12px;text-transform:uppercase;letter-spacing:0.08em;color:#6b7280;">Redemption Code</div>`,
    `<div style="font-size:22px;font-weight:700;letter-spacing:0.12em;color:#111827;margin-top:4px;">${escapeHtml(card.code)}</div>`,
    `</div>`,
    `<p style="text-align:center;margin:24px 0;"><a href="${escapeHtml(redeemUrl)}" style="display:inline-block;padding:12px 24px;background:#16a34a;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;">Redeem &amp; Assign Your Tree</a></p>`,
    `<p style="font-size:13px;color:#6b7280;">Or paste this link into your browser: ${escapeHtml(redeemUrl)}</p>`,
    `</div>`,
  ].join('');

  return {
    subject,
    text: textLines.join('\n'),
    html,
  };
}

// Persist in-memory store across Next.js hot reloads in development.
const globalStore = globalThis as unknown as {
  __harvestaGiftCards?: Map<string, GiftCard>;
};

function getStore(): Map<string, GiftCard> {
  if (!globalStore.__harvestaGiftCards) {
    globalStore.__harvestaGiftCards = new Map<string, GiftCard>();
  }
  return globalStore.__harvestaGiftCards;
}

export function createGiftCard(
  input: GiftCardPurchaseInput,
  options?: { code?: string; now?: Date }
): GiftCard {
  const denomination = getDenominationById(input.denominationId);
  if (!denomination) {
    throw new Error(`Unknown gift card denomination: ${input.denominationId}`);
  }

  const store = getStore();
  let code = options?.code ? normalizeGiftCardCode(options.code) : generateGiftCardCode();
  while (!options?.code && store.has(code)) {
    code = generateGiftCardCode();
  }

  const now = options?.now ?? new Date();
  const card: GiftCard = {
    id: globalThis.crypto.randomUUID(),
    code,
    denominationId: denomination.id,
    amountUsd: denomination.amountUsd,
    treeCount: denomination.treeCount,
    currency: 'USD',
    purchaserName: input.purchaserName,
    purchaserEmail: input.purchaserEmail,
    recipientName: input.recipientName,
    recipientEmail: input.recipientEmail,
    personalMessage: input.personalMessage ?? '',
    status: 'active',
    purchasedAt: now.toISOString(),
  };

  store.set(code, card);
  return card;
}

export function getGiftCardByCode(code: string): GiftCard | undefined {
  return getStore().get(normalizeGiftCardCode(code));
}

export type RedeemGiftCardResult =
  | { ok: true; giftCard: GiftCard }
  | { ok: false; reason: 'not_found' | 'already_redeemed'; giftCard?: GiftCard };

export function redeemGiftCard(
  code: string,
  input: GiftCardRedemptionInput,
  options?: { now?: Date }
): RedeemGiftCardResult {
  const store = getStore();
  const normalized = normalizeGiftCardCode(code);
  const existing = store.get(normalized);

  if (!existing) {
    return { ok: false, reason: 'not_found' };
  }

  if (existing.status === 'redeemed') {
    return { ok: false, reason: 'already_redeemed', giftCard: existing };
  }

  const redeemedAt = (options?.now ?? new Date()).toISOString();
  const updated: GiftCard = {
    ...existing,
    status: 'redeemed',
    redemption: {
      redeemedByName: input.redeemedByName,
      redeemedByEmail: input.redeemedByEmail,
      species: input.species,
      region: input.region,
      treeName: input.treeName,
      assignedTreeIds: generateAssignedTreeIds(existing.treeCount),
      redeemedAt,
    },
  };

  store.set(normalized, updated);
  return { ok: true, giftCard: updated };
}

export function clearGiftCardStore(): void {
  getStore().clear();
}
