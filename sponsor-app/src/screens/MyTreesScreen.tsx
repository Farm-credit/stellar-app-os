import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { getCachedSponsorships, type CachedSponsorship } from '../lib/offlineCache';

export function MyTreesScreen() {
  const [trees, setTrees] = useState<CachedSponsorship[]>([]);

  useEffect(() => {
    void getCachedSponsorships().then(setTrees);
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>My trees</Text>
      <Text style={styles.subtitle}>Growth tracking, available offline.</Text>

      {trees.length === 0 ? (
        <Text style={styles.empty}>No sponsored trees yet — sponsor one from the Home tab.</Text>
      ) : (
        <FlatList
          data={trees}
          keyExtractor={(item) => item.id}
          accessibilityLabel="Sponsored trees and their growth status"
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardText}>
                <Text style={styles.species}>{item.species}</Text>
                <Text style={styles.meta}>
                  {item.region} · {item.quantity} tree{item.quantity === 1 ? '' : 's'}
                </Text>
              </View>
              <View style={styles.statusPill}>
                <Text style={styles.statusText}>{item.status}</Text>
              </View>
            </View>
          )}
        />
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Refresh tree growth data"
        onPress={() => void getCachedSponsorships().then(setTrees)}
        style={({ pressed }) => [styles.refresh, pressed && styles.refreshPressed]}
      >
        <Text style={styles.refreshText}>Refresh</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f4f4', padding: 16 },
  title: { fontSize: 26, fontWeight: '700', color: '#0d3b1f', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#555', marginBottom: 16 },
  empty: { fontSize: 15, color: '#777', marginTop: 24, textAlign: 'center' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardText: { flex: 1 },
  species: { fontSize: 17, fontWeight: '600', color: '#111' },
  meta: { fontSize: 13, color: '#666', marginTop: 4 },
  statusPill: {
    backgroundColor: '#e6f7ee',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  statusText: { fontSize: 13, fontWeight: '600', color: '#0d7a3f', textTransform: 'capitalize' },
  refresh: {
    marginTop: 8,
    alignSelf: 'center',
    backgroundColor: '#14b6e7',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  refreshPressed: { opacity: 0.75 },
  refreshText: { color: '#fff', fontWeight: '600' },
});
