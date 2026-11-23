import { describe, expect, it } from 'vitest';
import { GET } from './route';

describe('GET /api/farmer-guides', () => {
  it('returns the complete guide library and categories', async () => {
    const response = GET(new Request('http://localhost/api/farmer-guides'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.total).toBe(5);
    expect(body.categories).toContain('Certification');
  });

  it('searches guide content and applies a category filter', async () => {
    const response = GET(
      new Request('http://localhost/api/farmer-guides?q=prohibited-input&category=Certification')
    );
    const body = await response.json();

    expect(body.total).toBe(1);
    expect(body.guides[0].slug).toBe('certification-process');
  });
});
