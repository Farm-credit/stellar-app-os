// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { Keypair } from '@stellar/stellar-sdk';
import { verifyWalletMessage } from './verifyWalletMessage';
// Published SEP-53 test vector; this is not an application credential.
const wallet = 'GBXFXNDLV4LSWA4VB7YIL5GBD7BVNR22SGBTDKMO2SBZZHDXSKZYCP7L';
const signature =
  'fO5dbYhXUhBMhe6kId/cuVq/AfEnHRHEvsP8vXh03M1uLpi5e46yO2Q8rEBzu3feXQewcQE5GArp88u6ePK6BA==';
describe('wallet message signatures', () => {
  it('verifies the published SEP-53 test vector', () =>
    expect(verifyWalletMessage(wallet, 'Hello, World!', signature, 'sep53')).toBe(true));
  it('rejects altered messages and incorrect formats', () => {
    expect(verifyWalletMessage(wallet, 'Different message', signature, 'sep53')).toBe(false);
    expect(verifyWalletMessage(wallet, 'Hello, World!', signature)).toBe(false);
  });
  it('preserves existing raw-signature clients', () => {
    const key = Keypair.random();
    const message = 'stellar-auth:test-nonce';
    expect(
      verifyWalletMessage(
        key.publicKey(),
        message,
        key.sign(Buffer.from(message)).toString('base64')
      )
    ).toBe(true);
  });
});
