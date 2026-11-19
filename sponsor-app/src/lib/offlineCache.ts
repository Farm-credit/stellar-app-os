import AsyncStorage from '@react-native-async-storage/async-storage';

const SPONSORSHIPS_KEY = '@sponsor-app/sponsorships/v1';
const QUEUE_KEY = '@sponsor-app/pending-sponsorships/v1';

export interface CachedSponsorship {
  id: string;
  species: string;
  region: string;
  quantity: number;
  status: 'queued' | 'confirmed' | 'planted' | 'growing';
  createdAt: string;
  treeId?: string;
}

/**
 * Offline sponsorship cache (#1119): sponsorships are stored on-device so the
 * user can review and track their trees without a network connection.
 */
export async function getCachedSponsorships(): Promise<CachedSponsorship[]> {
  const raw = await AsyncStorage.getItem(SPONSORSHIPS_KEY);
  return raw ? (JSON.parse(raw) as CachedSponsorship[]) : [];
}

export async function addCachedSponsorship(
  sponsorship: Omit<CachedSponsorship, 'createdAt' | 'status'>
): Promise<CachedSponsorship> {
  const current = await getCachedSponsorships();
  const entry: CachedSponsorship = {
    ...sponsorship,
    status: 'queued',
    createdAt: new Date().toISOString(),
  };
  await AsyncStorage.setItem(SPONSORSHIPS_KEY, JSON.stringify([entry, ...current]));
  return entry;
}

export async function updateCachedSponsorship(
  id: string,
  patch: Partial<CachedSponsorship>
): Promise<void> {
  const current = await getCachedSponsorships();
  const next = current.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry));
  await AsyncStorage.setItem(SPONSORSHIPS_KEY, JSON.stringify(next));
}

/** Queue sponsorship actions made while offline for later sync. */
export async function enqueuePendingAction(action: {
  type: 'sponsor';
  payload: Record<string, unknown>;
}): Promise<void> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  const queue = raw ? (JSON.parse(raw) as Array<typeof action>) : [];
  queue.push(action);
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export async function getPendingActions(): Promise<Array<{ type: 'sponsor'; payload: Record<string, unknown> }>> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  return raw ? (JSON.parse(raw) as Array<{ type: 'sponsor'; payload: Record<string, unknown> }>) : [];
}

export async function clearPendingActions(): Promise<void> {
  await AsyncStorage.removeItem(QUEUE_KEY);
}
