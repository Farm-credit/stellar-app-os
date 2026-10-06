import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import {
  authenticateWithBiometrics,
  biometricLabel,
  getBiometricAvailability,
  type BiometricAvailability,
} from '../lib/biometrics';
import { registerForPushNotifications } from '../lib/notifications';

export function ProfileScreen() {
  const [availability, setAvailability] = useState<BiometricAvailability>({ available: false });
  const [authState, setAuthState] = useState<'idle' | 'checking' | 'success' | 'failed'>('idle');
  const [pushEnabled, setPushEnabled] = useState(false);

  useEffect(() => {
    void getBiometricAvailability().then(setAvailability);
  }, []);

  const handleAuth = async () => {
    setAuthState('checking');
    const ok = await authenticateWithBiometrics();
    setAuthState(ok ? 'success' : 'failed');
  };

  const handlePushToggle = async (enabled: boolean) => {
    setPushEnabled(enabled);
    if (enabled) {
      const token = await registerForPushNotifications();
      setPushEnabled(token !== null);
    }
  };

  const label = availability.available ? biometricLabel(availability.type) : 'Biometrics';

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Profile</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Security</Text>
        <Text style={styles.meta}>
          {availability.available
            ? `${label} ${availability.enrolled ? 'enrolled and ready' : 'not enrolled on this device'}`
            : 'Biometric hardware not available (simulator?).'}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Unlock with ${label}`}
          disabled={!availability.available || !availability.enrolled}
          onPress={() => void handleAuth()}
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
            (!availability.available || !availability.enrolled) && styles.buttonDisabled,
          ]}
        >
          <Text style={styles.buttonText}>
            {authState === 'checking'
              ? 'Authenticating…'
              : authState === 'success'
                ? 'Unlocked ✓'
                : authState === 'failed'
                  ? 'Failed — try again'
                  : `Unlock with ${label}`}
          </Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.cardTitle}>Push notifications</Text>
          <Switch
            accessibilityLabel="Enable push notifications for growth updates"
            value={pushEnabled}
            onValueChange={(value) => void handlePushToggle(value)}
          />
        </View>
        <Text style={styles.meta}>Get notified when your sponsored trees hit growth milestones.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f4f4', padding: 16 },
  title: { fontSize: 26, fontWeight: '700', color: '#0d3b1f', marginBottom: 16 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#111' },
  meta: { fontSize: 13, color: '#666', marginTop: 6, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  button: {
    backgroundColor: '#14b6e7',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonPressed: { opacity: 0.75 },
  buttonDisabled: { backgroundColor: '#b9c4bd' },
  buttonText: { color: '#fff', fontWeight: '600' },
});
