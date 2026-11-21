import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import SponsorSettingsPage from "../page";
import {
  createSampleMilestoneAlert,
  DEFAULT_SPONSOR_NOTIFICATION_SETTINGS,
  isValidStellarPublicKey,
  isValidWebhookUrl,
  validateNotificationSettings,
} from "@/lib/sponsor-notifications";

describe("sponsor-notifications helpers", () => {
  it("validates default settings with zero errors", () => {
    const errors = validateNotificationSettings(
      DEFAULT_SPONSOR_NOTIFICATION_SETTINGS,
    );
    expect(errors).toEqual({});
  });

  it("rejects invalid email and non-HTTPS webhook URLs when enabled", () => {
    const errors = validateNotificationSettings({
      ...DEFAULT_SPONSOR_NOTIFICATION_SETTINGS,
      channels: {
        ...DEFAULT_SPONSOR_NOTIFICATION_SETTINGS.channels,
        email: true,
        webhook: true,
      },
      emailAddress: "not-an-email",
      webhookUrl: "http://insecure.example.com/hook",
    });

    expect(errors.emailAddress).toBeDefined();
    expect(errors.webhookUrl).toBeDefined();
    expect(isValidWebhookUrl("https://hooks.example.com/esg")).toBe(true);
    expect(isValidWebhookUrl("http://hooks.example.com/esg")).toBe(false);
  });

  it("validates Stellar Ed25519 public keys", () => {
    expect(isValidStellarPublicKey("")).toBe(true);
    expect(isValidStellarPublicKey("INVALID_KEY")).toBe(false);
    // Well-formed Stellar Ed25519 public key
    expect(
      isValidStellarPublicKey(
        "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H",
      ),
    ).toBe(true);
  });

  it("requires at least one channel and one milestone event when enabled", () => {
    const errors = validateNotificationSettings({
      ...DEFAULT_SPONSOR_NOTIFICATION_SETTINGS,
      channels: { inApp: false, email: false, webhook: false, push: false },
      events: {
        planting_verified: false,
        survival_check_passed: false,
        escrow_tranche_released: false,
        carbon_credits_minted: false,
      },
    });

    expect(errors.channels).toBeDefined();
    expect(errors.events).toBeDefined();
  });
});

describe("SponsorSettingsPage", () => {
  const initialAlert = createSampleMilestoneAlert("planting_verified");

  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        if (method === "PUT") {
          const parsed = JSON.parse(String(init?.body ?? "{}"));
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                settings: { ...parsed, updatedAt: new Date().toISOString() },
                message: "Notification settings saved successfully.",
              }),
          } as Response);
        }
        if (method === "POST") {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                alert: createSampleMilestoneAlert("planting_verified"),
                delivered: true,
                message: "Test planting milestone alert dispatched.",
              }),
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              settings: DEFAULT_SPONSOR_NOTIFICATION_SETTINGS,
              recentAlerts: [initialAlert],
            }),
        } as Response);
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("loads settings and renders notification controls and alert feed", async () => {
    render(<SponsorSettingsPage />);

    expect(screen.getByTestId("settings-loading")).toBeInTheDocument();

    await waitFor(() => {
      expect(
        screen.getByText("Sponsor Notification Settings"),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("switch", {
          name: /enable real-time milestone verification alerts/i,
        }),
      ).toHaveAttribute("aria-checked", "true");
    });

    expect(screen.getByTestId("milestone-alert-feed")).toBeInTheDocument();
  });

  it("shows accessible validation errors when saving invalid Stellar key or email", async () => {
    render(<SponsorSettingsPage />);

    await waitFor(() => {
      expect(screen.getByLabelText(/alert email address/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/alert email address/i), {
      target: { value: "invalid-email" },
    });
    fireEvent.change(screen.getByLabelText(/stellar benefactor public key/i), {
      target: { value: "BAD_STELLAR_KEY" },
    });

    fireEvent.click(
      screen.getByRole("button", { name: /save notification settings/i }),
    );

    await waitFor(() => {
      expect(
        screen.getByText(/enter a valid email address/i),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/enter a valid stellar ed25519 public key/i),
      ).toBeInTheDocument();
    });
  });

  it("saves valid settings and displays accessible confirmation banner", async () => {
    render(<SponsorSettingsPage />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /save notification settings/i }),
      ).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole("button", { name: /save notification settings/i }),
    );

    await waitFor(() => {
      const banner = screen.getByTestId("notification-status-banner");
      expect(banner).toHaveTextContent(
        /notification settings saved successfully/i,
      );
    });
  });

  it("dispatches a test planting milestone alert and prepends it to the feed", async () => {
    render(<SponsorSettingsPage />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /send test alert/i }),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /send test alert/i }));

    await waitFor(() => {
      expect(screen.getByTestId("notification-status-banner")).toHaveTextContent(
        /test planting milestone alert dispatched/i,
      );
      expect(screen.getByText("2 alerts")).toBeInTheDocument();
    });
  });

  it("falls back gracefully with console.warn when API is unreachable", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("Network offline"))),
    );

    render(<SponsorSettingsPage />);

    await waitFor(() => {
      expect(screen.getByTestId("notification-status-banner")).toHaveTextContent(
        /using locally cached notification preferences/i,
      );
    });

    expect(warnSpy).toHaveBeenCalled();
  });
});
