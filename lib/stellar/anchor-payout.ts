/**
 * Stellar Anchor Payout Service — Issue #333
 *
 * Integrates with Stellar SEP-10, SEP-24, SEP-31, and SEP-38 to convert
 * USDC/XLM into Nigerian Naira (NGN) for farmer payouts. Supports two
 * delivery paths:
 *   - SEP-24 interactive withdrawal: anchor opens a hosted UI for the farmer
 *   - SEP-31 direct payment: programmatic cross-border transfer (no UI required)
 */

export type OffRampMethod = 'mobile_money' | 'bank_transfer';

export interface StellarToml {
  TRANSFER_SERVER_SEP0024?: string;
  DIRECT_PAYMENT_SERVER?: string;
  WEB_AUTH_ENDPOINT?: string;
  SIGNING_KEY?: string;
  ANCHOR_QUOTE_SERVER?: string;
}

export interface NairaQuote {
  quoteId: string;
  usdcAmount: number;
  /** Estimated NGN delivered (before anchor fees) */
  ngnAmount: number;
  /** NGN per 1 USDC */
  rate: number;
  feeUsdc: number;
  expiresAt: string;
}

export interface Sep24WithdrawalResult {
  anchorTransactionId: string;
  /** Hosted interactive URL — open in browser / WebView for farmer to confirm */
  interactiveUrl: string;
  status: 'pending_user_transfer_start';
}

export interface Sep31PayoutResult {
  anchorTransactionId: string;
  /** Stellar account to send USDC to */
  stellarAccountId: string;
  stellarMemoType: 'text' | 'hash' | 'id';
  stellarMemo: string;
  status: 'pending_sender';
}

export interface Sep31PayoutRequest {
  farmerPublicKey: string;
  usdcAmount: number;
  offRampMethod: OffRampMethod;
  /** E.164 mobile number, required when offRampMethod === 'mobile_money' */
  mobileNumber?: string;
  /** NUBAN account number, required when offRampMethod === 'bank_transfer' */
  bankAccountNumber?: string;
  /** CBN bank code, required when offRampMethod === 'bank_transfer' */
  bankCode?: string;
  /** Pre-obtained JWT from SEP-10 (optional — fetched internally if omitted) */
  sep10Jwt?: string;
  quoteId?: string;
}

export interface AnchorPayoutStatus {
  anchorTransactionId: string;
  status:
    | 'pending_sender'
    | 'pending_stellar'
    | 'pending_external'
    | 'pending_user_transfer_complete'
    | 'completed'
    | 'error'
    | 'refunded';
  message?: string;
  /** NGN amount credited to farmer's account */
  amountOut?: string;
  externalTransactionId?: string;
}

// ── stellar.toml ──────────────────────────────────────────────────────────────

/**
 * Fetch and parse the anchor's stellar.toml to discover service endpoints.
 */
