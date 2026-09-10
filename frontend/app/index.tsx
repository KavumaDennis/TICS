import { Redirect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, Text, View } from 'react-native';

import { useAppStore } from '@/src/store/appStore';
import { useAuthStore } from '@/src/store/useAuthStore';
import { SafeText } from '@/src/components/responsive/SafeText';

export default function Index() {
  const onboardingCompleted = useAppStore((s) => s.onboardingCompleted);
  const appHydrated = useAppStore((s) => s.hydrated);
  const authHydrated = useAuthStore((s) => s.hydrated);
  const token = useAuthStore((s) => s.token);

  if (!appHydrated || !authHydrated) {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: '#0a0f1e' }}>
        <LinearGradient
          colors={['rgba(10,11,30,0.95)', 'rgba(10,11,30,0.98)']}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
        <View className="items-center gap-6">
          <View className="items-center gap-3">
            <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-[42px] text-white tracking-wide">
              TICS
            </SafeText>
            <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-[11px] text-slate-400 tracking-widest uppercase">
              Travel Intelligence & Coordination System
            </SafeText>
          </View>
          <ActivityIndicator size="large" color="#F59E0B" />
        </View>
      </View>
    );
  }

  if (!onboardingCompleted) return <Redirect href={'/onboarding/splash' as any} />;
  if (!token) return <Redirect href="/auth/login" />;
  return <Redirect href="/home" />;
}
