import { useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Animated, Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import ScreenBackground from '@/src/components/ScreenBackground';
import Card from '@/src/components/Card';
import { Image } from 'expo-image';
import { fetchTravelCarouselImages } from '@/src/services/PexelsService';
import type { TravelImage } from '@/src/services/PexelsService';
import { SafeText } from '@/src/components/responsive/SafeText';


export default function AddYourTripScreen() {
  const router = useRouter();

  return (

    <View className="flex-1 p-1 pb-3">

      <View className='p-2 flex-row items-center gap-3 bg-tics-amber/25 border border-tics-amber/10 rounded-full'>
        <Pressable
          onPress={() => router.back()}
          style={{ width: 46, height: 46 }}
          className="items-center justify-center bg-tics-amber/35 border border-tics-amber/20 rounded-full">
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </Pressable>

        <View>
          <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-text text-[17px]">Add your trip</SafeText>
          <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-muted text-[13px] leading-5">Import your trip details.</SafeText>
        </View>
      </View>

      <View className="mt-5 gap-5 px-1">
        <Pressable onPress={() => router.push('/trip/email-sync')} className="">
          <Card accent="blue" className="bg-tics-amber/25 border border-tics-amber/10 rounded-full justify-center px-4 py-4">
            <View className="flex-row items-center">
              <View
                style={{
                  width: 46,
                  height: 46,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                className='rounded-full bg-tics-amber/35 border border-tics-amber/20'
              >
                <Ionicons name="mail" size={22} color="#fff" />
              </View>
              <View className="ml-4 flex-1">
                <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-text text-[16px]">Sync from email</SafeText>
                <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="mt-2 text-tics-muted text-[12px] leading-5">Gmail, Outlook</SafeText>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#96C7B3" />
            </View>
          </Card>
        </Pressable>

        <Pressable onPress={() => router.push('/trip/booking-import')}>
          <Card accent="purple" className="bg-tics-amber/25 border border-tics-amber/10 rounded-full justify-center px-4 py-4">
            <View className="flex-row items-center">
              <View
                style={{
                  width: 52,
                  height: 52,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                className='rounded-full bg-tics-amber/35 border border-tics-amber/20'
              >
                <Ionicons name="download" size={22} color="#fff" />
              </View>
              <View className="ml-4 flex-1">
                <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-text text-[16px]">Import from booking</SafeText>
                <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="mt-2 text-tics-muted text-[12px] leading-5">Expedia, Booking.com, Skyscanner</SafeText>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#fff" />
            </View>
          </Card>
        </Pressable>

        <Pressable onPress={() => router.push('/trip-input')} className="">
          <Card accent="green" className="bg-tics-amber/25 border border-tics-amber/10 rounded-full justify-center px-4 py-4">
            <View className="flex-row items-center">
              <View
                className='rounded-full bg-tics-amber/35 border border-tics-amber/20'
                style={{
                  width: 52,
                  height: 52,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="create" size={22} color="#fff" />
              </View>
              <View className="ml-4 flex-1">
                <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-text text-[16px]">Enter manually</SafeText>
                <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="mt-2 text-tics-muted text-[12px] leading-5">Manual entry (V1)</SafeText>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#96C7B3" />
            </View>
          </Card>
        </Pressable>
      </View>
      {/* Travel image carousel with overlaid indicators */}
      <View className="flex-1 px-1 mt-4">
        <AssetCarousel />
      </View>

      <Pressable onPress={() => router.replace('/home')} className="mt-auto bg-tics-amber/35 border border-tics-amber/20 rounded-full p-6">
        <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-center text-[12px] font-semibold text-tics-muted">Skip for now</SafeText>
      </Pressable>
    </View>

  );
}

/* ── Travel carousel with smooth fade animation (same as onboarding) ───────── */

const SLIDE_DURATION = 6000;

function AssetCarousel() {
  const [slides, setSlides] = useState<TravelImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [bgIndex, setBgIndex] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  // Fetch travel images from Pexels API on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const images = await fetchTravelCarouselImages();
        if (!cancelled && images.length > 0) {
          setSlides(images);
        }
      } catch (err) {
        console.warn('[AddYourTrip] carousel fetch error:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Auto-advance slides with smooth fade (same as onboarding)
  useEffect(() => {
    if (slides.length === 0) return;

    const interval = setInterval(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 800,
        useNativeDriver: true,
      }).start(() => {
        setBgIndex((prev) => (prev + 1) % slides.length);
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }).start();
      });
    }, SLIDE_DURATION);

    return () => clearInterval(interval);
  }, [slides.length]);

  // Loading skeleton
  if (loading || slides.length === 0) {
    return (
      <View style={{ flex: 1, borderRadius: 32, overflow: 'hidden' }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.06)' }} />
      </View>
    );
  }

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
        {/* Animated background image slider (same as onboarding) */}
        <Animated.View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: fadeAnim }}>
          <Image
            source={{ uri: slides[bgIndex].url }}
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
            {slides.map((_, i) => (
              <View
                key={i}
                style={{
                  width: i === bgIndex ? 18 : 5,
                  height: 5,
                  borderRadius: 3,
                  backgroundColor: i === bgIndex ? '#ffffff' : 'rgba(255,255,255,0.5)',
                }}
              />
            ))}
          </View>
        </View>

        {/* Gradient overlay for carousel */}
        <LinearGradient
          colors={['transparent', 'rgba(59,130,246,0.25)', 'rgba(139,92,246,0.15)', 'rgba(10,11,30,0.55)']}
          style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 100 }}
        />
        <LinearGradient
          colors={['rgba(59,130,246,0.15)', 'transparent']}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 60 }}
        />
      </View>
    </View>
  );
}