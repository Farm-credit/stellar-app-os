import { beforeEach, describe, expect, it } from 'vitest';
import { GET, POST } from './route';
import { resetInMemoryLocationRequests } from '@/lib/planting-location-requests';

describe('/api/planting-location-requests', () => {
  beforeEach(() => {
    delete process.env.DATABASE_URL;
    resetInMemoryLocationRequests(false);
  });

  it('creates a pending location request on POST', async () => {
    const request = new Request('http://localhost/api/planting-location-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sponsorName: 'Maya Lin',
        sponsorEmail: 'maya@example.org',
        transactionRef: 'tx_12345',
        treeCount: 12,
        preferredRegion: 'Latin America',
        preferredCountry: 'Brazil',
        preferenceNotes: 'Atlantic corridor if available',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.request.status).toBe('pending');
    expect(data.request.preferredRegion).toBe('Latin America');
    expect(data.request.preferredCountry).toBe('Brazil');
    expect(data.request.treeCount).toBe(12);
  });

  it('returns 400 when validation fails', async () => {
    const request = new Request('http://localhost/api/planting-location-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sponsorEmail: 'invalid-email',
        treeCount: -1,
        preferredRegion: '',
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('returns sponsor requests filtered by email on GET', async () => {
    await POST(
      new Request('http://localhost/api/planting-location-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sponsorEmail: 'sponsor1@example.org',
          transactionRef: 'tx_one',
          treeCount: 5,
          preferredRegion: 'Sub-Saharan Africa',
        }),
      })
    );

    const response = await GET(
      new Request('http://localhost/api/planting-location-requests?email=sponsor1@example.org')
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.totalCount).toBe(1);
    expect(data.requests[0].transactionRef).toBe('tx_one');
  });

  it('returns 400 on GET when neither email nor transactionRef is supplied', async () => {
    const response = await GET(new Request('http://localhost/api/planting-location-requests'));
    expect(response.status).toBe(400);
  });
});
