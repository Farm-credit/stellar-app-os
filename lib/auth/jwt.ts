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
}

export function signPlanterJwt(walletAddress: string): Promise<string> {
  return new SignJWT({ role: 'planter' as const })
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
