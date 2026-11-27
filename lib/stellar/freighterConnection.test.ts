import { beforeEach, describe, expect, it, vi } from 'vitest';
import { connectFreighter, getFreighterNetwork, isFreighterInstalled } from './wallet';
const mocks = vi.hoisted(() => ({
  isConnected: vi.fn(),
  requestAccess: vi.fn(),
  getNetwork: vi.fn(),
}));
vi.mock('@stellar/freighter-api', () => mocks);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.isConnected.mockResolvedValue({ isConnected: true });
  mocks.requestAccess.mockResolvedValue({ address: 'wallet-address' });
});
describe('Freighter 6 wallet connection for leaderboard settings', () => {
  it('requests permission and returns the connected address', async () => {
    expect(await connectFreighter()).toBe('wallet-address');
    expect(mocks.requestAccess).toHaveBeenCalledOnce();
  });
  it('handles an absent extension without treating an object as true', async () => {
    mocks.isConnected.mockResolvedValue({ isConnected: false });
    expect(await isFreighterInstalled()).toBe(false);
    await expect(connectFreighter()).rejects.toThrow('extension not found');
    expect(mocks.requestAccess).not.toHaveBeenCalled();
  });
  it('rejects denied permission instead of using an empty address', async () => {
    mocks.requestAccess.mockResolvedValue({ address: '', error: { message: 'denied' } });
    await expect(connectFreighter()).rejects.toThrow('Connection rejected');
  });
  it.each([
    ['PUBLIC', 'mainnet'],
    ['TESTNET', 'testnet'],
    ['CUSTOM', null],
  ])('reads the %s network response', async (network, expected) => {
    mocks.getNetwork.mockResolvedValue({ network });
    expect(await getFreighterNetwork()).toBe(expected);
  });
});
