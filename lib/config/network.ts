import type { NetworkType } from '@/lib/types/wallet';

function requireEnv(key: string): string {
  return process.env[key] ?? '';
}

export interface RpcNodeEntry {
  url: string;
  name: string;
  weight: number;
}

export interface NetworkConfig {
  network: NetworkType;
  horizonUrl: string;
  sorobanRpcUrl: string;
  networkPassphrase: string;
  usdcIssuer: string;
  treeIssuer: string;
  carbonCreditIssuer: string;
  rpcNodes: RpcNodeEntry[];
  contracts: {
    treeEscrow: string;
    escrowMilestone: string;
    locationProof: string;
    nullifierRegistry: string;
    carbonCredits: string;
  };
  addresses: {
    planting: string;
    replantingBuffer: string;
    bulkRecipient: string;
    treeDistributor: string;
  };
  anchor: {
    apiUrl: string;
    homeDomain: string;
  };
}

function parseRpcNodes(): RpcNodeEntry[] {
  const urlsRaw = process.env.RPC_NODE_URLS || process.env.NEXT_PUBLIC_HORIZON_URL || '';
  const namesRaw = process.env.RPC_NODE_NAMES || '';
  const weightsRaw = process.env.RPC_NODE_WEIGHTS || '';

  const urls = urlsRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const names = namesRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const weights = weightsRaw
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => !Number.isNaN(n));

  const singleUrl = process.env.NEXT_PUBLIC_HORIZON_URL;
  if (urls.length === 0 && singleUrl) {
    return [{ url: singleUrl, name: 'default', weight: 1 }];
  }

  return urls.map((url, i) => ({
    url,
    name: names[i] ?? `node-${i}`,
    weight: weights[i] ?? 1,
  }));
}

function loadNetworkConfig(): NetworkConfig {
  const network = (process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? 'testnet') as NetworkType;

  return {
    network,
    horizonUrl: requireEnv('NEXT_PUBLIC_HORIZON_URL'),
    sorobanRpcUrl: requireEnv('NEXT_PUBLIC_SOROBAN_RPC_URL'),
    networkPassphrase: requireEnv('NEXT_PUBLIC_NETWORK_PASSPHRASE'),
    usdcIssuer: requireEnv('NEXT_PUBLIC_USDC_ISSUER'),
    treeIssuer: requireEnv('NEXT_PUBLIC_TREE_ISSUER'),
    carbonCreditIssuer: requireEnv('NEXT_PUBLIC_CARBON_CREDIT_ISSUER'),
    rpcNodes: parseRpcNodes(),
    contracts: {
      treeEscrow: requireEnv('NEXT_PUBLIC_CONTRACT_TREE_ESCROW'),
      escrowMilestone: requireEnv('NEXT_PUBLIC_CONTRACT_ESCROW_MILESTONE'),
      locationProof: requireEnv('NEXT_PUBLIC_CONTRACT_LOCATION_PROOF'),
      nullifierRegistry: requireEnv('NEXT_PUBLIC_CONTRACT_NULLIFIER_REGISTRY'),
      carbonCredits: requireEnv('NEXT_PUBLIC_CONTRACT_CARBON_CREDITS'),
    },
    addresses: {
      planting: requireEnv('NEXT_PUBLIC_PLANTING_ADDRESS'),
      replantingBuffer: requireEnv('NEXT_PUBLIC_REPLANTING_BUFFER_ADDRESS'),
      bulkRecipient: requireEnv('NEXT_PUBLIC_BULK_RECIPIENT_ADDRESS'),
      treeDistributor: requireEnv('NEXT_PUBLIC_TREE_DISTRIBUTOR'),
    },
    anchor: {
      apiUrl: requireEnv('NEXT_PUBLIC_ANCHOR_API_URL'),
      homeDomain: requireEnv('NEXT_PUBLIC_ANCHOR_HOME_DOMAIN'),
    },
  };
}

export const networkConfig: NetworkConfig = loadNetworkConfig();
