import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import Card from '@/src/components/Card';

type Variant = 'critical' | 'warning' | 'info';

const VARIANT_STYLES: Record<
  Variant,
  { badgeBg: string; border: string; icon: any; iconColor: string; title: string }
> = {
  critical: {
    badgeBg: 'bg-tics-red/20 text-tics-red border-tics-red/35',
    border: 'border-tics-red/35',
    icon: 'warning',
    iconColor: '#EF4444',
    title: 'CRITICAL',
  },
  warning: {
    badgeBg: 'bg-tics-amber/20 text-tics-amber border-tics-amber/35',
    border: 'border-tics-amber/35',
    icon: 'alert',
    iconColor: '#F59E0B',
    title: 'WARNING',
  },
  info: {
    badgeBg: 'bg-tics-blue/20 text-tics-blue border-tics-blue/35',
    border: 'border-tics-blue/35',
    icon: 'information-circle',
    iconColor: '#3B82F6',
    title: 'INFO',
  },
};

export type AlertCardProps = {
  variant: Variant;
  title: string;
  message: string;
  timeLabel: string;
  ctaLabel: string;
  onPress?: () => void;
  severityLabel?: string;
};

export default function AlertCard({
  variant,
  title,
  message,
  timeLabel,
  ctaLabel,
  onPress,
  severityLabel,
}: AlertCardProps) {
  const v = VARIANT_STYLES[variant];

  return (
    <Card className={['overflow-hidden', v.border, 'px-0 py-0'].join(' ')}>
      <View className="px-4 py-4">
        <View className="flex-row items-start">
          <View className={['h-11 w-11 items-center justify-center rounded-2xl border', v.badgeBg].join(' ')}>
            <Ionicons name={v.icon} size={20} color={v.iconColor} />
          </View>

          <View className="ml-3 flex-1">
            <View className="flex-row items-center justify-between">
              <Text className="text-tics-text text-[15px] font-extrabold tracking-wide">{title}</Text>
              {severityLabel ? (
                <View className={['rounded-full border px-3 py-1', v.badgeBg].join(' ')}>
                  <Text className="text-[11px] font-extrabold">{severityLabel}</Text>
                </View>
              ) : null}
            </View>
            <Text className="mt-2 text-tics-muted text-[13px] leading-5">{message}</Text>

            <View className="mt-4 flex-row items-center justify-between">
              <Text className="text-tics-muted text-[12px]">{timeLabel}</Text>
              <Pressable
                onPress={onPress}
                className={[
                  'rounded-full border px-5 py-2',
                  variant === 'critical'
                    ? 'border-tics-red/40 bg-tics-red/15'
                    : variant === 'warning'
                      ? 'border-tics-amber/40 bg-tics-amber/15'
                      : 'border-tics-blue/40 bg-tics-blue/15',
                ].join(' ')}
              >
                <Text className="text-tics-text text-[12px] font-bold">{ctaLabel}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Card>
  );
}
