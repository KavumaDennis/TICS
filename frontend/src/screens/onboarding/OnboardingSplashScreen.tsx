import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, Text, View, Animated } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { SafeText } from '@/src/components/responsive/SafeText';

const BACKGROUND_IMAGES = [
  require('../../../assets/images/slide1.jpg'),
  require('../../../assets/images/slide2.jpg'),
  require('../../../assets/images/slide3.jpg'),
  require('../../../assets/images/slide4.jpg'),
  require('../../../assets/images/slide5.jpg'),
  require('../../../assets/images/slide6.jpg'),
  require('../../../assets/images/slide7.jpg'),
  require('../../../assets/images/slide8.jpg'),
  require('../../../assets/images/slide9.jpg'),
];

export default function OnboardingSplashScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Image slider with smooth fade animation
  const [bgIndex, setBgIndex] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const interval = setInterval(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 800,
        useNativeDriver: true,
      }).start(() => {
        setBgIndex((prev) => (prev + 1) % BACKGROUND_IMAGES.length);
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }).start();
      });
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  return (
    <View className="flex-1" style={{ paddingTop: insets.top }}>
      {/* Animated background image slider */}
      <Animated.View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: fadeAnim }}>
        <Image
          source={BACKGROUND_IMAGES[bgIndex]}
          contentFit="cover"
          style={{ width: '100%', height: '100%' }}
        />
      </Animated.View>

      {/* Overlay gradient for readability */}
      <LinearGradient
        colors={['rgba(10,11,30,0.85)', 'rgba(10,11,30,0.92)', 'rgba(10,11,30,0.95)']}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />

    

      {/* Content */}
      <View className="flex-1 items-center justify-center px-8">
        <View
          style={{
            width: 100,
            height: 100,
            alignItems: 'center',
            justifyContent: 'center',
          }}
          className="rounded-4xl bg-tics-amber/20 border border-tics-amber/50"
        >
          <Ionicons name="globe" size={48} color="rgba(248,250,252,0.96)" />
        </View>
        <SafeText
          style={{ fontFamily: 'ShareTech_400Regular' }}
          className="mt-8 text-center text-[34px] tracking-tight text-white"
        >
          TICS
        </SafeText>
        <SafeText
          style={{ fontFamily: 'ShareTech_400Regular' }}
          className="mt-3 px-4 text-center text-[12px] leading-5 text-slate-300"
        >
          Travel Intelligence & Coordination System
        </SafeText>
      </View>

      {/* Bottom wave accent */}
      <View className="absolute bottom-0 left-0 right-0">
        <View className="px-2 pb-2">
          <Pressable
            onPress={() => router.push('/onboarding/intro' as any)}
            className="active:opacity-90 border bg-tics-amber/35 border-tics-amber/20 rounded-full p-6"
          >
            <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-center flex-1 text-[16px] text-tics-text">
              Next
            </SafeText>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
