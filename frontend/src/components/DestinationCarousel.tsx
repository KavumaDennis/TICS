/**
 * DestinationCarousel.tsx
 * Horizontally swipeable carousel showing exactly 5 destination country images.
 * Uses FlatList with paging for smooth native scrolling.
 * Features loading skeletons, Firestore caching, and graceful error fallback.
 */

import { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, FlatList, Text, View, ViewToken } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';

import { fetchCountryImages, resolveCountry } from '@/src/services/PexelsService';
import type { Trip } from '@/src/store/tripStore';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CAROUSEL_WIDTH = SCREEN_WIDTH - 32;
const CAROUSEL_HEIGHT = 220;
const IMAGE_BORDER_RADIUS = 24;
const SLIDE_COUNT = 5;

/* ── Pulse Skeleton ────────────────────────────────────────────────────────── */

function SkeletonSlide() {
  const pulse = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.7, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.3, duration: 900, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, []);
  return (
    <Animated.View
      style={{
        width: CAROUSEL_WIDTH,
        height: CAROUSEL_HEIGHT,
        borderRadius: IMAGE_BORDER_RADIUS,
        backgroundColor: 'rgba(255,255,255,0.08)',
        opacity: pulse,
      }}
    />
  );
}

/* ── Dot Indicators ────────────────────────────────────────────────────────── */

function DotIndicators({ count, activeIndex }: { count: number; activeIndex: number }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 12, gap: 6 }}>
      {Array.from({ length: count }).map((_, i) => (
        <View
          key={i}
          style={{
            width: i === activeIndex ? 20 : 7,
            height: 7,
            borderRadius: 3,
            borderWidth:1,
            borderColor: 'rgba(150, 199, 179, 0.3)',
            backgroundColor: i === activeIndex ? 'rgba(150, 199, 179, 0.5)' : 'rgba(150, 199, 179, 0.2)',
          }}
        />
      ))}
    </View>
  );
}

/* ── Main Component ────────────────────────────────────────────────────────── */

interface DestinationCarouselProps {
  trip: Trip;
}

export default function DestinationCarousel({ trip }: DestinationCarouselProps) {
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  const resolved = resolveCountry(trip);
  const country = resolved?.country ?? '';
  const countryCode = resolved?.countryCode ?? '';

  useEffect(() => {
    if (!country || !countryCode) {
      setLoading(false);
      setFailed(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setFailed(false);
        const urls = await fetchCountryImages(country, countryCode);
        if (cancelled) return;
        if (urls.length === 0) {
          setFailed(true);
        } else {
          setImages(urls);
        }
      } catch (err) {
        console.warn('[DestinationCarousel] error:', err);
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [country, countryCode]);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setActiveIndex(viewableItems[0].index);
      }
    },
  ).current;

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;


  /* ── Error placeholder ────────────────────────────────────────────────────── */

  if (failed && !loading) {
    return (
      <View
        style={{
          minHeight: 120, borderRadius: IMAGE_BORDER_RADIUS, borderWidth: 1,
          borderColor: 'rgba(139,92,246,0.2)', backgroundColor: 'rgba(139,92,246,0.06)',
          padding: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 12,
        }}
      >
        <Text className="text-tics-amber" style={{ fontFamily: 'Syne_500Medium', fontSize: 15, textAlign: 'center' }}>
          {country ? `Explore ${country}` : 'Destination images'}
        </Text>
        <Text style={{ fontFamily: 'Syne_500Medium', color: '#64748b', fontSize: 12, marginTop: 6, textAlign: 'center' }}>
          Images unavailable at this time
        </Text>
      </View>
    );
  }

  /* ── Loading skeleton ─────────────────────────────────────────────────────── */

  if (loading) {
    return (
      <View style={{ marginBottom: 12 }}>
        <Text className='ml-2 text-tics-amber' style={{ fontFamily: 'Syne_700Bold', color: '#f8fafc', fontSize: 15, }}>
          Explore {country || '...'}
        </Text>
        <SkeletonSlide />
        <DotIndicators count={SLIDE_COUNT} activeIndex={0} />
      </View>
    );
  }

  /* ── Carousel render ──────────────────────────────────────────────────────── */

  const renderItem = ({ item, index }: { item: string; index: number }) => (
    <View className='space-x-2' style={{ width: CAROUSEL_WIDTH, height: CAROUSEL_HEIGHT, borderRadius: IMAGE_BORDER_RADIUS, overflow: 'hidden', marginRight: 5 }}>
      <Image source={{ uri: item }} contentFit="cover" transition={300} style={{ width: '100%', height: '100%', }}  />
      <LinearGradient
        colors={['transparent', 'rgba(10,11,30,0.7)']}
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 70, justifyContent: 'flex-end', paddingHorizontal: 16, paddingBottom: 14 }}
      >
        <Text className='border border-tics-amber/50 self-start p-1 px-3 rounded-full' style={{ fontFamily: 'Syne_500Medium', color: 'rgba(248,250,252,0.7)', fontSize: 11, backgroundColor: " rgb(150 199 179 / 0.7);" }}>
          {index + 1} / {images.length}
        </Text>
      </LinearGradient>
    </View>
  );

  return (
    <View style={{ marginBottom: 12 }}>
      <Text className='ml-2 text-tics-amber' style={{ fontFamily: 'Syne_700Bold', fontSize: 15, marginBottom: 8 }}>
        Explore {country}
      </Text>
      <FlatList
        ref={flatListRef}
        data={images}
        renderItem={renderItem}
        keyExtractor={(_, i) => `dest-${i}`}
        horizontal pagingEnabled showsHorizontalScrollIndicator={false}
        snapToInterval={CAROUSEL_WIDTH} decelerationRate="fast" bounces={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        getItemLayout={(_, index) => ({ length: CAROUSEL_WIDTH, offset: CAROUSEL_WIDTH * index, index })}
        style={{ borderRadius: IMAGE_BORDER_RADIUS,  }}
      />
      <DotIndicators count={images.length} activeIndex={activeIndex} />
    </View>
  );
}

