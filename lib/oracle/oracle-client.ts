import { hexToBytes } from '@noble/hashes/utils';
import { ed25519 } from '@noble/curves/ed25519';
import type { NdviSubmissionRequest, NdviSubmissionResponse } from '@/lib/types/oracle';

function verifyOracleSignature(payload: string, signatureHex: string): boolean {
  const pubHex = process.env.ORACLE_PUBLIC_KEY_HEX;
  if (!pubHex) throw new Error('ORACLE_PUBLIC_KEY_HEX environment variable not set');

  const pub = hexToBytes(pubHex);
  const sig = hexToBytes(signatureHex);
  const msg = new TextEncoder().encode(payload);

  return ed25519.verify(sig, msg, pub);
}

function ndviToSurvivalRate(ndvi: number): number {
  if (Number.isNaN(ndvi) || !isFinite(ndvi)) throw new Error('ndvi must be a finite number');
  const clamped = Math.max(0, Math.min(1, ndvi));
  return Math.round(clamped * 100);
}

export async function submitNdviSurvival(
  req: NdviSubmissionRequest
): Promise<NdviSubmissionResponse> {
  const { farmerPublicKey, ndvi, proofHash, contractType, network, signature } = req;

  if (!farmerPublicKey) throw new Error('Missing farmerPublicKey');
  if (typeof ndvi !== 'number' || ndvi < 0 || ndvi > 1)
    throw new Error('ndvi must be a number between 0.0 and 1.0');
  if (!proofHash || proofHash.length !== 64 || !/^[0-9a-f]+$/i.test(proofHash))
    throw new Error('proofHash must be a 64-char hex string (SHA-256)');
  if (contractType !== 'tree-escrow' && contractType !== 'escrow-milestone')
    throw new Error('contractType must be "tree-escrow" or "escrow-milestone"');
  if (network !== 'testnet' && network !== 'mainnet') throw new Error('UNSUPPORTED_NETWORK');
  if (!signature || !/^[0-9a-f]+$/i.test(signature) || signature.length !== 128)
    throw new Error('signature must be a 64-byte hex string (128 hex chars)');

  const payload = `${farmerPublicKey}|${proofHash}|${ndvi.toFixed(6)}|${contractType}|${network}`;
  const ok = verifyOracleSignature(payload, signature);
  if (!ok) throw new Error('ORACLE_SIGNATURE_INVALID');

  const survivalRate = ndviToSurvivalRate(ndvi);
  const outcome = survivalRate >= 70 ? 'completed' : 'disputed';

  return {
    outcome,
    amountReleased: outcome === 'completed' ? 'tranche2' : '0',
    survivalRate,
    transactionHash: 'mock_tx_hash_pending_implementation',
  };
}
