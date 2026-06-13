import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import OnboardingShell from '@/src/screens/onboarding/OnboardingShell';
import { useAppStore } from '@/src/store/appStore';

export default function OnboardingCoordinationScreen() {
  const router = useRouter();
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);

  async function onGetStarted() {
    await completeOnboarding();
    router.replace('/auth/register' as any);
  }

  return (
    <OnboardingShell
      stepIndex={3}
      title={'End-to-End\nCoordination'}
      subtitle="From airport transfers to your final destination, we coordinate it all."
      hero={<Ionicons name="car" size={56} color="#2563eb" />}
      primaryLabel="Get Started"
      onPrimary={onGetStarted}
    />
  );
}
