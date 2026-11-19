import { useEffect, useState } from 'react';
import { SafeAreaView, ScrollView, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { registerForPushNotifications } from './src/notifications/registerForPushNotifications';

type Snapshot = {
  trees: number;
  co2Tonnes: number;
  protectedHectares: number;
  lastSyncedAt: string;
};
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://farmcredit.app';
export default function App() {
  const [snapshot, setSnapshot] = useState<Snapshot>({
    trees: 4840,
    co2Tonnes: 305.3,
    protectedHectares: 134.1,
    lastSyncedAt: 'cached',
  });
  
  useEffect(() => {
    void (async () => {
      const cached = await AsyncStorage.getItem('sponsor-portfolio');
      if (cached) setSnapshot(JSON.parse(cached) as Snapshot);
      await registerForPushNotifications(API_URL).catch(() => undefined);
      const response = await fetch(`${API_URL}/api/portfolio?sponsor=mobile`).catch(() => null);
      if (response?.ok) {
        const data = (await response.json()) as { totals: Omit<Snapshot, 'lastSyncedAt'> };
        const next = { ...data.totals, lastSyncedAt: new Date().toISOString() };
        setSnapshot(next);
        await AsyncStorage.setItem('sponsor-portfolio', JSON.stringify(next));
      }
    })();
  }, []);
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as
        | { type?: string; screen?: string }
        | undefined;
      const screen = data?.screen ?? routeForNotificationType(data?.type);
      if (screen) {
        // Navigation is wired up by the root navigator; this listener only resolves the target.
        console.log(`[push] route to ${screen}`);
      }
    });
    return () => subscription.remove();
  }, []);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0d0b21' }}>
      <ScrollView contentContainerStyle={{ padding: 24, gap: 20 }}>
        <Text style={{ color: '#14b6e7', fontSize: 14, fontWeight: '700' }}>STELLAR SPONSOR</Text>
        <Text style={{ color: '#fff', fontSize: 32, fontWeight: '800' }}>Your forest</Text>
        <Text style={{ color: '#cbd5e1' }}>
          Health alerts and milestones, even when you are offline.
        </Text>
        <View style={{ gap: 12 }}>
          <Metric label="Trees sponsored" value={snapshot.trees.toLocaleString()} />
          <Metric label="CO₂ captured" value={`${snapshot.co2Tonnes.toFixed(1)} t`} />
          <Metric label="Forest protected" value={`${snapshot.protectedHectares.toFixed(1)} ha`} />
        </View>
        <Text style={{ color: '#94a3b8', fontSize: 12 }}>
          Last synced:{' '}
          {snapshot.lastSyncedAt === 'cached'
            ? 'offline cache'
            : new Date(snapshot.lastSyncedAt).toLocaleString()}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
function routeForNotificationType(type?: string): string | null {
  switch (type) {
    case 'tree_planted':
      return 'TreeDetail';
    case 'tree_survival_1y':
      return 'TreeDetail';
    case 'tree_milestone_5y':
      return 'TreeMilestone';
    case 'achievement_unlocked':
      return 'Achievements';
    default:
      return null;
  }
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ backgroundColor: '#141230', borderRadius: 16, padding: 18 }}>
      <Text style={{ color: '#94a3b8' }}>{label}</Text>
      <Text style={{ color: '#fff', fontSize: 28, fontWeight: '800', marginTop: 8 }}>{value}</Text>
    </View>
  );
}
