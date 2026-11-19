import { z } from 'zod';

export const VOLUNTEER_ROLES = ['digger', 'photographer', 'team-lead'] as const;
export const eventIdSchema = z.uuid();
export const eventSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    location: z.string().trim().min(1).max(300),
    briefing: z.string().trim().min(1).max(5000),
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
  })
  .refine(
    (value) => {
      const duration = Date.parse(value.endsAt) - Date.parse(value.startsAt);
      return duration >= 60000 && duration <= 86400000;
    },
    { message: 'Events must last between one minute and 24 hours' }
  );
export const signupSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z
    .email()
    .max(254)
    .transform((value) => value.toLowerCase()),
  role: z.enum(VOLUNTEER_ROLES),
});
export const updateSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('role'), volunteerId: z.uuid(), role: z.enum(VOLUNTEER_ROLES) }),
  z.object({
    action: z.literal('hours'),
    volunteerId: z.uuid(),
    minutes: z.number().int().min(1).max(1440),
  }),
]);

export interface PlantingEvent {
  id: string;
  coordinator_wallet: string;
  title: string;
  location: string;
  briefing: string;
  starts_at: string;
  ends_at: string;
}
export interface Volunteer {
  id: string;
  event_id: string;
  wallet: string;
  name: string;
  email: string;
  role: (typeof VOLUNTEER_ROLES)[number];
  minutes: number | null;
  briefing_sent_at: string | null;
}
