import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import ScreenBackground from '@/src/components/ScreenBackground';
import Card from '@/src/components/Card';

export default function PrivacyScreen() {
  const router = useRouter();

  return (
    
      <View className="flex-1 px-2 pt-10">
        <View className="flex-row items-center gap-3 mt-2">
          <Pressable onPress={() => router.back()} className="h-11 w-11 items-center justify-center rounded-xl border border-[#96C7B3]/50 bg-white/[0.05]">
            <Ionicons name="chevron-back" size={22} color="#f8fafc" />
          </Pressable>
          <Text style={{fontFamily: 'Syne_500Medium'}} className="text-[17px] text-white">Privacy & data</Text>
          <View className="w-10" />
        </View>

        <ScrollView className="mt-3" contentContainerClassName="pb-28">
          <Card accent="blue" className="px-2 py-3">
            <Text style={{fontFamily: 'Syne_500Medium'}} className="text-[14px] text-white">What TICS stores</Text>
            <Text style={{fontFamily: 'Syne_500Medium'}} className="mt-3 text-[13px] leading-5 text-slate-400">
              • Account email and optional display name{'\n'}• Trip itineraries you create{'\n'}• Alerts & recommendations tied to those trips{'\n'}• Device push tokens when you enable notifications
            </Text>
          </Card>
          <Card className="px-2 py-3">
            <Text style={{fontFamily: 'Syne_500Medium'}} className="text-[14px] text-white">Your controls</Text>
            <Text style={{fontFamily: 'Syne_500Medium'}} className="mt-3 text-[13px] leading-5 text-slate-400">
              Edit your profile anytime under Personal information. You can revoke sessions by signing out on this device.
            </Text>
          </Card>
        </ScrollView>
      </View>
  
  );
}
