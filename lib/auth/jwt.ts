import { SignJWT, jwtVerify } from 'jose';

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET ?? 'dev-secret-replace-before-production'
);

const ISSUER = 'stellar-app-os';
const EXPIRY = '8h';

export interface PlanterPayload {
  sub: string; // Stellar wallet address
  role: 'planter';
  iss: string;
  jti?: string;
  type?: 'access' | 'refresh';
}

const REFRESH_EXPIRY = '7d';

// Memory/state trackers for refresh token reuse detection & revocation
const usedRefreshTokens = new Set<string>();
const revokedTokenFamilies = new Set<string>();

export function signPlanterJwt(walletAddress: string): Promise<string> {
  return new SignJWT({ role: 'planter' as const, type: 'access' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(walletAddress)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(EXPIRY)
    .sign(secret);
}

export async function verifyPlanterJwt(token: string): Promise<PlanterPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret, { issuer: ISSUER });
    return payload as unknown as PlanterPayload;
  } catch {
    return null;
  }
}

export function signRefreshToken(
  walletAddress: string,
  tokenId?: string,
  familyId?: string
): Promise<string> {
  const jti = tokenId || Math.random().toString(36).substring(2) + Date.now().toString(36);
  const family = familyId || walletAddress;
  return new SignJWT({ role: 'planter' as const, type: 'refresh', family })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(walletAddress)
    .setIssuer(ISSUER)
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(REFRESH_EXPIRY)
    .sign(secret);
}

export async function verifyRefreshToken(
  token: string
): Promise<(PlanterPayload & { jti: string; family?: string }) | null> {
  try {
    const { payload } = await jwtVerify(token, secret, { issuer: ISSUER });
    if (payload.type !== 'refresh') return null;
    return payload as unknown as PlanterPayload & { jti: string; family?: string };
  } catch {
    return null;
  }
}

export async function rotateRefreshToken(
  oldRefreshToken: string
): Promise<{ accessToken: string; refreshToken: string } | null> {
  const payload = await verifyRefreshToken(oldRefreshToken);
  if (!payload || !payload.jti || !payload.sub) {
    return null;
  }

  const { jti, sub: walletAddress, family } = payload;

  // If token family is already revoked due to detected reuse attack, reject
  if (family && revokedTokenFamilies.has(family)) {
    return null;
  }

  // Reuse Detection: If this refresh token JTI was already used, revoke the family!
  if (usedRefreshTokens.has(jti)) {
    if (family) {
      revokedTokenFamilies.add(family);
    }
    return null;
  }

  // Mark old token JTI as consumed
  usedRefreshTokens.add(jti);

  // Issue new access token and rotated refresh token
  const newAccessToken = await signPlanterJwt(walletAddress);
  const newRefreshToken = await signRefreshToken(walletAddress, undefined, family);

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
  };
}

export function __resetRefreshTokenStateForTests(): void {
  usedRefreshTokens.clear();
  revokedTokenFamilies.clear();
}

