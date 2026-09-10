import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import ScreenBackground from '@/src/components/ScreenBackground';
import Card from '@/src/components/Card';
import { useTripStore } from '@/src/store/tripStore';
import { SafeText } from '@/src/components/responsive/SafeText';

export default function TripsPreferencesScreen() {
  const router = useRouter();
  const trips = useTripStore((s) => s.trips);

  return (

    <View className="flex-1 p-1">
    <View className="flex-row items-center bg-tics-amber/25 border border-tics-amber/10 rounded-full p-2 gap-2">
        <Pressable
          onPress={() => router.back()}
          style={{ height: 46, width: 46 }}
          className="items-center justify-center bg-tics-amber/35 border border-tics-amber/20 rounded-full">
          <Ionicons name="chevron-back" size={22} color="#f8fafc" />
        </Pressable>
        <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-[17px] text-white">Trips & preferences</SafeText>
        <View className="w-10" />
      </View>

      <ScrollView className="mt-6" contentContainerClassName="gap-4 pb-28">
        <Card accent="blue" className="px-2 py-5">
          <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-[14px] text-white">Trip library</SafeText>
          <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="mt-2 text-[13px] leading-5 text-slate-400">
            You have <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-white">{trips.length}</SafeText> saved trip{trips.length === 1 ? '' : 's'}.
            Default monitoring uses your most recently active itinerary.
          </SafeText>
        </Card>

        <Card className="px-2 py-5">
          <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-[13px] text-slate-400">Preferred cabin</SafeText>
          <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="mt-2 text-[15px] text-white">Economy (default)</SafeText>
        </Card>

        <Card className="px-2 py-5">
          <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-[13px] text-slate-400">Airport buffer</SafeText>
          <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="mt-2 text-[15px] text-white">Standard · 3h international</SafeText>
          <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="mt-2 text-[12px] text-slate-500">Editable preferences sync from Firestore in a future release.</SafeText>
        </Card>
      </ScrollView>
    </View>

  );
}
