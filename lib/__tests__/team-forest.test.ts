import { describe, expect, it, vi } from 'vitest';
import {
  createInviteCode,
  createSponsorTeam,
  isValidTeamWallet,
  normalizeTeamName,
  joinSponsorTeam,
} from '@/lib/team-forest';

const ownerWallet = `G${'A'.repeat(55)}`;
const memberWallet = `G${'B'.repeat(55)}`;

describe('team forest operations', () => {
  it('normalizes names and validates invite codes', () => {
    expect(normalizeTeamName('  Northern   Grove  ')).toBe('Northern Grove');
    expect(isValidTeamWallet(ownerWallet)).toBe(true);
    expect(createInviteCode()).toMatch(/^[A-Za-z0-9_-]{8}$/);
  });

  it('creates a team and owner membership in one transaction', async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [{ id: '12', invite_code: 'invite-1' }] })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({}),
      release: vi.fn(),
    };
    const pool = { connect: vi.fn().mockResolvedValue(client) };

    const result = await createSponsorTeam(pool as never, ownerWallet, 'Northern Grove');

    expect(result).toEqual({ id: '12', inviteCode: 'invite-1' });
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('rejects an unknown invite code and joins a valid member', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: '12' }] });
    const pool = { query };

    await expect(joinSponsorTeam(pool, 'unknown', memberWallet)).rejects.toThrow(
      'Invite code not found'
    );
    await expect(joinSponsorTeam(pool, 'invite-1', memberWallet)).resolves.toEqual({
      teamId: '12',
    });
  });
});
