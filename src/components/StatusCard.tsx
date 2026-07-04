import { StyleSheet, Text, View } from 'react-native';

import { DEFAULT_CONFIG, DetectorSnapshot } from '../dsp/detector';

const REASON_LABEL: Record<string, string> = {
  'level-rise': 'Motor sounds like it is straining',
  'level-drop': 'Machine has gone quiet',
  'variance-shift': "Sound's texture changed",
};

function phaseHeadline(snapshot: DetectorSnapshot, isRecording: boolean): string {
  switch (snapshot.phase) {
    case 'idle':
      return 'Ready to listen';
    case 'calibrating':
      return isRecording ? 'Learning your machine’s sound…' : 'Listening interrupted';
    case 'monitoring':
      return isRecording ? 'Listening for a change…' : 'Listening interrupted';
    case 'paused':
      return 'Paused';
    case 'done':
      return '🍦 Done!';
  }
}

export function StatusCard({
  snapshot,
  isRecording,
}: {
  snapshot: DetectorSnapshot;
  isRecording: boolean;
}) {
  const calibrationSecondsLeft = Math.ceil(snapshot.calibrationRemainingMs / 1000);
  const holdProgress = Math.min(1, snapshot.triggerHeldMs / DEFAULT_CONFIG.sustainMs);
  const interrupted = (snapshot.phase === 'calibrating' || snapshot.phase === 'monitoring') && !isRecording;

  return (
    <View style={styles.card}>
      <Text style={styles.headline}>{phaseHeadline(snapshot, isRecording)}</Text>

      {interrupted && (
        <Text style={styles.detail}>
          Lost the microphone — your baseline is safe, tap Resume to keep going.
        </Text>
      )}

      {snapshot.phase === 'paused' && (
        <Text style={styles.detail}>
          Your baseline is saved — tap Resume to keep listening right where you left off.
        </Text>
      )}

      {snapshot.phase === 'calibrating' && isRecording && (
        <Text style={styles.detail}>{calibrationSecondsLeft}s remaining</Text>
      )}

      {snapshot.phase === 'monitoring' && (
        <>
          <Text style={styles.detail}>
            baseline {snapshot.baselineMean?.toFixed(1) ?? '—'} dB · now{' '}
            {snapshot.currentMean?.toFixed(1) ?? '—'} dB
          </Text>
          {snapshot.reason && isRecording && (
            <View style={styles.holdRow}>
              <Text style={styles.detail}>{REASON_LABEL[snapshot.reason]}, confirming…</Text>
              <View style={styles.holdTrack}>
                <View style={[styles.holdFill, { width: `${holdProgress * 100}%` }]} />
              </View>
            </View>
          )}
        </>
      )}

      {snapshot.phase === 'done' && snapshot.reason && (
        <Text style={styles.detail}>{REASON_LABEL[snapshot.reason]}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    backgroundColor: '#fafafa',
    borderRadius: 14,
    padding: 16,
    gap: 6,
  },
  headline: {
    fontSize: 20,
    fontWeight: '700',
    color: '#222',
  },
  detail: {
    fontSize: 14,
    color: '#666',
  },
  holdRow: {
    gap: 4,
    marginTop: 4,
  },
  holdTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#eee',
    overflow: 'hidden',
  },
  holdFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: '#ff8f5e',
  },
});
