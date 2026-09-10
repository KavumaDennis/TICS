import type { ReactNode } from 'react';
import { useState, useEffect, useRef } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, Text, View, Dimensions, Animated, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
// import { Text } from '@/src/components/responsive/Text';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type Props = {
  title: string;
  subtitle: string;
  hero?: ReactNode;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  /** Which dot is active for the four post-splash onboarding steps (0–3). */
  stepIndex: number;
  /** Optional additional context cards/content below subtitle */
  contextCards?: ReactNode;
  /** Background image for the screen */
  backgroundImage?: any;
};

export default function OnboardingShell({ 
  title, 
  subtitle, 
  hero, 
  primaryLabel, 
  onPrimary, 
  secondaryLabel, 
  onSecondary, 
  stepIndex, 
  contextCards,
  backgroundImage 
}: Props) {
  const insets = useSafeAreaInsets();
  const totalSteps = 4;
  
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
        setBgIndex((prev) => (prev + 1) % 9);
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
    <View className="flex-1" style={{ paddingTop: Math.max(insets.top, 16), paddingBottom: Math.max(insets.bottom, 12) }}>
      {/* Animated background image slider */}
      {backgroundImage && (
        <Animated.View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: fadeAnim }}>
          <Image
            source={backgroundImage}
            contentFit="cover"
            style={{ width: '100%', height: '100%' }}
          />
        </Animated.View>
      )}
      
      {/* Dark overlay gradient for readability */}
      <LinearGradient
        colors={['rgba(10,11,30,0.75)', 'rgba(10,11,30,0.85)', 'rgba(10,11,30,0.92)']}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />

      <ScrollView 
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 8 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-1 justify-between" style={{ minHeight: Dimensions.get('window').height - insets.top - insets.bottom - 32 }}>
          {/* Top section with icon and text */}
          <View className="px-2 gap-10">
            {/* Hero icon */}
            {hero && (
              <View className="w-20 h-20 rounded-full items-center">
                {hero}
              </View>
            )}

            {/* Title and subtitle */}
            <View className="items-center gap-3">
              <Text
                style={{ fontFamily: 'ShareTech_400Regular' }}
                className="text-tics-text text-[40px]"
              >
                {title}
              </Text>

              <Text
                style={{ fontFamily: 'ShareTech_400Regular' }}
                className="text-tics-muted leading-7 text-[15px]"
              >
                {subtitle}
              </Text>
            </View>

            {/* Context cards if provided */}
            {contextCards && (
              <View className="w-full mt-4 gap-3">
                {contextCards}
              </View>
            )}
          </View>

          {/* Bottom section with buttons and indicators */}
          <View className="gap-5 pt-8 mt-auto">
            {/* Step indicators */}
            <View className="flex-row items-center justify-center gap-2">
              {Array.from({ length: totalSteps }).map((_, i) => (
                <View
                  key={String(i)}
                  className={[
                    'h-2 rounded-full',
                    i === stepIndex ? 'w-8 bg-tics-amber' : 'w-2 bg-white/25',
                  ].join(' ')}
                />
              ))}
            </View>

            {/* Primary button */}
            <Pressable
              onPress={onPrimary}
              className="active:opacity-92 rounded-full p-6 bg-tics-amber/35"
              style={{ alignItems: 'center' }}
            >
              <Text style={{ fontFamily: 'ShareTech_400Regular' }} className="text-[16px] text-white font-semibold">
                {primaryLabel}
              </Text>
            </Pressable>

            {/* Secondary button */}
            {secondaryLabel && onSecondary && (
              <Pressable
                style={{
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.15)',
                }}
                onPress={onSecondary}
                className="active:opacity-80 p-6 rounded-full"
              >
                <Text style={{ fontFamily: 'ShareTech_400Regular' }} className="text-[14px] text-tics-muted">
                  {secondaryLabel}
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}