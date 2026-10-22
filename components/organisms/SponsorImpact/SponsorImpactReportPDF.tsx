import React from 'react';
import { Circle, Document, Page, StyleSheet, Svg, Text, View } from '@react-pdf/renderer';
import type { ImpactReportData } from '@/lib/impact-report/impact-report-data';

const styles = StyleSheet.create({
  page: { padding: 40, paddingBottom: 60, fontFamily: 'Helvetica', fontSize: 10, color: '#111827' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottom: '2 solid #00b36b',
    paddingBottom: 14,
    marginBottom: 20,
  },
  brand: { flexDirection: 'row', alignItems: 'center' },
  brandName: { fontSize: 20, fontWeight: 'bold', color: '#14B6E7', marginLeft: 8 },
  headerMeta: { textAlign: 'right', fontSize: 9, color: '#6B7280' },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 4 },
  sponsorName: { fontSize: 16, color: '#00b36b', fontWeight: 'bold', marginBottom: 2 },
  address: { fontSize: 8, color: '#6B7280', marginBottom: 18 },
  cards: { flexDirection: 'row', marginBottom: 22 },
  card: {
    flex: 1,
    backgroundColor: '#F0FDF4',
    border: '1 solid #BBF7D0',
    borderRadius: 8,
    padding: 12,
    marginRight: 8,
  },
  cardLast: { marginRight: 0 },
  cardValue: { fontSize: 22, fontWeight: 'bold', color: '#059669' },
  cardLabel: { fontSize: 8, color: '#4B5563', textTransform: 'uppercase', marginTop: 3 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#00b36b',
    borderBottom: '1 solid #E5E7EB',
    paddingBottom: 4,
    marginBottom: 8,
  },
  section: { marginBottom: 20 },
  intro: { fontSize: 9, color: '#4B5563', marginBottom: 8 },
  row: {
    flexDirection: 'row',
    paddingVertical: 4,
    borderBottom: '1 solid #F3F4F6',
  },
  rowHead: { backgroundColor: '#F9FAFB', fontWeight: 'bold' },
  colName: { flex: 3 },
  colCount: { flex: 1, textAlign: 'right' },
  colPct: { flex: 1, textAlign: 'right' },
  footer: {
    position: 'absolute',
    bottom: 28,
    left: 40,
    right: 40,
    textAlign: 'center',
    fontSize: 8,
    color: '#9CA3AF',
    borderTop: '1 solid #E5E7EB',
    paddingTop: 8,
  },
});

/** Platform mark — mirrors public/icon-source.svg so no image asset is needed. */
function PlatformLogo({ size = 30 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 512 512">
      <Circle cx={256} cy={256} r={120} fill="#14B6E7" opacity={0.2} />
      <Circle cx={256} cy={256} r={80} fill="#14B6E7" opacity={0.4} />
      <Circle cx={256} cy={256} r={40} fill="#14B6E7" />
      <Circle cx={376} cy={256} r={28} fill="#00C2FF" />
      <Circle cx={136} cy={256} r={28} fill="#00C2FF" />
      <Circle cx={256} cy={136} r={28} fill="#3E1BDB" />
      <Circle cx={256} cy={376} r={28} fill="#00B36B" />
    </Svg>
  );
}

function BreakdownTable({
  label,
  rows,
}: {
  label: string;
  rows: { name: string; count: number; percent: number }[];
}) {
  return (
    <View>
      <View style={[styles.row, styles.rowHead]}>
        <Text style={styles.colName}>{label}</Text>
        <Text style={styles.colCount}>Trees</Text>
        <Text style={styles.colPct}>Share</Text>
      </View>
      {rows.map((r) => (
        <View key={r.name} style={styles.row} wrap={false}>
          <Text style={styles.colName}>{r.name}</Text>
          <Text style={styles.colCount}>{r.count.toLocaleString('en-US')}</Text>
          <Text style={styles.colPct}>{r.percent.toFixed(1)}%</Text>
        </View>
      ))}
    </View>
  );
}

export function SponsorImpactReportPDF({ data }: { data: ImpactReportData }) {
  const generated = new Date(data.generatedOn).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });

  return (
    <Document
      title={`${data.sponsorName} — ${data.reportYear} Impact Report`}
      author="FarmCredit"
      subject="Annual sponsor impact report"
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.header} fixed>
          <View style={styles.brand}>
            <PlatformLogo />
            <Text style={styles.brandName}>FarmCredit</Text>
          </View>
          <View style={styles.headerMeta}>
            <Text>Annual Impact Report {data.reportYear}</Text>
            <Text>Generated {generated}</Text>
          </View>
        </View>

        <Text style={styles.title}>Annual Impact Report {data.reportYear}</Text>
        <Text style={styles.sponsorName}>{data.sponsorName}</Text>
        <Text style={styles.address}>{data.sponsorAddress}</Text>

        <View style={styles.cards}>
          <View style={styles.card}>
            <Text style={styles.cardValue}>{data.totalTrees.toLocaleString('en-US')}</Text>
            <Text style={styles.cardLabel}>Total trees</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardValue}>{data.totalCo2Tonnes.toFixed(1)} t</Text>
            <Text style={styles.cardLabel}>CO2 absorbed / year</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardValue}>{data.speciesCount}</Text>
            <Text style={styles.cardLabel}>Species</Text>
          </View>
          <View style={[styles.card, styles.cardLast]}>
            <Text style={styles.cardValue}>{data.regionCount}</Text>
            <Text style={styles.cardLabel}>Regions</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Species diversity</Text>
          <Text style={styles.intro}>
            {data.speciesCount} species across {data.totalTrees.toLocaleString('en-US')} trees.
          </Text>
          <BreakdownTable
            label="Species"
            rows={data.speciesBreakdown.map((s) => ({
              name: s.species,
              count: s.count,
              percent: s.percent,
            }))}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Geographic spread</Text>
          <Text style={styles.intro}>
            Trees planted across {data.regionCount} {data.regionCount === 1 ? 'region' : 'regions'}.
          </Text>
          <BreakdownTable
            label="Region"
            rows={data.regionBreakdown.map((r) => ({
              name: r.region,
              count: r.count,
              percent: r.percent,
            }))}
          />
        </View>

        <Text style={styles.footer} fixed>
          Prepared for {data.sponsorName} · FarmCredit · CO2 figures are estimated annual
          absorption across all sponsored trees.
        </Text>
      </Page>
    </Document>
  );
}
