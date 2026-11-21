/**
 * GET /api/sponsors/:sponsorId/badges/:badgeId/image — Issue #1687
 * 1200x630 PNG share card for an earned badge. 404 until the badge is earned.
 */
import { ImageResponse } from 'next/og';
import { type NextRequest, NextResponse } from 'next/server';
import { getAchievementsForSponsor } from '@/lib/api/sponsor-achievements';
import { getSponsorProfile } from '@/lib/api/sponsors';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ sponsorId: string; badgeId: string }>;
}

function shortAddress(address: string): string {
  return address.length <= 12 ? address : `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { sponsorId, badgeId } = await params;
  const address = decodeURIComponent(sponsorId);
  const badge = getAchievementsForSponsor(address)?.find((a) => a.id === badgeId);
  if (!badge || !badge.earned) {
    return NextResponse.json({ success: false, error: 'Badge not earned' }, { status: 404 });
  }

  const profile = getSponsorProfile(address);
  const sponsorName = profile?.name ?? shortAddress(address);
  const earnedOn = badge.earnedAt
    ? new Date(badge.earnedAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'UTC',
      })
    : '';

  return new ImageResponse(
    <div
      style={{
        width: '1200px',
        height: '630px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        background: 'linear-gradient(135deg, #052e16 0%, #14532d 50%, #166534 100%)',
        color: '#ffffff',
        fontFamily: 'sans-serif',
      }}
    >
      <div
        style={{
          width: '240px',
          height: '240px',
          borderRadius: '120px',
          background: '#fbbf24',
          color: '#052e16',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: badge.emblem.length > 2 ? 84 : 110,
          fontWeight: 800,
          border: '10px solid #fde68a',
        }}
      >
        {badge.emblem}
      </div>
      <div style={{ display: 'flex', fontSize: 28, marginTop: 36, color: '#bbf7d0' }}>
        BADGE EARNED
      </div>
      <div style={{ display: 'flex', fontSize: 72, fontWeight: 800, marginTop: 8 }}>
        {badge.name}
      </div>
      <div style={{ display: 'flex', fontSize: 32, marginTop: 16, color: '#dcfce7' }}>
        {sponsorName}
        {earnedOn ? ` · ${earnedOn}` : ''}
      </div>
      <div style={{ display: 'flex', fontSize: 24, marginTop: 40, color: '#86efac' }}>
        FarmCredit tree sponsorship
      </div>
    </div>,
    { width: 1200, height: 630 }
  );
}
