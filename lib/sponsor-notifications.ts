import { StrKey } from "@stellar/stellar-sdk";

export type NotificationChannel = "inApp" | "email" | "webhook" | "push";

export type MilestoneEventType =
  | "planting_verified"
  | "survival_check_passed"
  | "escrow_tranche_released"
  | "carbon_credits_minted";

export type DigestFrequency = "realtime" | "hourly" | "daily";

export interface QuietHoursConfig {
  enabled: boolean;
  start: string;
  end: string;
}

export interface SponsorNotificationSettings {
  enabled: boolean;
  channels: Record<NotificationChannel, boolean>;
  emailAddress: string;
  webhookUrl: string;
  stellarAccount: string;
  events: Record<MilestoneEventType, boolean>;
  frequency: DigestFrequency;
  minVerifiedTreesThreshold: number;
  quietHours: QuietHoursConfig;
  updatedAt: string;
}

export interface MilestoneAlertItem {
  id: string;
  eventType: MilestoneEventType;
  title: string;
  message: string;
  stewardName: string;
  poolName: string;
  treesVerified: number;
  ledgerSequence: number;
  timestamp: string;
}

export interface ValidationErrors {
  emailAddress?: string;
  webhookUrl?: string;
  stellarAccount?: string;
  minVerifiedTreesThreshold?: string;
  channels?: string;
  events?: string;
}

export const NOTIFICATION_STORAGE_KEY =
  "farm-credit:sponsor-notification-settings";

export const MILESTONE_EVENT_META: Record<
  MilestoneEventType,
  { label: string; description: string }
> = {
  planting_verified: {
    label: "Planting Milestone Verified",
    description:
      "Alert when GPS coordinates and photo proofs are verified by community verifiers.",
  },
  survival_check_passed: {
    label: "Survival Check Passed",
    description:
      "Alert when 6-month or 12-month sapling survival audits meet threshold criteria.",
  },
  escrow_tranche_released: {
    label: "Escrow Tranche Released",
    description:
      "Alert when Soroban escrow releases milestone payouts to farmers and urban stewards.",
  },
  carbon_credits_minted: {
    label: "CARBON Credits Minted",
    description:
      "Alert when verified ecological impact credits are minted on Stellar.",
  },
};

export const DEFAULT_SPONSOR_NOTIFICATION_SETTINGS: SponsorNotificationSettings =
  {
    enabled: true,
    channels: {
      inApp: true,
      email: true,
      webhook: false,
      push: false,
    },
    emailAddress: "esg-alerts@benefactor.org",
    webhookUrl: "",
    stellarAccount: "",
    events: {
      planting_verified: true,
      survival_check_passed: true,
      escrow_tranche_released: true,
      carbon_credits_minted: false,
    },
    frequency: "realtime",
    minVerifiedTreesThreshold: 25,
    quietHours: {
      enabled: false,
      start: "22:00",
      end: "07:00",
    },
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidStellarPublicKey(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  try {
    return StrKey.isValidEd25519PublicKey(trimmed);
  } catch {
    return false;
  }
}

export function isValidWebhookUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function validateNotificationSettings(
  settings: SponsorNotificationSettings,
): ValidationErrors {
  const errors: ValidationErrors = {};

  if (settings.enabled) {
    const hasChannel = Object.values(settings.channels).some(Boolean);
    if (!hasChannel) {
      errors.channels =
        "Select at least one delivery channel when alerts are enabled.";
    }

    const hasEvent = Object.values(settings.events).some(Boolean);
    if (!hasEvent) {
      errors.events =
        "Subscribe to at least one planting milestone event type.";
    }
  }

  if (settings.channels.email) {
    const email = settings.emailAddress.trim();
    if (!email || !EMAIL_REGEX.test(email)) {
      errors.emailAddress = "Enter a valid email address for email alerts.";
    }
  }

  if (settings.channels.webhook) {
    if (!isValidWebhookUrl(settings.webhookUrl)) {
      errors.webhookUrl =
        "Enter a valid HTTPS webhook URL (e.g. https://hooks.example.com/esg).";
    }
  }

  if (
    settings.stellarAccount.trim() &&
    !isValidStellarPublicKey(settings.stellarAccount)
  ) {
    errors.stellarAccount =
      "Enter a valid Stellar Ed25519 public key (starts with G).";
  }

  if (
    !Number.isFinite(settings.minVerifiedTreesThreshold) ||
    settings.minVerifiedTreesThreshold < 1 ||
    settings.minVerifiedTreesThreshold > 100000
  ) {
    errors.minVerifiedTreesThreshold =
      "Minimum verified trees threshold must be between 1 and 100,000.";
  }

  return errors;
}

export function createSampleMilestoneAlert(
  eventType: MilestoneEventType = "planting_verified",
): MilestoneAlertItem {
  const now = new Date().toISOString();
  const meta = MILESTONE_EVENT_META[eventType];
  return {
    id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    eventType,
    title: meta.label,
    message:
      eventType === "planting_verified"
        ? "150 indigenous acacia saplings verified with GPS & photo proof by community verifier."
        : eventType === "survival_check_passed"
          ? "6-month survival check passed at 94% survival rate across 320 saplings."
          : eventType === "escrow_tranche_released"
            ? "Soroban escrow released Tranche 2 (450 USDC) to Nakuru Urban Planters."
            : "180 CARBON credits minted on Stellar for verified watershed planting.",
    stewardName: "Nakuru Community School & Stewards",
    poolName: "Rift Valley Reforestation Pool",
    treesVerified: 150,
    ledgerSequence: 54829104,
    timestamp: now,
  };
}
