import { z } from 'zod';

/**
 * Stellar Ed25519 public keys always start with 'G' and are 56 characters.
 * We validate the format here; the SDK-level check happens server-side.
 */
const stellarPublicKeyRegex = /^G[A-Z2-7]{55}$/;

export const planterRegistrationSchema = z.object({
  // ── Step 1: Wallet ────────────────────────────────────────────────────────
  walletPublicKey: z
    .string()
    .min(1, 'Please connect a wallet to continue')
    .regex(stellarPublicKeyRegex, 'Invalid Stellar public key'),

  // ── Step 2: Profile ───────────────────────────────────────────────────────
  displayName: z
    .string()
    .min(2, 'Display name must be at least 2 characters')
    .max(60, 'Display name must be 60 characters or fewer')
    .trim(),

  bio: z.string().max(500, 'Bio must be 500 characters or fewer').trim(),

  /** IPFS CID set after server-side photo upload. Empty string = no photo. */
  profilePhotoIpfsCid: z.string(),

  // ── Step 3: Regions ───────────────────────────────────────────────────────
  regions: z.array(z.string()).min(1, 'Please select at least one operating region'),

  // ── Step 4: Review / Terms ────────────────────────────────────────────────
  termsAccepted: z.literal(true, {
    message: 'You must accept the terms and conditions to register',
  }),
});

export type PlanterRegistrationFormData = z.infer<typeof planterRegistrationSchema>;

/** Step-scoped partial schemas used for per-step field validation */
export const walletStepSchema = planterRegistrationSchema.pick({ walletPublicKey: true });
export const profileStepSchema = planterRegistrationSchema.pick({
  displayName: true,
  bio: true,
  profilePhotoIpfsCid: true,
});
export const regionsStepSchema = planterRegistrationSchema.pick({ regions: true });
export const reviewStepSchema = planterRegistrationSchema.pick({ termsAccepted: true });
