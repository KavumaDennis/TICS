import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import ScreenBackground from '@/src/components/ScreenBackground';
import Card from '@/src/components/Card';
import { SafeText } from '@/src/components/responsive/SafeText';

export default function PaymentMethodsScreen() {
  const router = useRouter();

  return (
    <ScreenBackground variant="blue">
      <View className="flex-1 px-5 pt-14">
        <View className="flex-row items-center justify-between">
          <Pressable onPress={() => router.back()} className="h-10 w-10 items-center justify-center rounded-2xl border border-white/12 bg-white/[0.06]">
            <Ionicons name="chevron-back" size={22} color="#f8fafc" />
          </Pressable>
          <SafeText className="text-[17px] font-extrabold text-white">Payment methods</SafeText>
          <View className="w-10" />
        </View>

        <ScrollView className="mt-6" contentContainerClassName="gap-4 pb-28">
          <Card accent="purple" className="px-5 py-5">
            <SafeText className="text-[14px] font-extrabold text-white">Overview</SafeText>
            <SafeText className="mt-2 text-[13px] leading-5 text-slate-400">
              Saved cards and billing profiles will appear here for premium upgrades and partner bookings. No payment methods are stored yet.
            </SafeText>
          </Card>

          <Pressable className="rounded-[22px] border border-dashed border-white/20 bg-white/[0.04] px-5 py-8">
            <View className="items-center">
              <Ionicons name="add-circle-outline" size={36} color="rgba(248,250,252,0.45)" />
              <SafeText className="mt-3 text-[14px] font-bold text-white">Add payment method</SafeText>
              <SafeText className="mt-1 text-center text-[12px] text-slate-500">Coming soon — Stripe / native wallets.</SafeText>
            </View>
          </Pressable>
        </ScrollView>
      </View>
    </ScreenBackground>
  );
}
