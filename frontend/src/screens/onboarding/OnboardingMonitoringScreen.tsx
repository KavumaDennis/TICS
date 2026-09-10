import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { View, Text } from 'react-native';

import OnboardingShell from '@/src/screens/onboarding/OnboardingShell';
import { SafeText } from '@/src/components/responsive/SafeText';

export default function OnboardingMonitoringScreen() {
  const router = useRouter();
  return (
    <OnboardingShell
      stepIndex={1}
      title="Stay Ahead of Disruptions"
      subtitle="Get real-time alerts about flight changes, weather risks, and itinerary updates—before they impact your plans."
      hero={
        <View className="w-20 h-20 rounded-full items-center justify-center" style={{ backgroundColor: 'rgba(59,130,246,0.4)', borderWidth: 2, borderColor: 'rgba(59,130,246,0.1)' }}>
          <Ionicons name="notifications" size={40} color="#60A5FA" />
        </View>
      }
      primaryLabel="Next"
      onPrimary={() => router.push('/onboarding/recommendations' as any)}
      backgroundImage={require('../../../assets/images/slide3.jpg')}
      contextCards={
        <View className="gap-3 mt-2">
          <View className="flex-row items-center gap-3 rounded-3xl bg-white/5 border border-white/5 p-5">
            <View className="w-10 h-10 rounded-full bg-blue-500/20 items-center justify-center">
              <Ionicons name="airplane" size={20} color="#60A5FA" />
            </View>
            <View className="flex-1">
              <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-text text-[13px]">Flight Delay</SafeText>
              <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-muted text-[11px]">UA 256 delayed by 1h 20m</SafeText>
            </View>
            <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-muted text-[10px]">9:20 AM</SafeText>
          </View>

          <View className="flex-row items-center gap-3 rounded-3xl bg-white/5 border border-white/5 p-5">
            <View className="w-10 h-10 rounded-full bg-amber-500/20 items-center justify-center">
              <Ionicons name="rainy" size={20} color="#FBBF24" />
            </View>
            <View className="flex-1">
              <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-text text-[13px]">Weather Alert</SafeText>
              <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-muted text-[11px]">Heavy rain expected in Nairobi</SafeText>
            </View>
            <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-muted text-[10px]">8:45 AM</SafeText>
          </View>

          <View className="flex-row items-center gap-3 rounded-3xl bg-white/5 border border-white/5 p-5">
            <View className="w-10 h-10 rounded-full bg-red-500/20 items-center justify-center">
              <Ionicons name="alert-circle" size={20} color="#EF4444" />
            </View>
            <View className="flex-1">
              <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-text text-[13px]">Itinerary Update</SafeText>
              <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-muted text-[11px]">Your Nairobi → Arusha trip time has changed</SafeText>
            </View>
            <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-muted text-[10px]">8:30 AM</SafeText>
          </View>
        </View>
      }
    />
  );
}