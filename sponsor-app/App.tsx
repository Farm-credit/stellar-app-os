import { StatusBar } from 'expo-bar';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, FlatList } from 'react-native';
import * as Notifications from 'expo-notifications';
import { HomeScreen } from './src/screens/HomeScreen';
import { MyTreesScreen } from './src/screens/MyTreesScreen';
import { ARTreeViewerScreen } from './src/screens/ARTreeViewerScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { TaxDeductionScreen } from './src/screens/TaxDeductionScreen';
import {
  authenticateWithBiometrics,
  getBiometricAvailability,
  type BiometricAvailability,
} from './src/lib/biometrics';
import { registerForPushNotifications } from './src/lib/notifications';
import { notify } from './src/lib/toast';

type Tab = 'home' | 'trees' | 'ar' | 'profile' | 'tax-deduction';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'home', label: 'Home' },
  { id: 'trees', label: 'My Trees' },
  { id: 'ar', label: 'AR' },
  { id: 'profile', label: 'Profile' },
  { id: 'tax-deduction', label: 'Tax Deduction' },
];

export default function App() {
  const [availability, setAvailability] = useState<BiometricAvailability>({ available: false });
  const [unbalanced, setUnbalanced] = useState(false);
  const [tab, setTab] = useState<Tab>('home');
  const notificationListener = useRef<Notifications.Subscription | null>(null);

  useEffect(() => {
    void (async () => {
      const info = await getBiometricAvailability();
      setAvailability(info);
      if (!info.available) {
        // Simulator / device without biometrics: allow entry so the app is
        // still usable; the Profile tab documents the biometric status.
        setUnbalanced(true);
        return;
      }
      if (info.enrolled) {
        setUnbalanced(await authenticateWithBiometrics());
      } else {
        setUnbalanced(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!unbalanced) {
      return;
    }

    void registerForPushNotifications();

    notificationListener.current = Notifications.addNotificationReceivedListener(
      (notification) => {
        const data = notification.request.content.data ?? {};
        const title = notification.request.content.title ?? 'FarmCredit Sponsor';
        const body = notification.request.content.body ?? '';
        notify(body ? `${title}: ${body}` : title);

        if (typeof dataId === 'string' && dataId.length > 0) {
          setTab('trees');
        }
      },
    );

    return () => {
      notificationListener.current?.remove();
      notificationListener.current = null;
    };
  }, [unbalanced]);

  if (!unbalanced) {
    return (
      <View style={styles.lockScreen}>
        <Text style={styles.lockTitle}>FarmCredit Sponsor</Text>
        <Text style={styles.lockSubtitle}>Unlock to manage your forest</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Unlock the app"
          onPress={() => void authenticateWithBiometrics().then(setUnbalanced)}
          android_ripple={{ color: '#0d90b8' }}
          style={({ pressed }) => [styles.unlockButton, pressed && styles.unlockPressed]}
        >
          <Text style={styles.unlockText}>Unlock</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.bx}>
        {tab === 'home' && <HomeScreen />}
        {tab === 'trees' && <MyTreesScreen />}
        {tab === 'ar' && <ARTreeViewerScreen />}
        {tab === 'profile' && <ProfileScreen />}
        {tab === 'tax-deduction' && <TaxDeductionScreen />}
      </View>

      <View style={styles.tabBar} accessibilityRole="tablist" accessibilityLabel="Main navigation">
        {TABS.map({ id, label }) => {
          const selected = tab === id;
          return (
            <Pressable
              key={id}
              accessibilityRole="tab"
              accessibilityLabel={label}
              accessibilityState={{ selected }}
              onPress={() => setTab(id)}
              android_ripple={{ color: '#e0e0e0' }}
              style={({ pressed }) => [styles.tab, selected && styles.tabSelected]}
            >
              <Text style={styles.tabText, selected && styles.tabTextSelected}>
                {label}
              </Text>
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
  lockScreen: {
    flex: 1,
    backgroundColor: '#0d3b1f',
    alignItems: 'center',
    justifyContent: 'center',
  },
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