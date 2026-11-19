/**
 * Route-level tests for the cooperative API — Issue #1431
 *
 * Exercises every handler end-to-end against the in-process cooperative
 * service: formation, membership, pooling and bargaining.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { resetCooperativeStore } from '@/lib/api/cooperatives';
import { GET as listGET, POST as createPOST } from '../route';
import { GET as detailGET } from '../[id]/route';
import {
  DELETE as membersDELETE,
  GET as membersGET,
  POST as membersPOST,
} from '../[id]/members/route';
import { DELETE as poolDELETE, GET as poolGET, POST as poolPOST } from '../[id]/pool/route';
import { GET as bargainingGET, POST as bargainingPOST } from '../[id]/bargaining/route';

const BASE = 'http://localhost/api/cooperatives';

function request(url: string, method = 'GET', body?: unknown): Request {
  return new Request(url, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function ctx(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

async function readJson(response: Response): Promise<any> {
  return response.json();
}

async function createCooperativeViaApi(
  overrides: Record<string, unknown> = {}
): Promise<string> {
  const response = await createPOST(
    request(BASE, 'POST', {
      name: 'Nairobi Grain Alliance',
      region: 'Kenya',
      founderId: 'farmer-founder',
      minMembersToBargain: 3,
      bargainingQuorumPercent: 60,
      ...overrides,
    })
  );
  expect(response.status).toBe(201);
  const json = await readJson(response);
  return json.cooperative.id as string;
}

async function seedActiveCoop(): Promise<string> {
  const id = await createCooperativeViaApi();
  await membersPOST(request(`${BASE}/${id}/members`, 'POST', { userId: 'farmer-2' }), ctx(id));
  await membersPOST(request(`${BASE}/${id}/members`, 'POST', { userId: 'farmer-3' }), ctx(id));
  await poolPOST(
    request(`${BASE}/${id}/pool`, 'POST', {
      projectId: 'proj-001',
      contributorId: 'farmer-founder',
      quantityTons: 600,
    }),
    ctx(id)
  );
  await poolPOST(
    request(`${BASE}/${id}/pool`, 'POST', {
      projectId: 'proj-005',
      contributorId: 'farmer-2',
      quantityTons: 400,
    }),
    ctx(id)
  );
  return id;
}

beforeEach(() => {
  resetCooperativeStore();
});

// ── /api/cooperatives ─────────────────────────────────────────────────────────

describe('GET/POST /api/cooperatives', () => {
  it('forms a cooperative and returns it in the list', async () => {
    const id = await createCooperativeViaApi();

    const listResponse = await listGET(request(BASE));
    expect(listResponse.status).toBe(200);
    const list = await readJson(listResponse);
    expect(list.success).toBe(true);
    expect(list.totalCount).toBe(1);
    expect(list.cooperatives[0]).toMatchObject({
      id,
      name: 'Nairobi Grain Alliance',
      region: 'Kenya',
      memberCount: 1,
      status: 'forming',
    });
  });

  it('applies region and memberId query filters', async () => {
    await createCooperativeViaApi({ region: 'Kenya' });
    await createCooperativeViaApi({ name: 'Ghana Cocoa Union', region: 'Ghana', founderId: 'gh-1' });

    const kenya = await readJson(await listGET(request(`${BASE}?region=Kenya`)));
    expect(kenya.totalCount).toBe(1);

    const member = await readJson(await listGET(request(`${BASE}?memberId=gh-1`)));
    expect(member.totalCount).toBe(1);
    expect(member.cooperatives[0].name).toBe('Ghana Cocoa Union');

    const none = await readJson(await listGET(request(`${BASE}?search=nothing`)));
    expect(none.totalCount).toBe(0);
  });

  it('rejects invalid cooperative payloads with 400', async () => {
    const response = await createPOST(request(BASE, 'POST', { name: 'ab', founderId: 'f1' }));
    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toMatchObject({
      success: false,
      code: 'invalid_request',
    });
  });

  it('rejects malformed JSON with 400', async () => {
    const response = await createPOST(
      new Request(BASE, { method: 'POST', body: 'not-json{' })
    );
    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toMatchObject({
      success: false,
      error: 'Invalid JSON body',
    });
  });
});

// ── /api/cooperatives/:id ─────────────────────────────────────────────────────

describe('GET /api/cooperatives/:id', () => {
  it('returns the cooperative with its bargaining terms', async () => {
    const id = await seedActiveCoop();
    const response = await detailGET(request(`${BASE}/${id}`), ctx(id));
    expect(response.status).toBe(200);

    const json = await readJson(response);
    expect(json.success).toBe(true);
    expect(json.cooperative.members).toHaveLength(3);
    expect(json.terms).toMatchObject({
      pooledQuantityTons: 1_000,
      discountPercent: 6,
      effectivePricePerTon: 38.82,
      meetsMemberMinimum: true,
    });
  });

  it('returns 404 for an unknown cooperative', async () => {
    const response = await detailGET(request(`${BASE}/coop-missing`), ctx('coop-missing'));
    expect(response.status).toBe(404);
    await expect(readJson(response)).resolves.toMatchObject({
      success: false,
      code: 'not_found',
    });
  });
});

// ── /api/cooperatives/:id/members ─────────────────────────────────────────────

describe('/api/cooperatives/:id/members', () => {
  it('lists members and lets admins add new ones', async () => {
    const id = await createCooperativeViaApi();

    const listed = await readJson(await membersGET(request(`${BASE}/${id}/members`), ctx(id)));
    expect(listed.memberCount).toBe(1);

    const added = await membersPOST(
      request(`${BASE}/${id}/members`, 'POST', { userId: 'farmer-2', name: 'Bola' }),
      ctx(id)
    );
    expect(added.status).toBe(201);
    const body = await readJson(added);
    expect(body.member).toMatchObject({ userId: 'farmer-2', name: 'Bola', role: 'member' });
    expect(body.memberCount).toBe(2);
  });

  it('returns 409 when adding a duplicate member', async () => {
    const id = await createCooperativeViaApi();
    await membersPOST(request(`${BASE}/${id}/members`, 'POST', { userId: 'farmer-2' }), ctx(id));

    const response = await membersPOST(
      request(`${BASE}/${id}/members`, 'POST', { userId: 'farmer-2' }),
      ctx(id)
    );
    expect(response.status).toBe(409);
    await expect(readJson(response)).resolves.toMatchObject({ code: 'conflict' });
  });

  it('removes a member via query string or body and validates the input', async () => {
    const id = await createCooperativeViaApi();
    await membersPOST(request(`${BASE}/${id}/members`, 'POST', { userId: 'farmer-2' }), ctx(id));

    const missing = await membersDELETE(request(`${BASE}/${id}/members`), ctx(id));
    expect(missing.status).toBe(400);

    const removed = await membersDELETE(
      request(`${BASE}/${id}/members?memberId=farmer-2`, 'DELETE'),
      ctx(id)
    );
    expect(removed.status).toBe(200);
    await expect(readJson(removed)).resolves.toMatchObject({
      success: true,
      cooperative: { members: [{ userId: 'farmer-founder' }] },
    });

    await membersPOST(request(`${BASE}/${id}/members`, 'POST', { userId: 'farmer-3' }), ctx(id));
    const removedViaBody = await membersDELETE(
      request(`${BASE}/${id}/members`, 'DELETE', { memberId: 'farmer-3' }),
      ctx(id)
    );
    expect(removedViaBody.status).toBe(200);
  });

  it('refuses to remove the founder with 409', async () => {
    const id = await createCooperativeViaApi();
    const response = await membersDELETE(
      request(`${BASE}/${id}/members?memberId=farmer-founder`, 'DELETE'),
      ctx(id)
    );
    expect(response.status).toBe(409);
  });
});

// ── /api/cooperatives/:id/pool ────────────────────────────────────────────────

describe('/api/cooperatives/:id/pool', () => {
  it('pools a project and reports the reached discount tier', async () => {
    const id = await seedActiveCoop();

    const response = await poolGET(request(`${BASE}/${id}/pool`), ctx(id));
    expect(response.status).toBe(200);
    const json = await readJson(response);
    expect(json.pooledProjects).toHaveLength(2);
    expect(json.pooledQuantityTons).toBe(1_000);
    expect(json.terms.discountPercent).toBe(6);
    expect(json.terms.blendedPricePerTon).toBe(41.3);
  });

  it('rejects unknown projects with 400', async () => {
    const id = await createCooperativeViaApi();
    const response = await poolPOST(
      request(`${BASE}/${id}/pool`, 'POST', {
        projectId: 'proj-nope',
        contributorId: 'farmer-founder',
        quantityTons: 10,
      }),
      ctx(id)
    );
    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toMatchObject({ code: 'invalid_request' });
  });

  it('rejects malformed pool bodies with 400', async () => {
    const id = await createCooperativeViaApi();
    const response = await poolPOST(
      new Request(`${BASE}/${id}/pool`, { method: 'POST', body: 'nope' }),
      ctx(id)
    );
    expect(response.status).toBe(400);
  });

  it('withdraws a pooled project and recomputes the terms', async () => {
    const id = await seedActiveCoop();
    const pool = await readJson(await poolGET(request(`${BASE}/${id}/pool`), ctx(id)));
    const pooledProjectId = pool.pooledProjects[0].id as string;

    const response = await poolDELETE(
      request(
        `${BASE}/${id}/pool?pooledProjectId=${pooledProjectId}&requesterId=farmer-founder`,
        'DELETE'
      ),
      ctx(id)
    );
    expect(response.status).toBe(200);
    const json = await readJson(response);
    expect(json.cooperative.pooledProjects).toHaveLength(1);
    expect(json.terms.pooledQuantityTons).toBe(400);
    expect(json.terms.discountPercent).toBe(0);
  });

  it('requires pooledProjectId on DELETE', async () => {
    const id = await createCooperativeViaApi();
    const response = await poolDELETE(request(`${BASE}/${id}/pool`, 'DELETE'), ctx(id));
    expect(response.status).toBe(400);
  });
});

// ── /api/cooperatives/:id/bargaining ──────────────────────────────────────────

describe('/api/cooperatives/:id/bargaining', () => {
  it('runs a full bargaining round: open, offer, vote, finalize', async () => {
    const id = await seedActiveCoop();

    const created = await bargainingPOST(
      request(`${BASE}/${id}/bargaining`, 'POST', { action: 'create_round' }),
      ctx(id)
    );
    expect(created.status).toBe(201);
    const createdBody = await readJson(created);
    expect(createdBody.round).toMatchObject({ status: 'open', targetQuantityTons: 1_000 });
    const roundId = createdBody.round.id as string;

    const offered = await bargainingPOST(
      request(`${BASE}/${id}/bargaining`, 'POST', {
        action: 'submit_offer',
        roundId,
        buyerId: 'buyer-1',
        buyerName: 'EcoCorp',
        pricePerTon: 42,
        quantityTons: 1_000,
        terms: 'Net 30',
      }),
      ctx(id)
    );
    expect(offered.status).toBe(200);
    await expect(readJson(offered)).resolves.toMatchObject({
      round: { status: 'offer_received', offer: { buyerId: 'buyer-1', pricePerTon: 42 } },
    });

    const voted = await bargainingPOST(
      request(`${BASE}/${id}/bargaining`, 'POST', {
        action: 'vote',
        roundId,
        memberId: 'farmer-founder',
        vote: 'accept',
      }),
      ctx(id)
    );
    expect(voted.status).toBe(200);
    await expect(readJson(voted)).resolves.toMatchObject({ round: { votes: [{ vote: 'accept' }] } });

    const premature = await bargainingPOST(
      request(`${BASE}/${id}/bargaining`, 'POST', { action: 'finalize', roundId }),
      ctx(id)
    );
    expect(premature.status).toBe(409);

    await bargainingPOST(
      request(`${BASE}/${id}/bargaining`, 'POST', {
        action: 'vote',
        roundId,
        memberId: 'farmer-2',
        vote: 'accept',
      }),
      ctx(id)
    );
    const finalized = await bargainingPOST(
      request(`${BASE}/${id}/bargaining`, 'POST', { action: 'finalize', roundId }),
      ctx(id)
    );
    expect(finalized.status).toBe(200);
    await expect(readJson(finalized)).resolves.toMatchObject({ round: { status: 'accepted' } });

    const listed = await readJson(
      await bargainingGET(request(`${BASE}/${id}/bargaining`), ctx(id))
    );
    expect(listed.rounds).toHaveLength(1);
    expect(listed.terms.discountPercent).toBe(6);
  });

  it('rejects a round before the member minimum or pool is ready', async () => {
    const solo = await createCooperativeViaApi();
    await poolPOST(
      request(`${BASE}/${solo}/pool`, 'POST', {
        projectId: 'proj-001',
        contributorId: 'farmer-founder',
        quantityTons: 100,
      }),
      ctx(solo)
    );
    const notEnoughMembers = await bargainingPOST(
      request(`${BASE}/${solo}/bargaining`, 'POST', { action: 'create_round' }),
      ctx(solo)
    );
    expect(notEnoughMembers.status).toBe(400);
    await expect(readJson(notEnoughMembers)).resolves.toMatchObject({
      error: expect.stringContaining('at least 3 members'),
    });

    const emptyPool = await createCooperativeViaApi({ founderId: 'f2', name: 'Empty Pool Coop' });
    await membersPOST(request(`${BASE}/${emptyPool}/members`, 'POST', { userId: 'm2' }), ctx(emptyPool));
    await membersPOST(request(`${BASE}/${emptyPool}/members`, 'POST', { userId: 'm3' }), ctx(emptyPool));
    const noPool = await bargainingPOST(
      request(`${BASE}/${emptyPool}/bargaining`, 'POST', { action: 'create_round' }),
      ctx(emptyPool)
    );
    expect(noPool.status).toBe(400);
    await expect(readJson(noPool)).resolves.toMatchObject({
      error: expect.stringContaining('Pool at least one project'),
    });
  });

  it('validates the action and required identifiers', async () => {
    const id = await seedActiveCoop();

    const badAction = await bargainingPOST(
      request(`${BASE}/${id}/bargaining`, 'POST', { action: 'dance' }),
      ctx(id)
    );
    expect(badAction.status).toBe(400);

    const missingRound = await bargainingPOST(
      request(`${BASE}/${id}/bargaining`, 'POST', { action: 'submit_offer', pricePerTon: 10, quantityTons: 1 }),
      ctx(id)
    );
    expect(missingRound.status).toBe(400);

    const malformed = await bargainingPOST(
      new Request(`${BASE}/${id}/bargaining`, { method: 'POST', body: '{' }),
      ctx(id)
    );
    expect(malformed.status).toBe(400);
  });

  it('returns 404 for an unknown cooperative on GET', async () => {
    const response = await bargainingGET(request(`${BASE}/coop-missing/bargaining`), ctx('coop-missing'));
    expect(response.status).toBe(404);
  });
});
