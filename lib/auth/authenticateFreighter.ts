import { signMessage } from '@stellar/freighter-api';

/** Keep the returned access token in component memory; never persist it in browser storage. */
export async function authenticateFreighter(walletAddress: string): Promise<string> {
  const challengeResponse = await fetch(
    `/api/auth/nonce?wallet=${encodeURIComponent(walletAddress)}`,
    { cache: 'no-store' }
  );
  if (!challengeResponse.ok) throw new Error('Unable to request wallet authentication.');
  const challenge = (await challengeResponse.json()) as { nonce: string; message: string };
  const signed = await signMessage(challenge.message, { address: walletAddress });
  if (signed.error || !signed.signedMessage || signed.signerAddress !== walletAddress) {
    throw new Error('Wallet authentication was cancelled or the signing account changed.');
  }
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      walletAddress,
      nonce: challenge.nonce,
      signature:
        typeof signed.signedMessage === 'string'
          ? signed.signedMessage
          : signed.signedMessage.toString('base64'),
      scheme: 'sep53',
    }),
  });
  if (!response.ok) throw new Error('Wallet authentication failed. Please try again.');
  const result = (await response.json()) as { token: string };
  return result.token;
}
