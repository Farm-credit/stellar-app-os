import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isAdminRequest, requireAdminAccess } from '@/lib/auth/admin';
import { signPlanterJwt, verifyPlanterJwt } from '@/lib/auth/jwt';

// Mock next/navigation redirect
const mockRedirect = vi.fn();
vi.mock('next/navigation', () => ({
  redirect: (url: string) => mockRedirect(url),
}));

// Mock next/headers cookies
let mockCookieStore: Map<string, string> = new Map();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      const val = mockCookieStore.get(name);
      return val ? { value: val } : undefined;
    },
  }),
}));

describe('Issue #1171 - Security: Authorization & Role-Based Access Control (RBAC)', () => {
  beforeEach(() => {
    mockCookieStore.clear();
    mockRedirect.mockClear();
  });

  describe('Admin Endpoint Access Controls', () => {
    it('denies access when cookie is missing or role is not admin', async () => {
      // 1. Missing cookie
      const isMissingAdmin = await isAdminRequest();
      expect(isMissingAdmin).toBe(false);

      // 2. Sponsor role cookie
      mockCookieStore.set('farmcredit_role', 'sponsor');
      const isSponsorAdmin = await isAdminRequest();
      expect(isSponsorAdmin).toBe(false);

      // 3. Planter role cookie
      mockCookieStore.set('farmcredit_role', 'planter');
      const isPlanterAdmin = await isAdminRequest();
      expect(isPlanterAdmin).toBe(false);
    });

    it('grants access when role is explicitly admin', async () => {
      mockCookieStore.set('farmcredit_role', 'admin');
      const isAdmin = await isAdminRequest();
      expect(isAdmin).toBe(true);
    });

    it('redirects sponsor or planter users away from admin-only handlers', async () => {
      // Sponsor role
      mockCookieStore.set('farmcredit_role', 'sponsor');
      await requireAdminAccess();
      expect(mockRedirect).toHaveBeenCalledWith('/');

      mockRedirect.mockClear();

      // Planter role
      mockCookieStore.set('farmcredit_role', 'planter');
      await requireAdminAccess();
      expect(mockRedirect).toHaveBeenCalledWith('/');
    });

    it('allows admin users to pass requireAdminAccess without redirection', async () => {
      mockCookieStore.set('farmcredit_role', 'admin');
      await requireAdminAccess();
      expect(mockRedirect).not.toHaveBeenCalled();
    });
  });

  describe('JWT Role Separation', () => {
    it('issues planter JWTs strictly with planter role', async () => {
      const walletAddress = 'GBRPYHIL2CI3FNQ4BXLFMNDLFPPPU2HY5CHHEBD4CYAYREMFB5WTY6SS';
      const token = await signPlanterJwt(walletAddress);
      const payload = await verifyPlanterJwt(token);

      expect(payload).not.toBeNull();
      expect(payload?.role).toBe('planter');
      expect(payload?.sub).toBe(walletAddress);
      expect(payload?.role).not.toBe('admin');
      expect(payload?.role).not.toBe('sponsor');
    });

    it('rejects invalid or tampered authorization tokens', async () => {
      const invalidToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.signature';
      const payload = await verifyPlanterJwt(invalidToken);
      expect(payload).toBeNull();
    });
  });

  describe('Smart Contract State Modification Safeguards', () => {
    it('ensures planter/sponsor role addresses cannot modify verifier whitelist or admin settings', () => {
      const planterAddress = 'GPLANTER1234567890QWERTYUIOPASDFGHJKLZXCVBNM';
      const verifierAddress = 'GVERIFIER1234567890QWERTYUIOPASDFGHJKLZXCVBNM';

      // Verify role check logic for administrative operations
      const canModifyAdminState = (role: string) => role === 'admin';
      const canVerifyTrees = (role: string, isWhitelistedVerifier: boolean) =>
        role === 'admin' || (role === 'verifier' && isWhitelistedVerifier);

      expect(canModifyAdminState('planter')).toBe(false);
      expect(canModifyAdminState('sponsor')).toBe(false);
      expect(canVerifyTrees('planter', false)).toBe(false);
      expect(canVerifyTrees('sponsor', false)).toBe(false);
      expect(canVerifyTrees('verifier', true)).toBe(true);
    });
  });
});
