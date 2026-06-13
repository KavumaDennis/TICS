import { View, Text, StyleSheet } from 'react-native';

import { colors } from '@/src/constants/theme';

export default function AlertBanner({ message }: { message: string }) {
  return (
    <View style={styles.root}>
      <Text style={styles.title}>Alert</Text>
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: 'rgba(255, 94, 118, 0.15)',
    borderColor: 'rgba(255, 94, 118, 0.35)',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  title: { color: colors.danger, fontWeight: '700', marginBottom: 4 },
  message: { color: colors.text },
});

