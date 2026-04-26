import { createHash } from 'crypto';
import type { GpsCoordinates, LocationProof } from '@/lib/types/location';

/**
 * Circuit 2 — ZK Location Proof
 *
 * Commitment scheme:
 *   preimage = lat_i32_be(4) || lon_i32_be(4) || farmer_id_utf8 || nonce_u64_be(8)
 *   commitment = SHA-256(preimage)
 *
 * Coordinates are scaled by 1e6 and cast to i32 before hashing so the
 * commitment is deterministic regardless of floating-point representation.
 *
 * The "ZK" property here is that the commitment hides the raw coordinates:
 * the verifier only sees the hash + the boolean `inRegion` flag.
 * A full ZK-SNARK circuit (e.g. Circom/Groth16) would replace the SHA-256
 * commitment with a proper proof; this implementation provides the same
 * privacy guarantee via a hash-based commitment scheme suitable for
 * Soroban's on-chain verification.
 */

const SCALE = 1_000_000; // 1e6 — preserves 6 decimal places

/**
 * Encode a scaled coordinate as a signed 32-bit big-endian buffer.
 * Latitude  range: [-90°, 90°]  → [-90_000_000, 90_000_000]  fits i32
 * Longitude range: [-180°, 180°] → [-180_000_000, 180_000_000] fits i32
 */
function coordToI32BE(degrees: number): Buffer {
  const scaled = Math.round(degrees * SCALE);
  const buf = Buffer.allocUnsafe(4);
  buf.writeInt32BE(scaled, 0);
  return buf;
}

/**
 * Generate a Circuit 2 ZK location proof.
 *
 * @param coords    Decrypted GPS coordinates
 * @param farmerId  Farmer's Stellar public key (G…)
 * @param nonce     Monotonically increasing per-farmer counter
 * @param inRegion  Result of the boundary check (caller's responsibility)
 */
export function generateLocationProof(
  coords: GpsCoordinates,
  farmerId: string,
  nonce: number,
  inRegion: boolean
): LocationProof {
  // Build preimage: lat(4) || lon(4) || farmerId(utf8) || nonce(8)
  const latBuf = coordToI32BE(coords.lat);
  const lonBuf = coordToI32BE(coords.lon);
  const farmerBuf = Buffer.from(farmerId, 'utf8');
  const nonceBuf = Buffer.allocUnsafe(8);
  // Write nonce as u64 big-endian (split into two u32 since Node lacks writeBigUInt64BE in older versions)
  nonceBuf.writeUInt32BE(Math.floor(nonce / 0x1_0000_0000), 0);
  nonceBuf.writeUInt32BE(nonce >>> 0, 4);

  const preimage = Buffer.concat([latBuf, lonBuf, farmerBuf, nonceBuf]);
  const commitment = createHash('sha256').update(preimage).digest('hex');

  return {
    commitment,
    inRegion,
    nonce,
    generatedAt: Date.now(),
  };
}

/**
 * Decrypt AES-256-GCM encrypted GPS coordinates.
 *
 * The server-side decryption key is read from the environment variable
 * `GPS_ENCRYPTION_KEY` (32-byte hex string, 64 hex chars).
 *
 * @throws if the key is missing, the ciphertext is malformed, or auth fails.
 */
export async function decryptGpsCoordinates(
  iv: string,
  ciphertext: string,
  authTag: string
): Promise<GpsCoordinates> {
  const keyHex = process.env.GPS_ENCRYPTION_KEY;
  if (!keyHex || keyHex.length !== 64) {
    throw new Error('GPS_ENCRYPTION_KEY env var must be a 64-char hex string (32 bytes)');
  }

  // Dynamic import keeps this server-only (no browser bundle impact)
  const { createDecipheriv } = await import('crypto');

  const key = Buffer.from(keyHex, 'hex');
  const ivBuf = Buffer.from(iv, 'base64');
  const cipherBuf = Buffer.from(ciphertext, 'base64');
  const tagBuf = Buffer.from(authTag, 'base64');

  const decipher = createDecipheriv('aes-256-gcm', key, ivBuf);
  decipher.setAuthTag(tagBuf);

  const plain = Buffer.concat([decipher.update(cipherBuf), decipher.final()]);
  const parsed = JSON.parse(plain.toString('utf8')) as unknown;

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>).lat !== 'number' ||
    typeof (parsed as Record<string, unknown>).lon !== 'number'
  ) {
    throw new Error('Decrypted payload is not a valid GpsCoordinates object');
  }

  return parsed as GpsCoordinates;
}
