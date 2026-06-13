import TripInputScreen from '@/src/screens/TripInputScreen';
import { useAuthStore } from '@/src/store/useAuthStore';
import { Redirect } from 'expo-router';

export default function TripInputRoute() {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Redirect href="/auth/login" />;
  return <TripInputScreen />;
}
