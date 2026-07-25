import { Asset, Horizon } from '@stellar/stellar-sdk';
import type { NetworkType } from '@/lib/types/wallet';
import { networkConfig } from '@/lib/config/network';

/**
 * XLM → USDC on-chain conversion helpers.
 *
 * The platform prices trees in USD ($1 = 1 USDC). Donors may pay with XLM, in
 * which case we convert to USDC through the Stellar DEX using a strict-receive
 * path payment so the escrow always receives the *exact* USDC amount. The donor
 * supplies a `sendMax` ceiling of XLM (quote + slippage) to bound their cost.
 */

/** Default slippage tolerance applied to the XLM `sendMax` ceiling (2%). */
export const DEFAULT_CONVERSION_SLIPPAGE = 0.02;

/** Upper bound on slippage tolerance the caller may request (10%). */
export const MAX_CONVERSION_SLIPPAGE = 0.1;

/**
 * The XLM a donor must send (as a stroops-precision string) to deliver exactly
 * `destUsdc` USDC, given an XLM-per-USDC `rate`, padded by `slippage` tolerance.
 *
 * Pure function — no network access — so the conversion math is unit-testable.
 */
export function computeSendMax(destUsdc: number, rate: number, slippage: number): string {
  if (!(destUsdc > 0)) {
    throw new Error('destination amount must be positive');
  }
  if (!(rate > 0)) {
    throw new Error('conversion rate must be positive');
  }
  if (slippage < 0 || slippage > MAX_CONVERSION_SLIPPAGE) {
    throw new Error(`slippage must be between 0 and ${MAX_CONVERSION_SLIPPAGE}`);
  }
  return (destUsdc * rate * (1 + slippage)).toFixed(7);
}

/**
 * Query Horizon's path-finding for the cheapest XLM → USDC route and return the
 * implied rate (XLM required per 1 USDC delivered).
 *
 * @throws if no path exists (insufficient DEX liquidity) — callers should fall
 *         back to asking the donor to pay with USDC directly.
 */
export async function getXlmPerUsdcRate(totalUsdc: number, _network: NetworkType): Promise<number> {
  if (!(totalUsdc > 0)) {
    throw new Error('amount must be positive');
  }

  const server = new Horizon.Server(networkConfig.horizonUrl);
  const usdc = new Asset('USDC', networkConfig.usdcIssuer);

  const response = await server
    .strictReceivePaths([Asset.native()], usdc, totalUsdc.toFixed(7))
    .call();

  const records = response.records ?? [];
  if (records.length === 0) {
    throw new Error(
      'No XLM→USDC conversion path is available right now (insufficient DEX liquidity). Please donate with USDC.'
    );
  }

  const cheapest = records.reduce((best, current) =>
    parseFloat(current.source_amount) < parseFloat(best.source_amount) ? current : best
  );

  return parseFloat(cheapest.source_amount) / totalUsdc;
}
