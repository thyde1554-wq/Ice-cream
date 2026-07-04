import { StatusBar } from 'expo-status-bar';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { useAudioMonitor } from './src/audio/useAudioMonitor';
import { LevelMeter } from './src/components/LevelMeter';
import { SensitivityControl } from './src/components/SensitivityControl';
import { StatusCard } from './src/components/StatusCard';

export default function App() {
  const monitor = useAudioMonitor();
  const { snapshot } = monitor;
  const isActive = snapshot.phase !== 'idle' && snapshot.phase !== 'done';

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>🍦 Churn Watch</Text>
          <Text style={styles.subtitle}>
            Listens to your ice cream maker and tells you when it&apos;s done.
          </Text>
        </View>

        <StatusCard snapshot={snapshot} />

        <LevelMeter db={snapshot.currentMean ?? null} active={monitor.isRecording} />

        {monitor.permissionDenied && (
          <Text style={styles.error}>
            Microphone permission was denied. Enable it in Settings to use Churn Watch.
          </Text>
        )}
        {monitor.error && <Text style={styles.error}>{monitor.error}</Text>}

        <Pressable
          style={[styles.button, isActive && styles.buttonStop]}
          onPress={() => (isActive || snapshot.phase === 'done' ? monitor.stop() : monitor.start())}
        >
          <Text style={styles.buttonText}>
            {snapshot.phase === 'done' ? 'Reset' : isActive ? 'Stop listening' : 'Start listening'}
          </Text>
        </Pressable>

        <View style={styles.sensitivitySection}>
          <Text style={styles.sensitivityLabel}>Sensitivity</Text>
          <SensitivityControl value={monitor.sensitivity} onChange={monitor.setSensitivity} />
        </View>

        <Text style={styles.hint}>
          Place your phone near the machine, start it churning, then tap Start. Give it about a
          minute to learn the baseline sound before it starts watching for changes.
        </Text>

        <StatusBar style="auto" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  container: {
    flex: 1,
    padding: 24,
    gap: 20,
    justifyContent: 'center',
  },
  header: {
    gap: 4,
    marginBottom: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#222',
  },
  subtitle: {
    fontSize: 14,
    color: '#777',
  },
  error: {
    color: '#c0392b',
    fontSize: 13,
  },
  button: {
    backgroundColor: '#ff8f5e',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  buttonStop: {
    backgroundColor: '#555',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  sensitivitySection: {
    gap: 8,
  },
  sensitivityLabel: {
    fontSize: 13,
    color: '#666',
    fontWeight: '600',
  },
  hint: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
  },
});
