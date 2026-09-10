import { Ionicons } from '@expo/vector-icons';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import ScreenBackground from '@/src/components/ScreenBackground';
import Card from '@/src/components/Card';
import { SafeText } from '@/src/components/responsive/SafeText';

export default function SupportCenterScreen() {
  const router = useRouter();

  return (

    <View className="flex-1 p-1">
      <View className="flex-row items-center bg-tics-amber/25 border border-tics-amber/10 rounded-full p-2 gap-2">
        <Pressable
          onPress={() => router.back()}
          style={{ height: 46, width: 46 }}
          className="items-center justify-center bg-tics-amber/35 border border-tics-amber/20 rounded-full">
          <Ionicons name="chevron-back" size={22} color="#f8fafc" />
        </Pressable>
        <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-[17px] text-white">Support center</SafeText>
      </View>

      <ScrollView className="mt-5" contentContainerClassName="gap-4 pb-10">
        <Card accent="blue" className="pt-3">
          <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-[18px] text-white">Help & docs</SafeText>
          <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="mt-2 text-[13px] leading-5 text-slate-400">
            Browse FAQs, escalation paths, and incident reporting.
          </SafeText>
        </Card>

        {[
          { icon: 'book-outline' as const, title: 'Getting started', detail: 'First trip, monitoring, and alerts', action: 'trip' as const },
          { icon: 'shield-checkmark-outline' as const, title: 'Privacy & data', detail: 'What we store and why', action: 'privacy' as const },
          { icon: 'mail-outline' as const, title: 'Contact support', detail: 'support@tics.app', action: 'mail' as const },
        ].map((row) => (
          <Pressable
            key={row.title}
            onPress={() => {
              if (row.action === 'trip') router.push('/trip/add' as any);
              else if (row.action === 'privacy') router.push('/account/privacy' as any);
              else Linking.openURL('mailto:support@tics.app');
            }}
            className="rounded-full bg-tics-amber/35 border border-tics-amber/20 p-3 active:opacity-90"
          >
            <View className="flex-row items-center">
              <View style={{ width: 46, height: 46 }} className="items-center justify-center rounded-full bg-tics-amber/35 border border-tics-amber/20">
                <Ionicons name={row.icon} size={20} color="#96C7B3" />
              </View>
              <View className="ml-3 flex-1">
                <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-[14px] text-white">{row.title}</SafeText>
                <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="mt-1 text-[12px] text-slate-500">{row.detail}</SafeText>
              </View>
              <Ionicons name="open-outline" size={18} color="rgba(248,250,252,0.45)" />
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>

  );
}
