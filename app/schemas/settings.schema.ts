import { z } from "zod";

export const profileSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Please enter a valid email address"),
});

export const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Z]/, "Must contain at least one uppercase letter")
      .regex(/[0-9]/, "Must contain at least one number"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const notificationsSchema = z.object({
  notifications: z.object({
    emailBookings: z.boolean(),
    emailMarketing: z.boolean(),
    pushPayments: z.boolean(),
    pushUpdates: z.boolean(),
    smsAlerts: z.boolean(),
  }),
});

export const preferencesSchema = z.object({
  language: z.enum(["en", "fr", "es", "pt", "de"]),
  currency: z.enum(["USD", "EUR", "GBP", "NGN", "GHS"]),
  theme: z.enum(["light", "dark", "system"]),
});

export type ProfileFormData = z.infer<typeof profileSchema>;
export type PasswordFormData = z.infer<typeof passwordSchema>;
export type NotificationsFormData = z.infer<typeof notificationsSchema>;
export type PreferencesFormData = z.infer<typeof preferencesSchema>;