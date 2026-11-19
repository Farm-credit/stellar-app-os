import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import { StyleSheet, Text, View, Button, Image, Switch, ScrollView, TextInput } from 'react-native';
import { useEffect, useState } from 'react';

export default function App() {
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [syncStatus, setSyncStatus] = useState('All progress synced!');
  const [gpsCoordinates, setGpsCoordinates] = useState('');
  const [gpsStatus, setGpsStatus] = useState('Locating your position...');

  useEffect(() => {
    let isMounted = true;

    async function captureGpsOnLaunch() {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!permission.granted) {
          if (isMounted) setGpsStatus('Location permission was denied. Enter coordinates manually.');
          return;
        }

        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });

        if (isMounted) {
          setGpsCoordinates(
            `${position.coords.latitude.toFixed(6)}, ${position.coords.longitude.toFixed(6)}`
          );
          setGpsStatus('GPS captured automatically.');
        }
      } catch {
        if (isMounted) setGpsStatus('Unable to capture GPS. Enter coordinates manually.');
      }
    }

    void captureGpsOnLaunch();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleUploadPhoto = () => {
    // Dummy handler for taking/picking a photo
    setPhotoUri('https://picsum.photos/200/300');
    setSyncStatus(isOffline ? '1 item pending sync (Offline)' : 'Uploading...');

    if (!isOffline) {
      setTimeout(() => setSyncStatus('Photo uploaded successfully!'), 1500);
    }
  };

  const handleSyncProgress = () => {
    setSyncStatus('Syncing progress with server...');
    setTimeout(() => setSyncStatus('All progress synced!'), 2000);
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Planter App 🌱</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Network Status</Text>
        <View style={styles.row}>
          <Text>Offline Mode:</Text>
          <Switch value={isOffline} onValueChange={setIsOffline} />
        </View>
        <Text style={styles.statusText}>{syncStatus}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Planting Location</Text>
        <Text style={styles.statusText}>{gpsStatus}</Text>
        <TextInput
          style={styles.input}
          value={gpsCoordinates}
          onChangeText={setGpsCoordinates}
          placeholder="Latitude, longitude"
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Planting GPS coordinates"
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Photo Uploads</Text>
        <Button title="Take/Upload Photo" onPress={handleUploadPhoto} />
        {photoUri && <Image source={{ uri: photoUri }} style={styles.image} />}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Offline Progress Tracking</Text>
        <Button title="Force Sync Now" onPress={handleSyncProgress} disabled={isOffline} />
      </View>

      <StatusBar style="auto" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#f4f4f4',
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 30,
    color: '#2e7d32',
  },
  section: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 15,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  statusText: {
    fontStyle: 'italic',
    color: '#555',
    marginTop: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  image: {
    width: '100%',
    height: 200,
    marginTop: 15,
    borderRadius: 8,
  },
});