export async function fetchStellarToml(homeDomain: string): Promise<StellarToml> {
  const url = `https://${homeDomain}/.well-known/stellar.toml`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch stellar.toml from ${homeDomain}: ${res.status}`);
  }
  const text = await res.text();
  return parseStellarToml(text);
}

function parseStellarToml(toml: string): StellarToml {
  const result: StellarToml = {};
  for (const line of toml.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const raw = trimmed
      .slice(eqIdx + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
    if (key === 'TRANSFER_SERVER_SEP0024') result.TRANSFER_SERVER_SEP0024 = raw;
    if (key === 'DIRECT_PAYMENT_SERVER') result.DIRECT_PAYMENT_SERVER = raw;
    if (key === 'WEB_AUTH_ENDPOINT') result.WEB_AUTH_ENDPOINT = raw;
    if (key === 'SIGNING_KEY') result.SIGNING_KEY = raw;
    if (key === 'ANCHOR_QUOTE_SERVER') result.ANCHOR_QUOTE_SERVER = raw;
  }
  return result;
}

// ── SEP-10 Web Authentication ─────────────────────────────────────────────────

/**
 * Obtain a SEP-10 JWT for the given Stellar account.
 * `signChallengeFn` is injected so callers can use Freighter or any other signer.
 */
export async function getSep10Jwt(
  webAuthEndpoint: string,
  accountPublicKey: string,
  networkPassphrase: string,
  signChallengeFn: (xdr: string, networkPassphrase: string) => Promise<string>
): Promise<string> {
  // Step 1: Request challenge
  const challengeRes = await fetch(
    `${webAuthEndpoint}?account=${encodeURIComponent(accountPublicKey)}`
  );
  if (!challengeRes.ok) {
    throw new Error(`SEP-10 challenge request failed: ${challengeRes.status}`);
  }
  const { transaction: challengeXdr } = (await challengeRes.json()) as { transaction: string };

  // Step 2: Sign challenge
  const signedXdr = await signChallengeFn(challengeXdr, networkPassphrase);

  // Step 3: Exchange signed challenge for JWT
  const tokenRes = await fetch(webAuthEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transaction: signedXdr }),
  });
  if (!tokenRes.ok) {
    const body = (await tokenRes.json()) as { error?: string };
    throw new Error(`SEP-10 token exchange failed: ${body.error ?? tokenRes.status}`);
  }
  const { token } = (await tokenRes.json()) as { token: string };
  return token;
}

// ── SEP-38 Quote ──────────────────────────────────────────────────────────────

/**
 * Fetch an indicative USDC → NGN exchange rate quote from the anchor.
 * Returns a NairaQuote with rate, fee, and expiry.
 */
export async function getNairaQuote(
  quoteServerUrl: string,
  usdcAmount: number,
  usdcIssuer: string,
  sep10Jwt: string
): Promise<NairaQuote> {
  const params = new URLSearchParams({
    sell_asset: `stellar:USDC:${usdcIssuer}`,
    buy_asset: 'iso4217:NGN',
    sell_amount: usdcAmount.toFixed(7),
  });

  const res = await fetch(`${quoteServerUrl}/prices?${params.toString()}`, {
    headers: { Authorization: `Bearer ${sep10Jwt}` },
  });

  if (!res.ok) {
    throw new Error(`SEP-38 quote request failed: ${res.status}`);
  }

  const data = (await res.json()) as {
    buy_deliverable_amount: string;
    price: string;
    fee: { total: string; asset: string };
    id: string;
    expires_at: string;
  };

  const ngnAmount = parseFloat(data.buy_deliverable_amount);
  const rate = parseFloat(data.price);
  const feeUsdc = parseFloat(data.fee?.total ?? '0');

  return {
    quoteId: data.id ?? '',
    usdcAmount,
    ngnAmount,
    rate,
    feeUsdc,
    expiresAt: data.expires_at ?? new Date(Date.now() + 5 * 60_000).toISOString(),
  };
}

// ── SEP-24 Interactive Withdrawal ─────────────────────────────────────────────

/**
 * Initiate a SEP-24 interactive withdrawal flow.
 * Returns an interactive URL the farmer opens to provide their NGN bank/mobile details,
 * plus the anchor transaction ID for polling.
 */
export async function initiateSep24Withdrawal(
  transferServer: string,
  farmerPublicKey: string,
  usdcAmount: number,
  usdcAssetCode: string,
  sep10Jwt: string,
  quoteId?: string
): Promise<Sep24WithdrawalResult> {
  const body: Record<string, string> = {
    asset_code: usdcAssetCode,
    account: farmerPublicKey,
    amount: usdcAmount.toFixed(7),
    lang: 'en',
  };
  if (quoteId) body.quote_id = quoteId;

  const res = await fetch(`${transferServer}/transactions/withdrawal/interactive`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sep10Jwt}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = (await res.json()) as { error?: string };
    throw new Error(`SEP-24 withdrawal initiation failed: ${err.error ?? res.status}`);
  }

  const data = (await res.json()) as { id: string; url: string; type: string };
  return {
    anchorTransactionId: data.id,
    interactiveUrl: data.url,
    status: 'pending_user_transfer_start',
  };
}

// ── SEP-31 Direct Payment ─────────────────────────────────────────────────────

/**
 * Initiate a SEP-31 direct cross-border payment to deliver NGN to a farmer.
 * Returns the Stellar account and memo to send USDC to — the caller then
 * submits the Stellar payment transaction.
 */
export async function initiateSep31Payout(
  directPaymentServer: string,
  request: Sep31PayoutRequest,
  usdcAssetCode: string,
  usdcIssuer: string,
  sep10Jwt: string
): Promise<Sep31PayoutResult> {
  const transactionFields: Record<string, string> = {};

  if (request.offRampMethod === 'mobile_money' && request.mobileNumber) {
    transactionFields.mobile_number = request.mobileNumber;
    transactionFields.country_code = 'NG';
    transactionFields.mobile_money_provider = 'auto'; // anchor resolves MNO from number
  } else if (request.offRampMethod === 'bank_transfer') {
    if (!request.bankAccountNumber || !request.bankCode) {
      throw new Error('Bank account number and bank code required for bank transfer');
    }
    transactionFields.bank_account_number = request.bankAccountNumber;
    transactionFields.bank_number = request.bankCode;
    transactionFields.country_code = 'NG';
  } else {
    throw new Error('Invalid off-ramp method or missing required fields');
  }

  const body: Record<string, unknown> = {
    asset_code: usdcAssetCode,
    asset_issuer: usdcIssuer,
    amount: request.usdcAmount.toFixed(7),
    sender_id: request.farmerPublicKey,
    receiver_id: request.farmerPublicKey,
    fields: {
      transaction: transactionFields,
    },
  };
  if (request.quoteId) body.quote_id = request.quoteId;

  const res = await fetch(`${directPaymentServer}/transactions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sep10Jwt}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = (await res.json()) as { error?: string };
    throw new Error(`SEP-31 transaction initiation failed: ${err.error ?? res.status}`);
  }

  const data = (await res.json()) as {
    id: string;
    stellar_account_id: string;
    stellar_memo_type: 'text' | 'hash' | 'id';
    stellar_memo: string;
  };

  return {
    anchorTransactionId: data.id,
    stellarAccountId: data.stellar_account_id,
    stellarMemoType: data.stellar_memo_type,
    stellarMemo: data.stellar_memo,
    status: 'pending_sender',
  };
}

// ── Status Polling ────────────────────────────────────────────────────────────

/**
 * Poll the anchor for the status of a withdrawal or direct payment transaction.
 * Compatible with both SEP-24 and SEP-31 transaction status endpoints.
 */
export async function getAnchorPayoutStatus(
  serverUrl: string,
  anchorTransactionId: string,
  sep10Jwt: string
): Promise<AnchorPayoutStatus> {
  const res = await fetch(
    `${serverUrl}/transaction?id=${encodeURIComponent(anchorTransactionId)}`,
    { headers: { Authorization: `Bearer ${sep10Jwt}` } }
  );

  if (!res.ok) {
    throw new Error(`Anchor status check failed: ${res.status}`);
  }

  const data = (await res.json()) as {
    transaction: {
      id: string;
      status: AnchorPayoutStatus['status'];
      message?: string;
      amount_out?: string;
      external_transaction_id?: string;
    };
  };

  const tx = data.transaction;
  return {
    anchorTransactionId: tx.id,
    status: tx.status,
    message: tx.message,
    amountOut: tx.amount_out,
    externalTransactionId: tx.external_transaction_id,
  };
}
