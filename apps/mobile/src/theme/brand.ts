import { Platform, StyleSheet } from 'react-native';
import { BRAND_PHONE, BRAND_PHONE_HREF } from '@mc-labor/shared';

export { BRAND_PHONE, BRAND_PHONE_HREF };

/** FieldFlow-style palette (efficient-realtime-intuitive) */
export const FF = {
  bg: '#F8FAFC',
  card: '#FFFFFF',
  primary: '#2563EB',
  primaryDark: '#1D4ED8',
  text: '#0F172A',
  textSecondary: '#64748B',
  textMuted: '#94A3B8',
  border: '#F1F5F9',
  borderInput: '#E2E8F0',
  blue50: '#EFF6FF',
  green500: '#22C55E',
  green50: '#F0FDF4',
  red500: '#EF4444',
  red50: '#FEF2F2',
  amber500: '#F59E0B',
  amber50: '#FFFBEB',
  violet500: '#7C3AED',
  violet50: '#F5F3FF',
  cyan500: '#0891B2',
  cyan50: '#ECFEFF',
  rose500: '#E11D48',
  rose50: '#FFF1F2',
  indigo500: '#4F46E5',
  indigo50: '#EEF2FF',
} as const;

export type AccentKey = 'blue' | 'green' | 'amber' | 'violet' | 'rose' | 'cyan' | 'indigo';

export const accents: Record<
  AccentKey,
  { bg: string; color: string; border: string; gradient: [string, string] }
> = {
  blue: { bg: '#EFF6FF', color: '#2563EB', border: '#BFDBFE', gradient: ['#2563EB', '#4F46E5'] },
  green: { bg: '#F0FDF4', color: '#16A34A', border: '#BBF7D0', gradient: ['#22C55E', '#16A34A'] },
  amber: { bg: '#FFFBEB', color: '#D97706', border: '#FDE68A', gradient: ['#F59E0B', '#D97706'] },
  violet: { bg: '#F5F3FF', color: '#7C3AED', border: '#DDD6FE', gradient: ['#8B5CF6', '#7C3AED'] },
  rose: { bg: '#FFF1F2', color: '#E11D48', border: '#FECDD3', gradient: ['#F43F5E', '#E11D48'] },
  cyan: { bg: '#ECFEFF', color: '#0891B2', border: '#A5F3FC', gradient: ['#06B6D4', '#0891B2'] },
  indigo: { bg: '#EEF2FF', color: '#4F46E5', border: '#C7D2FE', gradient: ['#6366F1', '#4F46E5'] },
};

export const fonts = {
  regular: 'Montserrat_400Regular',
  medium: 'Montserrat_500Medium',
  semiBold: 'Montserrat_600SemiBold',
  bold: 'Montserrat_700Bold',
} as const;

export const theme = {
  colors: {
    bg: FF.bg,
    surface: FF.card,
    surfaceSolid: FF.card,
    surfaceMuted: '#F1F5F9',
    surfaceElevated: FF.card,
    border: FF.border,
    borderSoft: FF.borderInput,
    text: FF.text,
    textSecondary: FF.textSecondary,
    textMuted: FF.textMuted,
    textLight: FF.textMuted,
    primary: FF.primary,
    primaryDark: FF.primaryDark,
    accentWarm: FF.amber500,
    accentWarmBg: FF.amber50,
    accentWarmBorder: '#FDE68A',
    success: FF.green500,
    successBg: FF.green50,
    successBorder: '#BBF7D0',
    danger: FF.red500,
    dangerBg: FF.red50,
    dangerBorder: '#FECACA',
    warning: FF.amber500,
    warningBg: FF.amber50,
    warningBorder: '#FDE68A',
    info: FF.primary,
    infoBg: FF.blue50,
    infoBorder: '#BFDBFE',
  },
  radius: {
    sm: 12,
    md: 16,
    lg: 20,
    xl: 24,
    card: 24,
    full: 999,
  },
  spacing: {
    screen: 20,
    card: 16,
  },
} as const;

export const glassStyle = {
  backgroundColor: FF.card,
  borderWidth: 1,
  borderColor: FF.border,
} as const;

export const cardShadow = Platform.select({
  web: { boxShadow: '0 2px 20px -8px rgba(15, 23, 42, 0.12)' },
  default: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 2,
  },
});

export const chromeBarShadow = Platform.select({
  web: { boxShadow: '0 1px 4px rgba(15, 23, 42, 0.06)' },
  default: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 3,
  },
});

export const tabBarShadow = Platform.select({
  web: { boxShadow: '0 -2px 10px rgba(15, 23, 42, 0.07)' },
  default: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 10,
  },
});

export const brandStyles = StyleSheet.create({
  headerTitle: {
    fontFamily: fonts.semiBold,
    fontWeight: '600',
    fontSize: 17,
    color: FF.text,
  },
});

export const headerScreenOptions = {
  headerStyle: {
    backgroundColor: FF.card,
    borderBottomWidth: 1,
    borderBottomColor: FF.borderInput,
  },
  headerTintColor: FF.primary,
  headerTitleStyle: brandStyles.headerTitle,
  headerShadowVisible: false,
  headerBackTitleVisible: false,
} as const;

export const tabScreenOptions = {
  tabBarShowLabel: true,
  tabBarActiveTintColor: FF.primary,
  tabBarInactiveTintColor: FF.textMuted,
  headerStyle: { backgroundColor: FF.card },
  headerTintColor: FF.primary,
  headerTitleStyle: brandStyles.headerTitle,
  headerShadowVisible: false,
} as const;

export function statusColors(status: string): { bg: string; text: string; border: string } {
  const s = status.toUpperCase();
  if (['ACTIVE', 'ACCEPTED', 'APPROVED', 'COMPLETED', 'ACKNOWLEDGED', 'CLOCKED_IN'].includes(s)) {
    return { bg: FF.green50, text: FF.green500, border: '#BBF7D0' };
  }
  if (['SENT', 'PENDING', 'DRAFT'].includes(s)) {
    return { bg: FF.amber50, text: FF.amber500, border: '#FDE68A' };
  }
  if (['CANCELLED', 'REJECTED', 'FAILED'].includes(s)) {
    return { bg: FF.red50, text: FF.red500, border: '#FECACA' };
  }
  return { bg: FF.blue50, text: FF.primary, border: '#BFDBFE' };
}
