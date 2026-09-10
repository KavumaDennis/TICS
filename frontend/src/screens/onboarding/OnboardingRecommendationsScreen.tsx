import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, View, Text } from 'react-native';

import OnboardingShell from '@/src/screens/onboarding/OnboardingShell';
import { SafeText } from '@/src/components/responsive/SafeText';

export default function OnboardingRecommendationsScreen() {
  const router = useRouter();
  return (
    <OnboardingShell
      stepIndex={2}
      title="Recover Faster When Plans Change"
      subtitle="Our AI instantly finds the best alternatives and rebooks options so you can keep moving forward."
      hero={
        <View className="w-20 h-20 rounded-3xl items-center justify-center bg-tics-amber/20 border border-tics-amber/50">
          <Ionicons name="sparkles" size={40} color="#A78BFA" />
        </View>
      }
      primaryLabel="Next"
      onPrimary={() => router.push('/onboarding/coordination' as any)}
      backgroundImage={require('../../../assets/images/slide7.jpg')}
      contextCards={
        <View className="rounded-4xl bg-white/5 border border-white/5 p-5">
          <View className="flex-row items-center justify-between mb-3">
            <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-text text-[12px]">Smart Alternative Found</SafeText>
            <Ionicons name="checkmark-circle" size={16} color="#22C55E" />
          </View>
          <View className="gap-2">
            <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-text text-[15px] font-semibold">New Flight Option</SafeText>
            <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-muted text-[13px]">KQ 484</SafeText>
            <View className="flex-row items-center gap-2 mt-2">
              <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-text text-[13px]">3:10 PM</SafeText>
              <Ionicons name="arrow-forward" size={14} color="#94a3b8" />
              <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-text text-[13px]">5:45 PM</SafeText>
            </View>
            <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-muted text-[12px] mt-1">NBO → JRO</SafeText>
            <View className="flex-row items-center gap-2 mt-3">
              <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-green text-[12px]">Better time · Less delay</SafeText>
            </View>
          </View>
          <Pressable className="mt-4 rounded-full bg-purple-500/30 border border-purple-500/20 p-6 items-center">
            <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-purple-300 text-[13px]">View Details</SafeText>
          </Pressable>
        </View>
      }
    />
  );
}