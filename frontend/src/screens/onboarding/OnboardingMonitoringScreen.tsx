import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

import OnboardingShell from '@/src/screens/onboarding/OnboardingShell';

export default function OnboardingMonitoringScreen() {
  const router = useRouter();
  return (
    <OnboardingShell
      stepIndex={1}
      title={'Real-time\nMonitoring'}
      subtitle="We track your flights, connections, weather and more in real-time."
      hero={
        
          <View className="relative items-center justify-center">
            <Ionicons name="location" size={28} color="#2563eb" style={{ position: 'absolute', top: -8, right: -14 }} />
            <Ionicons name="person" size={44} color="#2563eb" />
          </View>
        
      }
      primaryLabel="Next"
      onPrimary={() => router.push('/onboarding/recommendations' as any)}
    />
  );
}
