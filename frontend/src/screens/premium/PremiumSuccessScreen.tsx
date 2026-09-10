import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

import PremiumShell from '@/src/screens/premium/PremiumShell';
import { SafeText } from '@/src/components/responsive/SafeText';

export default function PremiumSuccessScreen() {
  const router = useRouter();
  return (
    <PremiumShell
      title="Success"
      subtitle="You are now a Premium Member!"
      primaryLabel="Go to Dashboard"
      onPrimary={() => router.replace('/home')}
    >
      <View className="items-center">
        <Ionicons name="checkmark-circle" size={56} color="#22C55E" />
        <SafeText className="mt-3 text-tics-muted text-[12px]">Premium is applied to your account.</SafeText>
      </View>
    </PremiumShell>
  );
}

