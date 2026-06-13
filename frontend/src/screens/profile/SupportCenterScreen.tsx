import { Ionicons } from '@expo/vector-icons';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import ScreenBackground from '@/src/components/ScreenBackground';
import Card from '@/src/components/Card';

export default function SupportCenterScreen() {
  const router = useRouter();

  return (
    
      <View className="flex-1 px-2 pt-5">
        <View className="flex-row items-center gap-3 mt-7">
          <Pressable onPress={() => router.back()} className="h-11 w-11 items-center justify-center rounded-xl border border-[#96C7B3]/50 bg-white/[0.05]">
            <Ionicons name="chevron-back" size={22} color="#f8fafc" />
          </Pressable>
          <Text style={{fontFamily: 'Syne_500Medium'}} className="text-[17px] text-white">Support center</Text>
        </View>

        <ScrollView className="mt-5" contentContainerClassName="gap-4 pb-10">
          <Card accent="blue" className="pt-3">
            <Text style={{fontFamily: 'Syne_500Medium'}} className="text-[18px] text-white">Help & docs</Text>
            <Text style={{fontFamily: 'Syne_500Medium'}} className="mt-2 text-[13px] leading-5 text-slate-400">
              Browse FAQs, escalation paths, and incident reporting.
            </Text>
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
              className="rounded-2xl bg-tics-blue/30 px-5 py-5 active:opacity-90"
            >
              <View className="flex-row items-center">
                <View className="h-11 w-11 items-center justify-center rounded-full bg-tics-blue/20 border border-tics-blue/10">
                  <Ionicons name={row.icon} size={20} color="#93c5fd" />
                </View>
                <View className="ml-3 flex-1">
                  <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-[14px] text-white">{row.title}</Text>
                  <Text style={{ fontFamily: 'Syne_500Medium' }} className="mt-1 text-[12px] text-slate-500">{row.detail}</Text>
                </View>
                <Ionicons name="open-outline" size={18} color="rgba(248,250,252,0.45)" />
              </View>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    
  );
}
