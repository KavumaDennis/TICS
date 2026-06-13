import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import ScreenBackground from '@/src/components/ScreenBackground';
import Card from '@/src/components/Card';
import { useTripStore } from '@/src/store/tripStore';

export default function TripsPreferencesScreen() {
  const router = useRouter();
  const trips = useTripStore((s) => s.trips);

  return (
  
      <View className="flex-1 px-2 pt-10">
        <View className="flex-row items-center gap-3 mt-2">
          <Pressable onPress={() => router.back()} className="h-11 w-11 items-center justify-center rounded-xl border border-[#96C7B3]/50 bg-white/[0.05]">
            <Ionicons name="chevron-back" size={22} color="#f8fafc" />
          </Pressable>
          <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-[17px] text-white">Trips & preferences</Text>
          <View className="w-10" />
        </View>

        <ScrollView className="mt-6" contentContainerClassName="gap-4 pb-28">
          <Card accent="blue" className="px-2 py-5">
            <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-[14px] text-white">Trip library</Text>
            <Text style={{ fontFamily: 'Syne_500Medium' }} className="mt-2 text-[13px] leading-5 text-slate-400">
              You have <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-white">{trips.length}</Text> saved trip{trips.length === 1 ? '' : 's'}.
              Default monitoring uses your most recently active itinerary.
            </Text>
          </Card>

          <Card className="px-2 py-5">
            <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-[13px] text-slate-400">Preferred cabin</Text>
            <Text style={{ fontFamily: 'Syne_500Medium' }} className="mt-2 text-[15px] text-white">Economy (default)</Text>
          </Card>

          <Card className="px-2 py-5">
            <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-[13px] text-slate-400">Airport buffer</Text>
            <Text style={{ fontFamily: 'Syne_500Medium' }} className="mt-2 text-[15px] text-white">Standard · 3h international</Text>
            <Text style={{ fontFamily: 'Syne_500Medium' }} className="mt-2 text-[12px] text-slate-500">Editable preferences sync from Firestore in a future release.</Text>
          </Card>
        </ScrollView>
      </View>
   
  );
}
