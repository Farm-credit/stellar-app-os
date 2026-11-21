import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { Tree, TreeSpecies, TreeStatus } from '@/lib/types/tree';

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: 'Helvetica', fontSize: 10, lineHeight: 1.4 },
  header: { marginBottom: 25, borderBottom: '2 solid #00b36b', paddingBottom: 15 },
  logo: { fontSize: 22, fontWeight: 'bold', color: '#00b36b', marginBottom: 5 },
  subtitle: { fontSize: 10, color: '#666' },
  title: { fontSize: 18, fontWeight: 'bold', marginTop: 15, marginBottom: 10, color: '#333' },
  summaryGrid: { flexDirection: 'row', gap: 10, marginBottom: 25 },
  summaryCard: {
    flex: 1,
    backgroundColor: '#F0FDF4',
    padding: 15,
    borderRadius: 8,
    border: '1 solid #BBF7D0',
  },
  summaryCardBlue: {
    flex: 1,
    backgroundColor: '#F0F9FF',
    padding: 15,
    borderRadius: 8,
    border: '1 solid #BAE6FD',
  },
  summaryCardAmber: {
    flex: 1,
    backgroundColor: '#FFFBEB',
    padding: 15,
    borderRadius: 8,
    border: '1 solid #FDE68A',
  },
  summaryCardPurple: {
    flex: 1,
    backgroundColor: '#FAF5FF',
    padding: 15,
    borderRadius: 8,
    border: '1 solid #E9D5FF',
  },
  summaryValue: { fontSize: 24, fontWeight: 'bold', marginBottom: 3 },
  summaryLabel: {
    fontSize: 9,
    color: '#666',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  section: { marginBottom: 20 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#00b36b',
    borderBottom: '1 solid #E5E7EB',
    paddingBottom: 5,
  },
  carbonBox: {
    backgroundColor: '#ECFDF5',
    padding: 18,
    borderRadius: 10,
    marginBottom: 20,
    textAlign: 'center',
    border: '1 solid #A7F3D0',
  },
  carbonValue: { fontSize: 32, fontWeight: 'bold', color: '#059669', marginBottom: 5 },
  carbonLabel: { fontSize: 11, color: '#065F46', fontWeight: 'bold' },
  carbonSubtext: { fontSize: 9, color: '#047857', marginTop: 5 },
  treeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  treeCard: {
    width: '48%',
    border: '1 solid #E5E7EB',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    backgroundColor: '#FAFAFA',
  },
  treeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  speciesBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    fontSize: 9,
    fontWeight: 'bold',
    color: '#FFF',
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    fontSize: 8,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  treeIcon: {
    width: 60,
    height: 50,
    borderRadius: 6,
    textAlign: 'center',
    overflow: 'hidden',
    marginBottom: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  treeIconText: { fontSize: 28, fontWeight: 'bold', color: '#FFF', opacity: 0.9 },
  treeId: { fontSize: 9, color: '#6B7280', fontWeight: 'bold', marginBottom: 3 },
  treeProject: { fontSize: 11, fontWeight: 'bold', color: '#111827', marginBottom: 6 },
  treeDetail: {
    fontSize: 9,
    color: '#4B5563',
    marginBottom: 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  detailLabel: { color: '#6B7280' },
  detailValue: { fontWeight: 'bold', color: '#111827' },
  co2Row: {
    marginTop: 8,
    paddingTop: 8,
    borderTop: '1 solid #E5E7EB',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  co2Label: {
    fontSize: 8,
    color: '#059669',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  co2Value: { fontSize: 12, fontWeight: 'bold', color: '#059669' },
  speciesLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 8, color: '#4B5563' },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    textAlign: 'center',
    fontSize: 8,
    color: '#9CA3AF',
    borderTop: '1 solid #E5E7EB',
    paddingTop: 10,
  },
});

const speciesColors: Partial<Record<TreeSpecies, string>> = {
  Teak: '#f59e0b',
  Moringa: '#10b981',
  Eucalyptus: '#14b8a6',
  Mangrove: '#06b6d4',
  Acacia: '#84cc16',
  Neem: '#22c55e',
  'African Mahogany': '#a16207',
  Baobab: '#d97706',
  'Bamboo (Moso)': '#4ade80',
  'West African Cedar': '#15803d',
  'Caribbean Pine': '#166534',
  Iroko: '#854d0e',
  Shea: '#ca8a04',
  Cashew: '#f97316',
  'African Locust Bean': '#78350f',
};

const statusColors: Record<TreeStatus, { bg: string; text: string }> = {
  funded: { bg: '#FEF3C7', text: '#92400E' },
  planted: { bg: '#DBEAFE', text: '#1E40AF' },
  verified: { bg: '#D1FAE5', text: '#065F46' },
  completed: { bg: '#ECFDF5', text: '#064E3B' },
  failed: { bg: '#FEE2E2', text: '#991B1B' },
};

const speciesInitials: Partial<Record<TreeSpecies, string>> = {
  Teak: 'TK',
  Moringa: 'MO',
  Eucalyptus: 'EU',
  Mangrove: 'MN',
  Acacia: 'AC',
  Neem: 'NE',
  'African Mahogany': 'AM',
  Baobab: 'BA',
  'Bamboo (Moso)': 'BM',
  'West African Cedar': 'WC',
  'Caribbean Pine': 'CP',
  Iroko: 'IR',
  Shea: 'SH',
  Cashew: 'CA',
  'African Locust Bean': 'AB',
};

interface ForestReportPDFProps {
  trees: Tree[];
  totalCount: number;
  totalCO2Kg: number;
  speciesCount: number;
  regionCount: number;
  activeCount: number;
  generatedDate: string;
}

export const ForestReportPDF: React.FC<ForestReportPDFProps> = ({
  trees,
  totalCount,
  totalCO2Kg,
  speciesCount,
  regionCount,
  activeCount,
  generatedDate,
}) => {
  const co2Display =
    totalCO2Kg >= 1000 ? `${(totalCO2Kg / 1000).toFixed(1)} tonnes` : `${totalCO2Kg.toFixed(0)} kg`;
  const co2YearEquivalent =
    totalCO2Kg >= 1000
      ? `Equivalent to taking ${Math.round(totalCO2Kg / 1000 / 0.000411).toLocaleString()} cars off the road for a year`
      : `Equivalent to taking ${Math.round(totalCO2Kg / 0.411)} cars off the road for a day`;

  const uniqueSpecies = Array.from(new Set(trees.map((t) => t.species)));

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.logo}>FarmCredit</Text>
          <Text style={styles.subtitle}>Sponsored Forest Impact Report</Text>
        </View>

        <Text style={styles.title}>Your Forest Summary</Text>

        <View style={styles.carbonBox}>
          <Text style={styles.carbonValue}>{co2Display}</Text>
          <Text style={styles.carbonLabel}>CO₂ Offset Potential Per Year</Text>
          <Text style={styles.carbonSubtext}>{co2YearEquivalent}</Text>
        </View>

        <View style={styles.summaryGrid}>
          <View style={styles.summaryCard}>
            <Text style={[styles.summaryValue, { color: '#00b36b' }]}>{totalCount}</Text>
            <Text style={styles.summaryLabel}>Trees Sponsored</Text>
          </View>
          <View style={styles.summaryCardBlue}>
            <Text style={[styles.summaryValue, { color: '#0284c7' }]}>{activeCount}</Text>
            <Text style={styles.summaryLabel}>Active Trees</Text>
          </View>
          <View style={styles.summaryCardAmber}>
            <Text style={[styles.summaryValue, { color: '#d97706' }]}>{speciesCount}</Text>
            <Text style={styles.summaryLabel}>Species</Text>
          </View>
          <View style={styles.summaryCardPurple}>
            <Text style={[styles.summaryValue, { color: '#7c3aed' }]}>{regionCount}</Text>
            <Text style={styles.summaryLabel}>Regions</Text>
          </View>
        </View>

        {uniqueSpecies.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Species Legend</Text>
            <View style={styles.speciesLegend}>
              {uniqueSpecies.map((species) => (
                <View key={species} style={styles.legendItem}>
                  <View
                    style={[
                      styles.legendDot,
                      { backgroundColor: speciesColors[species] ?? '#94a3b8' },
                    ]}
                  />
                  <Text style={styles.legendText}>{species}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Trees ({trees.length})</Text>
          <View style={styles.treeGrid}>
            {trees.map((tree) => {
              const speciesColor = speciesColors[tree.species] ?? '#94a3b8';
              const statusStyle = statusColors[tree.status];
              const initials =
                speciesInitials[tree.species] ?? tree.species.slice(0, 2).toUpperCase();
              const plantedDate = tree.plantedAt
                ? new Date(tree.plantedAt).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })
                : 'Pending';

              return (
                <View key={tree.id} style={styles.treeCard}>
                  <View style={[styles.treeIcon, { backgroundColor: speciesColor }]}>
                    <Text style={styles.treeIconText}>{initials}</Text>
                  </View>

                  <View style={styles.treeHeader}>
                    <View>
                      <Text style={styles.treeId}>#{tree.treeId || tree.id.slice(0, 8)}</Text>
                      <Text style={styles.treeProject}>{tree.projectName}</Text>
                    </View>
                    <View
                      style={[
                        styles.statusBadge,
                        { backgroundColor: statusStyle.bg, color: statusStyle.text },
                      ]}
                    >
                      <Text>{tree.status}</Text>
                    </View>
                  </View>

                  <View style={styles.treeDetail}>
                    <Text style={styles.detailLabel}>Species:</Text>
                    <View style={[styles.speciesBadge, { backgroundColor: speciesColor }]}>
                      <Text>{tree.species}</Text>
                    </View>
                  </View>

                  <View style={styles.treeDetail}>
                    <Text style={styles.detailLabel}>Region:</Text>
                    <Text style={styles.detailValue}>{tree.region}</Text>
                  </View>

                  <View style={styles.treeDetail}>
                    <Text style={styles.detailLabel}>Planted:</Text>
                    <Text style={styles.detailValue}>{plantedDate}</Text>
                  </View>

                  <View style={styles.treeDetail}>
                    <Text style={styles.detailLabel}>Location:</Text>
                    <Text style={styles.detailValue}>
                      {tree.lat?.toFixed(2)}, {tree.lng?.toFixed(2)}
                    </Text>
                  </View>

                  <View style={styles.co2Row}>
                    <Text style={styles.co2Label}>CO₂ / yr</Text>
                    <Text style={styles.co2Value}>
                      {tree.co2OffsetKgPerYear >= 1000
                        ? `${(tree.co2OffsetKgPerYear / 1000).toFixed(2)}t`
                        : `${tree.co2OffsetKgPerYear.toFixed(0)}kg`}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.footer}>
          <Text>Generated on {generatedDate} • FarmCredit Forest Report</Text>
          <Text>Each tree represents a verified, real-world planting on the Stellar Network</Text>
        </View>
      </Page>
    </Document>
  );
};
