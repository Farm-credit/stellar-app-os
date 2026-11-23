'use client';

import {
  Address,
  Contract,
  Keypair,
  Networks,
  SorobanRpc,
  TransactionBuilder,
  nativeToScVal,
  xdr,
} from '@stellar/stellar-sdk';
import type { NetworkType } from '@/lib/types/wallet';

type WalletSigner = (transactionXdr: string, networkPassphrase: string) => Promise<string>;

const SOROBAN_RPC: Record<NetworkType, string> = {
  testnet: 'https://soroban-testnet.stellar.org',
  mainnet: 'https://soroban-mainnet.stellar.org',
};

function contractId(): string {
  const id = process.env.NEXT_PUBLIC_CONTRACT_CARBON_CREDITS;
  if (!id) throw new Error('Carbon-credit contract is not configured.');
  return id;
}

function passphrase(network: NetworkType): string {
  return network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;
}

async function invokeWithWallet(
  method: string,
  args: xdr.ScVal[],
  network: NetworkType,
  signTransaction: WalletSigner
): Promise<string> {
  const rpc = new SorobanRpc.Server(SOROBAN_RPC[network], { allowHttp: false });
  const transaction = new TransactionBuilder(Keypair.random().publicKey(), {
    fee: '1000000',
    networkPassphrase: passphrase(network),
  })
    .addOperation(new Contract(contractId()).call(method, ...args))
    .setTimeout(120)
    .build();

  const simulation = await rpc.simulateTransaction(transaction);
  if (SorobanRpc.Api.isSimulationError(simulation)) {
    throw new Error(simulation.error ?? `Unable to simulate ${method}.`);
  }
  const prepared = SorobanRpc.assembleTransaction(transaction, simulation).build();
  const signedXdr = await signTransaction(prepared.toXDR(), passphrase(network));
  const submitted = await rpc.sendTransaction(
    TransactionBuilder.fromXDR(signedXdr, passphrase(network))
  );
  if (submitted.status === 'ERROR') {
    throw new Error(
      `Transaction submission failed: ${submitted.errorResult?.toXDR('base64') ?? 'unknown error'}`
    );
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    const result = await rpc.getTransaction(submitted.hash);
    if (result.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS) return submitted.hash;
    if (result.status === SorobanRpc.Api.GetTransactionStatus.FAILED) {
      throw new Error(
        `Transaction failed: ${result.resultMetaXdr?.toXDR('base64') ?? 'unknown error'}`
      );
    }
  }
  throw new Error(
    'Transaction confirmation timed out. Check the transaction hash before retrying.'
  );
}

export function listVerifiedFieldCredit(
  seller: string,
  evidenceDigest: string,
  grams: bigint,
  pricePerTon: bigint,
  network: NetworkType,
  signTransaction: WalletSigner
): Promise<string> {
  if (!/^[a-f0-9]{64}$/.test(evidenceDigest))
    throw new Error('Evidence digest must be 64 lowercase hex characters.');
  if (grams < 1_000_000n || grams % 1_000_000n !== 0n)
    throw new Error('Listings must be in whole tons.');
  if (pricePerTon <= 0n) throw new Error('Price per ton must be greater than zero.');
  return invokeWithWallet(
    'open_field_credit_lot',
    [
      new Address(seller).toScVal(),
      xdr.ScVal.scvBytes(Buffer.from(evidenceDigest, 'hex')),
      nativeToScVal(grams, { type: 'u64' }),
      nativeToScVal(pricePerTon, { type: 'i128' }),
    ],
    network,
    signTransaction
  );
}

export function buyVerifiedFieldCreditPortion(
  buyer: string,
  lotId: number,
  grams: bigint,
  network: NetworkType,
  signTransaction: WalletSigner
): Promise<string> {
  if (!Number.isSafeInteger(lotId) || lotId <= 0) throw new Error('Invalid listing ID.');
  if (grams < 1_000_000n || grams % 1_000_000n !== 0n)
    throw new Error('Purchases must be in whole tons.');
  return invokeWithWallet(
    'buy_retail_portion',
    [
      new Address(buyer).toScVal(),
      nativeToScVal(BigInt(lotId), { type: 'u64' }),
      nativeToScVal(grams, { type: 'u64' }),
    ],
    network,
    signTransaction
  );
}
