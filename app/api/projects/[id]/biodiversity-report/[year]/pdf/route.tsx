import { type NextRequest, NextResponse } from 'next/server';
import React from 'react';
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';

import { mockAdminProjectDetails } from '@/lib/api/mock/adminProjectDetails';
import { mockCarbonProjects } from '@/lib/api/mock/carbonProjects';
import { getProjectBiodiversityReports, parseReportYear } from '@/lib/biodiversity/impact-report';
import { seedProjectWildlife } from '@/lib/wildlife/service';
import type { AnnualBiodiversityReport, RecoveryIndicator } from '@/lib/types/biodiversity-report';
import type { TaxonomicGroup } from '@/lib/wildlife/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ── Styles ────────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    backgroundColor: '#ffffff',
    paddingHorizontal: 40,
    paddingTop: 0,
    paddingBottom: 44,
  },
  header: {
    backgroundColor: '#0D0B21',
    marginHorizontal: -40,
    paddingHorizontal: 40,
    paddingTop: 26,
    paddingBottom: 18,
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 19,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 1.2,
  },
  headerSubtitle: {
    color: '#14B6E7',
    fontSize: 10,
    marginTop: 5,
  },
  periodRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  headerMeta: { color: '#CBD5E1', fontSize: 8 },
  accentBar: {
    backgroundColor: '#00B36B',
    height: 3,
    marginHorizontal: -40,
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 8,
    color: '#64748B',
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 12,
    color: '#0D0B21',
    fontFamily: 'Helvetica-Bold',
    marginBottom: 8,
  },
  body: { fontSize: 9, color: '#334155', lineHeight: 1.5 },
  statsBox: {
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
    paddingVertical: 12,
    paddingHorizontal: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  statValue: {
    fontSize: 17,
    fontFamily: 'Helvetica-Bold',
    color: '#0D0B21',
    textAlign: 'center',
  },
  statLabel: { fontSize: 7.5, color: '#64748B', textAlign: 'center', marginTop: 3 },
  block: { marginBottom: 16 },
  tableHead: {
    flexDirection: 'row',
    borderBottomWidth: 0.7,
    borderBottomColor: '#CBD5E1',
    paddingBottom: 4,
    marginBottom: 4,
  },
  tableHeadCell: {
    fontSize: 7.5,
    color: '#64748B',
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 3,
    borderBottomWidth: 0.3,
    borderBottomColor: '#E2E8F0',
  },
  cell: { fontSize: 9, color: '#0D0B21' },
  cellMuted: { fontSize: 9, color: '#64748B' },
  callout: {
    backgroundColor: '#ECFDF5',
    borderLeftWidth: 2,
    borderLeftColor: '#00B36B',
    paddingVertical: 7,
    paddingHorizontal: 9,
    marginBottom: 6,
  },
  calloutText: { fontSize: 9, color: '#065F46', lineHeight: 1.45 },
  methodologyText: { fontSize: 7.5, color: '#64748B', lineHeight: 1.45, marginBottom: 3 },
  footer: {
    position: 'absolute',
    bottom: 16,
    left: 40,
    right: 40,
    borderTopWidth: 0.5,
    borderTopColor: '#CBD5E1',
    paddingTop: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: { fontSize: 7, color: '#94A3B8' },
  badge: {
    borderRadius: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: '#00B36B',
    alignSelf: 'flex-start',
  },
  badgeDraft: { backgroundColor: '#F59E0B' },
  badgeText: {
    color: '#ffffff',
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 0.4,
  },
});

// ── Formatting helpers ────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '—';
  return new Date(ms).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function groupLabel(group: TaxonomicGroup): string {
  return group.charAt(0).toUpperCase() + group.slice(1);
}

function sourceLabel(source: AnnualBiodiversityReport['diversity']['source']): string {
  if (source === 'census') return 'Annual tree census';
  if (source === 'wildlife') return 'Wildlife sightings (no census on file)';
  return 'No survey data';
}

function formatIndicatorValue(indicator: RecoveryIndicator): string {
  if (indicator.value === null) return 'Not measured';
  if (indicator.unit === 'percent') return `${indicator.value.toFixed(1)}%`;
  if (indicator.unit === 'species') return `${indicator.value}`;
  return indicator.value.toFixed(2);
}

function trendLabel(trend: RecoveryIndicator['trend']): string {
  if (trend === 'increasing') return '↑ Improving';
  if (trend === 'decreasing') return '↓ Declining';
  if (trend === 'stable') return '→ Stable';
  return '· First year';
}

// ── Document ──────────────────────────────────────────────────────────────────

