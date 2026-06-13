import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';

import ScreenBackground from '@/src/components/ScreenBackground';
import Card from '@/src/components/Card';

export default function NotificationsSettingsScreen() {
  const router = useRouter();
  const [pushTrip, setPushTrip] = useState(true);
  const [pushAlerts, setPushAlerts] = useState(true);
  const [emailDigest, setEmailDigest] = useState(false);

  return (
    <ScreenBackground variant="blue">
      <View className="flex-1 px-2 pt-10">
        <View className="flex-row items-center gap-3">
          <Pressable onPress={() => router.back()} className="h-11 w-11 items-center justify-center rounded-xl border border-[#96C7B3]/50 bg-white/[0.05]">
            <Ionicons name="chevron-back" size={22} color="#f8fafc" />
          </Pressable>
          <Text style={{fontFamily: 'Syne_500Medium'}} className="text-[17px] text-white">Notifications</Text>
          <View className="w-10" />
        </View>

        <ScrollView className="mt-6" contentContainerClassName="gap-4 pb-28">
          <Card className="py-5 px-2">
            <Text style={{fontFamily: 'Syne_500Medium'}} className="text-[14px] text-white">Channels</Text>
            <Text style={{fontFamily: 'Syne_500Medium'}} className="mt-2 text-[12px] leading-5 text-slate-500">
              Toggles are local for now; Cloud Functions + FCM topic preferences can persist these per user.
            </Text>

            <View className="mt-5 flex-row items-center justify-between border-t border-white/10 pt-4">
              <View className="flex-1 pr-4">
                <Text style={{fontFamily: 'Syne_500Medium'}} className="text-[14px] text-white">Trip updates</Text>
                <Text style={{fontFamily: 'Syne_500Medium'}} className="mt-1 text-[12px] text-slate-500">Departures, arrivals, timeline changes</Text>
              </View>
              <Switch value={pushTrip} onValueChange={setPushTrip} trackColor={{ false: '#334155', true: '#2563eb' }} />
            </View>

            <View className="mt-4 flex-row items-center justify-between border-t border-white/10 pt-4">
              <View className="flex-1 pr-4">
                <Text style={{fontFamily: 'Syne_500Medium'}} className="text-[14px] text-white">Disruption alerts</Text>
                <Text style={{fontFamily: 'Syne_500Medium'}} className="mt-1 text-[12px] text-slate-500">Delays, cancellations, gate moves</Text>
              </View>
              <Switch value={pushAlerts} onValueChange={setPushAlerts} trackColor={{ false: '#334155', true: '#2563eb' }} />
            </View>

            <View className="mt-4 flex-row items-center justify-between border-t border-white/10 pt-4">
              <View className="flex-1 pr-4">
                <Text style={{fontFamily: 'Syne_500Medium'}} className="text-[14px] text-white">Weekly digest email</Text>
                <Text style={{fontFamily: 'Syne_500Medium'}} className="mt-1 text-[12px] text-slate-500">Summary of trips & recommendations</Text>
              </View>
              <Switch value={emailDigest} onValueChange={setEmailDigest} trackColor={{ false: '#334155', true: '#2563eb' }} />
            </View>
          </Card>
        </ScrollView>
      </View>
    </ScreenBackground>
  );
}
