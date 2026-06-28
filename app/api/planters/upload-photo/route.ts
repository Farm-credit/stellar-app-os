import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';

/**
 * POST /api/planters/upload-photo
 *
 * Accepts a multipart/form-data upload with a single "photo" field,
 * validates the file type and size server-side, then pins to IPFS via
 * Pinata and returns the content CID.
 *
 * Security:
 * - Allow-list: only image/jpeg, image/png, image/webp accepted
 * - 5 MB hard size cap — rejects oversized files before reading
 * - File is renamed to a UUID on the server — original name discarded
 * - X-Content-Type-Options: nosniff set on response
 * - TODO(security): Antivirus / CDR scanning of uploaded images is NOT
 *   implemented. Integrate a scanning step (e.g., ClamAV or a cloud AV
 *   API) before permanently pinning to IPFS in production.
 * - TODO(security): Rate-limit this endpoint per wallet / IP to prevent
 *   storage exhaustion attacks.
 */

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Verify magic-bytes / file signature to ensure the actual content matches
 * the declared MIME type. This is a lightweight check; a server-side
 * library like `file-type` should be used in production for full coverage.
 */
function validateMagicBytes(buffer: Uint8Array, mimeType: string): boolean {
  if (mimeType === 'image/jpeg') {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimeType === 'image/png') {
    return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  }
  if (mimeType === 'image/webp') {
    // RIFF....WEBP
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

  // ── Size check ────────────────────────────────────────────────────────────
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json({ error: 'File too large. Maximum size is 5 MB.' }, { status: 413 });
  }

  // ── MIME type allow-list ──────────────────────────────────────────────────
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: 'Unsupported file type. Only JPEG, PNG and WebP images are accepted.' },
      { status: 415 }
    );
  }

  // ── Magic-bytes content verification ─────────────────────────────────────
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  if (!validateMagicBytes(bytes, file.type)) {
    return NextResponse.json(
      { error: 'File content does not match declared type.' },
      { status: 415 }
    );
  }

  // ── Rename to UUID — discard original filename ────────────────────────────
  const ext = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/png' ? 'png' : 'webp';
  const safeFilename = `${randomUUID()}.${ext}`;

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
    JSON.stringify({ name: `planter-photo-${safeFilename}` })
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

  return NextResponse.json(
    { cid },
    {
      status: 200,
      headers: {
        'X-Content-Type-Options': 'nosniff',
      },
    }
  );
}
