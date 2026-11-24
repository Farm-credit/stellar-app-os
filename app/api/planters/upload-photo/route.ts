import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import {
  guardUploadAgainstDuplicates,
  safelyRecordUploadedPhotoHash,
} from '@/lib/image/upload-dedup';

/**
 * POST /api/planters/upload-photo
 *
 * Accepts a multipart/form-data upload with a single "photo" field,
 * validates the file type, magic bytes, and perceptual hash (pHash)
 * duplicate status server-side, then pins to IPFS via Pinata and returns
 * the content CID + pHash hex.
 */

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Verify magic-bytes / file signature to ensure the actual content matches
 * the declared MIME type.
 */
function validateMagicBytes(buffer: Uint8Array, mimeType: string): boolean {
  if (mimeType === 'image/jpeg') {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimeType === 'image/png') {
    return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  }
  if (mimeType === 'image/webp') {
    return (
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46 &&
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50
    );
  }
  return false;
}

export async function POST(request: Request) {
  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid multipart request' }, { status: 400 });
  }

  const file = formData.get('photo');
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'No photo file provided' }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json({ error: 'File too large. Maximum size is 5 MB.' }, { status: 413 });
  }

  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: 'Unsupported file type. Only JPEG, PNG and WebP images are accepted.' },
      { status: 415 }
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  if (!validateMagicBytes(bytes, file.type)) {
    return NextResponse.json(
      { error: 'File content does not match declared type.' },
      { status: 415 }
    );
  }

  const ext = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/png' ? 'png' : 'webp';
  const safeFilename = `${randomUUID()}.${ext}`;

  const rawTreeId = formData.get('treeId');
  const entityType = typeof rawTreeId === 'string' && rawTreeId.trim() ? 'tree' : 'planter';
  const rawEntityId =
    entityType === 'tree' ? rawTreeId : (formData.get('planterId') ?? formData.get('walletAddress'));
  const entityId =
    typeof rawEntityId === 'string' && rawEntityId.trim().length > 0
      ? rawEntityId.trim()
      : safeFilename;

  // ── Perceptual hash (pHash) duplicate detection before IPFS pinning ───────
  let verifiedHashHex: string | undefined;
  try {
    const verdict = await guardUploadAgainstDuplicates(Buffer.from(arrayBuffer), {
      entityType,
      entityId,
      routeLabel: 'planters/upload-photo',
    });

    if (verdict.isDuplicate) {
      return NextResponse.json(
        {
          error: `Duplicate or reused photo detected. Please upload an original ${entityType} verification photo.`,
          code: 'DUPLICATE_PHOTO',
          hash: verdict.phash.hex,
          distance: verdict.distance,
          similarity: verdict.similarityScore,
          threshold: verdict.threshold,
          duplicateOf: verdict.duplicateOf,
        },
        {
          status: 422,
          headers: { 'X-Content-Type-Options': 'nosniff' },
        }
      );
    }

    verifiedHashHex = verdict.phash.hex;
  } catch (err) {
    console.warn(
      '[photo-upload] Perceptual hash check failed — continuing after magic-byte validation:',
      err instanceof Error ? err.message : String(err)
    );
  }

  // ── Pin to IPFS via Pinata ────────────────────────────────────────────────
  const pinatajwt = process.env.PINATA_JWT;
  if (!pinatajwt) {
    console.error('PINATA_JWT env var is not set');
    return NextResponse.json({ error: 'Photo upload is temporarily unavailable' }, { status: 503 });
  }

  const pinataFormData = new FormData();
  const renamedBlob = new Blob([arrayBuffer], { type: file.type });
  pinataFormData.append('file', renamedBlob, safeFilename);
  pinataFormData.append(
    'pinataMetadata',
    JSON.stringify({ name: `${entityType}-photo-${safeFilename}` })
  );
  pinataFormData.append('pinataOptions', JSON.stringify({ cidVersion: 1 }));

  let cid: string;
  try {
    const pinataRes = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: { Authorization: `Bearer ${pinatajwt}` },
      body: pinataFormData,
    });

    if (!pinataRes.ok) {
      console.error('Pinata upload failed', { status: pinataRes.status });
      return NextResponse.json(
        { error: 'Photo upload failed. Please try again.' },
        { status: 502 }
      );
    }

    const pinataData = (await pinataRes.json()) as { IpfsHash: string };
    cid = pinataData.IpfsHash;
  } catch (err) {
    console.error('Pinata upload error', err instanceof Error ? err.message : 'unknown');
    return NextResponse.json({ error: 'Photo upload failed. Please try again.' }, { status: 502 });
  }

  if (verifiedHashHex) {
    await safelyRecordUploadedPhotoHash({
      entityType,
      entityId,
      hashHex: verifiedHashHex as Parameters<typeof safelyRecordUploadedPhotoHash>[0]['hashHex'],
      storageRef: cid,
      metadata: { mimeType: file.type, safeFilename },
      routeLabel: 'planters/upload-photo',
    });
  }

  return NextResponse.json(
    { cid, ...(verifiedHashHex ? { hash: verifiedHashHex } : {}) },
    {
      status: 200,
      headers: {
        'X-Content-Type-Options': 'nosniff',
      },
    }
  );
}
