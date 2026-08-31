import { randomBytes } from 'node:crypto';
import type { Pool } from 'pg';

const STELLAR_ADDRESS_PATTERN = /^G[A-Z2-7]{55}$/;

export interface TeamForestSummary {
  id: string;
  name: string;
  ownerWallet: string;
  inviteCode: string;
  members: Array<{ wallet: string; role: 'owner' | 'member'; joinedAt: string }>;
  trees: Array<{
    id: string;
    treeRef: string;
    species: string;
    region: string;
    status: string;
    co2OffsetKgPerYear: number;
  }>;
  totalTrees: number;
  totalCo2OffsetKgPerYear: number;
}

export function isValidTeamWallet(wallet: string): boolean {
  return STELLAR_ADDRESS_PATTERN.test(wallet);
}

export function normalizeTeamName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

export function createInviteCode(): string {
  return randomBytes(6).toString('base64url');
}

async function assertMember(pool: Pick<Pool, 'query'>, teamId: string, wallet: string) {
  const result = await pool.query<{ role: 'owner' | 'member' }>(
    'SELECT role FROM sponsor_team_members WHERE team_id = $1 AND wallet = $2',
    [teamId, wallet]
  );
  if (!result.rows[0]) throw new Error('Team membership required');
  return result.rows[0].role;
}

export async function createSponsorTeam(
  pool: Pool,
  ownerWallet: string,
  rawName: string
): Promise<{ id: string; inviteCode: string }> {
  const name = normalizeTeamName(rawName);
  if (!isValidTeamWallet(ownerWallet)) throw new Error('Invalid owner wallet');
  if (name.length < 2 || name.length > 80) throw new Error('Team name must be 2-80 characters');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const team = await client.query<{ id: string; invite_code: string }>(
      `INSERT INTO sponsor_teams (name, owner_wallet, invite_code)
       VALUES ($1, $2, $3)
       RETURNING id, invite_code`,
      [name, ownerWallet, createInviteCode()]
    );
    const row = team.rows[0];
    if (!row) throw new Error('Team was not created');
    await client.query(
      `INSERT INTO sponsor_team_members (team_id, wallet, role)
       VALUES ($1, $2, 'owner')`,
      [row.id, ownerWallet]
    );
    await client.query('COMMIT');
    return { id: row.id, inviteCode: row.invite_code };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function joinSponsorTeam(
  pool: Pick<Pool, 'query'>,
  inviteCode: string,
  wallet: string
): Promise<{ teamId: string }> {
  if (!isValidTeamWallet(wallet)) throw new Error('Invalid member wallet');
  const code = inviteCode.trim();
  const result = await pool.query<{ id: string }>(
    `INSERT INTO sponsor_team_members (team_id, wallet, role)
     SELECT id, $2, 'member' FROM sponsor_teams WHERE invite_code = $1
     ON CONFLICT (team_id, wallet) DO NOTHING
     RETURNING team_id AS id`,
    [code, wallet]
  );
  if (result.rows[0]?.id) return { teamId: result.rows[0].id };

  const existing = await pool.query<{ id: string }>(
    `SELECT t.id
     FROM sponsor_teams t
     JOIN sponsor_team_members m ON m.team_id = t.id
     WHERE t.invite_code = $1 AND m.wallet = $2`,
    [code, wallet]
  );
  if (existing.rows[0]?.id) return { teamId: existing.rows[0].id };
  throw new Error('Invite code not found');
}

export async function addTreeToSponsorTeam(
  pool: Pick<Pool, 'query'>,
  teamId: string,
  wallet: string,
  treeRef: string
): Promise<void> {
  await assertMember(pool, teamId, wallet);
  const result = await pool.query(
    `INSERT INTO sponsor_team_trees (team_id, tree_id, added_by_wallet)
     SELECT $1, id, $2 FROM trees
     WHERE tree_ref = $3 AND deleted_at IS NULL
     ON CONFLICT (team_id, tree_id) DO NOTHING`,
    [teamId, wallet, treeRef.trim()]
  );
  if (result.rowCount === 0) throw new Error('Tree not found or already shared');
}

export async function getSponsorTeam(
  pool: Pick<Pool, 'query'>,
  teamId: string,
  wallet: string
): Promise<TeamForestSummary> {
  await assertMember(pool, teamId, wallet);
  const [teamResult, membersResult, treesResult] = await Promise.all([
    pool.query<{ id: string; name: string; owner_wallet: string; invite_code: string }>(
      'SELECT id, name, owner_wallet, invite_code FROM sponsor_teams WHERE id = $1',
      [teamId]
    ),
    pool.query<{ wallet: string; role: 'owner' | 'member'; joined_at: string }>(
      `SELECT wallet, role, joined_at FROM sponsor_team_members
       WHERE team_id = $1 ORDER BY joined_at ASC`,
      [teamId]
    ),
    pool.query<{
      id: string;
      tree_ref: string;
      species: string;
      region: string;
      status: string;
      co2_offset_kg_per_year: string | number;
    }>(
      `SELECT t.id, t.tree_ref, COALESCE(sc.name, t.species_slug, 'Unknown') AS species,
              t.region, t.status, COALESCE(sc.co2_kg_per_year, 0) AS co2_offset_kg_per_year
       FROM sponsor_team_trees stt
       JOIN trees t ON t.id = stt.tree_id
       LEFT JOIN species_catalogue sc ON sc.slug = t.species_slug
       WHERE stt.team_id = $1 AND t.deleted_at IS NULL
       ORDER BY stt.added_at DESC`,
      [teamId]
    ),
  ]);

  const team = teamResult.rows[0];
  if (!team) throw new Error('Team not found');
  const trees = treesResult.rows.map((tree) => ({
    id: tree.id,
    treeRef: tree.tree_ref,
    species: tree.species,
    region: tree.region,
    status: tree.status,
    co2OffsetKgPerYear: Number(tree.co2_offset_kg_per_year ?? 0),
  }));

  return {
    id: team.id,
    name: team.name,
    ownerWallet: team.owner_wallet,
    inviteCode: team.invite_code,
    members: membersResult.rows.map((member) => ({
      wallet: member.wallet,
      role: member.role,
      joinedAt: member.joined_at,
    })),
    trees,
    totalTrees: trees.length,
    totalCo2OffsetKgPerYear: trees.reduce((total, tree) => total + tree.co2OffsetKgPerYear, 0),
  };
}
