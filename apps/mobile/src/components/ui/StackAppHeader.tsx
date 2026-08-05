import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { FF, fonts } from '@/theme/brand';
import { BrandHeaderLogo } from './BrandHeaderLogo';

type StackAppHeaderProps = {
  fallbackHref?: string;
  compact?: boolean;
  hideBack?: boolean;
};

export function StackAppHeader({ fallbackHref = '/', compact = false, hideBack = false }: StackAppHeaderProps = {}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  function goBack() {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(fallbackHref as never);
  }

  return (
    <View style={[styles.bar, compact && styles.barCompact, { paddingTop: insets.top + 7 }]}>
      {hideBack ? (
        <View style={[styles.backButton, compact && styles.backButtonCompact, styles.backPlaceholder]} />
      ) : (
        <Pressable
          onPress={goBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={8}
          style={({ pressed }) => [styles.backButton, compact && styles.backButtonCompact, pressed && styles.pressed]}
        >
          <Ionicons name="arrow-back" size={20} color={FF.text} />
          <Text style={styles.backLabel}>Back</Text>
        </Pressable>
      )}
      <BrandHeaderLogo />
      <View style={styles.copy}>
        <Text style={styles.context}>Worker Portal</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingBottom: 9,
    borderBottomWidth: 1,
    borderBottomColor: FF.borderInput,
    backgroundColor: FF.card,
  },
  barCompact: {
    minHeight: 56,
    paddingBottom: 7,
  },
  backButton: {
    minWidth: 72,
    height: 40,
    flexDirection: 'row',
    gap: 5,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    borderWidth: 1,
    borderColor: FF.borderInput,
    backgroundColor: '#F8FAFC',
  },
  backButtonCompact: {
    minWidth: 68,
    height: 36,
  },
  backPlaceholder: {
    borderWidth: 0,
    backgroundColor: 'transparent',
  },
  backLabel: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: FF.text,
  },
  copy: {
    flex: 1,
  },
  context: {
    marginTop: 1,
    fontFamily: fonts.regular,
    fontSize: 10,
    color: FF.textSecondary,
  },
  pressed: {
    opacity: 0.7,
  },
});
