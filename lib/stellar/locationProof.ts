import {
  Contract,
  SorobanRpc,
  TransactionBuilder,
  Networks,
  Keypair,
  xdr,
  nativeToScVal,
  Address,
} from '@stellar/stellar-sdk';
import type { NetworkType } from '@/lib/types/wallet';
import type { LocationProof } from '@/lib/types/location';

function getRpcUrl(network: NetworkType): string {
  return network === 'mainnet'
    ? 'https://mainnet.sorobanrpc.com'
    : 'https://soroban-testnet.stellar.org';
}

function getNetworkPassphrase(network: NetworkType): string {
  return network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;
}

/**
 * Build, simulate, and submit a `submit_proof` invocation on the
 * location-proof Soroban contract.
 *
 * The server signs with the LOCATION_PROOF_SIGNER_SECRET env var
 * (the admin/verifier keypair that was passed to `initialize`).
 *
 * @returns Stellar transaction hash
 */
export async function submitLocationProofToContract(
  proof: LocationProof,
  farmerId: string,
  contractId: string,
  network: NetworkType
): Promise<string> {
  const signerSecret = process.env.LOCATION_PROOF_SIGNER_SECRET;
  if (!signerSecret) {
    throw new Error('LOCATION_PROOF_SIGNER_SECRET env var is required');
  }

  const signer = Keypair.fromSecret(signerSecret);
  const rpcUrl = getRpcUrl(network);
  const server = new SorobanRpc.Server(rpcUrl, { allowHttp: false });
  const passphrase = getNetworkPassphrase(network);

  // Load signer account
  const account = await server.getAccount(signer.publicKey());

  // Build the contract call arguments
  const contract = new Contract(contractId);

  // commitment as Bytes (32 bytes from hex)
  const commitmentBytes = xdr.ScVal.scvBytes(Buffer.from(proof.commitment, 'hex'));

  const tx = new TransactionBuilder(account, {
    fee: '1000000', // 0.1 XLM max fee for Soroban
    networkPassphrase: passphrase,
  })
    .addOperation(
      contract.call(
        'submit_proof',
        // farmer_id: Address
        nativeToScVal(Address.fromString(farmerId), { type: 'address' }),
        // commitment: BytesN<32>
        commitmentBytes,
        // in_region: bool
        nativeToScVal(proof.inRegion, { type: 'bool' }),
        // nonce: u64
        nativeToScVal(BigInt(proof.nonce), { type: 'u64' })
      )
    )
    .setTimeout(300)
    .build();

  // Simulate to get the footprint / resource fee
  const simResult = await server.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(simResult)) {
    throw new Error(`Soroban simulation failed: ${simResult.error}`);
  }

  // Assemble (applies resource fee + footprint)
  const assembled = SorobanRpc.assembleTransaction(tx, simResult).build();
  assembled.sign(signer);

  // Submit
  const sendResult = await server.sendTransaction(assembled);
  if (sendResult.status === 'ERROR') {
    throw new Error(`Transaction submission failed: ${JSON.stringify(sendResult.errorResult)}`);
  }

  // Poll for confirmation
  const hash = sendResult.hash;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const status = await server.getTransaction(hash);
    if (status.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS) {
      return hash;
    }
    if (status.status === SorobanRpc.Api.GetTransactionStatus.FAILED) {
      throw new Error(`Transaction failed on-chain: ${hash}`);
    }
  }

  throw new Error(`Transaction not confirmed after 60s: ${hash}`);
}
