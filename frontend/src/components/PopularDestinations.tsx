/**
 * PopularDestinations.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Horizontally scrollable carousel of popular destinations from around the
 * world. Non-clickable — displays image + name only.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Pressable,
  Text,
  View,
  ViewToken,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Entypo from '@expo/vector-icons/Entypo';

import {
  POPULAR_DESTINATIONS,
  type PopularDestination,
} from '@/src/services/PexelsService';

/* ── Constants ─────────────────────────────────────────────────────────────── */

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_SIZE = (SCREEN_WIDTH - 32 - 12) / 2.3; // fits ~2.3 cards visible
const CARD_HEIGHT = 150;
const BORDER_RADIUS = 20;

/* ── Component ─────────────────────────────────────────────────────────────── */

export default function PopularDestinations() {
  const flatListRef = useRef<FlatList>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  const scrollToIndex = (direction: 'left' | 'right') => {
    const nextIndex =
      direction === 'right'
        ? Math.min(currentIndex + 2, POPULAR_DESTINATIONS.length - 1)
        : Math.max(currentIndex - 2, 0);

    flatListRef.current?.scrollToIndex({
      index: nextIndex,
      animated: true,
    });
    setCurrentIndex(nextIndex);
  };

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setCurrentIndex(viewableItems[0].index);
      }
    },
  ).current;

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  const renderItem = ({ item }: { item: PopularDestination }) => (
    <View
      style={{
        width: CARD_SIZE,
        height: CARD_HEIGHT,
        borderRadius: BORDER_RADIUS,
        overflow: 'hidden',
        marginRight: 10,
      }}
    >
      <Image
        source={{ uri: item.image }}
        contentFit="cover"
        transition={200}
        style={{
          width: '100%',
          height: '100%',
        }}
      />
      {/* Name overlay */}
      <LinearGradient
        colors={['transparent', 'rgba(10,11,30,0.85)']}
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 60,
          justifyContent: 'flex-end',
          paddingHorizontal: 12,
          paddingBottom: 10,
        }}
      >
        <Text
          style={{
            fontFamily: 'Syne_600SemiBold',
            color: '#f8fafc',
            fontSize: 13,
          }}
          numberOfLines={1}
        >
          {item.name}
        </Text>
      </LinearGradient>
    </View>
  );

  return (
    <View>
      {/* Header row */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 10,
        }}
      >
        <Text
          style={{
            fontFamily: 'Syne_700Bold',
            
            fontSize: 15,
          }}
          className="text-tics-amber ml-1"
        >
          Popular destinations
        </Text>
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <Pressable onPress={() => scrollToIndex('left')}>
            <Entypo name="arrow-with-circle-left" size={24} color="rgb(150 199 179 / 0.7)" />
          </Pressable>
          <Pressable onPress={() => scrollToIndex('right')}>
            <Entypo name="arrow-with-circle-right" size={24} color="rgb(150 199 179 / 0.7)" />
          </Pressable>
        </View>
      </View>

      {/* Horizontal list */}
      <FlatList
        ref={flatListRef}
        data={POPULAR_DESTINATIONS}
        renderItem={renderItem}
        keyExtractor={(item) => item.countryCode + item.name}
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        bounces={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        getItemLayout={(_, index) => ({
          length: CARD_SIZE + 10,
          offset: (CARD_SIZE + 10) * index,
          index,
        })}
      />
    </View>
  );
}
