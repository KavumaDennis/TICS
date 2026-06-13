import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import ScreenBackground from '@/src/components/ScreenBackground';
import Card from '@/src/components/Card';

export default function AddYourTripScreen() {
  const router = useRouter();

  return (
    
      <View className="flex-1 px-6 pt-14 pb-10">
        <Pressable onPress={() => router.back()} className="mb-4 h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06]">
          <Ionicons name="chevron-back" size={22} color="rgba(248,250,252,0.9)" />
        </Pressable>

        <View>
          <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-tics-text text-[22px]">Add your trip</Text>
          <Text style={{ fontFamily: 'Syne_500Medium' }} className="mt-2 text-tics-muted text-[13px] leading-5">Import your trip details.</Text>
        </View>

        <View className="mt-5 gap-5">
          <Pressable disabled className="">
            <Card accent="blue" className="bg-tics-purple/10 border border-white/20 rounded-2xl justify-center px-4 py-4">
              <View className="flex-row items-center">
                <LinearGradient
                  colors={['rgba(59,130,246,0.35)', 'rgba(139,92,246,0.22)']}
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 10,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 1,
                    borderColor: 'rgba(248, 250, 252, 0.4)',
                  }}
                >
                  <Ionicons name="mail" size={22} color="#fff" />
                </LinearGradient>
                <View className="ml-4 flex-1">
                  <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-tics-text text-[16px] font-extrabold">Sync from email</Text>
                  <Text style={{ fontFamily: 'Syne_500Medium' }} className="mt-2 text-tics-muted text-[12px] leading-5">Gmail, Outlook (future)</Text>
                </View>
                <Ionicons name="lock-closed" size={18} color="rgba(248,250,252,0.45)" />
              </View>
            </Card>
          </Pressable>

          <Pressable disabled className="">
            <Card accent="purple" className="bg-tics-amber/20 border border-white/20 rounded-2xl justify-center px-4 py-4">
              <View className="flex-row items-center">
                <LinearGradient
                  colors={['rgba(139,92,246,0.35)', 'rgba(59,130,246,0.18)']}
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 10,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 1,
                    borderColor: 'rgba(248, 250, 252, 0.4)',
                  }}
                >
                  <Ionicons name="download" size={22} color="#fff" />
                </LinearGradient>
                <View className="ml-4 flex-1">
                  <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-tics-text text-[16px] font-extrabold">Import from booking</Text>
                  <Text style={{ fontFamily: 'Syne_500Medium' }} className="mt-2 text-tics-muted text-[12px] leading-5">Expedia, Booking.com (future)</Text>
                </View>
                <Ionicons name="lock-closed" size={18} color="rgba(248,250,252,0.45)" />
              </View>
            </Card>
          </Pressable>

          <Pressable onPress={() => router.push('/trip-input')} className="">
            <Card accent="green" className="bg-tics-green/20 border border-white/20 rounded-2xl justify-center px-4 py-4">
              <View className="flex-row items-center">
                <LinearGradient
                  colors={['rgba(34,197,94,0.35)', 'rgba(22,163,74,0.28)']}
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 10,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 1,
                    borderColor: 'rgba(248, 250, 252, 0.4)',
                  }}
                >
                  <Ionicons name="create" size={22} color="#05210f" />
                </LinearGradient>
                <View className="ml-4 flex-1">
                  <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-tics-text text-[16px]">Enter manually</Text>
                  <Text style={{ fontFamily: 'Syne_500Medium' }} className="mt-2 text-tics-muted text-[12px] leading-5">Manual entry (V1)</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="rgba(248,250,252,0.75)" />
              </View>
            </Card>
          </Pressable>
        </View>

        <Pressable onPress={() => router.replace('/home')} className="mt-auto pt-8">
          <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-center text-[12px] font-semibold text-tics-muted">Skip for now</Text>
        </Pressable>
      </View>
    
  );
}
