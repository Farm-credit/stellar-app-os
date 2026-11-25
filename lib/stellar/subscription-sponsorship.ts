import {
  Contract,
  Networks,
  SorobanRpc,
  TransactionBuilder,
  Address,
  nativeToScVal,
  xdr,
} from '@stellar/stellar-sdk';
import type { NetworkType } from '@/lib/types/wallet';

const RPC: Record<NetworkType, string> = {
  testnet: 'https://soroban-testnet.stellar.org',
  mainnet: 'https://soroban-mainnet.stellar.org',
};

function passphrase(network: NetworkType) {
  return network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;
}
function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export interface SubscriptionSetupInput {
  sponsor: string;
  steward: string;
  token: string;
  amountPerCycle: bigint;
  treesPerCycle: number;
  intervalSeconds?: number;
  network: NetworkType;
}

/** SEP-0007 payment URI for pre-funding the community pool. */
export function createSep7PoolPaymentUri(input: {
  destination: string;
  amount: string;
  assetCode?: string;
  memo?: string;
}): string {
  const params = new URLSearchParams({ destination: input.destination, amount: input.amount });
  if (input.assetCode) params.set('asset_code', input.assetCode);
  if (input.memo) params.set('memo', input.memo.slice(0, 28));
  return `web+stellar:pay?${params.toString()}`;
}

/** Builds an unsigned Soroban setup transaction for Freighter/Albedo signing. */
export async function buildSubscriptionSetupXdr(input: SubscriptionSetupInput): Promise<string> {
  if (!Number.isInteger(input.treesPerCycle) || input.treesPerCycle < 1 || input.treesPerCycle > 50)
    throw new Error('Trees per cycle must be between 1 and 50');
  if (input.amountPerCycle <= 0n) throw new Error('Amount per cycle must be positive');
  const rpc = new SorobanRpc.Server(RPC[input.network], { allowHttp: false });
  const account = await rpc.getAccount(input.sponsor);
  const contract = new Contract(
    required(
      input.network === 'testnet'
        ? 'NEXT_PUBLIC_CONTRACT_SUBSCRIPTION_SPONSORSHIP_TESTNET'
        : 'NEXT_PUBLIC_CONTRACT_SUBSCRIPTION_SPONSORSHIP'
    )
  );
  const operation = contract.call(
    'setup',
    new Address(input.sponsor).toScVal(),
    new Address(input.steward).toScVal(),
    new Address(input.token).toScVal(),
    nativeToScVal(input.amountPerCycle, { type: 'i128' }),
    xdr.ScVal.scvU32(input.treesPerCycle),
    nativeToScVal(BigInt(input.intervalSeconds ?? 2_592_000), { type: 'u64' })
  );
  const transaction = new TransactionBuilder(account, {
    fee: '1000000',
    networkPassphrase: passphrase(input.network),
  })
    .addOperation(operation)
    .setTimeout(180)
    .build();
  const simulation = await rpc.simulateTransaction(transaction);
  if (SorobanRpc.Api.isSimulationError(simulation))
    throw new Error(simulation.error ?? 'Unable to simulate subscription setup');
  return SorobanRpc.assembleTransaction(transaction, simulation).build().toXDR();
}
