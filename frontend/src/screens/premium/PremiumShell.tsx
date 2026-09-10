import type { PropsWithChildren } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import ScreenBackground from '@/src/components/ScreenBackground';
import Card from '@/src/components/Card';
import { SafeText } from '@/src/components/responsive/SafeText';

type Props = PropsWithChildren<{
  title: string;
  subtitle: string;
  primaryLabel: string;
  onPrimary: () => void;
  showBack?: boolean;
}>;

export default function PremiumShell({ title, subtitle, primaryLabel, onPrimary, showBack, children }: Props) {
  const router = useRouter();
  return (
    <ScreenBackground variant="blue">
      <View className="flex-1 px-6 pt-14 pb-10">
        <View className="flex-row items-center justify-between">
          {showBack ? (
            <Pressable onPress={() => router.back()} className="h-10 w-10 items-center justify-center rounded-2xl bg-white/5">
              <Ionicons name="chevron-back" size={20} color="rgba(234,242,255,0.9)" />
            </Pressable>
          ) : (
            <View className="h-10 w-10" />
          )}
          <SafeText className="text-tics-text text-[16px] font-extrabold">Premium</SafeText>
          <View className="h-10 w-10" />
        </View>

        <Card className="mt-8 px-6 py-8">
          <SafeText className="text-tics-text text-[22px] font-extrabold">{title}</SafeText>
          <SafeText className="mt-3 text-tics-muted text-[13px] leading-5">{subtitle}</SafeText>
          {children ? <View className="mt-6 gap-3">{children}</View> : null}
        </Card>

        <Pressable onPress={onPrimary} className="mt-auto rounded-2xl bg-tics-purple px-6 py-4">
          <SafeText className="text-center text-[14px] font-extrabold text-tics-text">{primaryLabel}</SafeText>
        </Pressable>
      </View>
    </ScreenBackground>
  );
}

