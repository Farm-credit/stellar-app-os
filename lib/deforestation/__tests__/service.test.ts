import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { sendDeforestationAlertEmail } from '@/lib/email/sendgrid';
import { createMockDeforestationProvider } from '../providers/mock-provider';
import {
  ensureDeforestationAlertsSeeded,
  getAllAlerts,
  getProjectAlerts,
  pullDeforestationAlerts,
  resetDeforestationService,
} from '../service';
import type { DeforestationProvider, MonitoredZone } from '../types';
import type * as ProviderModule from '../provider';
import { pointInPolygon } from '../geometry';

vi.mock('@/lib/email/sendgrid', () => ({
  sendDeforestationAlertEmail: vi.fn(() => Promise.resolve(1)),
}));

/** Per-test override for the provider chosen by the service. */
const overrides = vi.hoisted(() => ({
  primary: null as DeforestationProvider | null,
}));

vi.mock('../provider', async (importOriginal) => {
  const actual = await importOriginal<typeof ProviderModule>();
  return {
    ...actual,
    getDeforestationProvider: () => overrides.primary ?? actual.getDeforestationProvider(),
  };
});

const TEST_ZONE: MonitoredZone = {
  zoneId: 'zone-test-1',
  projectId: 'proj-test',
  projectName: 'Test Forest Project',
  areaHectares: 1000,
  polygon: [
    [0, 0],
    [0.1, 0],
    [0.1, 0.1],
    [0, 0.1],
    [0, 0],
  ],
  center: [0.05, 0.05],
};

const FIXED_NOW = new Date('2026-10-23T12:00:00.000Z');

const emailMock = vi.mocked(sendDeforestationAlertEmail);

describe('Deforestation alert service (Issue #672)', () => {
  beforeEach(() => {
    resetDeforestationService();
    emailMock.mockClear();
    emailMock.mockResolvedValue(1);
    overrides.primary = null;
    delete process.env.GFW_API_KEY;
    delete process.env.DEFORESTATION_ALERT_EMAILS;
    delete process.env.ADMIN_ALERT_EMAIL;
  });

  afterEach(() => {
    resetDeforestationService();
    overrides.primary = null;
    delete process.env.GFW_API_KEY;
    delete process.env.DEFORESTATION_ALERT_EMAILS;
    delete process.env.ADMIN_ALERT_EMAIL;
  });

  it('stores new alerts with a highlightable affected area and dedupes repeat pulls', async () => {
    const provider = createMockDeforestationProvider({ now: () => FIXED_NOW });

    const first = await pullDeforestationAlerts({
      provider,
      zones: [TEST_ZONE],
      notify: false,
      now: FIXED_NOW,
    });

    expect(first.errors).toEqual([]);
    expect(first.newAlertCount).toBeGreaterThan(0);

    const stored = getProjectAlerts('proj-test');
    expect(stored).toHaveLength(first.newAlertCount);

    const alert = stored[0];
    expect(alert.zoneId).toBe(TEST_ZONE.zoneId);
    expect(alert.source).toBe('mock');
    expect(alert.detectedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(alert.notified).toBe(false);
    // Affected area is a closed ring containing the detection point.
    expect(alert.affectedAreaPolygon[0]).toEqual(
      alert.affectedAreaPolygon[alert.affectedAreaPolygon.length - 1]
    );
    expect(pointInPolygon(alert.coordinates, alert.affectedAreaPolygon)).toBe(true);

    // Same provider again → nothing new, no duplicate notifications.
    const second = await pullDeforestationAlerts({
      provider,
      zones: [TEST_ZONE],
      notify: true,
      now: FIXED_NOW,
    });
    expect(second.newAlertCount).toBe(0);
    expect(getProjectAlerts('proj-test')).toHaveLength(first.newAlertCount);
  });

  it('emails resolved recipients once per new alert', async () => {
    process.env.DEFORESTATION_ALERT_EMAILS = 'pm@example.org, ops@example.org';
    const provider = createMockDeforestationProvider({ now: () => FIXED_NOW });

    const summary = await pullDeforestationAlerts({
      provider,
      zones: [TEST_ZONE],
      notify: true,
      now: FIXED_NOW,
    });

    expect(summary.newAlertCount).toBeGreaterThan(0);
    expect(emailMock).toHaveBeenCalledTimes(summary.newAlertCount);
    expect(emailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        recipients: ['pm@example.org', 'ops@example.org'],
        projectName: TEST_ZONE.projectName,
        projectId: TEST_ZONE.projectId,
        detectedOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        source: 'GFW satellite alert feed (mock)',
        linkUrl: `/projects/${TEST_ZONE.projectId}`,
      })
    );
    expect(getProjectAlerts('proj-test').every((a) => a.notified)).toBe(true);

    // Repeat pull → no re-notification.
    await pullDeforestationAlerts({ provider, zones: [TEST_ZONE], notify: true, now: FIXED_NOW });
    expect(emailMock).toHaveBeenCalledTimes(summary.newAlertCount);
  });

  it('falls back to the mock feed when the primary provider fails', async () => {
    overrides.primary = {
      name: 'gfw',
      fetchAlerts: () => Promise.reject(new Error('GFW API 503: unavailable')),
    } satisfies DeforestationProvider;

    const summary = await pullDeforestationAlerts({
      zones: [TEST_ZONE],
      notify: false,
      now: FIXED_NOW,
    });

    expect(summary.usedFallback).toBe(true);
    expect(summary.provider).toBe('mock');
    expect(summary.newAlertCount).toBeGreaterThan(0);
    expect(summary.errors).toHaveLength(1);
    expect(summary.errors[0]).toContain('GFW API 503');
  });

  it('does not apply fallback when a provider was injected explicitly', async () => {
    const failing: DeforestationProvider = {
      name: 'gfw',
      fetchAlerts: () => Promise.reject(new Error('boom')),
    };

    const summary = await pullDeforestationAlerts({
      provider: failing,
      zones: [TEST_ZONE],
      notify: false,
      now: FIXED_NOW,
    });

    expect(summary.usedFallback).toBe(false);
    expect(summary.newAlertCount).toBe(0);
    expect(summary.errors).toHaveLength(1);
  });

  it('seeds the store for reads without notifying anyone', async () => {
    await ensureDeforestationAlertsSeeded();
    expect(getAllAlerts().length).toBeGreaterThan(0);
    expect(emailMock).not.toHaveBeenCalled();

    // Seeding is a one-time guard.
    const count = getAllAlerts().length;
    await ensureDeforestationAlertsSeeded();
    expect(getAllAlerts()).toHaveLength(count);
  });

  it('never seeds from the mock feed when a real GFW key is configured', async () => {
    process.env.GFW_API_KEY = 'test-key';
    await ensureDeforestationAlertsSeeded();
    expect(getAllAlerts()).toHaveLength(0);
  });
});
