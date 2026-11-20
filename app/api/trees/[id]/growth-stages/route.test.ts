import { beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from './route';
import { resetGrowthStageStore } from '@/lib/tree-growth/stages';

describe('/api/trees/[id]/growth-stages', () => {
  beforeEach(() => {
    resetGrowthStageStore();
  });

  it('GET returns current stage and chronological photo timeline', async () => {
    const req = new NextRequest('http://localhost:3000/api/trees/tree-1/growth-stages');
    const res = await GET(req, { params: Promise.resolve({ id: 'tree-1' }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(['sapling', 'juvenile', 'mature']).toContain(data.currentStage);
    expect(Array.isArray(data.photos)).toBe(true);
    expect(data.photos.length).toBeGreaterThan(0);
  });

  it('POST uploads a stage photo and notifies sponsor on stage transition', async () => {
    const req = new NextRequest('http://localhost:3000/api/trees/tree-custom/growth-stages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stage: 'juvenile',
        imageUrl: 'https://example.com/juvenile.jpg',
        uploadedBy: 'Field Team Alpha',
        caption: 'Reached juvenile stage',
        heightCm: 175,
        sponsorId: 'sponsor-42',
      }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: 'tree-custom' }) });
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.currentStage).toBe('juvenile');
    expect(data.transitioned).toBe(true);
    expect(data.notification).toBeTruthy();
    expect(data.notification.sponsorId).toBe('sponsor-42');
  });

  it('POST returns 400 for invalid growth stage', async () => {
    const req = new NextRequest('http://localhost:3000/api/trees/tree-custom/growth-stages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stage: 'ancient',
        imageUrl: 'https://example.com/photo.jpg',
        uploadedBy: 'Field Team Alpha',
      }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: 'tree-custom' }) });
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
  });
});
