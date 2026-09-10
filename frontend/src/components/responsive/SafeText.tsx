/**
 * SafeText.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Universal text component that auto-truncates with "..." when content exceeds
 * its container width. Drop-in replacement for <Text> in any screen.
 *
 * Features:
 * - Defaults to numberOfLines={1} (single line, always safe)
 * - ellipsizeMode="tail" automatically applied
 * - Passes through ALL React Native Text props including className (nativewind)
 * - Supports allowUnlimited for paragraphs that should wrap
 * - No breaking changes - just import and replace <Text> with <SafeText>
 *
 * Usage:
 *   import { SafeText } from '@/src/components/responsive/SafeText';
 *   <SafeText className="text-white text-lg">{title}</SafeText>
 *   <SafeText numberOfLines={3} className="text-gray-400">{description}</SafeText>
 *   <SafeText allowUnlimited>{paragraph}</SafeText>
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React from 'react';
import { Text, TextProps } from 'react-native';

interface SafeTextProps extends TextProps {
  /** Max lines before "..." truncation. Defaults to 1 for safety. */
  numberOfLines?: number;
  /** Truncation mode. Defaults to "tail" */
  ellipsizeMode?: 'head' | 'middle' | 'tail' | 'clip';
  /** If true, allow unlimited lines (no truncation). Use for paragraphs. */
  allowUnlimited?: boolean;
}

/**
 * SafeText - Drop-in replacement for React Native <Text>
 *
 * Automatically truncates overflowing content with "..." (ellipsis).
 * Defaults to single-line for maximum safety.
 * Set allowUnlimited={true} for paragraph text that should wrap.
 */
export function SafeText({
  numberOfLines = 1,
  ellipsizeMode = 'tail',
  allowUnlimited = false,
  children,
  style,
  ...props
}: SafeTextProps) {
  const lines = allowUnlimited ? undefined : numberOfLines;

  return (
    <Text
      {...props}
      numberOfLines={lines}
      ellipsizeMode={ellipsizeMode}
      style={style}
    >
      {children}
    </Text>
  );
}

export default SafeText;

/**
 * SafeTextMini - Extra-safe version for small UI elements.
 * Always single line with "..." truncation.
 */
export function SafeTextMini(props: SafeTextProps) {
  return <SafeText {...props} numberOfLines={1} />;
}