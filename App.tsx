import { StatusBar } from 'expo-status-bar';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { useAudioMonitor } from './src/audio/useAudioMonitor';
import { LevelMeter } from './src/components/LevelMeter';
import { SensitivityControl } from './src/components/SensitivityControl';
import { StatusCard } from './src/components/StatusCard';

export default function App() {
  const monitor = useAudioMonitor();
  const { snapshot, isRecording } = monitor;

  const isActiveListening =
    (snapshot.phase === 'calibrating' || snapshot.phase === 'monitoring') && isRecording;
  const needsResume =
    snapshot.phase === 'paused' ||
    ((snapshot.phase === 'calibrating' || snapshot.phase === 'monitoring') && !isRecording);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>🍦 Churn Watch</Text>
          <Text style={styles.subtitle}>
            Listens to your ice cream maker and tells you when it&apos;s done.
          </Text>
        </View>

        <StatusCard snapshot={snapshot} isRecording={isRecording} />

        <LevelMeter db={snapshot.currentMean ?? null} active={isActiveListening} />

        {monitor.permissionDenied && (
          <Text style={styles.error}>
            Microphone permission was denied. Enable it in Settings to use Churn Watch.
          </Text>
        )}
        {monitor.error && <Text style={styles.error}>{monitor.error}</Text>}

        {snapshot.phase === 'idle' && (
          <Pressable style={styles.button} onPress={monitor.start}>
            <Text style={styles.buttonText}>Start listening</Text>
          </Pressable>
        )}

        {isActiveListening && (
          <View style={styles.buttonRow}>
            <Pressable
              style={[styles.button, styles.buttonSecondary, styles.buttonFlex]}
              onPress={monitor.pause}
            >
              <Text style={styles.buttonSecondaryText}>Pause</Text>
            </Pressable>
            <Pressable
              style={[styles.button, styles.buttonStop, styles.buttonFlex]}
              onPress={monitor.stop}
            >
              <Text style={styles.buttonText}>End session</Text>
            </Pressable>
          </View>
        )}

        {needsResume && (
          <View style={styles.buttonRow}>
            <Pressable style={[styles.button, styles.buttonFlex]} onPress={monitor.resume}>
              <Text style={styles.buttonText}>Resume</Text>
            </Pressable>
            <Pressable
              style={[styles.button, styles.buttonStop, styles.buttonFlex]}
              onPress={monitor.stop}
            >
              <Text style={styles.buttonText}>End session</Text>
            </Pressable>
          </View>
        )}

        {snapshot.phase === 'done' && (
          <View style={styles.buttonRow}>
            <Pressable style={[styles.button, styles.buttonFlex]} onPress={monitor.stop}>
              <Text style={styles.buttonText}>Confirm done</Text>
            </Pressable>
            <Pressable
              style={[styles.button, styles.buttonSecondary, styles.buttonFlex]}
              onPress={monitor.dismissDone}
            >
              <Text style={styles.buttonSecondaryText}>False alarm, keep listening</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.sensitivitySection}>
          <Text style={styles.sensitivityLabel}>Sensitivity</Text>
          <SensitivityControl value={monitor.sensitivity} onChange={monitor.setSensitivity} />
        </View>

        <Text style={styles.hint}>
          Place your phone near the machine, start it churning, then tap Start. Give it about a
          minute to learn the baseline sound before it starts watching for changes. Need to check
          on it? Tap Pause first — Resume picks up right where you left off.
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
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  buttonFlex: {
    flex: 1,
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
  buttonSecondary: {
    backgroundColor: '#eee',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  buttonSecondaryText: {
    color: '#333',
    fontSize: 15,
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
