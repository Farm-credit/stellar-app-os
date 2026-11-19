import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { sendDeforestationAlertEmail } from '@/lib/email/sendgrid';
import { resetDeforestationService } from '@/lib/deforestation/service';
import { GET } from './alerts/route';
import { POST } from './pull/route';

vi.mock('@/lib/email/sendgrid', () => ({
  sendDeforestationAlertEmail: vi.fn(() => Promise.resolve(1)),
}));

const emailMock = vi.mocked(sendDeforestationAlertEmail);

describe('Deforestation alert API routes (Issue #672)', () => {
  beforeEach(() => {
    resetDeforestationService();
    emailMock.mockClear();
    emailMock.mockResolvedValue(1);
    delete process.env.GFW_API_KEY;
    process.env.DEFORESTATION_ALERT_EMAILS = 'pm@example.org';
  });

  describe('GET /api/deforestation/alerts', () => {
    it('returns seeded alerts for monitored zones', async () => {
      const res = await GET(new NextRequest('http://localhost:3000/api/deforestation/alerts'));
      expect(res.status).toBe(200);

      const data = (await res.json()) as {
        alerts: Array<{ projectId: string; affectedAreaPolygon: unknown }>;
        count: number;
      };
      expect(data.count).toBeGreaterThan(0);
      expect(data.alerts.length).toBe(data.count);
      // Every alert carries geometry for the map highlight.
      for (const alert of data.alerts) {
        expect(alert.projectId).toBeTruthy();
        expect(Array.isArray(alert.affectedAreaPolygon)).toBe(true);
      }
    });

    it('filters alerts by project', async () => {
      const res = await GET(
        new NextRequest('http://localhost:3000/api/deforestation/alerts?projectId=proj-001')
      );
      const data = (await res.json()) as { alerts: Array<{ projectId: string }>; count: number };
      expect(data.count).toBeGreaterThan(0);
      expect(data.alerts.every((a) => a.projectId === 'proj-001')).toBe(true);

      const empty = await GET(
        new NextRequest('http://localhost:3000/api/deforestation/alerts?projectId=nope')
      );
      const emptyData = (await empty.json()) as { count: number };
      expect(emptyData.count).toBe(0);
    });
  });

  describe('POST /api/deforestation/pull', () => {
    it('pulls alerts for all monitored zones and notifies recipients', async () => {
      const res = await POST(
        new NextRequest('http://localhost:3000/api/deforestation/pull', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        })
      );
      expect(res.status).toBe(200);

      const data = (await res.json()) as {
        success: boolean;
        summary: {
          provider: string;
          zonesChecked: number;
          newAlertCount: number;
          emailsSent: number;
          errors: string[];
        };
      };

      expect(data.success).toBe(true);
      expect(data.summary.provider).toBe('mock');
      expect(data.summary.zonesChecked).toBeGreaterThan(0);
      expect(data.summary.newAlertCount).toBeGreaterThan(0);
      expect(data.summary.errors).toEqual([]);
      expect(data.summary.emailsSent).toBe(data.summary.newAlertCount);
      expect(emailMock).toHaveBeenCalledTimes(data.summary.newAlertCount);
      expect(emailMock).toHaveBeenCalledWith(
        expect.objectContaining({ recipients: ['pm@example.org'] })
      );
    });

    it('records alerts without emailing when notify is false', async () => {
      const res = await POST(
        new NextRequest('http://localhost:3000/api/deforestation/pull', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notify: false }),
        })
      );
      const data = (await res.json()) as { summary: { emailsSent: number; newAlertCount: number } };
      expect(data.summary.newAlertCount).toBeGreaterThan(0);
      expect(data.summary.emailsSent).toBe(0);
      expect(emailMock).not.toHaveBeenCalled();
    });
  });
});
