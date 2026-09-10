/**
 * ResponsiveHeader.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Reusable header component that prevents overflow on all screen sizes.
 *
 * Features:
 * - Title truncates gracefully with ellipsis
 * - Action buttons remain visible and tappable
 * - Subtitle wraps or truncates based on available space
 * - Safe area aware
 * - Responsive padding and font sizes
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Ionicons } from '@expo/vector-icons';
import { ReactNode } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { responsiveTextSize, horizontalPadding, getTitleStyle } from '@/src/utils/responsive';
import { SafeText } from '@/src/components/responsive/SafeText';

interface ResponsiveHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  rightActions?: ReactNode;
  maxTitleWidth?: number;
  titleLines?: number;
}

export function ResponsiveHeader({
  title,
  subtitle,
  onBack,
  rightActions,
  maxTitleWidth,
  titleLines = 2,
}: ResponsiveHeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: insets.top + 12,
          paddingHorizontal: horizontalPadding,
          paddingBottom: 12,
        },
      ]}
    >
      {/* Main row */}
      <View style={styles.row}>
        {/* Back button */}
        {onBack && (
          <Pressable
            onPress={onBack}
            style={styles.iconButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="chevron-back" size={22} color="rgba(248,250,252,0.9)" />
          </Pressable>
        )}

        {/* Title container */}
        <View style={[styles.titleContainer, maxTitleWidth ? { maxWidth: maxTitleWidth } : undefined]}>
          <SafeText
            style={getTitleStyle(true)}
            numberOfLines={titleLines}
            ellipsizeMode="tail"
          >
            {title}
          </SafeText>
          {subtitle ? (
            <SafeText
              style={styles.subtitle}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {subtitle}
            </SafeText>
          ) : null}
        </View>

        {/* Right actions */}
        {rightActions && (
          <View style={styles.actions}>{rightActions}</View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  titleContainer: {
    flex: 1,
    flexShrink: 1,
    justifyContent: 'center',
  },
  subtitle: {
    fontFamily: 'ShareTech_400Regular',
    color: 'rgba(226,232,240,0.72)',
    fontSize: responsiveTextSize.xs,
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(245,158,11,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});