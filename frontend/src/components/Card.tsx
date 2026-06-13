import type { PropsWithChildren } from 'react';
import { View } from 'react-native';

export type CardAccent = 'none' | 'blue' | 'red' | 'green' | 'purple';

type Props = PropsWithChildren<{
  className?: string;
  accent?: CardAccent;
}>;

const ACCENT: Record<CardAccent, string> = {
  none: 'border-white/[0.12] bg-white/[0.07]',
  blue: 'border-[#3b82f6]/35 bg-white/[0.06]',
  red: 'border-[#ef4444]/40 bg-white/[0.06]',
  green: 'border-[#22c55e]/38 bg-white/[0.06]',
  purple: 'border-[#8b5cf6]/42 bg-white/[0.06]',
};

export default function Card({ children, className, accent = 'none' }: Props) {
  return (
    <View
      className={[
        // ACCENT[accent],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </View>
  );
}
