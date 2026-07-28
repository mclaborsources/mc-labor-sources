import { type ReactNode } from 'react';
import { View, StyleSheet, ActivityIndicator, Text, ScrollView, type ViewStyle } from 'react-native';
import { AppBackground } from './AppBackground';
import { theme, fonts } from '@/theme/brand';

type ScreenProps = {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  style?: ViewStyle;
  contentContainerStyle?: ViewStyle;
};

export function Screen({ children, scroll = false, padded = true, style, contentContainerStyle }: ScreenProps) {
  return (
    <AppBackground style={style}>
      {scroll ? (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.scrollContent, padded && styles.padded, contentContainerStyle]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.flex, padded && styles.padded, contentContainerStyle]}>{children}</View>
      )}
    </AppBackground>
  );
}

export function LoadingView({ label }: { label?: string }) {
  return (
    <Screen padded={false}>
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primaryDark} />
        {label ? <Text style={styles.loadingLabel}>{label}</Text> : null}
      </View>
    </Screen>
  );
}

export function EmptyState({ message, icon }: { message: string; icon?: string }) {
  return (
    <View style={styles.empty}>
      {icon ? <Text style={styles.emptyIcon}>{icon}</Text> : null}
      <Text style={styles.emptyText}>{message}</Text>
    </View>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  if (!message) return null;
  return (
    <View style={styles.errorBanner}>
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

export function InfoBanner({ message }: { message: string }) {
  return (
    <View style={styles.infoBanner}>
      <Text style={styles.infoText}>{message}</Text>
    </View>
  );
}

export function SuccessBanner({ message }: { message: string }) {
  if (!message) return null;
  return (
    <View style={styles.successBanner}>
      <Text style={styles.successText}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  padded: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 32,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 32,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingLabel: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: theme.colors.textMuted,
    marginTop: 12,
  },
  empty: {
    alignItems: 'center',
    marginHorizontal: 18,
    marginVertical: 22,
    paddingVertical: 42,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    borderRadius: 20,
    backgroundColor: theme.colors.surface,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  emptyText: {
    fontFamily: fonts.regular,
    fontSize: 15,
    color: theme.colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
  },
  errorBanner: {
    backgroundColor: theme.colors.dangerBg,
    borderWidth: 1,
    borderColor: theme.colors.dangerBorder,
    borderRadius: theme.radius.md,
    padding: 14,
    marginBottom: 16,
  },
  errorText: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: theme.colors.danger,
    lineHeight: 20,
  },
  infoBanner: {
    backgroundColor: theme.colors.infoBg,
    borderWidth: 1,
    borderColor: theme.colors.infoBorder,
    borderRadius: theme.radius.md,
    padding: 14,
    marginBottom: 16,
  },
  infoText: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: theme.colors.info,
    lineHeight: 20,
  },
  successBanner: {
    backgroundColor: theme.colors.successBg,
    borderWidth: 1,
    borderColor: theme.colors.successBorder,
    borderRadius: theme.radius.md,
    padding: 14,
    marginBottom: 16,
  },
  successText: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: theme.colors.success,
    lineHeight: 20,
  },
});

/** Shared layout tokens for list and tab content screens */
export const screenLayout = StyleSheet.create({
  body: {
    paddingHorizontal: theme.spacing.screen,
    paddingTop: 20,
    paddingBottom: 32,
  },
  itemWrap: {
    paddingHorizontal: theme.spacing.screen,
  },
  listSpacer: {
    height: 20,
  },
  listContent: {
    paddingBottom: 32,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionLabel: {
    fontFamily: fonts.semiBold,
    fontSize: 15,
    color: theme.colors.text,
  },
  sectionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.colors.infoBg,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  sectionPillText: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: theme.colors.primary,
  },
});
