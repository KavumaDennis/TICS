import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import PremiumShell from '@/src/screens/premium/PremiumShell';
import Card from '@/src/components/Card';

export default function ChoosePlanScreen() {
  const router = useRouter();
  return (
    <PremiumShell
      showBack
      title="Choose Plan"
      subtitle="Monthly or Annual subscription."
      primaryLabel="Select Plan"
      onPrimary={() => router.push('/premium/payment' as any)}
    >
      <View className="flex-row gap-3">
        <Card className="flex-1 px-4 py-4">
          <Text className="text-tics-text text-[13px] font-extrabold">Monthly</Text>
          <Text className="mt-2 text-tics-text text-[18px] font-black">$9.99</Text>
        </Card>
        <Card className="flex-1 px-4 py-4">
          <Text className="text-tics-text text-[13px] font-extrabold">Annual</Text>
          <Text className="mt-2 text-tics-text text-[18px] font-black">$99.99</Text>
        </Card>
      </View>
      <Pressable onPress={() => router.push('/premium/payment' as any)} className="rounded-2xl bg-tics-green px-5 py-4">
        <Text className="text-center text-[13px] font-extrabold text-[#07131F]">Pay $9.99</Text>
      </Pressable>
    </PremiumShell>
  );
}
