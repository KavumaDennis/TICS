/**
 * Shared responsive utilities for TICS
 *
 * Provides:
 * - Screen width/height detection
 * - Responsive text scaling
 * - Card container helpers
 * - Safe area spacing
 * - Common breakpoints
 */

import { Dimensions, Platform } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

/* ════════════════════════════════════════════════════════════════════════════ */
/*  BREAKPOINTS                                                               */
/* ════════════════════════════════════════════════════════════════════════════ */

export const isSmallScreen = SCREEN_WIDTH < 375;        // iPhone SE, small Android
export const isMediumScreen = SCREEN_WIDTH >= 375 && SCREEN_WIDTH < 414; // iPhone 14 Pro, standard Android
export const isLargeScreen = SCREEN_WIDTH >= 414 && SCREEN_WIDTH < 768; // Large phones
export const isTablet = SCREEN_WIDTH >= 768;

export const screenWidth = SCREEN_WIDTH;
export const screenHeight = SCREEN_HEIGHT;

/* ════════════════════════════════════════════════════════════════════════════ */
/*  SPACING                                                                   */
/* ════════════════════════════════════════════════════════════════════════════ */

export const horizontalPadding = isTablet ? 24 : (isLargeScreen ? 20 : 16);
export const verticalPadding = isTablet ? 20 : (isLargeScreen ? 18 : 16);
export const cardGap = isTablet ? 20 : (isLargeScreen ? 16 : 12);
export const sectionGap = isTablet ? 28 : (isLargeScreen ? 24 : 20);

/* ════════════════════════════════════════════════════════════════════════════ */
/*  TYPOGRAPHY                                                                 */
/* ════════════════════════════════════════════════════════════════════════════ */

export const fontScale = Math.max(0.85, SCREEN_WIDTH / 375); // Base on standard phone, min 0.85

export const responsiveTextSize = {
  xs: Math.max(10, Math.round(11 * Math.min(fontScale, 1.1))),
  sm: Math.round(13 * Math.min(fontScale, 1.1)),
  base: Math.round(15 * Math.min(fontScale, 1.1)),
  lg: Math.round(17 * Math.min(fontScale, 1.1)),
  xl: Math.round(20 * Math.min(fontScale, 1.1)),
  '2xl': Math.round(24 * Math.min(fontScale, 1.1)),
  '3xl': Math.round(30 * Math.min(fontScale, 1.1)),
  '4xl': Math.round(36 * Math.min(fontScale, 1.05)),
};

/* ════════════════════════════════════════════════════════════════════════════ */
/*  LAYOUT HELPERS                                                            */
/* ════════════════════════════════════════════════════════════════════════════ */

export const getResponsiveCardWidth = (columns: number = 2): number => {
  if (isTablet) return (SCREEN_WIDTH - horizontalPadding * 2 - cardGap * (columns - 1)) / columns;
  return (SCREEN_WIDTH - horizontalPadding * 2 - cardGap) / 2;
};

export const getMaxContentWidth = (): number => {
  return isTablet ? 700 : SCREEN_WIDTH;
};

/* ════════════════════════════════════════════════════════════════════════════ */
/*  SAFE AREA                                                                */
/* ════════════════════════════════════════════════════════════════════════════ */

export const hasNotch = Platform.OS === 'ios' && SCREEN_HEIGHT >= 800;
export const bottomSafeArea = Platform.OS === 'ios' ? 34 : 0;

/* ════════════════════════════════════════════════════════════════════════════ */
/*  TEXT OVERFLOW HELPERS                                                     */
/* ════════════════════════════════════════════════════════════════════════════ */

export const getTitleLines = (text: string): number => {
  if (!text) return 1;
  if (text.length <= 20) return 1;
  if (text.length <= 60) return 2;
  return isTablet ? 2 : 3;
};

export const getDescriptionLines = (): number => {
  return isTablet ? 3 : 2;
};

export const shouldTruncateTitle = (text: string, maxLength: number = isTablet ? 100 : 50): boolean => {
  return (text?.length || 0) > maxLength;
};

export const truncateText = (text: string, maxLength: number = isTablet ? 100 : 50): string => {
  if (!text || text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
};

/* ════════════════════════════════════════════════════════════════════════════ */
/*  COMMON STYLES (to be used with NativeWind)                                */
/* ════════════════════════════════════════════════════════════════════════════ */

/**
 * Common container style for all screens
 */
export const screenContainerStyle = {
  flex: 1,
  width: SCREEN_WIDTH,
  maxWidth: isTablet ? 768 : SCREEN_WIDTH,
  alignSelf: 'center' as const,
  backgroundColor: '#0a0b1e',
};

/**
 * Safe scroll view wrapper
 */
export const scrollViewStyle = {
  flex: 1,
  width: SCREEN_WIDTH,
  maxWidth: isTablet ? 768 : SCREEN_WIDTH,
  alignSelf: 'center' as const,
};

/**
 * Card base container
 */
export const cardContainerStyle = {
  marginHorizontal: horizontalPadding,
  marginBottom: cardGap,
};

/**
 * Header with title and optional actions - prevents overflow
 */
export const getHeaderStyle = (hasActions: boolean = false) => ({
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  justifyContent: hasActions ? 'space-between' as const : 'flex-start' as const,
  paddingHorizontal: horizontalPadding,
  paddingVertical: verticalPadding,
  gap: 12,
  minHeight: 56,
});

export const getTitleStyle = (isLargeHeader: boolean = false) => ({
  fontSize: isLargeHeader ? responsiveTextSize['2xl'] : responsiveTextSize.xl,
  fontWeight: '600' as const,
  color: '#F8FAFC',
  flex: 1,
  flexShrink: 1,
});

export const getSubtitleStyle = () => ({
  fontSize: responsiveTextSize.sm,
  color: 'rgba(226,232,240,0.72)',
  marginTop: 4,
});

/**
 * Button container to prevent overflow
 */
export const getButtonRowStyle = () => ({
  flexDirection: 'row' as const,
  flexWrap: 'wrap' as const,
  gap: 10,
  marginHorizontal: horizontalPadding,
});

/**
 * Chip/tag row style
 */
export const getChipRowStyle = () => ({
  flexDirection: 'row' as const,
  flexWrap: 'wrap' as const,
  gap: 8,
  marginHorizontal: horizontalPadding,
});

/**
 * Bottom safe area padding
 */
export const bottomPadding = bottomSafeArea + 16;