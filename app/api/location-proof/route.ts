import { NextResponse } from 'next/server';
import { decryptGpsCoordinates, generateLocationProof } from '@/lib/zk/locationProof';
import { isInNorthernNigeria } from '@/lib/geo/northernNigeria';
import { submitLocationProofToContract } from '@/lib/stellar/locationProof';
import type { LocationProofRequest, LocationProofResponse } from '@/lib/types/location';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as LocationProofRequest;
    const { farmerId, encryptedGps, nonce, network, contractId } = body;

    // ── 1. Validate required fields ──────────────────────────────────────────
    if (!farmerId || !encryptedGps || nonce == null || !network || !contractId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!encryptedGps.iv || !encryptedGps.ciphertext || !encryptedGps.authTag) {
      return NextResponse.json({ error: 'Invalid encryptedGps payload' }, { status: 400 });
    }

    if (nonce < 0 || !Number.isInteger(nonce)) {
      return NextResponse.json({ error: 'nonce must be a non-negative integer' }, { status: 400 });
    }

    // ── 2. Decrypt GPS coordinates ───────────────────────────────────────────
    const coords = await decryptGpsCoordinates(
      encryptedGps.iv,
      encryptedGps.ciphertext,
      encryptedGps.authTag
    );

    // ── 3. Validate Northern Nigeria boundary ────────────────────────────────
    const inRegion = isInNorthernNigeria(coords);
    if (!inRegion) {
      return NextResponse.json(
        { error: 'GPS coordinates are outside the Northern Nigeria boundary' },
        { status: 422 }
      );
    }

    // ── 4. Generate Circuit 2 ZK location proof ──────────────────────────────
    const proof = generateLocationProof(coords, farmerId, nonce, inRegion);

    // ── 5. Submit to Soroban smart contract ──────────────────────────────────
    const transactionHash = await submitLocationProofToContract(
      proof,
      farmerId,
      contractId,
      network
    );

    const response: LocationProofResponse = {
      transactionHash,
      commitment: proof.commitment,
      inRegion: proof.inRegion,
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error('[location-proof] error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
