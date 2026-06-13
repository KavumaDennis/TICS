import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function OnboardingSplashScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-[#07091a]" style={{ paddingTop: insets.top }}>
      {/* <LinearGradient colors={['#0a0c18', '#0c1428', '#0a0c18']} style={{ flex: 1 }}> */}
        <View className="flex-1 items-center justify-center px-8">
          <LinearGradient
            colors={['rgba(59,130,246,0.55)', 'rgba(139,92,246,0.35)', 'rgba(37,99,235,0.45)']}
            style={{
              width: 100,
              height: 100,
              borderRadius: 20,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.22)',
            }}
          >
            <Ionicons name="globe" size={48} color="rgba(248,250,252,0.96)" />
          </LinearGradient>
          <Text
          style={{ fontFamily: 'Syne_700Bold' }}
          className="mt-8 text-center text-[34px] tracking-tight text-white">TICS</Text>
          <Text
          style={{ fontFamily: 'Syne_700Bold' }}
          className="mt-3 px-4 text-center text-[12px] leading-5 text-slate-300">
            Travel Intelligence & Coordination System
          </Text>
        </View>

        {/* Bottom wave accent */}
        <View className="absolute bottom-0 left-0 right-0" style={{ paddingBottom: Math.max(insets.bottom, 16) }}>
          <View className="absolute bottom-0 left-0 right-0 px-5 pb-2">
            <Pressable
              onPress={() => router.push('/onboarding/intro' as any)}
              className="active:opacity-90 border bg-tics-amber"
              style={{
                borderRadius: 14,
                paddingVertical: 16,
                elevation: 8,
                borderColor: 'rgba(255,255,255,0.22)'
              }}
            >
              <Text style={{ fontFamily: 'Syne_700Bold' }} className="text-center flex-1 text-[16px] text-black">Next</Text>
            </Pressable>
          </View>
        </View>
      {/* </LinearGradient> */}
    </View>
  );
}
