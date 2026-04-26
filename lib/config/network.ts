import type { NetworkType } from '@/lib/types/wallet';

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

export interface NetworkConfig {
  network: NetworkType;
  horizonUrl: string;
  sorobanRpcUrl: string;
  networkPassphrase: string;
  usdcIssuer: string;
  treeIssuer: string;
  carbonCreditIssuer: string;
  contracts: {
    treeEscrow: string;
    escrowMilestone: string;
    locationProof: string;
    nullifierRegistry: string;
  };
  addresses: {
    planting: string;
    replantingBuffer: string;
    bulkRecipient: string;
  };
  anchor: {
    apiUrl: string;
    homeDomain: string;
  };
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
    contracts: {
      treeEscrow: requireEnv('NEXT_PUBLIC_CONTRACT_TREE_ESCROW'),
      escrowMilestone: requireEnv('NEXT_PUBLIC_CONTRACT_ESCROW_MILESTONE'),
      locationProof: requireEnv('NEXT_PUBLIC_CONTRACT_LOCATION_PROOF'),
      nullifierRegistry: requireEnv('NEXT_PUBLIC_CONTRACT_NULLIFIER_REGISTRY'),
    },
    addresses: {
      planting: requireEnv('NEXT_PUBLIC_PLANTING_ADDRESS'),
      replantingBuffer: requireEnv('NEXT_PUBLIC_REPLANTING_BUFFER_ADDRESS'),
      bulkRecipient: requireEnv('NEXT_PUBLIC_BULK_RECIPIENT_ADDRESS'),
    },
    anchor: {
      apiUrl: requireEnv('NEXT_PUBLIC_ANCHOR_API_URL'),
      homeDomain: requireEnv('NEXT_PUBLIC_ANCHOR_HOME_DOMAIN'),
    },
  };
}

export const networkConfig: NetworkConfig = loadNetworkConfig();
