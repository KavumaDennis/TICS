import { Redirect } from 'expo-router';

import { useAppStore } from '@/src/store/appStore';
import { useAuthStore } from '@/src/store/useAuthStore';

export default function Index() {
  const onboardingCompleted = useAppStore((s) => s.onboardingCompleted);
  const appHydrated = useAppStore((s) => s.hydrated);
  const authHydrated = useAuthStore((s) => s.hydrated);
  const token = useAuthStore((s) => s.token);

  if (!appHydrated || !authHydrated) return null;

  if (!onboardingCompleted) return <Redirect href={'/onboarding/splash' as any} />;
  if (!token) return <Redirect href="/auth/login" />;
  return <Redirect href="/home" />;
}
