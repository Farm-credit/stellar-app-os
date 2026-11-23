import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import SponsorTelemetryPage from "../page";
import {
  buildSponsorTelemetry,
  computeGrowthPct,
  formatCredits,
  formatTonnes,
  formatWaterKiloLiters,
  isValidTimeframe,
} from "@/lib/sponsor-telemetry";

vi.mock("recharts", () => {
  const MockContainer = ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="recharts-container">{children}</div>
  );
  const MockComponent = () => null;
  return {
    ResponsiveContainer: MockContainer,
    AreaChart: MockContainer,
    BarChart: MockContainer,
    Area: MockComponent,
    Bar: MockComponent,
    XAxis: MockComponent,
    YAxis: MockComponent,
    CartesianGrid: MockComponent,
    Tooltip: MockComponent,
    Legend: MockComponent,
  };
});

describe("sponsor-telemetry helpers", () => {
  it("validates timeframes correctly", () => {
    expect(isValidTimeframe("7d")).toBe(true);
    expect(isValidTimeframe("30d")).toBe(true);
    expect(isValidTimeframe("all")).toBe(true);
    expect(isValidTimeframe("2w")).toBe(false);
  });

  it("formats ecological metrics cleanly", () => {
    expect(formatTonnes(12500)).toBe("12.5 tCO2e");
    expect(formatWaterKiloLiters(45000)).toBe("45.0 kL");
    expect(formatCredits(3200)).toBe("3,200 CARBON");
    expect(computeGrowthPct(120, 100)).toBe(20);
    expect(computeGrowthPct(100, 0)).toBe(0);
  });

  it("builds telemetry payload filtered by poolId", () => {
    const allPayload = buildSponsorTelemetry("30d", "all");
    expect(allPayload.pools.length).toBe(4);
    expect(allPayload.timeSeries.length).toBe(4);

    const singlePool = buildSponsorTelemetry("30d", "pool-rift-valley");
    expect(singlePool.pools.length).toBe(1);
    expect(singlePool.pools[0].poolId).toBe("pool-rift-valley");
    expect(singlePool.summary.totalCo2Tonnes).toBeLessThan(
      allPayload.summary.totalCo2Tonnes,
    );
  });
});

describe("SponsorTelemetryPage", () => {
  const mockPayload30d = buildSponsorTelemetry("30d", "all");
  const mockPayload90d = buildSponsorTelemetry("90d", "all");

  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL) => {
        const url = String(input);
        const payload = url.includes("timeframe=90d")
          ? mockPayload90d
          : mockPayload30d;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(payload),
        } as Response);
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders loading state then displays KPI cards, charts, and pools table", async () => {
    render(<SponsorTelemetryPage />);

    expect(screen.getByTestId("telemetry-loading")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId("kpi-co2")).toBeInTheDocument();
    });

    expect(
      screen.getByText("Corporate ESG Telemetry Dashboard"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("kpi-water")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-credits")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-funding")).toBeInTheDocument();
    expect(
      screen.getAllByTestId("recharts-container").length,
    ).toBeGreaterThanOrEqual(3);
    expect(
      screen.getAllByText("Rift Valley Agroforestry Fund").length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("refetches telemetry when timeframe button is clicked", async () => {
    render(<SponsorTelemetryPage />);

    await waitFor(() => {
      expect(screen.getByTestId("kpi-co2")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "90D" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("timeframe=90d"),
        expect.any(Object),
      );
    });
  });

  it("shows error banner on failure and recovers on retry", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: "Soroban RPC unavailable" }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockPayload30d),
      } as Response);

    vi.stubGlobal("fetch", fetchMock);

    render(<SponsorTelemetryPage />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(screen.getByText("Soroban RPC unavailable")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => {
      expect(screen.getByTestId("kpi-co2")).toBeInTheDocument();
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
