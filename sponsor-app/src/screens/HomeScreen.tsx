import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { fetchTreeSpecies, type TreeSpecies } from '../lib/treeApi';
import {
  addCachedSponsorship,
  enqueuePendingAction,
  getPendingActions,
} from '../lib/offlineCache';
import { notify } from '../lib/notifications';

export function HomeScreen() {
  const [species, setSpecies] = useState<TreeSpecies[]>([]);
  const [pendingCount, setPendingCount] = useState(0);

  const refreshPending = useCallback(async () => {
    const actions = await getPendingActions();
    setPendingCount(actions.length);
  }, []);

  useEffect(() => {
    void fetchTreeSpecies().then(setSpecies);
    void refreshPending();
  }, [refreshPending]);

  const handleSponsor = async (tree: TreeSpecies) => {
    const id = `sponsor-${Date.now()}`;
    await addCachedSponsorship({
      id,
      species: tree.name,
      region: 'West Africa',
      quantity: 1,
    });
    await enqueuePendingAction({
      type: 'sponsor',
      payload: { treeId: tree.id, species: tree.name, quantity: 1 },
    });
    await refreshPending();
    await notify('Tree sponsored 🌳', `${tree.name} added to your forest.`);
    Alert.alert('Tree sponsored', `${tree.name} is on its way. Track growth in My Trees.`);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Sponsor a tree</Text>
      <Text style={styles.subtitle}>
        {pendingCount > 0
          ? `${pendingCount} sponsorship${pendingCount === 1 ? '' : 's'} pending sync (offline queue).`
          : 'Choose a species to sponsor. Works offline — actions sync later.'}
      </Text>

      <FlatList
        data={species}
        keyExtractor={(item) => item.id}
        accessibilityLabel="Tree species available for sponsorship"
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardText}>
              <Text style={styles.speciesName}>{item.name}</Text>
              <Text style={styles.speciesMeta}>
                ~{item.co2PerYearKg} kg CO₂/year · {item.priceXlm} XLM
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Sponsor a ${item.name} tree`}
              onPress={() => void handleSponsor(item)}
              style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
            >
              <Text style={styles.buttonText}>Sponsor</Text>
            </Pressable>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f4f4', padding: 16 },
  title: { fontSize: 26, fontWeight: '700', color: '#0d3b1f', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#555', marginBottom: 16 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardText: { flex: 1, paddingRight: 12 },
  speciesName: { fontSize: 17, fontWeight: '600', color: '#111' },
  speciesMeta: { fontSize: 13, color: '#666', marginTop: 4 },
  button: {
    backgroundColor: '#14b6e7',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  buttonPressed: { opacity: 0.75 },
  buttonText: { color: '#fff', fontWeight: '600' },
});
