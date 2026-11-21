import { ImageResponse } from 'next/og';
import { NextResponse } from 'next/server';
import { getTreeById } from '@/lib/api/tree-registry';
import { getMockTrees } from '@/lib/api/mock/trees';
import { normalizeDedication } from '@/lib/trees/dedication';

export const runtime = 'edge';

const CARD_WIDTH = 1200;
const CARD_HEIGHT = 630;

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await context.params;
  const url = new URL(request.url);
  const queryDedication = normalizeDedication(url.searchParams.get('dedication'));

  const fetchedTree = await getTreeById(id).catch(() => null);
  const tree =
    fetchedTree ?? getMockTrees().find((candidate) => candidate.id === id || candidate.treeId === id) ?? null;

  const dedication = queryDedication ?? normalizeDedication(tree?.dedication);

  if (!dedication) {
    return NextResponse.json({ error: 'No dedication found for this tree' }, { status: 404 });
  }

  const species = tree?.species ?? 'Sponsored Tree';
  const region = tree?.region ?? 'Africa';
  const projectName = tree?.projectName ?? 'FarmCredit Reforestation';
  const treeIdLabel = tree?.treeId ?? id;
  const sponsorName = tree?.sponsorName?.trim() || 'A FarmCredit Sponsor';

  return new ImageResponse(
    (
      <div
        style={{
          width: `${CARD_WIDTH}px`,
          height: `${CARD_HEIGHT}px`,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '56px 72px',
          background: 'linear-gradient(135deg, #052e16 0%, #14532d 55%, #166534 100%)',
          color: '#ffffff',
          fontFamily: 'sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Decorative ambient glow */}
        <div
          style={{
            position: 'absolute',
            top: '-140px',
            right: '-140px',
            width: '440px',
            height: '440px',
            borderRadius: '50%',
            background: 'rgba(251, 113, 133, 0.14)',
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: '-100px',
            left: '-100px',
            width: '360px',
            height: '360px',
            borderRadius: '50%',
            background: 'rgba(134, 239, 172, 0.1)',
            display: 'flex',
          }}
        />

        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div
              style={{
                width: '54px',
                height: '54px',
                borderRadius: '16px',
                background: 'rgba(251, 113, 133, 0.2)',
                border: '1px solid rgba(251, 113, 133, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '28px',
                color: '#fda4af',
              }}
            >
              ♥
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span
                style={{
                  fontSize: '18px',
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: '#fda4af',
                }}
              >
                Tree Dedication
              </span>
              <span style={{ fontSize: '20px', color: 'rgba(255,255,255,0.8)' }}>
                {projectName}
              </span>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              padding: '10px 20px',
              borderRadius: '9999px',
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.2)',
              fontSize: '18px',
              fontWeight: 600,
              color: '#dcfce7',
            }}
          >
            {treeIdLabel}
          </div>
        </div>

        {/* Dedication Quote */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            padding: '36px 44px',
            borderRadius: '24px',
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.16)',
          }}
        >
          <span
            style={{
              fontSize: dedication.length > 120 ? '30px' : '38px',
              lineHeight: 1.35,
              fontWeight: 600,
              color: '#ffffff',
            }}
          >
            &ldquo;{dedication}&rdquo;
          </span>
          <span style={{ fontSize: '20px', color: '#bbf7d0' }}>
            Dedicated by {sponsorName}
          </span>
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderTop: '1px solid rgba(255,255,255,0.15)',
            paddingTop: '20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '24px', fontSize: '20px', color: '#dcfce7' }}>
            <span>{species}</span>
            <span style={{ color: 'rgba(255,255,255,0.4)' }}>•</span>
            <span>{region}</span>
          </div>
          <span style={{ fontSize: '20px', fontWeight: 700, color: '#86efac' }}>
            Stellar Farm Credit
          </span>
        </div>
      </div>
    ),
    {
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
    }
  );
}
