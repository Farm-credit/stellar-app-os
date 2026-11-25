import { z } from 'zod';

export interface PreferredRegionOption {
  value: string;
  label: string;
  regionGroup: string;
  countries: string[];
}

export const PREFERRED_PLANTING_REGIONS: PreferredRegionOption[] = [
  {
    value: 'Sub-Saharan Africa',
    label: 'Sub-Saharan Africa (Nigeria, Ghana, Kenya)',
    regionGroup: 'Sub-Saharan Africa',
    countries: ['Nigeria', 'Ghana', 'Kenya', 'Ethiopia', 'Tanzania', 'Uganda'],
  },
  {
    value: 'Latin America',
    label: 'Latin America (Brazil, Peru, Colombia)',
    regionGroup: 'Latin America',
    countries: ['Brazil', 'Peru', 'Colombia', 'Ecuador', 'Mexico', 'Costa Rica'],
  },
  {
    value: 'Southeast Asia',
    label: 'Southeast Asia (Indonesia, Philippines, Vietnam)',
    regionGroup: 'Southeast Asia',
    countries: ['Indonesia', 'Philippines', 'Vietnam', 'Malaysia', 'Thailand'],
  },
  {
    value: 'South Asia',
    label: 'South Asia (India, Nepal, Bangladesh)',
    regionGroup: 'South Asia',
    countries: ['India', 'Nepal', 'Bangladesh', 'Sri Lanka'],
  },
  {
    value: 'North America',
    label: 'North America (United States, Canada)',
    regionGroup: 'North America',
    countries: ['United States', 'USA', 'Canada'],
  },
  {
    value: 'Europe',
    label: 'Europe (Spain, Portugal, Greece)',
    regionGroup: 'Europe',
    countries: ['Spain', 'Portugal', 'Greece', 'Italy', 'France'],
  },
];

export const createLocationRequestSchema = z.object({
  sponsorId: z.string().trim().max(200).optional().nullable(),
  sponsorName: z.string().trim().max(200).optional().default(''),
  sponsorEmail: z
    .string()
    .trim()
    .min(1, 'Sponsor email is required')
    .email('Please provide a valid email address')
    .max(320),
  transactionRef: z.string().trim().max(200).optional().nullable(),
  treeCount: z.coerce
    .number()
    .int('Tree count must be a whole number')
    .min(1, 'Tree count must be at least 1')
    .max(100000, 'Tree count cannot exceed 100,000'),
  preferredRegion: z
    .string()
    .trim()
    .min(2, 'Preferred region or country must be at least 2 characters')
    .max(120, 'Preferred region or country must be 120 characters or fewer'),
  preferredCountry: z.string().trim().max(120).optional().nullable(),
  preferenceNotes: z.string().trim().max(500).optional().nullable(),
});

export const matchLocationRequestSchema = z.object({
  locationId: z.coerce
    .number()
    .int('Location ID must be an integer')
    .positive('Location ID must be a positive integer'),
  resolution: z.enum(['confirmed', 'alternative_assigned']),
  adminNotes: z.string().trim().max(1000).optional().nullable(),
  reviewedBy: z.string().trim().max(200).optional(),
});

export type CreateLocationRequestPayload = z.infer<typeof createLocationRequestSchema>;
export type MatchLocationRequestPayload = z.infer<typeof matchLocationRequestSchema>;
