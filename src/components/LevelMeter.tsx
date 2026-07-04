import { StyleSheet, Text, View } from 'react-native';

const MIN_DB = -60;
const MAX_DB = 0;

function clampToPercent(db: number | null): number {
  if (db == null) return 0;
  const clamped = Math.min(MAX_DB, Math.max(MIN_DB, db));
  return ((clamped - MIN_DB) / (MAX_DB - MIN_DB)) * 100;
}

export function LevelMeter({ db, active }: { db: number | null; active: boolean }) {
  const percent = clampToPercent(db);

  return (
    <View style={styles.container}>
      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            { width: `${percent}%`, backgroundColor: active ? '#ff8f5e' : '#c8c8c8' },
          ]}
        />
      </View>
      <Text style={styles.label}>{db != null ? `${db.toFixed(1)} dB` : '—'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    gap: 6,
  },
  track: {
    height: 14,
    borderRadius: 7,
    backgroundColor: '#eee',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 7,
  },
  label: {
    fontSize: 13,
    color: '#666',
    textAlign: 'right',
  },
});
