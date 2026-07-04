import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Sensitivity } from '../dsp/detector';

const OPTIONS: { value: Sensitivity; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

export function SensitivityControl({
  value,
  onChange,
}: {
  value: Sensitivity;
  onChange: (next: Sensitivity) => void;
}) {
  return (
    <View style={styles.row}>
      {OPTIONS.map((opt) => {
        const selected = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={[styles.pill, selected && styles.pillSelected]}
          >
            <Text style={[styles.pillText, selected && styles.pillTextSelected]}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    backgroundColor: '#eee',
    borderRadius: 10,
    padding: 3,
  },
  pill: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  pillSelected: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  pillText: {
    fontSize: 14,
    color: '#777',
    fontWeight: '500',
  },
  pillTextSelected: {
    color: '#222',
    fontWeight: '700',
  },
});