function BiodiversityImpactReportPdf({
  report,
  projectName,
}: {
  report: AnnualBiodiversityReport;
  projectName: string;
}) {
  const { diversity, wildlife, recovery, coverage } = report;

  return (
    <Document
      title={`Biodiversity Impact Report ${report.year} – ${projectName}`}
      author="FarmCredit"
      subject={`Annual biodiversity impact report for ${projectName} (${report.year})`}
      creator="Stellar App OS"
    >
      <Page size="A4" style={S.page}>
        <View style={S.header}>
          <Text style={S.headerTitle}>BIODIVERSITY IMPACT REPORT</Text>
          <Text style={S.headerSubtitle}>
            {projectName} · Annual report {report.year}
          </Text>
          <View style={S.periodRow}>
            <Text style={S.headerMeta}>
              Reporting period: {formatDate(report.periodStart)} – {formatDate(report.periodEnd)}
            </Text>
            <Text style={S.headerMeta}>Project ID: {report.projectId}</Text>
          </View>
        </View>
        <View style={S.accentBar} />

        <View style={[S.badge, report.status === 'in_progress' ? S.badgeDraft : {}]}>
          <Text style={S.badgeText}>
            {report.status === 'final' ? 'FINALISED ANNUAL REPORT' : 'DRAFT — YEAR IN PROGRESS'}
          </Text>
        </View>

        {/* Headline metrics */}
        <View style={[S.statsBox, { marginTop: 12 }]}>
          <View>
            <Text style={S.statValue}>{diversity.shannonIndex.toFixed(2)}</Text>
            <Text style={S.statLabel}>Shannon diversity H′</Text>
          </View>
          <View>
            <Text style={S.statValue}>{diversity.speciesRichness}</Text>
            <Text style={S.statLabel}>Tree species</Text>
          </View>
          <View>
            <Text style={S.statValue}>{wildlife.speciesRichness}</Text>
            <Text style={S.statLabel}>Wildlife species</Text>
          </View>
          <View>
            <Text style={S.statValue}>{wildlife.individualsObserved}</Text>
            <Text style={S.statLabel}>Animals recorded</Text>
          </View>
          <View>
            <Text style={S.statValue}>
              {recovery.treeSurvivalRate === null
                ? '—'
                : `${recovery.treeSurvivalRate.toFixed(1)}%`}
            </Text>
            <Text style={S.statLabel}>Tree survival</Text>
          </View>
        </View>

        {/* Species diversity */}
        <View style={S.block}>
          <Text style={S.sectionLabel}>Species diversity index</Text>
          <Text style={S.sectionTitle}>
            H′ {diversity.shannonIndex.toFixed(2)} · evenness {diversity.evenness.toFixed(2)} ·{' '}
            {diversity.totalIndividuals.toLocaleString('en-US')} individuals
          </Text>
          <Text style={S.body}>{diversity.interpretation}</Text>
          <Text style={[S.body, { color: '#64748B', marginTop: 3 }]}>
            Counts derived from: {sourceLabel(diversity.source)}
          </Text>
        </View>

        {report.baselineComparison && (
          <View style={S.callout}>
            <Text style={S.calloutText}>{report.baselineComparison.summary}</Text>
          </View>
        )}

        {/* Wildlife sightings */}
        <View style={S.block}>
          <Text style={S.sectionLabel}>Wildlife sightings</Text>
          <Text style={S.sectionTitle}>
            {wildlife.approvedSightings} approved record
            {wildlife.approvedSightings === 1 ? '' : 's'} · {wildlife.speciesRichness} species ·{' '}
            {wildlife.byGroup.length} taxonomic group
            {wildlife.byGroup.length === 1 ? '' : 's'}
          </Text>

          {wildlife.byGroup.length === 0 ? (
            <Text style={S.body}>No approved wildlife sightings recorded in this period.</Text>
          ) : (
            <>
              <View style={S.tableHead}>
                <Text style={[S.tableHeadCell, { flex: 2 }]}>Taxonomic group</Text>
                <Text style={[S.tableHeadCell, { flex: 1 }]}>Species</Text>
                <Text style={[S.tableHeadCell, { flex: 1 }]}>Individuals</Text>
              </View>
              {wildlife.byGroup.map((group) => (
                <View key={group.taxonomicGroup} style={S.tableRow}>
                  <Text style={[S.cell, { flex: 2 }]}>{groupLabel(group.taxonomicGroup)}</Text>
                  <Text style={[S.cell, { flex: 1 }]}>{group.speciesCount}</Text>
                  <Text style={[S.cell, { flex: 1 }]}>{group.individualCount}</Text>
                </View>
              ))}
            </>
          )}

          {wildlife.notableSpecies.length > 0 && (
            <View style={{ marginTop: 6 }}>
              <Text style={[S.body, { color: '#64748B' }]}>
                Notable records:{' '}
                {wildlife.notableSpecies
                  .map(
                    (species) =>
                      `${species.commonName} (${species.individualCount} individual${
                        species.individualCount === 1 ? '' : 's'
                      }, ${groupLabel(species.taxonomicGroup)})`
                  )
                  .join('; ')}
              </Text>
            </View>
          )}

          {wildlife.pendingSightings > 0 && (
            <Text style={[S.body, { color: '#B45309', marginTop: 3 }]}>
              {wildlife.pendingSightings} citizen-scientist record
              {wildlife.pendingSightings === 1 ? ' is' : 's are'} awaiting review and excluded from
              the figures above.
            </Text>
          )}
        </View>

        {/* Recovery indicators */}
        <View style={S.block}>
          <Text style={S.sectionLabel}>Ecosystem recovery indicators</Text>
          <Text style={S.sectionTitle}>
            {recovery.recoveryStatus
              ? `Band: ${recovery.recoveryStatus.replace(/-/g, ' ')}`
              : 'Insufficient data for a recovery band'}
          </Text>
          <View style={S.tableHead}>
            <Text style={[S.tableHeadCell, { flex: 2.4 }]}>Indicator</Text>
            <Text style={[S.tableHeadCell, { flex: 1 }]}>Value</Text>
            <Text style={[S.tableHeadCell, { flex: 1.4 }]}>vs previous year</Text>
          </View>
          {recovery.indicators.map((indicator) => (
            <View key={indicator.key} style={S.tableRow}>
              <Text style={[S.cell, { flex: 2.4 }]}>{indicator.label}</Text>
              <Text style={[S.cell, { flex: 1 }]}>{formatIndicatorValue(indicator)}</Text>
              <Text style={[S.cellMuted, { flex: 1.4 }]}>{trendLabel(indicator.trend)}</Text>
            </View>
          ))}
        </View>

        {/* Coverage */}
        <View style={S.block}>
          <Text style={S.sectionLabel}>Field survey coverage</Text>
          <Text style={S.body}>
            {coverage.censusSubmissions} census submission
            {coverage.censusSubmissions === 1 ? '' : 's'} ·{' '}
            {coverage.treesCounted.toLocaleString('en-US')} trees counted ·{' '}
            {coverage.wildlifeSubmissions} wildlife submission
            {coverage.wildlifeSubmissions === 1 ? '' : 's'}
          </Text>
          <Text style={[S.body, { color: '#64748B' }]}>
            Surveyors: {coverage.surveyors.length > 0 ? coverage.surveyors.join(', ') : '—'}
          </Text>
          <Text style={[S.body, { color: '#64748B' }]}>
            Observations spanning {formatDate(coverage.firstObservationAt)} to{' '}
            {formatDate(coverage.lastObservationAt)}
          </Text>
        </View>

        {/* Methodology */}
        <View>
          <Text style={S.sectionLabel}>Methodology</Text>
          {report.methodology.map((line, index) => (
            <Text key={index} style={S.methodologyText}>
              {index + 1}. {line}
            </Text>
          ))}
        </View>

        <View style={S.footer} fixed>
          <Text style={S.footerText}>
            FarmCredit · Biodiversity impact report {report.year} · generated{' '}
            {formatDate(report.generatedAt)}
          </Text>
          <Text
            style={S.footerText}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}

// ── Route handler ─────────────────────────────────────────────────────────────

/**
 * GET /api/projects/[id]/biodiversity-report/[year]/pdf
 *
 * Downloadable annual biodiversity impact report (issue #1630, AC3).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; year: string }> }
): Promise<NextResponse> {
  const { id, year } = await params;

  const adminProject = mockAdminProjectDetails.find(
    (project) => project.id === id || project.slug === id
  );
  const carbonProject = mockCarbonProjects.find(
    (project) => project.id === (adminProject?.id ?? id)
  );
  const projectId = adminProject?.id ?? carbonProject?.id;
  if (!projectId) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const parsedYear = parseReportYear(year);
  if (!parsedYear.ok) {
    return NextResponse.json({ error: parsedYear.message }, { status: 400 });
  }

  seedProjectWildlife(projectId);

  const report = getProjectBiodiversityReports(projectId).find(
    (candidate) => candidate.year === parsedYear.value
  );
  if (!report) {
    return NextResponse.json(
      {
        error: `No field survey data for ${parsedYear.value}`,
        code: 'no_survey_data',
      },
      { status: 404 }
    );
  }

  const projectName = adminProject?.name ?? carbonProject?.name ?? projectId;

  const pdfBuffer = await renderToBuffer(
    <BiodiversityImpactReportPdf report={report} projectName={projectName} />
  );

  const filename = `biodiversity-report-${projectId}-${report.year}.pdf`;

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
