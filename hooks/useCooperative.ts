'use client';

/**
 * Client hooks for farmer cooperatives — Issue #1431
 *
 * Thin fetch wrappers around `/api/cooperatives/*` plus two React hooks:
 *  - `useCooperatives` for browsing/forming cooperatives
 *  - `useCooperative` for a single cooperative (pooling + bargaining actions)
 */

import { useCallback, useEffect, useState } from 'react';
import type {
  BargainingRound,
  BargainingVoteChoice,
  CollectiveBargainingTerms,
  Cooperative,
  CooperativeStatus,
  CooperativeSummary,
  CreateBargainingRoundInput,
  CreateCooperativeInput,
  AddMemberInput,
  AddPooledProjectInput,
  SubmitBuyerOfferInput,
} from '@/lib/types/cooperative';

const BASE = '/api/cooperatives';

export interface CooperativeListFilter {
  region?: string;
  search?: string;
  memberId?: string;
  status?: CooperativeStatus;
}

export interface CooperativeDetail {
  cooperative: Cooperative;
  terms: CollectiveBargainingTerms;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });

  const payload = (await response.json().catch(() => null)) as
    | (T & { error?: string })
    | null;

  if (!response.ok || !payload) {
    throw new Error(payload?.error ?? `Request failed with status ${response.status}`);
  }
  return payload;
}

function buildQuery(filter: CooperativeListFilter): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filter)) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

// ── API helpers (usable outside React too) ────────────────────────────────────

export async function listCooperatives(
  filter: CooperativeListFilter = {}
): Promise<CooperativeSummary[]> {
  const data = await requestJson<{ cooperatives: CooperativeSummary[] }>(
    `${BASE}${buildQuery(filter)}`
  );
  return data.cooperatives;
}

export async function createCooperativeRequest(
  input: CreateCooperativeInput
): Promise<Cooperative> {
  const data = await requestJson<{ cooperative: Cooperative }>(BASE, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.cooperative;
}

export async function getCooperativeRequest(id: string): Promise<CooperativeDetail> {
  return requestJson<CooperativeDetail>(`${BASE}/${id}`);
}

export async function addCooperativeMemberRequest(
  id: string,
  input: AddMemberInput
): Promise<Cooperative> {
  const data = await requestJson<{ cooperative: Cooperative }>(`${BASE}/${id}/members`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.cooperative;
}

export async function poolCooperativeProjectRequest(
  id: string,
  input: AddPooledProjectInput
): Promise<CollectiveBargainingTerms> {
  const data = await requestJson<{ terms: CollectiveBargainingTerms }>(`${BASE}/${id}/pool`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.terms;
}

export async function startBargainingRoundRequest(
  id: string,
  input: CreateBargainingRoundInput = {}
): Promise<BargainingRound> {
  const data = await requestJson<{ round: BargainingRound }>(`${BASE}/${id}/bargaining`, {
    method: 'POST',
    body: JSON.stringify({ action: 'create_round', ...input }),
  });
  return data.round;
}

export async function submitBargainingOfferRequest(
  id: string,
  roundId: string,
  input: SubmitBuyerOfferInput
): Promise<BargainingRound> {
  const data = await requestJson<{ round: BargainingRound }>(`${BASE}/${id}/bargaining`, {
    method: 'POST',
    body: JSON.stringify({ action: 'submit_offer', roundId, ...input }),
  });
  return data.round;
}

export async function voteOnBargainingOfferRequest(
  id: string,
  roundId: string,
  memberId: string,
  vote: BargainingVoteChoice
): Promise<BargainingRound> {
  const data = await requestJson<{ round: BargainingRound }>(`${BASE}/${id}/bargaining`, {
    method: 'POST',
    body: JSON.stringify({ action: 'vote', roundId, memberId, vote }),
  });
  return data.round;
}

export async function finalizeBargainingRoundRequest(
  id: string,
  roundId: string
): Promise<BargainingRound> {
  const data = await requestJson<{ round: BargainingRound }>(`${BASE}/${id}/bargaining`, {
    method: 'POST',
    body: JSON.stringify({ action: 'finalize', roundId }),
  });
  return data.round;
}

// ── React hooks ───────────────────────────────────────────────────────────────

export function useCooperatives(filter: CooperativeListFilter = {}) {
  const { region, search, memberId, status } = filter;
  const [cooperatives, setCooperatives] = useState<CooperativeSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setCooperatives(await listCooperatives({ region, search, memberId, status }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load cooperatives');
    } finally {
      setIsLoading(false);
    }
  }, [region, search, memberId, status]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { cooperatives, isLoading, error, refresh };
}

export function useCooperative(id: string | null | undefined) {
  const [cooperative, setCooperative] = useState<Cooperative | null>(null);
  const [terms, setTerms] = useState<CollectiveBargainingTerms | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(id));
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    try {
      const detail = await getCooperativeRequest(id);
      setCooperative(detail.cooperative);
      setTerms(detail.terms);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load cooperative');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runAction = useCallback(
    async <T,>(action: () => Promise<T>): Promise<T | null> => {
      if (!id) return null;
      setError(null);
      try {
        const result = await action();
        await refresh();
        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Cooperative action failed');
        return null;
      }
    },
    [id, refresh]
  );

  return {
    cooperative,
    terms,
    isLoading,
    error,
    refresh,
    addMember: (input: AddMemberInput) =>
      runAction(() => addCooperativeMemberRequest(id as string, input)),
    poolProject: (input: AddPooledProjectInput) =>
      runAction(() => poolCooperativeProjectRequest(id as string, input)),
    startRound: (input: CreateBargainingRoundInput = {}) =>
      runAction(() => startBargainingRoundRequest(id as string, input)),
    submitOffer: (roundId: string, input: SubmitBuyerOfferInput) =>
      runAction(() => submitBargainingOfferRequest(id as string, roundId, input)),
    vote: (roundId: string, memberId: string, vote: BargainingVoteChoice) =>
      runAction(() => voteOnBargainingOfferRequest(id as string, roundId, memberId, vote)),
    finalizeRound: (roundId: string) =>
      runAction(() => finalizeBargainingRoundRequest(id as string, roundId)),
  };
}
