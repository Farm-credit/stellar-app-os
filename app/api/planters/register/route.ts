import { NextResponse } from 'next/server';
import { planterRegistrationSchema } from '@/lib/schemas/planter-registration';
import { StrKey } from '@stellar/stellar-sdk';
import { randomUUID } from 'crypto';

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

  // TODO: Persist to database — replace with actual DB call once the
  // planters table migration is in place.
  // Example:
  //   await db.query(
  //     `INSERT INTO planters (id, wallet_public_key, display_name, bio,
  //      profile_photo_ipfs_cid, regions, status)
  //      VALUES ($1, $2, $3, $4, $5, $6, 'pending')`,
  //     [planterId, walletPublicKey, displayName, bio ?? '',
  //      profilePhotoIpfsCid ?? '', regions]
  //   );
  const planterId = randomUUID();

  // Intentionally logging only non-PII metadata for debugging
  console.info('Planter registration submitted', { planterId, regionCount: regions.length });

  return NextResponse.json({ planterId, status: 'pending' }, { status: 201 });
}
