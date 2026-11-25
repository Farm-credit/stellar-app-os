import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockIsAdminRequest = vi.fn<() => Promise<boolean>>();

vi.mock('@/lib/auth/admin', () => ({
  isAdminRequest: () => mockIsAdminRequest(),
}));

import { GET } from './route';
import { PATCH } from './[id]/route';
import {
  createLocationRequest,
  resetInMemoryLocationRequests,
} from '@/lib/planting-location-requests';

describe('/api/admin/planting-location-requests', () => {
  beforeEach(() => {
    delete process.env.DATABASE_URL;
    delete process.env.SENDGRID_API_KEY;
    resetInMemoryLocationRequests(true);
    mockIsAdminRequest.mockReset();
  });

  it('rejects unauthenticated GET requests with 401', async () => {
    mockIsAdminRequest.mockResolvedValue(false);
    const response = await GET(
      new Request('http://localhost/api/admin/planting-location-requests')
    );
    expect(response.status).toBe(401);
  });

  it('lists location requests with ranked zone suggestions for admins', async () => {
    mockIsAdminRequest.mockResolvedValue(true);
    const response = await GET(
      new Request('http://localhost/api/admin/planting-location-requests?status=pending')
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.requests.length).toBeGreaterThan(0);
    expect(data.availableZones.length).toBeGreaterThan(0);
    expect(data.requests[0].suggestions.length).toBeGreaterThan(0);
    expect(data.summary.pending).toBe(data.requests.length);
  });

  it('confirms a matching zone and notifies the sponsor via PATCH', async () => {
    mockIsAdminRequest.mockResolvedValue(true);
    const created = await createLocationRequest({
      sponsorName: 'Chioma Eze',
      sponsorEmail: 'chioma@example.org',
      treeCount: 20,
      preferredRegion: 'Sub-Saharan Africa',
      preferredCountry: 'Nigeria',
    });

    const response = await PATCH(
      new Request(`http://localhost/api/admin/planting-location-requests/${created.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locationId: 1,
          resolution: 'confirmed',
          adminNotes: 'Matched to Kano Savanna Restoration.',
        }),
      }),
      { params: Promise.resolve({ id: created.id }) }
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.request.status).toBe('confirmed');
    expect(data.request.assignedZoneName).toBe('Kano Savanna Restoration');
    expect(data.request.notifiedAt).toBeTruthy();
    expect(data.notification.to).toBe('chioma@example.org');
    expect(data.notification.status).toBe('confirmed');
  });

  it('assigns an alternative zone and notifies the sponsor via PATCH', async () => {
    mockIsAdminRequest.mockResolvedValue(true);
    const created = await createLocationRequest({
      sponsorName: 'Sven Lindqvist',
      sponsorEmail: 'sven@example.org',
      treeCount: 10,
      preferredRegion: 'Scandinavia',
      preferredCountry: 'Sweden',
    });

    const response = await PATCH(
      new Request(`http://localhost/api/admin/planting-location-requests/${created.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locationId: 7,
          resolution: 'alternative_assigned',
          adminNotes: 'Assigned our active Mediterranean European zone.',
        }),
      }),
      { params: Promise.resolve({ id: created.id }) }
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.request.status).toBe('alternative_assigned');
    expect(data.request.assignedZoneName).toBe('Mediterranean Dryland Restoration');
    expect(data.notification.status).toBe('alternative_assigned');
    expect(data.notification.text).toContain('alternative planting zone');
  });

  it('returns 409 when selected zone has insufficient capacity', async () => {
    mockIsAdminRequest.mockResolvedValue(true);
    const created = await createLocationRequest({
      sponsorName: 'Big Corp',
      sponsorEmail: 'esg@bigcorp.org',
      treeCount: 99999,
      preferredRegion: 'Europe',
    });

    const response = await PATCH(
      new Request(`http://localhost/api/admin/planting-location-requests/${created.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locationId: 7,
          resolution: 'confirmed',
        }),
      }),
      { params: Promise.resolve({ id: created.id }) }
    );

    expect(response.status).toBe(409);
  });

  it('returns 401 on PATCH when user is not an admin', async () => {
    mockIsAdminRequest.mockResolvedValue(false);
    const response = await PATCH(
      new Request('http://localhost/api/admin/planting-location-requests/locreq_seed_1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locationId: 1, resolution: 'confirmed' }),
      }),
      { params: Promise.resolve({ id: 'locreq_seed_1' }) }
    );

    expect(response.status).toBe(401);
  });
});
