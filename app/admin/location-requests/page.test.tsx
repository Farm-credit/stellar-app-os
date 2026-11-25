import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AdminLocationRequestsPage from './page';

const MOCK_RESPONSE = {
  requests: [
    {
      id: 'locreq_1',
      sponsorId: 'GA7TEST',
      sponsorName: 'Amara Okafor',
      sponsorEmail: 'amara@example.org',
      transactionRef: 'tx_kano_001',
      treeCount: 25,
      preferredRegion: 'Sub-Saharan Africa',
      preferredCountry: 'Nigeria',
      preferenceNotes: 'Prefer savanna trees',
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
      suggestions: [
        {
          location: {
            id: 1,
            name: 'Kano Savanna Restoration',
            description: 'Sahelian savanna in northern Nigeria',
            latitude: 12.0022,
            longitude: 8.5911,
            region: 'Sub-Saharan Africa',
            climate: 'Arid',
            species: ['acacia', 'moringa'],
            availableCapacity: 15000,
          },
          isExactMatch: true,
          hasSufficientCapacity: true,
          score: 123,
          matchReason: 'Matches preferred country/area (Nigeria)',
        },
      ],
    },
  ],
  availableZones: [
    {
      id: 1,
      name: 'Kano Savanna Restoration',
      description: 'Sahelian savanna in northern Nigeria',
      latitude: 12.0022,
      longitude: 8.5911,
      region: 'Sub-Saharan Africa',
      climate: 'Arid',
      species: ['acacia', 'moringa'],
      availableCapacity: 15000,
    },
  ],
  summary: {
    total: 1,
    pending: 1,
    confirmed: 0,
    alternativeAssigned: 0,
  },
};

describe('AdminLocationRequestsPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('loads pending requests and allows admin to confirm a zone and notify sponsor', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_RESPONSE),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            message:
              'Confirmed "Kano Savanna Restoration" for amara@example.org and notified sponsor.',
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            ...MOCK_RESPONSE,
            requests: [
              {
                ...MOCK_RESPONSE.requests[0],
                status: 'confirmed',
                assignedLocationId: 1,
                assignedZoneName: 'Kano Savanna Restoration',
                assignedRegion: 'Sub-Saharan Africa',
                notifiedAt: '2026-11-25T01:00:00.000Z',
              },
            ],
            summary: { total: 1, pending: 0, confirmed: 1, alternativeAssigned: 0 },
          }),
      });

    vi.stubGlobal('fetch', fetchMock);

    render(<AdminLocationRequestsPage />);

    await waitFor(() => {
      expect(screen.getByText('Amara Okafor')).toBeInTheDocument();
    });

    const confirmButton = screen.getByRole('button', { name: /confirm & notify/i });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(
        screen.getByText(/Confirmed "Kano Savanna Restoration" for amara@example.org/i)
      ).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/planting-location-requests/locreq_1',
      expect.objectContaining({
        method: 'PATCH',
      })
    );
  });
});
