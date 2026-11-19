/**
 * Security Test Suite: Authentication - verify JWT refresh token rotation — Issue #1170
 *
 * Verifies:
 * 1. Refresh tokens can be issued and verified.
 * 2. Refresh token rotation generates a new access token and a new rotated refresh token.
 * 3. Once a refresh token is used to rotate, it CANNOT be reused (reuse protection).
 * 4. Reusing an old refresh token revokes the entire token family (family revocation attack protection).
 * 5. Access tokens cannot be passed off as refresh tokens.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  signPlanterJwt,
  verifyPlanterJwt,
  signRefreshToken,
  verifyRefreshToken,
  rotateRefreshToken,
  __resetRefreshTokenStateForTests,
} from '../jwt';

describe('Security: JWT Refresh Token Rotation & Reuse Detection (#1170)', () => {
  const walletAddress = 'G' + 'A'.repeat(55);

  beforeEach(() => {
    __resetRefreshTokenStateForTests();
  });

  it('successfully issues and verifies a JWT refresh token', async () => {
    const refreshToken = await signRefreshToken(walletAddress);
    expect(refreshToken).toBeDefined();
    expect(typeof refreshToken).toBe('string');

    const verified = await verifyRefreshToken(refreshToken);
    expect(verified).not.toBeNull();
    expect(verified?.sub).toBe(walletAddress);
    expect(verified?.type).toBe('refresh');
    expect(verified?.jti).toBeDefined();
  });

  it('rejects access tokens when provided to verifyRefreshToken', async () => {
    const accessToken = await signPlanterJwt(walletAddress);
    const verifiedAsRefresh = await verifyRefreshToken(accessToken);
    expect(verifiedAsRefresh).toBeNull();
  });

  it('rotates refresh token and returns new access and refresh tokens', async () => {
    const initialRefreshToken = await signRefreshToken(walletAddress);
    const rotationResult = await rotateRefreshToken(initialRefreshToken);

    expect(rotationResult).not.toBeNull();
    expect(rotationResult?.accessToken).toBeDefined();
    expect(rotationResult?.refreshToken).toBeDefined();

    // Verify new access token
    const newAccessPayload = await verifyPlanterJwt(rotationResult!.accessToken);
    expect(newAccessPayload?.sub).toBe(walletAddress);

    // Verify new refresh token
    const newRefreshPayload = await verifyRefreshToken(rotationResult!.refreshToken);
    expect(newRefreshPayload?.sub).toBe(walletAddress);
    expect(newRefreshPayload?.jti).not.toEqual((await verifyRefreshToken(initialRefreshToken))?.jti);
  });

  it('prevents old refresh tokens from being reused after rotation', async () => {
    const initialRefreshToken = await signRefreshToken(walletAddress);

    // First rotation succeeds
    const firstRotation = await rotateRefreshToken(initialRefreshToken);
    expect(firstRotation).not.toBeNull();

    // Second rotation attempt with same old token MUST fail
    const secondRotation = await rotateRefreshToken(initialRefreshToken);
    expect(secondRotation).toBeNull();
  });

  it('triggers token family revocation when an old token reuse attack is attempted', async () => {
    const initialRefreshToken = await signRefreshToken(walletAddress);

    // Legitimate user rotates token -> gets token2
    const firstRotation = await rotateRefreshToken(initialRefreshToken);
    expect(firstRotation).not.toBeNull();
    const token2 = firstRotation!.refreshToken;

    // Attacker attempts to reuse initialRefreshToken
    const attackRotation = await rotateRefreshToken(initialRefreshToken);
    expect(attackRotation).toBeNull(); // Blocked!

    // Due to reuse attack, token2 in the same family should NOW be revoked
    const userNextRotation = await rotateRefreshToken(token2);
    expect(userNextRotation).toBeNull(); // Entire family revoked!
  });

  it('handles invalid or tampered tokens gracefully', async () => {
    const tamperedToken = 'eyJhbGciOiJIUzI1NiJ9.invalidpayload.invalidsignature';
    const rotationResult = await rotateRefreshToken(tamperedToken);
    expect(rotationResult).toBeNull();
  });
});
