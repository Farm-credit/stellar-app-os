import { type NextRequest, NextResponse } from 'next/server';
import React from 'react';
import { renderToBuffer, Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import QRCode from 'qrcode';
import { getMockTrees } from '@/lib/api/mock/trees';
import { TREE_SPECIES } from '@/lib/constants/species';

export const runtime = 'nodejs';

// ── Styles ────────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    backgroundColor: '#ffffff',
    paddingHorizontal: 40,
    paddingTop: 0,
    paddingBottom: 32,
  },
  // Header band
  header: {
    backgroundColor: '#0D0B21',
    marginHorizontal: -40,
    paddingHorizontal: 40,
    paddingTop: 28,
    paddingBottom: 20,
    alignItems: 'center',
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 1.5,
  },
  headerSubtitle: {
    color: '#14B6E7',
    fontSize: 9,
    marginTop: 5,
  },
  accentBar: {
    backgroundColor: '#14B6E7',
    height: 3,
    marginHorizontal: -40,
    marginBottom: 28,
  },
  // Verified badge
  badge: {
    backgroundColor: '#00B36B',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 8,
    alignSelf: 'center',
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 0.5,
  },
  // Body
  sectionLabel: {
    fontSize: 8,
    color: '#64748B',
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  sectionValue: {
    fontSize: 13,
    color: '#0D0B21',
    fontFamily: 'Helvetica-Bold',
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    gap: 16,
  },
  col: {
    flex: 1,
  },
  statsBox: {
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 24,
  },
  statValue: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    color: '#0D0B21',
    textAlign: 'center',
  },
  statLabel: {
    fontSize: 8,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 3,
  },
  divider: {
    borderBottomWidth: 0.5,
    borderBottomColor: '#14B6E7',
    marginBottom: 20,
  },
  // QR + hash block
  verifyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
    marginBottom: 20,
  },
  qrImage: {
    width: 72,
    height: 72,
  },
  hashBlock: {
    flex: 1,
  },
  hashLabel: {
    fontSize: 8,
    color: '#64748B',
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  hashValue: {
    fontSize: 7,
    color: '#0D0B21',
    fontFamily: 'Helvetica',
    backgroundColor: '#F1F5F9',
    borderRadius: 3,
    padding: 5,
    marginBottom: 6,
  },
  hashUrl: {
    fontSize: 7,
    color: '#14B6E7',
  },
  // Footer
  footer: {
    backgroundColor: '#0D0B21',
    marginHorizontal: -40,
    paddingHorizontal: 40,
    paddingVertical: 10,
    marginTop: 'auto',
  },
  footerText: {
    color: '#ffffff',
    fontSize: 7,
    textAlign: 'center',
    opacity: 0.7,
  },
});

// ── Certificate Document ──────────────────────────────────────────────────────

interface CertProps {
  treeUid: string;
  species: string;
  region: string;
  projectName: string;
  plantedAt: string;
  co2Tonnes: string;
  qrDataUrl: string;
  treeUrl: string;
  issuedDate: string;
}

function TreeCertificate({
  treeUid,
  species,
  region,
  projectName,
  plantedAt,
  co2Tonnes,
  qrDataUrl,
  treeUrl,
  issuedDate,
}: CertProps) {
  return (
    <Document
      title={`Carbon Offset Certificate – ${treeUid}`}
      author="FarmCredit"
      creator="Stellar App OS"
    >
      <Page size="A4" style={S.page}>
        {/* Header */}
        <View style={S.header}>
          <Text style={S.headerTitle}>CARBON OFFSET CERTIFICATE</Text>
          <Text style={S.headerSubtitle}>Verified on the Stellar Network · {issuedDate}</Text>
          <View style={S.badge}>
            <Text style={S.badgeText}>✓ VERIFIED</Text>
          </View>
        </View>

        {/* Accent bar */}
        <View style={S.accentBar} />

        {/* Tree ID */}
        <Text style={S.sectionLabel}>Tree ID</Text>
        <Text style={S.sectionValue}>{treeUid}</Text>

        {/* Species + Region */}
        <View style={S.row}>
          <View style={S.col}>
            <Text style={S.sectionLabel}>Species</Text>
            <Text style={S.sectionValue}>{species}</Text>
          </View>
          <View style={S.col}>
            <Text style={S.sectionLabel}>Region</Text>
            <Text style={S.sectionValue}>{region}</Text>
          </View>
        </View>

        {/* Project */}
        <Text style={S.sectionLabel}>Reforestation Project</Text>
        <Text style={S.sectionValue}>{projectName}</Text>

        {/* Impact stats */}
        <View style={S.statsBox}>
          <View>
            <Text style={S.statValue}>{co2Tonnes}</Text>
            <Text style={S.statLabel}>Tonnes CO₂ Offset</Text>
            <Text style={S.statLabel}>(25-year estimate)</Text>
          </View>
          <View>
            <Text style={S.statValue}>{plantedAt}</Text>
            <Text style={S.statLabel}>Date Planted</Text>
          </View>
        </View>

        <View style={S.divider} />

        {/* QR + verification */}
        <View style={S.verifyRow}>
          <Image src={qrDataUrl} style={S.qrImage} />
          <View style={S.hashBlock}>
            <Text style={S.hashLabel}>Scan to Verify On-Chain</Text>
            <Text style={S.hashValue}>{treeUid}</Text>
            <Text style={S.hashUrl}>{treeUrl}</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={S.footer}>
          <Text style={S.footerText}>
            Powered by Stellar Network · Immutable · Verifiable · Permanent
          </Text>
        </View>
      </Page>
    </Document>
  );
}

// ── Route Handler ─────────────────────────────────────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ tree_id: string }> }
): Promise<NextResponse> {
  const { tree_id } = await params;

  const trees = getMockTrees();
  const tree = trees.find((t) => t.id === tree_id || t.treeId === tree_id);

  if (!tree) {
    return NextResponse.json({ error: 'Tree not found' }, { status: 404 });
  }

  const speciesInfo = TREE_SPECIES.find((s) => s.name === tree.species);
  const co2KgTotal =
    (speciesInfo?.co2KgPerYear ?? tree.co2OffsetKgPerYear) * (speciesInfo?.maturityYears ?? 25);
  const co2Tonnes = (co2KgTotal / 1000).toFixed(3);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.farmcredit.io';
  const treeUrl = `${appUrl}/trees/${tree.id}`;

  const qrDataUrl = await QRCode.toDataURL(treeUrl, { margin: 1, width: 200, type: 'image/png' });

  const plantedAt = tree.plantedAt
    ? new Date(tree.plantedAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : 'Pending';

  const issuedDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const pdfBuffer = await renderToBuffer(
    <TreeCertificate
      treeUid={tree.treeId}
      species={tree.species}
      region={tree.region}
      projectName={tree.projectName}
      plantedAt={plantedAt}
      co2Tonnes={co2Tonnes}
      qrDataUrl={qrDataUrl}
      treeUrl={treeUrl}
      issuedDate={issuedDate}
    />
  );

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="certificate-${tree.treeId}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}
