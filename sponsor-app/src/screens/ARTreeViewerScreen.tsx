import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

/**
 * AR tree viewing (#1119).
 *
 * The AR engine itself (e.g. `expo-gl` + a 3D runtime) is intentionally left
 * as an integration point: it needs a physical device and a configured 3D
 * asset pipeline. This screen owns the UX — selecting a tree and entering
 * the viewer — so the engine can be dropped in without screen changes.
 */
export function ARTreeViewerScreen() {
  const [viewerActive, setViewerActive] = useState(false);

  const handleEnterViewer = () => {
    // Integration point: mount <ARScene treeId={...} /> here once the AR
    // engine is configured (see README "AR tree viewing").
    setViewerActive(true);
    Alert.alert(
      'AR viewer',
      'The AR scene integration point is ready. On a physical device, point the camera at a flat surface to place your tree.'
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>View your tree in AR</Text>
      <Text style={styles.subtitle}>
        {viewerActive
          ? 'AR scene placeholder — engine integration documented in README.'
          : 'Place a 3D preview of your sponsored tree in the real world.'}
      </Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Enter AR tree viewer"
        onPress={handleEnterViewer}
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
      >
        <Text style={styles.buttonText}>View in AR</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f4f4', padding: 16, justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '700', color: '#0d3b1f', textAlign: 'center' },
  subtitle: { fontSize: 15, color: '#666', textAlign: 'center', marginTop: 8, marginBottom: 24 },
  button: {
    alignSelf: 'center',
    backgroundColor: '#0d7a3f',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 32,
  },
  buttonPressed: { opacity: 0.75 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
