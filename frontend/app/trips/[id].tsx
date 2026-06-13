import { Redirect, useLocalSearchParams } from 'expo-router';

import TripDetailsScreen from '@/src/screens/TripDetailsScreen';
import { useAuthStore } from '@/src/store/useAuthStore';

export default function TripDetailsRoute() {
  const token = useAuthStore((s) => s.token);
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!token) return <Redirect href="/auth/login" />;
  return <TripDetailsScreen />;
}
