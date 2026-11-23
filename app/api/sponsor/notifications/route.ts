import { NextRequest, NextResponse } from "next/server";
import {
  createSampleMilestoneAlert,
  DEFAULT_SPONSOR_NOTIFICATION_SETTINGS,
  validateNotificationSettings,
  type MilestoneEventType,
  type SponsorNotificationSettings,
} from "@/lib/sponsor-notifications";

let cachedSettings: SponsorNotificationSettings = {
  ...DEFAULT_SPONSOR_NOTIFICATION_SETTINGS,
  channels: { ...DEFAULT_SPONSOR_NOTIFICATION_SETTINGS.channels },
  events: { ...DEFAULT_SPONSOR_NOTIFICATION_SETTINGS.events },
  quietHours: { ...DEFAULT_SPONSOR_NOTIFICATION_SETTINGS.quietHours },
};

export async function GET() {
  return NextResponse.json(
    {
      settings: cachedSettings,
      recentAlerts: [createSampleMilestoneAlert("planting_verified")],
    },
    { status: 200 },
  );
}

export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<SponsorNotificationSettings>;
    const candidate: SponsorNotificationSettings = {
      ...DEFAULT_SPONSOR_NOTIFICATION_SETTINGS,
      ...body,
      channels: {
        ...DEFAULT_SPONSOR_NOTIFICATION_SETTINGS.channels,
        ...(body.channels ?? {}),
      },
      events: {
        ...DEFAULT_SPONSOR_NOTIFICATION_SETTINGS.events,
        ...(body.events ?? {}),
      },
      quietHours: {
        ...DEFAULT_SPONSOR_NOTIFICATION_SETTINGS.quietHours,
        ...(body.quietHours ?? {}),
      },
      updatedAt: new Date().toISOString(),
    };

    const errors = validateNotificationSettings(candidate);
    if (Object.keys(errors).length > 0) {
      return NextResponse.json(
        { error: "Invalid notification settings", details: errors },
        { status: 400 },
      );
    }

    cachedSettings = candidate;
    return NextResponse.json(
      {
        settings: cachedSettings,
        message: "Notification settings saved successfully.",
      },
      { status: 200 },
    );
  } catch (error) {
    console.warn(
      "[sponsor-notifications] Failed to parse notification settings payload:",
      error,
    );
    return NextResponse.json(
      { error: "Malformed JSON request body" },
      { status: 400 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      eventType?: MilestoneEventType;
    };
    const eventType: MilestoneEventType =
      body.eventType &&
      [
        "planting_verified",
        "survival_check_passed",
        "escrow_tranche_released",
        "carbon_credits_minted",
      ].includes(body.eventType)
        ? body.eventType
        : "planting_verified";

    const alert = createSampleMilestoneAlert(eventType);
    return NextResponse.json(
      {
        alert,
        delivered: true,
        message: "Test planting milestone alert dispatched.",
      },
      { status: 200 },
    );
  } catch (error) {
    console.warn(
      "[sponsor-notifications] Failed to dispatch test milestone alert:",
      error,
    );
    return NextResponse.json(
      { error: "Failed to dispatch test alert" },
      { status: 500 },
    );
  }
}
