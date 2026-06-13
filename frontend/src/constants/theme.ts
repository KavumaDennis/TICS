import { DarkTheme, type Theme } from '@react-navigation/native';

export const colors = {
  bg: '#0a0b1e',
  card: 'rgba(255,255,255,0.06)',
  border: 'rgba(255,255,255,0.12)',
  text: '#F8FAFC',
  muted: 'rgba(226,232,240,0.72)',
  primary: '#3B82F6',
  accentPurple: '#8B5CF6',
  danger: '#EF4444',
  warning: '#F59E0B',
  success: '#22C55E',
} as const;

export const darkNavTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    card: '#121332',
    border: colors.border,
    text: colors.text,
    primary: colors.primary,
    notification: colors.danger,
  },
};
