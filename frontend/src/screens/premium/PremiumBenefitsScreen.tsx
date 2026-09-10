import { useRouter } from 'expo-router';
import { Text } from 'react-native';

import PremiumShell from '@/src/screens/premium/PremiumShell';
import { SafeText } from '@/src/components/responsive/SafeText';

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
      <SafeText className="text-tics-muted text-[12px]">• Unlimited alerts</SafeText>
      <SafeText className="text-tics-muted text-[12px]">• Priority support</SafeText>
      <SafeText className="text-tics-muted text-[12px]">• Smart recommendations</SafeText>
    </PremiumShell>
  );
}
