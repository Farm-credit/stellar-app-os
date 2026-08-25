import { networkConfig } from '@/lib/config/network';
import type { NetworkType } from '@/lib/types/wallet';

export interface ProcessedTransaction {
  id: string;
  pagingToken: string;
  transactionHash: string;
  createdAt: string;
  type: string;
  sourceAccount: string;
  successful: boolean;
  amount?: string;
  assetCode?: string;
  assetIssuer?: string;
  assetType?: string;
  from?: string;
  to?: string;
  isSent: boolean;
  explorerUrl: string;
}

interface HorizonOperation {
  id: string;
  paging_token: string;
  transaction_hash: string;
  transaction_successful: boolean;
  source_account: string;
  type: string;
  type_i: number;
  created_at: string;
  from?: string;
  to?: string;
  amount?: string;
  asset_type?: string;
  asset_code?: string;
  asset_issuer?: string;
  starting_balance?: string;
  account?: string;
  funder?: string;
  trustor?: string;
  trustee?: string;
  trust_line_asset?: string;
  limit?: string;
  name?: string;
  value?: string;
  offer_id?: string;
  selling_asset_type?: string;
  selling_asset_code?: string;
  selling_asset_issuer?: string;
  buying_asset_type?: string;
  buying_asset_code?: string;
  buying_asset_issuer?: string;
  price?: string;
  source_amount?: string;
  source_asset_type?: string;
  source_asset_code?: string;
  source_asset_issuer?: string;
  into?: string;
}

export async function fetchAccountTransactions(
  publicKey: string,
  network: NetworkType,
  limit: number = 50
): Promise<ProcessedTransaction[]> {
  const horizonUrl = networkConfig.horizonUrl;
  const url = `${horizonUrl}/accounts/${publicKey}/operations?order=desc&limit=${limit}`;

  const response = await fetch(url);

  if (!response.ok) {
    if (response.status === 404) return [];
    throw new Error(`Failed to fetch transactions: ${response.statusText}`);
  }

  const data = (await response.json()) as {
    _embedded: {
      records: HorizonOperation[];
    };
  };

  const records = data._embedded?.records ?? [];

  return records.map((op) => processOperation(op, publicKey, network));
}

function processOperation(
  op: HorizonOperation,
  publicKey: string,
  network: NetworkType
): ProcessedTransaction {
  const isSent = op.source_account === publicKey;
  const base = {
    id: op.id,
    pagingToken: op.paging_token,
    transactionHash: op.transaction_hash,
    createdAt: op.created_at,
    type: op.type,
    sourceAccount: op.source_account,
    successful: op.transaction_successful,
    isSent,
    explorerUrl: getExplorerUrl(op.transaction_hash, network),
  };

  switch (op.type) {
    case 'payment': {
      const assetCode = op.asset_type === 'native' ? 'XLM' : (op.asset_code ?? 'unknown');
      return {
        ...base,
        amount: op.amount,
        assetCode,
        assetIssuer: op.asset_issuer,
        assetType: op.asset_type,
        from: op.from,
        to: op.to,
      };
    }
    case 'path_payment':
    case 'path_payment_strict_receive':
    case 'path_payment_strict_send': {
      const assetCode = op.asset_type === 'native' ? 'XLM' : (op.asset_code ?? 'unknown');
      return {
        ...base,
        amount: op.amount,
        assetCode,
        assetIssuer: op.asset_issuer,
        assetType: op.asset_type,
        from: op.from,
        to: op.to,
      };
    }
    case 'create_account': {
      return {
        ...base,
        amount: op.starting_balance,
        assetCode: 'XLM',
        to: op.account,
      };
    }
    case 'change_trust': {
      return {
        ...base,
        assetCode: op.trust_line_asset ?? op.asset_code ?? undefined,
        to: op.trustee,
      };
    }
    case 'manage_data': {
      return { ...base, amount: op.value };
    }
    case 'manage_sell_offer':
    case 'manage_buy_offer': {
      const sellAsset =
        op.selling_asset_type === 'native' ? 'XLM' : (op.selling_asset_code ?? 'unknown');
      const buyAsset =
        op.buying_asset_type === 'native' ? 'XLM' : (op.buying_asset_code ?? 'unknown');
      return {
        ...base,
        amount: op.amount,
        assetCode: `${sellAsset}/${buyAsset}`,
        assetType: op.selling_asset_type,
      };
    }
    case 'invoke_host_function':
    case 'bump_footprint_expiration':
    case 'restore_footprint': {
      return { ...base };
    }
    case 'account_merge': {
      return { ...base, to: op.into ?? op.account };
    }
    case 'set_options': {
      return { ...base };
    }
    default: {
      return { ...base };
    }
  }
}

function getExplorerUrl(hash: string, network: NetworkType): string {
  const networkParam = network === 'mainnet' ? 'public' : 'testnet';
  return `https://stellar.expert/explorer/${networkParam}/tx/${hash}`;
}
