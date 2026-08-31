import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { HomeScreen } from './src/screens/HomeScreen';
import { MyTreesScreen } from './src/screens/MyTreesScreen';
import { ARTreeViewerScreen } from './src/screens/ARTreeViewerScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import {
  authenticateWithBiometrics,
  getBiometricAvailability,
  type BiometricAvailability,
} from './src/lib/biometrics';

type Tab = 'home' | 'trees' | 'ar' | 'profile';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'home', label: 'Home' },
  { id: 'trees', label: 'My Trees' },
  { id: 'ar', label: 'AR' },
  { id: 'profile', label: 'Profile' },
];

export default function App() {
  const [availability, setAvailability] = useState<BiometricAvailability>({ available: false });
  const [unlocked, setUnlocked] = useState(false);
  const [tab, setTab] = useState<Tab>('home');

  useEffect(() => {
    void (async () => {
      const info = await getBiometricAvailability();
      setAvailability(info);
      if (!info.available) {
        // Simulator / device without biometrics: allow entry so the app is
        // still usable; the Profile tab documents the fallback.
        setUnlocked(true);
        return;
      }
      if (info.enrolled) {
        setUnlocked(await authenticateWithBiometrics());
      } else {
        setUnlocked(true);
      }
    })();
  }, []);

  if (!unlocked) {
    return (
      <View style={styles.lockScreen}>
        <Text style={styles.lockTitle}>FarmCredit Sponsor</Text>
        <Text style={styles.lockSubtitle}>Unlock to manage your forest</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Unlock the app"
          onPress={() => void authenticateWithBiometrics().then(setUnlocked)}
          style={({ pressed }) => [styles.unlockButton, pressed && styles.unlockPressed]}
        >
          <Text style={styles.unlockText}>Unlock</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.screen}>
        {tab === 'home' && <HomeScreen />}
        {tab === 'trees' && <MyTreesScreen />}
        {tab === 'ar' && <ARTreeViewerScreen />}
        {tab === 'profile' && <ProfileScreen />}
      </View>

      <View style={styles.tabBar} accessibilityRole="tablist" accessibilityLabel="Main navigation">
        {TABS.map(({ id, label }) => {
          const selected = tab === id;
          return (
            <Pressable
              key={id}
              accessibilityRole="tab"
              accessibilityLabel={label}
              accessibilityState={{ selected }}
              onPress={() => setTab(id)}
              style={[styles.tab, selected && styles.tabSelected]}
            >
              <Text style={[styles.tabText, selected && styles.tabTextSelected]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f4f4f4' },
  screen: { flex: 1 },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ccc',
    backgroundColor: '#fff',
    paddingBottom: 12,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  tabSelected: { borderTopWidth: 2, borderTopColor: '#14b6e7' },
  tabText: { fontSize: 13, color: '#666' },
  tabTextSelected: { color: '#0d3b1f', fontWeight: '700' },
  lockScreen: { flex: 1, backgroundColor: '#0d3b1f', alignItems: 'center', justifyContent: 'center' },
  lockTitle: { color: '#fff', fontSize: 26, fontWeight: '700' },
  lockSubtitle: { color: '#cfe8d8', fontSize: 15, marginTop: 8, marginBottom: 28 },
  unlockButton: {
    backgroundColor: '#14b6e7',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 48,
  },
  unlockPressed: { opacity: 0.8 },
  unlockText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
