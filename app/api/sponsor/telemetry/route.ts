import { NextRequest, NextResponse } from "next/server";
import {
  buildSponsorTelemetry,
  isValidTimeframe,
  type TelemetryTimeframe,
} from "@/lib/sponsor-telemetry";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const timeframeParam = searchParams.get("timeframe") ?? "30d";
    const poolId = searchParams.get("poolId") ?? "all";

    if (!isValidTimeframe(timeframeParam)) {
      return NextResponse.json(
        {
          error: "Invalid timeframe parameter. Expected one of: 7d, 30d, 90d, 1y, all.",
        },
        { status: 400 },
      );
    }

    const payload = buildSponsorTelemetry(
      timeframeParam as TelemetryTimeframe,
      poolId,
    );

    return NextResponse.json(payload, {
      status: 200,
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load ESG telemetry";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
