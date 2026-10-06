import { describe, expect, it, vi } from 'vitest';

const { mockBaseGET, mockBasePOST } = vi.hoisted(() => ({
  mockBaseGET: vi.fn().mockResolvedValue(new Response('mocked-response')),
  mockBasePOST: vi.fn().mockResolvedValue(new Response('mocked-post-response')),
}));

vi.mock('@/app/api/tax-forms/1099/route', () => ({
  GET: mockBaseGET,
  POST: mockBasePOST,
}));

import { GET, POST } from '../route';

describe('Admin 1099 route', () => {
  it('supplies default year and csv format when Accept: text/csv is provided', async () => {
    const req = new Request('http://localhost:3000/api/admin/tax-forms/1099', {
      headers: {
        Accept: 'text/csv',
        Authorization: 'Bearer test-token',
      },
    });

    await GET(req as any);

    expect(mockBaseGET).toHaveBeenCalled();
    const passedReq = mockBaseGET.mock.calls[0][0];
    const url = new URL(passedReq.url);
    expect(url.searchParams.get('format')).toBe('csv');
    expect(url.searchParams.get('type')).toBe('1099-NEC');
    expect(url.searchParams.get('year')).toBe(String(new Date().getUTCFullYear()));
  });

  it('delegates POST requests to base POST', async () => {
    const req = new Request('http://localhost:3000/api/admin/tax-forms/1099', {
      method: 'POST',
      body: JSON.stringify({ year: 2025 }),
    });

    await POST(req as any);
    expect(mockBasePOST).toHaveBeenCalled();
  });
});
