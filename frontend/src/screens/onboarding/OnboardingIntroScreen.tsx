import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { View, Text } from 'react-native';

import OnboardingShell from '@/src/screens/onboarding/OnboardingShell';

export default function OnboardingIntroScreen() {
  const router = useRouter();
  return (
    <OnboardingShell
      stepIndex={0}
      title="Travel Without the Chaos"
      subtitle="TICS keeps every part of your journey connected, so you can travel with confidence."
      hero={
        <View className="w-20 h-20 rounded-3xl items-center justify-center bg-tics-amber/20 border border-tics-amber/50">
          <Ionicons name="airplane" size={40} color="#60A5FA" />
        </View>
      }
      primaryLabel="Get Started"
      onPrimary={() => router.push('/onboarding/monitoring' as any)}
      backgroundImage={require('../../../assets/images/slide1.jpg')}
    />
  );
}