import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';

import PremiumShell from '@/src/screens/premium/PremiumShell';
import Card from '@/src/components/Card';
import { SafeText } from '@/src/components/responsive/SafeText';

export default function PremiumPaymentScreen() {
  const router = useRouter();
  return (
    <PremiumShell
      showBack
      title="Payment"
      subtitle="Enter your payment details."
      primaryLabel="Pay $9.99"
      onPrimary={() => router.replace('/premium/success' as any)}
    >
      <Card className="px-5 py-4">
        <SafeText className="text-tics-muted text-[12px]">Card Number</SafeText>
        <View className="mt-2 h-10 rounded-xl bg-white/5" />
      </Card>
      <Card className="px-5 py-4">
        <SafeText className="text-tics-muted text-[12px]">Expiry</SafeText>
        <View className="mt-2 h-10 rounded-xl bg-white/5" />
      </Card>
      <Card className="px-5 py-4">
        <SafeText className="text-tics-muted text-[12px]">Name on Card</SafeText>
        <View className="mt-2 h-10 rounded-xl bg-white/5" />
      </Card>
    </PremiumShell>
  );
}
