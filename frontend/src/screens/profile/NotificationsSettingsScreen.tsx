import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';

import ScreenBackground from '@/src/components/ScreenBackground';
import Card from '@/src/components/Card';
import { SafeText } from '@/src/components/responsive/SafeText';

export default function NotificationsSettingsScreen() {
  const router = useRouter();
  const [pushTrip, setPushTrip] = useState(true);
  const [pushAlerts, setPushAlerts] = useState(true);
  const [emailDigest, setEmailDigest] = useState(false);

  return (
    <ScreenBackground variant="blue">
      <View className="flex-1 p-1">
        <View className="flex-row items-center bg-tics-amber/25 border border-tics-amber/10 rounded-full p-2 gap-2">
          <Pressable
            onPress={() => router.back()}
            style={{ height: 46, width: 46 }}
            className="items-center justify-center bg-tics-amber/35 border border-tics-amber/20 rounded-full">
            <Ionicons name="chevron-back" size={22} color="#f8fafc" />
          </Pressable>
          <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-[17px] text-white">Notifications</SafeText>
          <View className="w-10" />
        </View>

        <ScrollView className="mt-6" contentContainerClassName="gap-4 pb-28">
          <Card className="py-5 px-2">
            <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-[14px] text-white">Channels</SafeText>
            <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="mt-2 text-[12px] leading-5 text-slate-500">
              Toggles are local for now; Cloud Functions + FCM topic preferences can persist these per user.
            </SafeText>

            <View className="mt-5 flex-row items-center justify-between border-t border-white/10 pt-4">
              <View className="flex-1 pr-4">
                <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-[14px] text-white">Trip updates</SafeText>
                <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="mt-1 text-[12px] text-slate-500">Departures, arrivals, timeline changes</SafeText>
              </View>
              <Switch value={pushTrip} onValueChange={setPushTrip} trackColor={{ false: '#334155', true: '#2563eb' }} />
            </View>

            <View className="mt-4 flex-row items-center justify-between border-t border-white/10 pt-4">
              <View className="flex-1 pr-4">
                <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-[14px] text-white">Disruption alerts</SafeText>
                <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="mt-1 text-[12px] text-slate-500">Delays, cancellations, gate moves</SafeText>
              </View>
              <Switch value={pushAlerts} onValueChange={setPushAlerts} trackColor={{ false: '#334155', true: '#2563eb' }} />
            </View>

            <View className="mt-4 flex-row items-center justify-between border-t border-white/10 pt-4">
              <View className="flex-1 pr-4">
                <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-[14px] text-white">Weekly digest email</SafeText>
                <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="mt-1 text-[12px] text-slate-500">Summary of trips & recommendations</SafeText>
              </View>
              <Switch value={emailDigest} onValueChange={setEmailDigest} trackColor={{ false: '#334155', true: '#2563eb' }} />
            </View>
          </Card>
        </ScrollView>
      </View>
    </ScreenBackground>
  );
}
