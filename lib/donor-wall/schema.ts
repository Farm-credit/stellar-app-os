import { z } from 'zod';

export const STELLAR_WALLET_REGEX = /^G[A-Z2-7]{55}$/;

export const walletSchema = z
  .string()
  .regex(STELLAR_WALLET_REGEX, 'Invalid Stellar wallet address');

export const recognitionSettingsSchema = z
  .object({
    recognitionOptIn: z.boolean(),
    displayName: z.string().trim().max(80, 'Name must be 80 characters or fewer').default(''),
    logoUrl: z
      .string()
      .trim()
      .max(2048, 'Logo URL is too long')
      .refine((value) => value === '' || isHttpsUrl(value), 'Logo URL must start with https://')
      .default(''),
  })
  .refine((data) => !data.recognitionOptIn || data.displayName.length >= 2, {
    message: 'A display name (at least 2 characters) is required to appear on the wall',
    path: ['displayName'],
  });

export type RecognitionSettingsInput = z.infer<typeof recognitionSettingsSchema>;

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}
