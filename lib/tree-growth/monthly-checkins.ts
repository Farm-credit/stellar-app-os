import { getPool } from '@/lib/db/client';

export type MonthlyCheckInStatus = 'pending' | 'verified' | 'rejected';

export interface TreeMonthlyCheckIn {
  id: string;
  treeId: string;
  checkinMonth: string;
  photoCid: string;
  imageUrl: string;
  submittedBy: string;
  caption: string | null;
  heightCm: number | null;
  verificationStatus: MonthlyCheckInStatus;
  verifiedBy: string | null;
  verifiedAt: string | null;
  createdAt: string;
}

interface TreeMonthlyCheckInRow {
  id: string;
  tree_id: string;
  checkin_month: string | Date;
  photo_cid: string;
  image_url: string;
  submitted_by: string;
  caption: string | null;
  height_cm: string | number | null;
  verification_status: MonthlyCheckInStatus;
  verified_by: string | null;
  verified_at: string | Date | null;
  created_at: string | Date;
}

function toIso(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapRow(row: TreeMonthlyCheckInRow): TreeMonthlyCheckIn {
  return {
    id: row.id,
    treeId: row.tree_id,
    checkinMonth:
      row.checkin_month instanceof Date
        ? row.checkin_month.toISOString().slice(0, 10)
        : row.checkin_month.slice(0, 10),
    photoCid: row.photo_cid,
    imageUrl: row.image_url,
    submittedBy: row.submitted_by,
    caption: row.caption,
    heightCm: row.height_cm === null ? null : Number(row.height_cm),
    verificationStatus: row.verification_status,
    verifiedBy: row.verified_by,
    verifiedAt: toIso(row.verified_at),
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : new Date(row.created_at).toISOString(),
  };
}

export async function listTreeMonthlyCheckIns(treeId: string): Promise<TreeMonthlyCheckIn[]> {
  const { rows } = await getPool().query<TreeMonthlyCheckInRow>(
    `SELECT id, tree_id, checkin_month, photo_cid, image_url, submitted_by,
            caption, height_cm, verification_status, verified_by, verified_at, created_at
       FROM tree_monthly_checkins
      WHERE tree_id = $1
      ORDER BY checkin_month DESC
      LIMIT 120`,
    [treeId]
  );
  return rows.map(mapRow);
}

export async function createTreeMonthlyCheckIn(input: {
  treeId: string;
  photoCid: string;
  imageUrl: string;
  submittedBy: string;
  caption: string | null;
  heightCm: number | null;
  now?: Date;
}): Promise<TreeMonthlyCheckIn | null> {
  const now = input.now ?? new Date();
  const checkinMonth = `${now.toISOString().slice(0, 7)}-01`;
  const { rows } = await getPool().query<TreeMonthlyCheckInRow>(
    `INSERT INTO tree_monthly_checkins
       (tree_id, checkin_month, photo_cid, image_url, submitted_by, caption, height_cm)
     VALUES ($1, $2::date, $3, $4, $5, $6, $7)
     ON CONFLICT (tree_id, checkin_month) DO NOTHING
     RETURNING id, tree_id, checkin_month, photo_cid, image_url, submitted_by,
               caption, height_cm, verification_status, verified_by, verified_at, created_at`,
    [
      input.treeId,
      checkinMonth,
      input.photoCid,
      input.imageUrl,
      input.submittedBy,
      input.caption,
      input.heightCm,
    ]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export function currentCheckInMonth(now = new Date()): string {
  return `${now.toISOString().slice(0, 7)}-01`;
}

export function nextCheckInDate(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
}
