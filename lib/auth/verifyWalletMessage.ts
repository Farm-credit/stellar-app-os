import { Keypair, hash } from '@stellar/stellar-sdk';

/** SEP-53 is the format returned by Freighter signMessage. Raw signatures remain supported for existing clients. */
export function verifyWalletMessage(
  wallet: string,
  message: string,
  signature: string,
  scheme: 'raw' | 'sep53' = 'raw'
): boolean {
  const bytes =
    scheme === 'sep53'
      ? hash(Buffer.from(`Stellar Signed Message:\n${message}`, 'utf8'))
      : Buffer.from(message, 'utf8');
  return Keypair.fromPublicKey(wallet).verify(bytes, Buffer.from(signature, 'base64'));
}
