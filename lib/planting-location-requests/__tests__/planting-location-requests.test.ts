import { describe, expect, it, vi } from 'vitest';
import { getMockPlantingLocations } from '@/lib/api/mock/plantingLocations';
import {
  buildLocationRequestNotification,
  createLocationRequestSchema,
  matchLocationRequestSchema,
  notifySponsorOfLocationDecision,
  resolveRegionGroup,
  suggestMatchingZones,
  type PlantingLocationRequest,
} from '@/lib/planting-location-requests';

const SAMPLE_REQUEST: PlantingLocationRequest = {
  id: 'locreq_test_1',
  sponsorId: 'GA7TEST',
  sponsorName: 'Ada Lovelace',
  sponsorEmail: 'ada@example.org',
  transactionRef: 'tx_abc123',
  treeCount: 10,
  preferredRegion: 'Sub-Saharan Africa',
  preferredCountry: 'Nigeria',
  preferenceNotes: 'Prefer savanna species',
  status: 'pending',
  assignedLocationId: null,
  assignedZoneName: null,
  assignedRegion: null,
  adminNotes: null,
  reviewedBy: null,
  reviewedAt: null,
  notifiedAt: null,
  createdAt: '2026-11-25T00:00:00.000Z',
  updatedAt: '2026-11-25T00:00:00.000Z',
};

describe('planting-location-requests domain logic', () => {
  describe('schemas', () => {
    it('validates a well-formed location request', () => {
      const parsed = createLocationRequestSchema.safeParse({
        sponsorName: 'Ada Lovelace',
        sponsorEmail: 'ada@example.org',
        treeCount: 15,
        preferredRegion: 'Sub-Saharan Africa',
        preferredCountry: 'Nigeria',
      });
      expect(parsed.success).toBe(true);
    });

    it('rejects missing email or short preferred region', () => {
      const parsed = createLocationRequestSchema.safeParse({
        sponsorEmail: 'not-an-email',
        treeCount: 0,
        preferredRegion: 'A',
      });
      expect(parsed.success).toBe(false);
    });

    it('validates admin match payload', () => {
      const parsed = matchLocationRequestSchema.safeParse({
        locationId: 1,
        resolution: 'confirmed',
        adminNotes: 'Matched to Kano Savanna Restoration',
      });
      expect(parsed.success).toBe(true);
    });
  });

  describe('resolveRegionGroup & suggestMatchingZones', () => {
    it('maps known countries to their region group', () => {
      expect(resolveRegionGroup('Nigeria')).toBe('Sub-Saharan Africa');
      expect(resolveRegionGroup('Brazil')).toBe('Latin America');
      expect(resolveRegionGroup('Indonesia')).toBe('Southeast Asia');
      expect(resolveRegionGroup('Atlantis')).toBeNull();
    });

    it('ranks exact country/region matches ahead of alternatives', () => {
      const zones = getMockPlantingLocations();
      const suggestions = suggestMatchingZones('Sub-Saharan Africa', 'Nigeria', 20, zones);

      expect(suggestions.length).toBe(zones.length);
      expect(suggestions[0].location.name).toBe('Kano Savanna Restoration');
      expect(suggestions[0].isExactMatch).toBe(true);
      expect(suggestions[0].hasSufficientCapacity).toBe(true);
    });

    it('suggests alternative zones with capacity when requested region has no match', () => {
      const zones = getMockPlantingLocations();
      const suggestions = suggestMatchingZones('Antarctica', 'Antarctica', 5, zones);

      expect(suggestions.every((s) => !s.isExactMatch)).toBe(true);
      expect(suggestions[0].hasSufficientCapacity).toBe(true);
      expect(suggestions[0].matchReason).toContain('Alternative planting zone');
    });

    it('penalizes zones without sufficient capacity', () => {
      const zones = getMockPlantingLocations();
      const suggestions = suggestMatchingZones('Europe', 'Spain', 50000, zones);

      const med = suggestions.find((s) => s.location.name === 'Mediterranean Dryland Restoration');
      expect(med?.hasSufficientCapacity).toBe(false);
      expect(med?.matchReason).toContain('insufficient capacity');
    });
  });

  describe('notifications', () => {
    it('builds confirmation email for matched location', () => {
      const notification = buildLocationRequestNotification({
        request: SAMPLE_REQUEST,
        assignedZoneName: 'Kano Savanna Restoration',
        assignedRegion: 'Sub-Saharan Africa',
        resolution: 'confirmed',
        adminNotes: 'Scheduled for next rainy season batch.',
      });

      expect(notification.subject).toContain('confirmed');
      expect(notification.subject).toContain('Kano Savanna Restoration');
      expect(notification.text).toContain('Nigeria (Sub-Saharan Africa)');
      expect(notification.text).toContain('Scheduled for next rainy season batch.');
      expect(notification.html).toContain('Planting Location Confirmed');
    });

    it('builds alternative assignment email when preferred zone is unavailable', () => {
      const notification = buildLocationRequestNotification({
        request: {
          ...SAMPLE_REQUEST,
          preferredRegion: 'Northern Europe',
          preferredCountry: 'Norway',
        },
        assignedZoneName: 'Mediterranean Dryland Restoration',
        assignedRegion: 'Europe',
        resolution: 'alternative_assigned',
        adminNotes: 'No active boreal project this quarter.',
      });

      expect(notification.subject).toContain('assigned to Mediterranean Dryland Restoration');
      expect(notification.text).toContain('alternative planting zone');
      expect(notification.html).toContain('Alternative Planting Zone Assigned');
    });

    it('dispatches notification via email sender callback', async () => {
      const sendEmail = vi.fn().mockResolvedValue(undefined);
      const result = await notifySponsorOfLocationDecision(
        {
          request: SAMPLE_REQUEST,
          assignedZoneName: 'Kano Savanna Restoration',
          assignedRegion: 'Sub-Saharan Africa',
          resolution: 'confirmed',
        },
        sendEmail
      );

      expect(sendEmail).toHaveBeenCalledTimes(1);
      expect(sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'ada@example.org',
          subject: expect.stringContaining('Kano Savanna Restoration'),
        })
      );
      expect(result.emailSent).toBe(true);
      expect(result.sentAt).toBeTruthy();
    });
  });
});
