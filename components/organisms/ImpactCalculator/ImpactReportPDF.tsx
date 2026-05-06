import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type {
  TravelInput,
  EnergyInput,
  LifestyleInput,
  ImpactResults,
} from '@/lib/types/impact-calculator';

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: 'Helvetica',
    fontSize: 11,
    lineHeight: 1.5,
  },
  header: {
    marginBottom: 30,
    borderBottom: '2 solid #0066CC',
    paddingBottom: 15,
  },
  logo: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#0066CC',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 10,
    color: '#666',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 20,
    marginBottom: 10,
    color: '#333',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#0066CC',
  },
  totalBox: {
    backgroundColor: '#E6F2FF',
    padding: 20,
    borderRadius: 8,
    marginBottom: 20,
    textAlign: 'center',
  },
  totalValue: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#0066CC',
    marginBottom: 5,
  },
  totalLabel: {
    fontSize: 12,
    color: '#666',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingBottom: 8,
    borderBottom: '1 solid #E5E5E5',
  },
  label: {
    fontSize: 11,
    color: '#333',
  },
  value: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#0066CC',
  },
  breakdownItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  breakdownLabel: {
    fontSize: 11,
    color: '#333',
  },
  breakdownValue: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  recommendationBox: {
    backgroundColor: '#F0F9FF',
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
  },
  recommendationTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#10B981',
    marginBottom: 5,
  },
  recommendationValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#10B981',
    marginBottom: 3,
  },
  recommendationLabel: {
    fontSize: 9,
    color: '#666',
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    textAlign: 'center',
    fontSize: 9,
    color: '#999',
    borderTop: '1 solid #E5E5E5',
    paddingTop: 10,
  },
  grid: {
    flexDirection: 'row',
    gap: 10,
  },
  gridItem: {
    flex: 1,
  },
});

interface ImpactReportPDFProps {
  travel: TravelInput;
  energy: EnergyInput;
  lifestyle: LifestyleInput;
  results: ImpactResults;
  generatedDate: string;
}

export const ImpactReportPDF: React.FC<ImpactReportPDFProps> = ({
  travel,
  energy,
  lifestyle,
  results,
  generatedDate,
}) => (
  <Document>
    <Page size="A4" style={styles.page}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.logo}>FarmCredit</Text>
        <Text style={styles.subtitle}>Carbon Footprint Impact Report</Text>
      </View>

      {/* Title */}
      <Text style={styles.title}>Your Carbon Footprint</Text>

      {/* Total Emissions */}
      <View style={styles.totalBox}>
        <Text style={styles.totalValue}>{results.totalEmissions}</Text>
        <Text style={styles.totalLabel}>tonnes CO₂ per year</Text>
      </View>

      {/* Breakdown */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Emissions Breakdown</Text>
        <View style={styles.breakdownItem}>
          <Text style={styles.breakdownLabel}>Travel</Text>
          <Text style={[styles.breakdownValue, { color: '#0066CC' }]}>
            {results.travelEmissions}t (
            {Math.round((results.travelEmissions / results.totalEmissions) * 100)}%)
          </Text>
        </View>
        <View style={styles.breakdownItem}>
          <Text style={styles.breakdownLabel}>Energy</Text>
          <Text style={[styles.breakdownValue, { color: '#8B5CF6' }]}>
            {results.energyEmissions}t (
            {Math.round((results.energyEmissions / results.totalEmissions) * 100)}%)
          </Text>
        </View>
        <View style={styles.breakdownItem}>
          <Text style={styles.breakdownLabel}>Lifestyle</Text>
          <Text style={[styles.breakdownValue, { color: '#10B981' }]}>
            {results.lifestyleEmissions}t (
            {Math.round((results.lifestyleEmissions / results.totalEmissions) * 100)}%)
          </Text>
        </View>
      </View>

      {/* Recommendations */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Offset Recommendations</Text>
        <View style={styles.grid}>
          <View style={[styles.gridItem, styles.recommendationBox]}>
            <Text style={styles.recommendationTitle}>Trees Needed</Text>
            <Text style={styles.recommendationValue}>{results.treesEquivalent.toLocaleString()}</Text>
            <Text style={styles.recommendationLabel}>to absorb annual emissions</Text>
          </View>
          <View style={[styles.gridItem, styles.recommendationBox]}>
            <Text style={[styles.recommendationTitle, { color: '#0066CC' }]}>Credits to Offset</Text>
            <Text style={[styles.recommendationValue, { color: '#0066CC' }]}>
              {results.recommendedCredits}
            </Text>
            <Text style={styles.recommendationLabel}>carbon credits recommended</Text>
          </View>
        </View>
      </View>

      {/* Input Details */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Your Inputs</Text>
        
        <Text style={{ fontSize: 12, fontWeight: 'bold', marginTop: 10, marginBottom: 5 }}>Travel</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Short flights per year</Text>
          <Text style={styles.value}>{travel.shortFlightsPerYear}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Long flights per year</Text>
          <Text style={styles.value}>{travel.longFlightsPerYear}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Car miles per week</Text>
          <Text style={styles.value}>{travel.carMilesPerWeek}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Primary transport</Text>
          <Text style={styles.value}>{travel.primaryTransport}</Text>
        </View>

        <Text style={{ fontSize: 12, fontWeight: 'bold', marginTop: 15, marginBottom: 5 }}>Energy</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Electricity (kWh/month)</Text>
          <Text style={styles.value}>{energy.electricityKwhPerMonth}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Natural gas (therms/month)</Text>
          <Text style={styles.value}>{energy.gasThermPerMonth}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Renewable energy</Text>
          <Text style={styles.value}>{energy.renewablePercentage}%</Text>
        </View>

        <Text style={{ fontSize: 12, fontWeight: 'bold', marginTop: 15, marginBottom: 5 }}>Lifestyle</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Diet type</Text>
          <Text style={styles.value}>{lifestyle.dietType}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Shopping habits</Text>
          <Text style={styles.value}>{lifestyle.shoppingHabits}</Text>
        </View>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text>Generated on {generatedDate} • FarmCredit Impact Calculator</Text>
        <Text>Visit farmcredit.com to offset your carbon footprint</Text>
      </View>
    </Page>
  </Document>
);
