import type { PropsWithChildren } from 'react';
import { LinearGradient } from 'expo-linear-gradient';

type Variant = 'blue' | 'slate' | 'green' | 'purple' | 'alerts' | 'recommendations';

/** Navy-first gradients with subtle category tint (matches TICS glass UI reference). */
const VARIANT_COLORS: Record<Variant, readonly [string, string, string]> = {
  blue: ['#0a0b1e', '#151839', '#0a0b1e'] as const,
  slate: ['#0a0b1e', '#121018', '#0a0b1e'] as const,
  green: ['#0a0b1e', '#0f2419', '#0a0b1e'] as const,
  purple: ['#0a0b1e', '#1a1033', '#0a0b1e'] as const,
  alerts: ['#0a0a14', '#140810', '#0a0a14'] as const,
  recommendations: ['#060814', '#051810', '#040e08'] as const,
};

export default function ScreenBackground({
  children,
  variant,
}: PropsWithChildren<{ variant: Variant }>) {
  return (
    <LinearGradient colors={VARIANT_COLORS[variant]} style={{ flex: 1 }}>
      {children}
    </LinearGradient>
  );
}
