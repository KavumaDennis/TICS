import { useRouter } from 'expo-router';
import { Text } from 'react-native';

import PremiumShell from '@/src/screens/premium/PremiumShell';

export default function PremiumBenefitsScreen() {
  const router = useRouter();
  return (
    <PremiumShell
      showBack
      title="Premium Benefits"
      subtitle="Unlimited alerts, AI recommendations, priority support and more."
      primaryLabel="See Plans"
      onPrimary={() => router.push('/premium/plans' as any)}
    >
      <Text className="text-tics-muted text-[12px]">• Unlimited alerts</Text>
      <Text className="text-tics-muted text-[12px]">• Priority support</Text>
      <Text className="text-tics-muted text-[12px]">• Smart recommendations</Text>
    </PremiumShell>
  );
}
