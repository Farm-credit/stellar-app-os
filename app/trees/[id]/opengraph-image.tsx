/**
 * Dynamic OpenGraph image for sponsored tree pages — Issue #1109
 *
 * Next.js App Router file-based OG image route.
 * Accessible at: /trees/[id]/opengraph-image
 * Returns a 1200×630 PNG using ImageResponse (Edge-compatible).
 */

import { ImageResponse } from 'next/og';
import { getTreeById } from '@/lib/api/tree-registry';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Use edge runtime for fastest cold-start on social crawlers
export const runtime = 'edge';

export default async function Image({ params }: { params: { id: string } }) {
  const tree = await getTreeById(params.id).catch(() => null);

  const species = tree?.species ?? 'Tree';
  const region = tree?.region ?? 'Africa';
  const projectName = tree?.projectName ?? 'FarmCredit Reforestation';
  const status = tree?.status ?? 'planted';
  const treeId = tree?.treeId ?? params.id;

  // Status badge colours
  const statusColour: Record<string, string> = {
    verified: '#16a34a',
    completed: '#0284c7',
    planted: '#65a30d',
    funded: '#d97706',
    failed: '#dc2626',
  };
  const badgeColour = statusColour[status] ?? '#16a34a';

  return new ImageResponse(
    <div
      style={{
        width: '1200px',
        height: '630px',
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(135deg, #052e16 0%, #14532d 50%, #166534 100%)',
        fontFamily: 'sans-serif',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Decorative circles */}
      <div
        style={{
          position: 'absolute',
          top: '-120px',
          right: '-120px',
          width: '480px',
          height: '480px',
          borderRadius: '50%',
          background: 'rgba(134,239,172,0.08)',
          display: 'flex',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: '-80px',
          left: '-80px',
          width: '320px',
          height: '320px',
          borderRadius: '50%',
          background: 'rgba(134,239,172,0.06)',
          display: 'flex',
        }}
      />

      {/* Main content */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          padding: '60px 80px',
          height: '100%',
          justifyContent: 'space-between',
        }}
      >
        {/* Top: branding */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {/* Tree emoji icon */}
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '14px',
              background: 'rgba(134,239,172,0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '32px',
            }}
          >
            🌳
          </div>
          <span
            style={{
              fontSize: '22px',
              fontWeight: 700,
              color: '#86efac',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}
          >
            FarmCredit
          </span>
          <div
            style={{
              marginLeft: '8px',
              padding: '4px 14px',
              borderRadius: '9999px',
              background: badgeColour,
              color: '#fff',
              fontSize: '14px',
              fontWeight: 600,
              letterSpacing: '0.04em',
              textTransform: 'capitalize',
              display: 'flex',
            }}
          >
            {status}
          </div>
        </div>

        {/* Middle: tree info */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div
            style={{
              fontSize: '72px',
              fontWeight: 800,
              color: '#ffffff',
              lineHeight: '1',
              letterSpacing: '-0.02em',
            }}
          >
            {species} Tree
          </div>
          <div
            style={{
              fontSize: '32px',
              color: '#86efac',
              fontWeight: 500,
            }}
          >
            📍 {region}
          </div>
          <div
            style={{
              fontSize: '26px',
              color: '#d1fae5',
              fontWeight: 400,
              opacity: 0.85,
            }}
          >
            {projectName}
          </div>
        </div>

        {/* Bottom: tree ID + tagline */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '15px', color: '#6ee7b7', opacity: 0.7 }}>Tree ID</span>
            <span
              style={{
                fontSize: '20px',
                color: '#a7f3d0',
                fontFamily: 'monospace',
                fontWeight: 600,
                letterSpacing: '0.05em',
              }}
            >
              {treeId}
            </span>
          </div>
          <div
            style={{
              fontSize: '18px',
              color: '#86efac',
              opacity: 0.75,
              textAlign: 'right',
            }}
          >
            🌱 Decentralized reforestation on Stellar
          </div>
        </div>
      </div>
    </div>,
    {
      ...size,
    }
  );
}
