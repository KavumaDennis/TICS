import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { View, Text, Pressable } from 'react-native';

import OnboardingShell from '@/src/screens/onboarding/OnboardingShell';
import { useAppStore } from '@/src/store/appStore';
import { SafeText } from '@/src/components/responsive/SafeText';

export default function OnboardingCoordinationScreen() {
  const router = useRouter();
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);

  async function onGetStarted() {
    await completeOnboarding();
    router.replace('/auth/register' as any);
  }

  return (
    <OnboardingShell
      stepIndex={3}
      title="Stay Connected Every Step of the Way"
      subtitle="Share trip updates with your operator, driver, or team. Everyone stays in sync, everywhere."
      hero={
        <View className="w-20 h-20 rounded-3xl items-center justify-center bg-tics-amber/20 border border-tics-amber/50">
          <Ionicons name="people" size={40} color="#22C55E" />
        </View>
      }
      primaryLabel="Create an Account"
      onPrimary={onGetStarted}
      secondaryLabel="Log In"
      onSecondary={() => router.replace('/auth/login' as any)}
      backgroundImage={require('../../../assets/images/slide5.jpg')}
      contextCards={
        <View className="gap-3 mt-2">
          <View className="flex-row items-center gap-3 rounded-3xl bg-white/5 border border-white/5 p-5">
            <View className="w-12 h-12 rounded-full bg-green-500/20 items-center justify-center">
              <Ionicons name="person" size={24} color="#22C55E" />
            </View>
            <View className="flex-1">
              <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-text text-[13px]">Operator</SafeText>
              <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-muted text-[11px]">Grace Mwangi</SafeText>
              <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-green text-[10px]">Online</SafeText>
            </View>
            <View className="w-8 h-8 rounded-full bg-green-500/20 items-center justify-center">
              <Ionicons name="location" size={16} color="#22C55E" />
            </View>
          </View>

          <View className="flex-row items-center gap-3 rounded-3xl bg-white/5 border border-white/5 p-5">
            <View className="w-12 h-12 rounded-full bg-blue-500/20 items-center justify-center">
              <Ionicons name="car" size={24} color="#3B82F6" />
            </View>
            <View className="flex-1">
              <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-text text-[13px]">Driver</SafeText>
              <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-muted text-[11px]">James K.</SafeText>
              <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-blue text-[10px]">On the way</SafeText>
            </View>
          </View>

          <View className="flex-row items-center gap-3 rounded-3xl bg-white/5 border border-white/5 p-5">
            <View className="w-12 h-12 rounded-full bg-purple-500/20 items-center justify-center">
              <Ionicons name="person" size={24} color="#A78BFA" />
            </View>
            <View className="flex-1">
              <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-text text-[13px]">You</SafeText>
              <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-muted text-[11px]">En route to hotel</SafeText>
            </View>
            <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-muted text-[10px]">2 min ago</SafeText>
          </View>
        </View>
      }
    />
  );
}