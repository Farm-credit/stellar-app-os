import { z } from 'zod';

export const donorInfoSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Please enter a valid email address'),
  name: z.string(),
  privacyAccepted: z.literal(true, {
    message: 'You must accept the privacy policy to continue',
  }),
});

export type DonorInfoFormData = z.infer<typeof donorInfoSchema>;
