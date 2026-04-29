import { NextResponse } from 'next/server';
import { isInNorthernNigeria } from '@/lib/geo/northernNigeria';
import { uploadImageToS3 } from '@/lib/aws/s3';
import { decryptClientPayload } from '@/lib/crypto/plantingVerification';
import { generateLocationProof } from '@/lib/zk/locationProof';
import { submitLocationProofToContract } from '@/lib/stellar/locationProof';
import type { ClientEncryptedPayload } from '@/lib/crypto/plantingVerification';
import type { NetworkType } from '@/lib/types/wallet';

interface PlantingGpsPayload {
  lat: number;
  lon: number;
  capturedAt: string;
  source: 'exif';
}

function parseEncryptedPayload(value: FormDataEntryValue | null): ClientEncryptedPayload | null {
  if (typeof value !== 'string') return null;

  try {
    const parsed = JSON.parse(value) as Partial<ClientEncryptedPayload>;
    if (typeof parsed.iv !== 'string' || typeof parsed.ciphertext !== 'string') {
      return null;
    }
    return parsed as ClientEncryptedPayload;
  } catch {
    return null;
  }
}

function isNetwork(value: FormDataEntryValue | null): value is NetworkType {
  return value === 'testnet' || value === 'mainnet';
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const farmerId = formData.get('farmerId');
    const treeCountValue = formData.get('treeCount');
    const nonceValue = formData.get('nonce');
    const network = formData.get('network');
    const contractId = formData.get('contractId');
    const wrappedKey = formData.get('wrappedKey');
    const encryptedGps = parseEncryptedPayload(formData.get('encryptedGps'));
    const encryptedPhoto = formData.get('encryptedPhoto');

    if (
      typeof farmerId !== 'string' ||
      typeof treeCountValue !== 'string' ||
      typeof nonceValue !== 'string' ||
      typeof contractId !== 'string' ||
      typeof wrappedKey !== 'string' ||
      !isNetwork(network) ||
      !encryptedGps ||
      !(encryptedPhoto instanceof File)
    ) {
      return NextResponse.json(
        { error: 'Missing or invalid verification fields' },
        { status: 400 }
      );
    }

    const treeCount = Number.parseInt(treeCountValue, 10);
    const nonce = Number.parseInt(nonceValue, 10);

    if (!Number.isInteger(treeCount) || treeCount < 1) {
      return NextResponse.json({ error: 'treeCount must be a positive integer' }, { status: 400 });
    }

    if (!Number.isInteger(nonce) || nonce < 0) {
      return NextResponse.json({ error: 'nonce must be a non-negative integer' }, { status: 400 });
    }

    const gps = decryptClientPayload<PlantingGpsPayload>(wrappedKey, encryptedGps);

    if (typeof gps.lat !== 'number' || typeof gps.lon !== 'number' || gps.source !== 'exif') {
      return NextResponse.json({ error: 'Invalid decrypted GPS payload' }, { status: 400 });
    }

    const inRegion = isInNorthernNigeria({ lat: gps.lat, lon: gps.lon });
    if (!inRegion) {
      return NextResponse.json(
        { error: 'GPS coordinates are outside the Northern Nigeria boundary' },
        { status: 422 }
      );
    }

    const encryptedPhotoBuffer = Buffer.from(await encryptedPhoto.arrayBuffer());
    const s3Key = await uploadImageToS3(farmerId, encryptedPhotoBuffer, 'application/octet-stream');
    const proof = generateLocationProof({ lat: gps.lat, lon: gps.lon }, farmerId, nonce, inRegion);
    const transactionHash = await submitLocationProofToContract(
      proof,
      farmerId,
      contractId,
      network
    );

    return NextResponse.json(
      {
        message: 'Planting verification submitted successfully.',
        treeCount,
        encryptedPhotoKey: s3Key,
        transactionHash,
        commitment: proof.commitment,
        inRegion: proof.inRegion,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[planting/verification] error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
