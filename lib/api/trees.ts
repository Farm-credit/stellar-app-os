import { getMockTrees, getMockTreesResponse } from '@/lib/api/mock/trees';
import type { Tree, TreeFilterState, TreesResponse } from '@/lib/types/tree';

export type WaitlistStatus = 'waiting' | 'assigned' | 'cancelled';

export interface WaitlistEntry {
  id: string;
  sponsorId: string;
  sponsorName: string;
  sponsorEmail: string;
  region: string;
  status: WaitlistStatus;
  joinedAt: string;
  assignedAt?: string;
  assignedTreeId?: string;
}

export interface AnnualImpactStats {
  sponsorId: string;
  sponsorName: string;
  sponsorEmail: string;
  year: number;
  treesFunded: number;
  co2AbsorbedKg: number;
  speciesCount: number;
  milestones: string[];
}

export interface AnnualImpactEmailRecord {
  id: string;
  sponsorId: string;
  year: number;
  status: 'pending' | 'sent';
  sentAt?: string;
}

const waitlistStore: WaitlistEntry[] = [];
const annualImpactEmailStore: AnnualImpactEmailRecord[] = [];

export function getWaitlistEntries(): WaitlistEntry[] {
  return waitlistStore;
}

export function getWaitlistPosition(sponsorId: string, region: string): number | null {
  const waiting = waitlistStore
    .filter((e) => e.region === region && e.status === 'waiting')
    .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
  const index = waiting.findIndex((e) => e.sponsorId === sponsorId);
  return index === -1 ? null : index + 1;
}

export function joinWaitlist(entry: Omit<WaitlistEntry, 'id' | 'status' | 'joinedAt'>): WaitlistEntry {
  const existing = waitlistStore.find(
    (e) => e.sponsorId === entry.sponsorId && e.region === entry.region && e.status === 'waiting',
  );
  if (existing) return existing;
  const created: WaitlistEntry = {
    ...entry,
    id: `wl_${waitlistStore.length + 1}`,
    status: 'waiting',
    joinedAt: new Date().toISOString(),
  };
  waitlistStore.push(created);
  return created;
}

export async function sendWaitlistAssignmentEmail(entry: WaitlistEntry, tree: Tree): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 50));
  // Delegates to the existing email digest infrastructure in production.
  void entry;
  void tree;
}

export async function assignWaitlistForRegion(region: string, tree: Tree): Promise<WaitlistEntry | null> {
  const next = waitlistStore
    .filter((e) => e.region === region && e.status === 'waiting')
    .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt))[0];
  if (!next) return null;
  next.status = 'assigned';
  next.assignedAt = new Date().toISOString();
  next.assignedTreeId = tree.id;
  await sendWaitlistAssignmentEmail(next, tree);
  return next;
}

export async function generateImpactImage(stats: AnnualImpactStats): Promise<string> {
  await new Promise((resolve) => setTimeout(resolve, 50));
  return `/api/impact-image?sponsor=${encodeURIComponent(stats.sponsorId)}&year=${stats.year}`;
}

export async function enqueueAnnualImpactEmails(year: number): Promise<AnnualImpactEmailRecord[]> {
  const trees = getMockTrees();
  const sponsors = new Map<string, AnnualImpactStats>();
  for (const tree of trees) {
    const sponsorId = tree.sponsorId ?? 'unknown';
    const existing = sponsors.get(sponsorId);
    if (existing) {
      existing.treesFunded += 1;
      existing.co2AbsorbedKg += tree.co2AbsorbedKg ?? 0;
    } else {
      sponsors.set(sponsorId, {
        sponsorId,
        sponsorName: tree.sponsorName ?? 'Sponsor',
        sponsorEmail: tree.sponsorEmail ?? '',
        year,
        treesFunded: 1,
        co2AbsorbedKg: tree.co2AbsorbedKg ?? 0,
        speciesCount: 0,
        milestones: [],
      });
    }
  }
  const records: AnnualImpactEmailRecord[] = [];
  for (const stats of sponsors.values()) {
    if (annualImpactEmailStore.some((r) => r.sponsorId === stats.sponsorId && r.year === year)) continue;
    const record: AnnualImpactEmailRecord = {
      id: `aie_${annualImpactEmailStore.length + 1}`,
      sponsorId: stats.sponsorId,
      year,
      status: 'pending',
    };
    annualImpactEmailStore.push(record);
    records.push(record);
  }
  return records;
}

export async function sendAnnualImpactEmails(year: number): Promise<void> {
  const pending = annualImpactEmailStore.filter((r) => r.year === year && r.status === 'pending');
  for (const record of pending) {
    const stats: AnnualImpactStats = {
      sponsorId: record.sponsorId,
      sponsorName: 'Sponsor',
      sponsorEmail: '',
      year,
      treesFunded: 0,
      co2AbsorbedKg: 0,
      speciesCount: 0,
      milestones: [],
    };
    await generateImpactImage(stats);
    record.status = 'sent';
    record.sentAt = new Date().toISOString();
  }
}

export const ANNUAL_IMPACT_EMAIL_CRON = '0 9 20 12 *';

function buildQuery(filters: TreeFilterState): string {
  const params = new URLSearchParams();
  if (filters.search) params.set('search', filters.search);
  if (filters.species !== 'all') params.set('species', filters.species);
  if (filters.region !== 'all') params.set('region', filters.region);
  if (filters.status !== 'all') params.set('status', filters.status);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

function toTreesResponse(trees: Tree[], totalCount: number): TreesResponse {
  const allTrees = getMockTrees();
  return {
    trees,
    totalCount,
    speciesOptions: [...new Set(allTrees.map((t) => t.species))].sort(),
    regionOptions: [...new Set(allTrees.map((t) => t.region))].sort(),
    statusOptions: [...new Set(allTrees.map((t) => t.status))].sort(),
  };
}

export async function fetchTrees(filters: TreeFilterState): Promise<TreesResponse> {
  if (typeof window !== 'undefined') {
    const res = await fetch(`/api/trees${buildQuery(filters)}`);
    if (!res.ok) throw new Error('Failed to load trees');
    const data = (await res.json()) as { trees: Tree[]; totalCount: number };
    return toTreesResponse(data.trees, data.totalCount);
  }

  await new Promise((resolve) => setTimeout(resolve, 150));
  return getMockTreesResponse(filters);
}

export function fetchPublicTrees(filters: TreeFilterState): Promise<TreesResponse> {
  return fetchTrees(filters);
}

export async function fetchTreeById(id: string): Promise<Tree | null> {
  const res = await fetch(`/api/trees/${encodeURIComponent(id)}`);
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error('Failed to load tree');
  }
  const data = (await res.json()) as { tree: Tree };
  return data.tree;
}
