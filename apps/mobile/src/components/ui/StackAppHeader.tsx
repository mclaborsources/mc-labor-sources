import { View, Image, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { FF, chromeBarShadow } from '@/theme/brand';

const LOGO_WIDTH = 220;
const LOGO_HEIGHT = 44;

/** Logo header bar for stack screens — same logo placement as tabs, back overlaid on logo */
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
    <View style={chromeBarShadow}>
      <View
        style={[
          styles.bar,
          compact && styles.barCompact,
          { paddingTop: insets.top + (compact ? 4 : 12) },
        ]}
      >
        <View style={[styles.logoWrap, compact && styles.logoWrapCompact]}>
          <Image
            source={require('../../../assets/logo.png')}
            style={[styles.logo, compact && styles.logoCompact]}
            resizeMode="contain"
          />
          <Pressable
            onPress={goBack}
            style={({ pressed }) => [
              styles.backBtn,
              compact && styles.backBtnCompact,
              pressed && styles.backBtnPressed,
            ]}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={20} color={FF.primary} />
          </Pressable>
        </View>
      </View>
      <LinearGradient
        colors={['#2563EB', '#4F46E5', '#2563EB']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.accentLine}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: FF.card,
    borderBottomWidth: 1,
    borderBottomColor: FF.borderInput,
    paddingBottom: 14,
    paddingHorizontal: 20,
    minHeight: 56,
    justifyContent: 'flex-end',
  },
  barCompact: {
    paddingBottom: 6,
    paddingHorizontal: 10,
    minHeight: 42,
  },
  logoWrap: {
    width: LOGO_WIDTH,
    height: LOGO_HEIGHT,
    alignSelf: 'flex-start',
  },
  logoWrapCompact: {
    width: 170,
    height: 32,
  },
  logo: {
    width: LOGO_WIDTH,
    height: LOGO_HEIGHT,
  },
  logoCompact: {
    width: 170,
    height: 32,
  },
  backBtn: {
    position: 'absolute',
    left: 0,
    top: 2,
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderWidth: 1,
    borderColor: FF.borderInput,
  },
  backBtnCompact: {
    top: 0,
    width: 32,
    height: 32,
    borderRadius: 10,
  },
  backBtnPressed: {
    opacity: 0.85,
  },
  accentLine: {
    height: 3,
  },
});
