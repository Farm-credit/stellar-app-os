import { beforeEach, describe, expect, it, vi } from 'vitest';

const { verifyPlanterJwt, createPhotoUploadUrl } = vi.hoisted(() => ({
  verifyPlanterJwt: vi.fn(),
  createPhotoUploadUrl: vi.fn(),
}));
vi.mock('@/lib/auth/jwt', () => ({ verifyPlanterJwt }));
vi.mock('@/lib/aws/s3', () => ({
  createPhotoUploadUrl,
  getPhotoExtension: (type: string) =>
    (({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }) as Record<string, string>)[
      type
    ],
}));
vi.mock('@/lib/logger', () => ({ default: { info: vi.fn(), error: vi.fn() } }));

import { POST } from './route';

function request(body: unknown, authorization = 'Bearer valid'): Request {
  return new Request('http://localhost/api/planters/photo-upload-url', {
    method: 'POST',
    headers: { authorization, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('tree photo signed uploads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyPlanterJwt.mockResolvedValue({ sub: 'GPLANTER', role: 'planter' });
    createPhotoUploadUrl.mockResolvedValue('https://s3.example/signed');
  });

  it('requires authentication', async () => {
    expect((await POST(request({}, '') as never)).status).toBe(401);
    verifyPlanterJwt.mockResolvedValueOnce(null);
    expect((await POST(request({}) as never)).status).toBe(401);
  });

  it('returns a signed PUT URL and safe server-generated key', async () => {
    const response = await POST(
      request({ treeId: 'TREE-818', contentType: 'image/jpeg', contentLength: 1024 }) as never
    );
    const result = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(result.key).toMatch(/^tree-photo-evidence\/GPLANTER\/TREE-818\/.+\.jpg$/);
    expect(result).toMatchObject({
      uploadUrl: 'https://s3.example/signed',
      expiresIn: 300,
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg', 'Content-Length': '1024' },
    });
    expect(createPhotoUploadUrl).toHaveBeenCalledWith(expect.objectContaining({ key: result.key }));
  });

  it('rejects unsafe keys, unsupported types, and oversized photos', async () => {
    expect(
      (
        await POST(
          request({ treeId: '../x', contentType: 'image/jpeg', contentLength: 1 }) as never
        )
      ).status
    ).toBe(400);
    expect(
      (
        await POST(
          request({ treeId: 'TREE', contentType: 'image/svg+xml', contentLength: 1 }) as never
        )
      ).status
    ).toBe(415);
    expect(
      (
        await POST(
          request({
            treeId: 'TREE',
            contentType: 'image/png',
            contentLength: 5 * 1024 * 1024 + 1,
          }) as never
        )
      ).status
    ).toBe(413);
    expect(createPhotoUploadUrl).not.toHaveBeenCalled();
  });

  it('does not leak AWS errors', async () => {
    createPhotoUploadUrl.mockRejectedValueOnce(new Error('AWS secret detail'));
    const response = await POST(
      request({ treeId: 'TREE', contentType: 'image/webp', contentLength: 10 }) as never
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'Photo upload is temporarily unavailable' });
  });
});
