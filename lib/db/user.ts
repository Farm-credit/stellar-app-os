/**
 * User data access (recreated — module was lost in a bad merge on main).
 */

import { getPool } from '@/lib/db/client';

export interface UserData {
  id: string;
  email: string | null;
  name: string | null;
  walletAddress: string | null;
  createdAt: Date;
}

export async function getUserData(userId: string): Promise<UserData | null> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT id, email, name, wallet_address AS "walletAddress", created_at AS "createdAt"
     FROM users WHERE id = $1`,
    [userId]
  );
  return (result.rows[0] as UserData | undefined) ?? null;
}

export async function deleteUserData(userId: string): Promise<void> {
  const pool = getPool();
  await pool.query('DELETE FROM users WHERE id = $1', [userId]);
}
