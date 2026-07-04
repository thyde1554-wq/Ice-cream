import { StyleSheet, Text, View } from 'react-native';

import { DEFAULT_CONFIG, DetectorSnapshot } from '../dsp/detector';

const REASON_LABEL: Record<string, string> = {
  'level-rise': 'Motor sounds like it is straining',
  'level-drop': 'Machine has gone quiet',
  'variance-shift': "Sound's texture changed",
};

function phaseHeadline(snapshot: DetectorSnapshot): string {
  switch (snapshot.phase) {
    case 'idle':
      return 'Ready to listen';
    case 'calibrating':
      return 'Learning your machine’s sound…';
    case 'monitoring':
      return 'Listening for a change…';
    case 'done':
      return '🍦 Done!';
  }
}

export function StatusCard({ snapshot }: { snapshot: DetectorSnapshot }) {
  const calibrationSecondsLeft = Math.ceil(snapshot.calibrationRemainingMs / 1000);
  const holdProgress = Math.min(1, snapshot.triggerHeldMs / DEFAULT_CONFIG.sustainMs);

  return (
    <View style={styles.card}>
      <Text style={styles.headline}>{phaseHeadline(snapshot)}</Text>

      {snapshot.phase === 'calibrating' && (
        <Text style={styles.detail}>{calibrationSecondsLeft}s remaining</Text>
      )}

      {snapshot.phase === 'monitoring' && (
        <>
          <Text style={styles.detail}>
            baseline {snapshot.baselineMean?.toFixed(1) ?? '—'} dB · now{' '}
            {snapshot.currentMean?.toFixed(1) ?? '—'} dB
          </Text>
          {snapshot.reason && (
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
