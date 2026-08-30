import { NextResponse } from 'next/server';
import { planterRegistrationSchema } from '@/lib/schemas/planter-registration';
import { StrKey } from '@stellar/stellar-sdk';
import { randomUUID } from 'crypto';

const MAX_PROFILE_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

function isPngOrJpeg(buffer: Buffer): boolean {
  if (buffer.length < 3) return false;
  // PNG magic: 89 50 4E 47 0D 0A 1A 0A
  const pngMagic = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (buffer.length >= pngMagic.length && pngMagic.every((byte, i) => buffer[i] === byte)) {
    return true;
  }
  // JPEG magic: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return true;
  }
  return false;
}

async function validateIpfsImage(cid: string): Promise<string | null> {
  try {
    const response = await fetch(`https://ipfs.io/ipfs/${cid}`, { redirect: 'follow' });
    if (!response.ok) return 'Could not fetch IPFS file';
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_PROFILE_IMAGE_SIZE) {
      return 'File exceeds 5MB limit';
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > MAX_PROFILE_IMAGE_SIZE) {
      return 'File exceeds 5MB limit';
    }
    if (!isPngOrJpeg(buffer)) {
      return 'File must be PNG or JPG';
    }
    return null;
  } catch {
    return 'Unable to validate IPFS file';
  }
}

/**
 * POST /api/planters/register
 *
 * Registers a new planter profile. Validates the payload server-side
 * using the Zod schema and then performs an additional Stellar SDK check
 * on the public key before persisting.
 *
 * Security:
 * - All inputs validated via Zod schema (server-side, never trust client)
 * - walletPublicKey validated with StrKey.isValidEd25519PublicKey
 * - displayName and bio stripped of surrounding whitespace by Zod .trim()
 * - profilePhotoIpfsCid validated against the IPFS file: MIME type must be
 *   PNG or JPG and size must not exceed 5MB.
 * - No sensitive data returned in error responses
 * - TODO(security): Add rate limiting middleware on this route (e.g. via
 *   the existing useRateLimit pattern) to prevent registration spam.
 */
export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  // Server-side schema validation — never trust client assertions
  const parsed = planterRegistrationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Validation failed',
        issues: parsed.error.issues.map((i) => ({
          path: i.path,
          message: i.message,
        })),
      },
      { status: 422 }
    );
  }

  const {
    walletPublicKey,
    displayName: _displayName,
    bio: _bio,
    profilePhotoIpfsCid: _profilePhotoIpfsCid,
    regions,
  } = parsed.data;

  // Additional Stellar SDK validation
  if (!StrKey.isValidEd25519PublicKey(walletPublicKey)) {
    return NextResponse.json({ error: 'Invalid Stellar wallet address' }, { status: 422 });
  }

  // Validate the uploaded image referenced by the CID (if provided)
  if (_profilePhotoIpfsCid) {
    const imageError = await validateIpfsImage(_profilePhotoIpfsCid);
    if (imageError) {
      return NextResponse.json({ error: imageError }, { status: 422 });
    }
  }

  // TODO: Persist to database — replace with actual DB call once the
  // planters table migration is in place.
  // Example:
  //   await db.query(
  //     `INSERT INTO planters (id, wallet_public_key, display_name, bio,
  //      profile_photo_ipfs_cid, regions, status)
  //      VALUES ($1, $2, $3, $4, $5, $6, 'pending')`,
  //     [planterId, walletPublicKey, displayName, bio ?? '',
  //      profilePhotoIfpsCid ?? '', regions]
  //   );
  const planterId = randomUUID();

  // Intentionally logging only non-PII metadata for debugging
  console.info('Planter registration submitted', { planterId, regionCount: regions.length });

  return NextResponse.json({ planterId, status: 'pending' }, { status: 201 });
}
