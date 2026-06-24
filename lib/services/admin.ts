import { Horizon } from '@stellar/stellar-sdk';
import { networkConfig } from '@/lib/config/network';
import { getPool } from '@/lib/db/client';
import { getTreeAsset } from '@/lib/stellar/tree-asset';
import { TREE_TOTAL_SUPPLY } from '@/lib/stellar/tree-token';

export interface AdminDashboardStats {
  totalTrees: number;
  pendingVerifications: number;
  openDisputes: number;
  feeTreasuryBalanceUsdc: number;
}

async function fetchAccountAssetBalance(
  server: Horizon.Server,
  address: string,
  assetCode: string,
  assetIssuer: string
): Promise<number> {
  try {
    const account = await server.loadAccount(address);
    const balance = account.balances.find(
      (b) => (b as any).asset_code === assetCode && (b as any).asset_issuer === assetIssuer
    );
    return balance ? parseFloat(balance.balance) : 0;
  } catch (error: any) {
    if (error?.response?.status === 404) return 0;
    throw error;
  }
}

export async function getTotalTrees(): Promise<number> {
  const server = new Horizon.Server(networkConfig.horizonUrl);
  const treeAsset = getTreeAsset(networkConfig.network);

  try {
    const distBalance = await fetchAccountAssetBalance(
      server,
      networkConfig.addresses.treeDistributor,
      treeAsset.getCode(),
      treeAsset.getIssuer()
    );
    return Math.max(0, TREE_TOTAL_SUPPLY - Math.floor(distBalance));
  } catch (e) {
    console.warn('Could not fetch distributor balance for total trees', e);
    return 0;
  }
}

export async function getPendingVerifications(): Promise<number> {
  try {
    const pool = getPool();
    const result = await pool.query(
      `SELECT COUNT(*)::int AS count FROM verification_queue WHERE status IN ('pending', 'resubmitted')`
    );
    return result.rows[0]?.count ?? 0;
  } catch (e) {
    console.warn('Could not query verification_queue', e);
    return 0;
  }
}

export async function getOpenDisputes(): Promise<number> {
  try {
    const pool = getPool();
    const result = await pool.query(
      `SELECT COUNT(*)::int AS count FROM disputes WHERE status = 'open'`
    );
    return result.rows[0]?.count ?? 0;
  } catch (e) {
    console.warn('Could not query disputes', e);
    return 0;
  }
}

export async function getFeeTreasuryBalanceUsdc(): Promise<number> {
  const treasuryAddress = process.env.FEE_TREASURY_ADDRESS;
  if (!treasuryAddress) return 0;

  const server = new Horizon.Server(networkConfig.horizonUrl);

  try {
    return await fetchAccountAssetBalance(
      server,
      treasuryAddress,
      'USDC',
      networkConfig.usdcIssuer
    );
  } catch (e) {
    console.warn('Could not fetch fee treasury balance', e);
    return 0;
  }
}

export async function getAdminDashboardStats(): Promise<AdminDashboardStats> {
  const [totalTrees, pendingVerifications, openDisputes, feeTreasuryBalanceUsdc] =
    await Promise.all([
      getTotalTrees(),
      getPendingVerifications(),
      getOpenDisputes(),
      getFeeTreasuryBalanceUsdc(),
    ]);

  return {
    totalTrees,
    pendingVerifications,
    openDisputes,
    feeTreasuryBalanceUsdc,
  };
}
