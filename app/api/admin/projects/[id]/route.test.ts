import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/admin', () => ({ isAdminRequest: vi.fn() }));
vi.mock('@/lib/db/client', () => ({ getPool: () => ({ mockedPool: true }) }));
vi.mock('@/lib/admin/projectsRepository', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    updateAdminProject: vi.fn(),
  };
});
vi.mock('@/lib/webhook/offset-verification-bridge', () => ({
  notifyProjectApproved: vi.fn(() => Promise.resolve([])),
  notifyProjectStatusChanged: vi.fn(() => Promise.resolve([])),
  notifyPriceChanged: vi.fn(() => Promise.resolve([])),
}));

import { updateAdminProject } from '@/lib/admin/projectsRepository';
import { isAdminRequest } from '@/lib/auth/admin';
import {
  notifyPriceChanged,
  notifyProjectApproved,
  notifyProjectStatusChanged,
} from '@/lib/webhook/offset-verification-bridge';
import { PATCH } from './route';

const mockedAdmin = vi.mocked(isAdminRequest);
const mockedUpdate = vi.mocked(updateAdminProject);
const mockedApproved = vi.mocked(notifyProjectApproved);
const mockedStatus = vi.mocked(notifyProjectStatusChanged);
const mockedPrice = vi.mocked(notifyPriceChanged);

const BASE_PROJECT = {
  id: 'proj-002',
  slug: 'texas-wind-energy-farm',
  name: 'Wind Energy Farm - Texas',
  description: 'Wind generation',
  type: 'Renewable Energy' as const,
  region: 'Texas',
  country: 'United States',
  standard: 'Gold Standard',
  methodology: 'ACM0002',
  registryProjectId: 'GS-11829',
  expectedAnnualTonnes: 1325,
  pricePerTonUsd: 37.9,
  availableSupplyTons: 980.6,
  totalIssuedTons: 1540.2,
  lifecycleStatus: 'Under Review' as const,
  verificationEnabled: false,
  verificationNotes: '',
  updatedBy: 'C. Lee',
  updatedAt: '2026-02-03T12:20:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedAdmin.mockResolvedValue(true);
});

describe('PATCH /api/admin/projects/[id]', () => {
  it('returns 401 when caller is not admin and 400 on invalid status', async () => {
    mockedAdmin.mockResolvedValueOnce(false);
    const unauth = await PATCH(
      new Request('https://app.example/api/admin/projects/proj-002', {
        method: 'PATCH',
        body: JSON.stringify({ lifecycleStatus: 'Approved' }),
      }),
      { params: Promise.resolve({ id: 'proj-002' }) }
    );
    expect(unauth.status).toBe(401);

    const invalid = await PATCH(
      new Request('https://app.example/api/admin/projects/proj-002', {
        method: 'PATCH',
        body: JSON.stringify({ lifecycleStatus: 'Rejected' }),
      }),
      { params: Promise.resolve({ id: 'proj-002' }) }
    );
    expect(invalid.status).toBe(400);
  });

  it('emits both project.approved and project.status.changed on Under Review -> Approved', async () => {
    mockedUpdate.mockResolvedValueOnce({
      previous: BASE_PROJECT,
      updated: {
        ...BASE_PROJECT,
        lifecycleStatus: 'Approved',
        updatedAt: '2026-02-04T10:00:00.000Z',
      },
    });

    const res = await PATCH(
      new Request('https://app.example/api/admin/projects/proj-002', {
        method: 'PATCH',
        body: JSON.stringify({ lifecycleStatus: 'Approved', updatedBy: 'Admin Jane' }),
      }),
      { params: Promise.resolve({ id: 'proj-002' }) }
    );
    expect(res.status).toBe(200);
    expect(mockedStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'proj-002',
        previousStatus: 'Under Review',
        newStatus: 'Approved',
      })
    );
    expect(mockedApproved).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'proj-002',
        approvedBy: 'Admin Jane',
      })
    );
  });

  it('emits only project.status.changed for non-Approved transitions and emits nothing on no-ops', async () => {
    mockedUpdate.mockResolvedValueOnce({
      previous: { ...BASE_PROJECT, lifecycleStatus: 'Approved' },
      updated: { ...BASE_PROJECT, lifecycleStatus: 'Paused' },
    });

    await PATCH(
      new Request('https://app.example/api/admin/projects/proj-002', {
        method: 'PATCH',
        body: JSON.stringify({ lifecycleStatus: 'Paused' }),
      }),
      { params: Promise.resolve({ id: 'proj-002' }) }
    );
    expect(mockedStatus).toHaveBeenCalledTimes(1);
    expect(mockedApproved).not.toHaveBeenCalled();

    vi.clearAllMocks();
    mockedUpdate.mockResolvedValueOnce({
      previous: { ...BASE_PROJECT, lifecycleStatus: 'Approved' },
      updated: { ...BASE_PROJECT, lifecycleStatus: 'Approved' },
    });
    await PATCH(
      new Request('https://app.example/api/admin/projects/proj-002', {
        method: 'PATCH',
        body: JSON.stringify({ lifecycleStatus: 'Approved' }),
      }),
      { params: Promise.resolve({ id: 'proj-002' }) }
    );
    expect(mockedStatus).not.toHaveBeenCalled();
    expect(mockedApproved).not.toHaveBeenCalled();
    expect(mockedPrice).not.toHaveBeenCalled();
  });
});
