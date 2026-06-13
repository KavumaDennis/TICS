import { Stack } from 'expo-router';

export default function AccountSectionLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#0a0b1e' },
      }}
    />
  );
}
