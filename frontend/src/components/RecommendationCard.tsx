import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import Card from '@/src/components/Card';

export type RecommendationCardProps = {
  kind: 'recommended_action' | 'smart_tip' | 'alternative_activity';
  title: string;
  message: string;
  ctaLabel: string;
  onPress?: () => void;
  iconName?: keyof typeof Ionicons.glyphMap;
};

const KIND_META: Record<RecommendationCardProps['kind'], { label: string; icon: any }> = {
  recommended_action: { label: 'RECOMMENDED ACTION', icon: 'airplane' },
  smart_tip: { label: 'SMART TIP', icon: 'car-sport' },
  alternative_activity: { label: 'ALTERNATIVE ACTIVITY', icon: 'home' },
};

export default function RecommendationCard({
  kind,
  title,
  message,
  ctaLabel,
  onPress,
  iconName,
}: RecommendationCardProps) {
  const meta = KIND_META[kind];
  const icon = iconName ?? meta.icon;

  return (
    <Card className="border-tics-green/25 bg-tics-green/10">
      <View className="flex-row items-start">
        <View className="h-11 w-11 items-center justify-center rounded-2xl bg-tics-green/25">
          <Ionicons name={icon} size={20} color="#BDF7D2" />
        </View>

        <View className="ml-3 flex-1">
          <View className="flex-row items-center justify-between">
            <Text className="text-tics-green text-[11px] font-extrabold tracking-wide">{meta.label}</Text>
            <Ionicons name="chevron-down" size={18} color="rgba(234,242,255,0.55)" />
          </View>
          <Text className="mt-2 text-tics-text text-[15px] font-extrabold">{title}</Text>
          <Text className="mt-1 text-tics-muted text-[13px] leading-5">{message}</Text>

          <View className="mt-4 items-end">
            <Pressable onPress={onPress} className="rounded-full bg-tics-green/25 px-5 py-2">
              <Text className="text-tics-text text-[12px] font-bold">{ctaLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Card>
  );
}

