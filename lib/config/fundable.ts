/**
 * Fundable off-ramp configuration.
 *
 * Fundable acts as the Stellar anchor for converting USDC/XLM into local
 * currency. Its hosted off-ramp flow lives at FUNDABLE_OFFRAMP_URL.
 */

export const FUNDABLE_OFFRAMP_URL =
  process.env.NEXT_PUBLIC_FUNDABLE_OFFRAMP_URL ?? 'https://stellar.fundable.finance/offramp';

export const FUNDABLE_HOME_DOMAIN =
  process.env.NEXT_PUBLIC_ANCHOR_HOME_DOMAIN ?? 'stellar.fundable.finance';

export const FUNDABLE_ANCHOR_API_URL =
  process.env.NEXT_PUBLIC_ANCHOR_API_URL ?? 'https://stellar.fundable.finance';
