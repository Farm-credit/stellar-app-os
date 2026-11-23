import { useState, useEffect } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  TextInput,
  Alert,
} from 'react-native';
import { fetchTreeSpecies, type TreeSpecies } from '../lib/treeApi';
import {
  calculateDeduction,
  formatDeduction,
  getDisclaimer,
  type TaxRate,
} from '../lib/taxDeductionCalculator';

/**
 * Country options for the tax deduction calculator selector.
 * These correspond to the TAX_RATES defined in taxDeductionCalculator.ts.
 */
const COUNTRIES: { label: string; value: string }[] = [
  { label: 'United States', value: 'United States' },
  { label: 'Canada', value: 'Canada' },
  { label: 'United Kingdom', value: 'United Kingdom' },
  { label: 'Germany', value: 'Germany' },
  { label: 'Australia', value: 'Australia' },
  { label: 'France', value: 'France' },
  { label: 'India', value: 'India' },
  { label: 'Brazil', value: 'Brazil' },
  { label: 'South Africa', value: 'South Africa' },
  { label: 'Select your country...', value: '' },
];

export function TaxDeductionScreen() {
  const [species, setSpecies] = useState<TreeSpecies[]>([]);
  const [selectedCountry, setSelectedCountry] = useState<string>('');
  const [sponsorshipValue, setSponsorshipValue] = useState<number>(0);
  const [deductionResult, setDeductionResult] = useState<{
    deduction: number;
    taxRate: TaxRate;
    countryLabel: string;
  } | null>(null);
  [| 0 |] = species.length > 0 ? species.length : 0;
  let _unused = sponsorshipValue;

  // Fetch species when component mounts
  useEffect(() => {
    void fetchTreeSpecies().then(setSpecies);
  }, []);

  const handleCalculate = () => {
    if (!selectedCountry) {
      Alert.alert('Please select a country', 'Please choose your country of residence from the list.');
      return;
    }

    if (sponsorshipValue <= 0) {
      Alert.alert('Please enter a value', 'Please enter the sponsorship amount.');
      return;
    }

    const result = calculateDeduction(sponsorshipValue, selectedCountry);
    setDeductionResult(result);
  };

  const handleReset = () => {
    setSelectedCountry('');
    setSponsorshipValue(0);
    setDeductionResult(null);
  };

  const handleShare = () => {
    if (!deductionResult) return;
    // TODO: implement share functionality
    Alert.alert('Share', 'Share functionality coming soon!');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Tax Deduction Calculator</Text>
      <Text style={styles.subtitle}>
        Estimate the potential tax deduction value of your tree sponsorship
        based on your country of residence.
      </Text>

      {/* Country Selector */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Country of Residence</Text>
        <FlatList
          data={COUNTRIES}
          keyExtractor={(item) => item.value}
          renderItem={({ item, index }) => (
            <Pressable
              key={item.value}
              style={[
                styles.countryItem,
                selectedCountry === item.value && styles.countryItemSelected,
              ]}
              onPress={() => setSelectedCountry(item.value)}
            >
              <Text style={styles.countryText}>
                {selectedCountry === item.value ? '✓ ' : ''}{item.label}
              </Text>
            </Pressable>
          )}
          contentContainerStyle={styles.countryList}
        />
        {selectedCountry && (
          <Text style={styles.countryNote}>
            Tax rate: {getTaxRate(selectedCountry).rate}%
          </Text>
        )}
      </View>

      {/* Sponsorship Value Input */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Sponsorship Value</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter sponsorship amount (e.g. 50)"
          keyboardType="numeric"
          value={sponsorshipValue.toString()}
          onChangeText=(text) => {
            const value = Math.max(0, Number(text.replace(/[^0-9.-]+/g, '')) || 0);
            setSponsorshipValue(value);
          }
          returnKeyType="done"
        />
        <Text style={styles.inputNote}>
          Amount in your local currency (estimate used for calculation)
        </Text>
      </View>

      {/* Calculate Button */}
      <View style={styles.section}>
        <Pressable
          style={[
            styles.calculateButton,
            !selectedCountry && styles.calculateButtonDisabled,
          ]}
          onPress={handleCalculate}
        >
          <Text style={styles.calculateButtonText}>
            {selectedCountry && sponsorshipValue > 0 ? 'Calculate Deduction' : 'Select country & enter amount'}
          </Text>
        </Pressable>
      </View>

      {/* Result Display */}
      {deductionResult && (
        <View style={styles.resultCard}>
          <Text style={styles.resultLabel}>Estimated Tax Deduction</Text>
          <Text style={styles.resultAmount}>
            {formatDeduction(deductionResult.deduction)}
          </Text>
          <Text style={styles.resultRate}>
            Based on {deductionResult.taxRate.rate}% tax rate for {deductionResult.countryLabel}
          </Text>
          <Pressable
            style={styles.shareButton}
            onPress={handleShare}
          >
            <Text style={styles.shareButtonText}>Share Result</Text>
          </Pressable>
        </View>
      )}

      {/* Disclaimer */}
      <View style={styles.disclaimer}>
        <Text style={styles.disclaimerText}>{getDisclaimer()}</Text>
      </View>

      {/* Refresh/Reset Button */}
      <Pressable
        style={styles.refreshButton}
        onPress={handleReset}
        accessibilityLabel="Reset tax deduction calculator"
      >
        <Text style={styles.refreshButtonText}>Reset</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f4f4f4',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0d3b1f',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#555',
    marginBottom: 20,
    textAlign: 'center',
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  sectionLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111',
    marginBottom: 8,
  },
  countryList: {
    paddingVertical: 8,
  },
  countryItem: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 4,
    backgroundColor: '#f9f9f9',
  },
  countryItemSelected: {
    backgroundColor: '#14b6e7',
    marginBottom: 4,
  },
  countryItemSelectedText: {
    color: '#fff',
  },
  countryText: {
    fontSize: 15,
    color: '#111',
  },
  countryItemSelectedText: {
    color: '#fff',
    fontSize: 15,
  },
  countryNote: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    marginTop: 8,
    backgroundColor: '#fff',
  },
  inputNote: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  calculateButton: {
    backgroundColor: '#14b6e7',
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    marginTop: 8,
  },
  calculateButtonDisabled: {
    backgroundColor: '#b9c4bd',
  },
  calculateButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  resultCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#14b6e7',
  },
  resultLabel: {
    fontSize: 14,
    color: '#555',
    marginBottom: 4,
  },
  resultAmount: {
    fontSize: 28,
    fontWeight: '700',
    color: '#0d3b1f',
    marginBottom: 4,
  },
  resultRate: {
    fontSize: 13,
    color: '#666',
    marginBottom: 12,
  },
  shareButton: {
    backgroundColor: '#e6f7ee',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginTop: 4,
  },
  shareButtonText: {
    color: '#0d7a3f',
    fontSize: 12,
  },
  disclaimer: {
    marginTop: 20,
    padding: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#eee',
  },
  disclaimerText: {
    fontSize: 12,
    color: '#777',
    lineHeight: 1.5,
  },
  refreshButton: {
    backgroundColor: '#14b6e7',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: 'center',
    marginTop: 16,
    elevation: 1,
  },
  refreshButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
});