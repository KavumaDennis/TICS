import type { ComponentProps } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

import OnboardingShell from '@/src/screens/onboarding/OnboardingShell';

function Bubble({
  icon,
  colors,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  colors: readonly [string, string];
}) {
  return (
    <LinearGradient
      colors={colors}
      style={{
        width: 72,
        height: 72,
        borderRadius: 36,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.18)',
      }}
    >
      <Ionicons name={icon} size={30} color="#f8fafc" />
    </LinearGradient>
  );
}

export default function OnboardingRecommendationsScreen() {
  const router = useRouter();
  return (
    <OnboardingShell
      stepIndex={2}
      title={'Smart AI\nRecommendations'}
      subtitle="Get AI-powered options and rebooking suggestions in seconds."
      hero={
        <View className="flex-row items-center justify-center gap-4">
          <Bubble icon="airplane" colors={['rgba(96,165,250,0.5)', 'rgba(59,130,246,0.35)']} />
          <Bubble icon="hardware-chip" colors={['rgba(167,139,250,0.55)', 'rgba(139,92,246,0.38)']} />
          <Bubble icon="walk" colors={['rgba(52,211,153,0.5)', 'rgba(34,197,94,0.35)']} />
        </View>
      }
      primaryLabel="Next"
      onPrimary={() => router.push('/onboarding/coordination' as any)}
    />
  );
}
