"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface SponsorTelemetryErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function SponsorTelemetryError({
  error,
  reset,
}: SponsorTelemetryErrorProps) {
  useEffect(() => {
    console.error("Corporate ESG Telemetry Dashboard error:", error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center justify-center px-4 py-16 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-400">
        <AlertTriangle className="h-6 w-6" aria-hidden="true" />
      </div>
      <h1 className="text-xl font-semibold text-foreground">
        Unable to load Corporate ESG Telemetry
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {error.message ||
          "An unexpected error occurred while syncing Soroban telemetry data."}
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700"
      >
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        Retry Telemetry Sync
      </button>
    </div>
  );
}
