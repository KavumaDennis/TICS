import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import OnboardingShell from '@/src/screens/onboarding/OnboardingShell';

export default function OnboardingIntroScreen() {
  const router = useRouter();
  return (
    <OnboardingShell
      stepIndex={0}
      title={'Smarter Travel\nStarts Here'}
      subtitle="TICS monitors your trips, alerts you of disruptions, and helps you every step of the way."
      hero={<Ionicons name="sparkles" size={56} color="#60a5fa" />}
      primaryLabel="Next"
      onPrimary={() => router.push('/onboarding/monitoring' as any)}
    />
  );
}
