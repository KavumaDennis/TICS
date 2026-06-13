import type { ReactNode } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import ScreenBackground from '@/src/components/ScreenBackground';
import Card from '@/src/components/Card';

type Props = {
  title: string;
  subtitle: string;
  hero?: ReactNode;
  primaryLabel: string;
  onPrimary: () => void;
  /** Which dot is active for the four post-splash onboarding steps (0–3). */
  stepIndex: number;
};

export default function OnboardingShell({ title, subtitle, hero, primaryLabel, onPrimary, stepIndex }: Props) {
  const insets = useSafeAreaInsets();
  // const lines = title
  const totalSteps = 4;

  return (

    <View className="flex-1" style={{ paddingTop: Math.max(insets.top, 16), paddingBottom: Math.max(insets.bottom, 12) }}>
      <Card className="flex-1 justify-between px-5">
        <View className='flex justify-center items-center flex-col gap-8'>
          {hero ? <View className="mt-10 items-center">{hero}</View> : null}

          <Text style={{ fontFamily: 'Syne_700Bold' }} className="text-tics-text w-full text-center text-[26px] leading-8">
            {title}
          </Text>

          <Text style={{ fontFamily: 'Syne_700Bold' }} className="mt-5 text-tics-muted text-center leading-6">{subtitle}</Text>
        </View>

        <View className="gap-6 pt-6">
          <View className="flex-row items-center justify-center gap-2">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <View
                key={String(i)}
                className={[
                  'h-2 rounded-full',
                  i === stepIndex ? 'w-8 bg-[#2563eb]' : 'w-2 bg-white/25',
                ].join(' ')}
              />
            ))}
          </View>

          <Pressable
            style={{
              borderRadius: 14,
              paddingVertical: 16,
              alignItems: 'center',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.22)',
              elevation: 6,
            }}
            onPress={onPrimary} className="active:opacity-92 bg-tics-amber">
            <Text style={{ fontFamily: 'Syne_700Bold' }} className="text-[16px] text-black">{primaryLabel}</Text>
          </Pressable>
        </View>
      </Card>
    </View>

  );
}
