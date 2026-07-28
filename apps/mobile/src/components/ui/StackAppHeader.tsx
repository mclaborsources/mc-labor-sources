import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { FF, fonts } from '@/theme/brand';

type StackAppHeaderProps = {
  fallbackHref?: string;
  compact?: boolean;
};

export function StackAppHeader({ fallbackHref, compact = false }: StackAppHeaderProps = {}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  function goBack() {
    if (fallbackHref) {
      router.replace(fallbackHref as never);
      return;
    }
    if (router.canGoBack()) router.back();
  }

  return (
    <View style={[styles.bar, compact && styles.barCompact, { paddingTop: insets.top + 7 }]}>
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
      <View style={styles.mark}>
        <Ionicons name="construct-outline" size={17} color="#fff" />
      </View>
      <View style={styles.copy}>
        <Text style={styles.brand}>MC LABOR SOURCES</Text>
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
  backLabel: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: FF.text,
  },
  mark: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
    backgroundColor: FF.primary,
  },
  copy: {
    flex: 1,
  },
  brand: {
    fontFamily: fonts.bold,
    fontSize: 10,
    letterSpacing: 0.65,
    color: FF.text,
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
