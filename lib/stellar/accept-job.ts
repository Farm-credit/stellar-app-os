import {
  Contract,
  Networks,
  SorobanRpc,
  TransactionBuilder,
  xdr,
  Address,
  Keypair,
} from '@stellar/stellar-sdk';
import type { NetworkType } from '@/lib/types/wallet';

const SOROBAN_RPC: Record<NetworkType, string> = {
  testnet: 'https://soroban-testnet.stellar.org',
  mainnet: 'https://soroban-mainnet.stellar.org',
};

function getContractId(network: NetworkType): string {
  const envKey =
    network === 'mainnet' ? 'TREE_ESCROW_CONTRACT_MAINNET' : 'TREE_ESCROW_CONTRACT_TESTNET';
  const id = process.env[envKey];
  if (!id) throw new Error(`${envKey} environment variable is not set`);
  return id;
}

function getNetworkPassphrase(network: NetworkType): string {
  return network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;
}

function addressToScVal(publicKey: string): xdr.ScVal {
  return new Address(publicKey).toScVal();
}

function u64ToScVal(n: number): xdr.ScVal {
  return xdr.ScVal.scvU64(xdr.Uint64.fromString(n.toString()));
}

function getFeePayerKeypair(): Keypair {
  const secret = process.env.STELLAR_FEE_PAYER_SECRET;
  if (!secret) throw new Error('STELLAR_FEE_PAYER_SECRET environment variable is not set');
  return Keypair.fromSecret(secret);
}

async function invokeContract(
  network: NetworkType,
  method: string,
  args: xdr.ScVal[]
): Promise<string> {
  const rpcUrl = SOROBAN_RPC[network];
  const contractId = getContractId(network);
  const networkPassphrase = getNetworkPassphrase(network);
  const feePayerKeypair = getFeePayerKeypair();

  const server = new SorobanRpc.Server(rpcUrl, { allowHttp: false });
  const account = await server.getAccount(feePayerKeypair.publicKey());
  const contract = new Contract(contractId);

  const tx = new TransactionBuilder(account, {
    fee: '1000000',
    networkPassphrase,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();

  const simResult = await server.simulateTransaction(tx);

  if (SorobanRpc.Api.isSimulationError(simResult)) {
    const msg = simResult.error ?? 'Simulation failed';
    throw new Error(msg);
  }

  const preparedTx = SorobanRpc.assembleTransaction(tx, simResult).build();
  preparedTx.sign(feePayerKeypair);

  const sendResult = await server.sendTransaction(preparedTx);
  if (sendResult.status === 'ERROR') {
    throw new Error(
      `Transaction submission failed: ${sendResult.errorResult?.toXDR('base64') ?? 'unknown'}`
    );
  }

  await pollForConfirmation(server, sendResult.hash);
  return sendResult.hash;
}

export async function invokeAcceptJob(
  farmerPublicKey: string,
  assignmentId: string,
  network: NetworkType
): Promise<string> {
  const numericId = BigInt(
    '0x' +
      assignmentId
        .replace(/[^a-f0-9]/gi, '')
        .padStart(16, '0')
        .slice(0, 16)
  );
  return invokeContract(network, 'accept_job', [
    addressToScVal(farmerPublicKey),
    u64ToScVal(Number(numericId)),
  ]);
}

export async function simulateAcceptJob(
  farmerPublicKey: string,
  assignmentId: string,
  network: NetworkType
): Promise<boolean> {
  const rpcUrl = SOROBAN_RPC[network];
  const contractId = getContractId(network);
  const networkPassphrase = getNetworkPassphrase(network);
  const feePayerKeypair = getFeePayerKeypair();

  const numericId = BigInt(
    '0x' +
      assignmentId
        .replace(/[^a-f0-9]/gi, '')
        .padStart(16, '0')
        .slice(0, 16)
  );

  const server = new SorobanRpc.Server(rpcUrl, { allowHttp: false });
  const account = await server.getAccount(feePayerKeypair.publicKey());
  const contract = new Contract(contractId);

  const tx = new TransactionBuilder(account, {
    fee: '1000000',
    networkPassphrase,
  })
    .addOperation(
      contract.call('accept_job', addressToScVal(farmerPublicKey), u64ToScVal(Number(numericId)))
    )
    .setTimeout(30)
    .build();

  const simResult = await server.simulateTransaction(tx);

  if (SorobanRpc.Api.isSimulationError(simResult)) {
    return false;
  }

  return true;
}

async function pollForConfirmation(
  server: SorobanRpc.Server,
  txHash: string,
  maxAttempts = 20,
  intervalMs = 1500
): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    await sleep(intervalMs);
    const result = await server.getTransaction(txHash);
    if (result.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS) return;
    if (result.status === SorobanRpc.Api.GetTransactionStatus.FAILED) {
      throw new Error(`Transaction failed: ${result.resultMetaXdr?.toXDR('base64') ?? 'unknown'}`);
    }
  }
  throw new Error('Transaction confirmation timeout');
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
