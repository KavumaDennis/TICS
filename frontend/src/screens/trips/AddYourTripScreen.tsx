import { useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Animated, Dimensions, Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import ScreenBackground from '@/src/components/ScreenBackground';
import Card from '@/src/components/Card';
import { Image } from 'expo-image';


const ASSET_SLIDES = [
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

export default function AddYourTripScreen() {
  const router = useRouter();

  return (

    <View className="flex-1 px-2 pt-10 pb-3">

      <View className='p-2 flex-row items-center gap-3 bg-tics-amber/25 border border-tics-amber/10 rounded-full'>
        <Pressable
          onPress={() => router.back()}
          style={{ width: 46, height: 46 }}
          className="items-center justify-center bg-tics-amber/35 border border-tics-amber/20 rounded-full">
          <Ionicons name="chevron-back" size={22} color="rgba(248,250,252,0.9)" />
        </Pressable>

        <View>
          <Text style={{ fontFamily: 'Syne_700Bold' }} className="text-tics-text text-[17px]">Add your trip</Text>
          <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-tics-muted text-[13px] leading-5">Import your trip details.</Text>
        </View>
      </View>

      <View className="mt-5 gap-5">
        <Pressable onPress={() => router.push('/trip/email-sync')} className="">
          <Card accent="blue" className="bg-tics-purple/35 border border-[#96C7B3]/20 rounded-full justify-center px-4 py-4">
            <View className="flex-row items-center">
              <LinearGradient
                colors={['rgba(59,130,246,0.35)', 'rgba(139,92,246,0.22)']}
                style={{
                  width: 52,
                  height: 52,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: 'rgba(248, 250, 252, 0.4)',
                }}
                className='rounded-full'
              >
                <Ionicons name="mail" size={22} color="#fff" />
              </LinearGradient>
              <View className="ml-4 flex-1">
                <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-tics-text text-[16px]">Sync from email</Text>
                <Text style={{ fontFamily: 'Syne_500Medium' }} className="mt-2 text-tics-muted text-[12px] leading-5">Gmail, Outlook</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="rgba(248,250,252,0.75)" />
            </View>
          </Card>
        </Pressable>

        <Pressable onPress={() => router.push('/trip/booking-import')}>
          <Card accent="purple" className="bg-tics-amber/35 border border-tics-amber/20 rounded-full justify-center px-4 py-4">
            <View className="flex-row items-center">
              <LinearGradient
                colors={['rgba(139,92,246,0.35)', 'rgba(59,130,246,0.18)']}
                style={{
                  width: 52,
                  height: 52,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: 'rgba(248, 250, 252, 0.4)',
                }}
                className='rounded-full'
              >
                <Ionicons name="download" size={22} color="#fff" />
              </LinearGradient>
              <View className="ml-4 flex-1">
                <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-tics-text text-[16px]">Import from booking</Text>
                <Text style={{ fontFamily: 'Syne_500Medium' }} className="mt-2 text-tics-muted text-[12px] leading-5">Expedia, Booking.com, Skyscanner</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="rgba(248,250,252,0.75)" />
            </View>
          </Card>
        </Pressable>

        <Pressable onPress={() => router.push('/trip-input')} className="">
          <Card accent="green" className="bg-tics-green/35 border border-tics-amber/20 rounded-full justify-center px-4 py-4">
            <View className="flex-row items-center">
              <LinearGradient
                colors={['rgba(34,197,94,0.35)', 'rgba(22,163,74,0.28)']}
                style={{
                  width: 52,
                  height: 52,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: 'rgba(248, 250, 252, 0.4)',
                }}
                className='rounded-full'
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
      {/* Asset carousel with overlaid indicators */}
      <View className="flex-1 mt-4">
        <AssetCarousel />
      </View>

      <Pressable onPress={() => router.replace('/home')} className="mt-auto bg-tics-amber/35 border border-tics-amber/20 rounded-full p-6">
        <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-center text-[12px] font-semibold text-tics-muted">Skip for now</Text>
      </Pressable>
    </View>

  );
}

/* ── Asset carousel with crossfade animation ─────────────────────────────────── */

function AssetCarousel() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [nextIndex, setNextIndex] = useState(1);

  useEffect(() => {
    const interval = setInterval(() => {
      const upcoming = (currentIndex + 1) % ASSET_SLIDES.length;
      setNextIndex(upcoming);

      // Reset before animation starts (prevents flicker)
      fadeAnim.setValue(0);

      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 2200,
        useNativeDriver: true,
      }).start(() => {
        // After fade completes, commit next image as current
        setCurrentIndex(upcoming);
      });
    }, 6000);

    return () => clearInterval(interval);
  }, [currentIndex]);

  return (
    <View style={{ marginBottom: 12, flex: 1 }}>
      <View
        style={{
          flex: 1,
          overflow: 'hidden',
          position: 'relative',
        }}
        className='rounded-4xl'
      >
        {/* Base image (always visible) */}
        <Image
          source={ASSET_SLIDES[currentIndex]}
          contentFit="cover"
          style={{ width: '100%', height: '100%', position: 'absolute' }}
        />

        {/* Overlay image (fades in smoothly) */}
        <Animated.View
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            opacity: fadeAnim,
          }}
        >
          <Image
            source={ASSET_SLIDES[nextIndex]}
            contentFit="cover"
            style={{ width: '100%', height: '100%' }}
          />
        </Animated.View>

        {/* Overlaid dot indicators */}
        <View
          style={{
            position: 'absolute',
            bottom: 0, left: 0, right: 0,
            height: 40,
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 10,
          }}
        >
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
            {ASSET_SLIDES.map((_, i) => (
              <View
                key={i}
                style={{
                  width: i === currentIndex ? 18 : 5,
                  height: 5,
                  borderRadius: 3,
                  backgroundColor: i === currentIndex ? '#ffffff' : 'rgba(255,255,255,0.5)',
                }}
              />
            ))}
          </View>
        </View>

        {/* Thin gradient for readability */}
        <LinearGradient
          colors={['transparent', 'rgba(10,11,30,0.55)']}
          style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 50 }}
        />
      </View>
    </View>
  );
}
