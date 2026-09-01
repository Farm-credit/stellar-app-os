import { Horizon } from '@stellar/stellar-sdk';
import { sendTreasuryAlertEmail, sendTreasuryDailySummaryEmail } from '@/lib/email/sendgrid';
import type {
  TreasuryAssetConfig,
  BalanceResult,
  CheckBalancesResult,
  TreasuryCheckConfig,
} from './types';

function getConfig(): Required<TreasuryCheckConfig> {
  return {
    horizonUrl: process.env.NEXT_PUBLIC_HORIZON_URL ?? 'https://horizon-testnet.stellar.org',
    usdcIssuer:
      process.env.NEXT_PUBLIC_USDC_ISSUER ??
      'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
    plantingAddress:
      process.env.NEXT_PUBLIC_PLANTING_ADDRESS ??
      'GABEMKJNR4GK7M4FROGA7I7PG63N2CKE3EGDSBSISG56SVL2O3KRNDXA',
    replantingAddress:
      process.env.NEXT_PUBLIC_REPLANTING_BUFFER_ADDRESS ??
      'GBUQWP3BOUZX34TOND2QV7QQ7K7VJTG6VSE62MFPXXXIAGKZ6YTDCXI',
    usdcAlertThreshold: Number(process.env.TREASURY_USDC_ALERT_THRESHOLD) || 500,
    notificationEmail: process.env.TREASURY_NOTIFICATION_EMAIL ?? 'treasury@harvesta.app',
  };
}

async function fetchAssetBalance(
  server: Horizon.Server,
  address: string,
  assetCode: string,
  assetIssuer: string
): Promise<BalanceResult> {
  const account = await server.loadAccount(address);
  const balanceRow = account.balances.find(
    (b) =>
      'asset_code' in b &&
      b.asset_code === assetCode &&
      'asset_issuer' in b &&
      b.asset_issuer === assetIssuer
  );
  const balance = balanceRow ? parseFloat(balanceRow.balance) : 0;
  return { address, assetCode, balance };
}

export function checkAssetBalance(
  asset: TreasuryAssetConfig,
  server?: Horizon.Server
): Promise<BalanceResult> {
  const config = getConfig();
  const srv = server ?? new Horizon.Server(config.horizonUrl, { allowHttp: true });
  return fetchAssetBalance(srv, asset.address, asset.assetCode, asset.assetIssuer);
}

export async function checkBalances(
  assetOverrides?: TreasuryAssetConfig[],
  server?: Horizon.Server
): Promise<CheckBalancesResult> {
  const config = getConfig();
  const srv = server ?? new Horizon.Server(config.horizonUrl, { allowHttp: true });

  const assets: TreasuryAssetConfig[] = assetOverrides ?? [
    {
      address: config.plantingAddress,
      assetCode: 'USDC',
      assetIssuer: config.usdcIssuer,
    },
    {
      address: config.replantingAddress,
      assetCode: 'USDC',
      assetIssuer: config.usdcIssuer,
    },
  ];

  const results = await Promise.all(
    assets.map((a) => fetchAssetBalance(srv, a.address, a.assetCode, a.assetIssuer))
  );

  const alerts: BalanceResult[] = [];
  for (const r of results) {
    if (r.balance < config.usdcAlertThreshold) {
      alerts.push(r);
    }
  }

  return { balances: results, alerts, threshold: config.usdcAlertThreshold };
}

export async function checkAndAlert(
  assetOverrides?: TreasuryAssetConfig[],
  server?: Horizon.Server
): Promise<void> {
  const config = getConfig();
  const result = await checkBalances(assetOverrides, server);
  for (const alert of result.alerts) {
    await sendTreasuryAlertEmail({
      to: config.notificationEmail,
      address: alert.address,
      assetCode: alert.assetCode,
      balance: alert.balance,
      threshold: result.threshold,
    });
  }
}

export async function sendDailySummary(
  assetOverrides?: TreasuryAssetConfig[],
  server?: Horizon.Server
): Promise<void> {
  const config = getConfig();
  const result = await checkBalances(assetOverrides, server);
  await sendTreasuryDailySummaryEmail({
    to: config.notificationEmail,
    balances: result.balances,
    threshold: result.threshold,
  });
}
