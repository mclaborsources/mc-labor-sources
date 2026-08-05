import { View, Text, Pressable, StyleSheet, type ImageSourcePropType } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { fonts, FF } from '@/theme/brand';

type ImageBannerProps = {
  /** Retained for compatibility while page artwork is intentionally no longer rendered. */
  source: ImageSourcePropType;
  title: string;
  subtitle?: string;
  variant?: 'card' | 'full' | 'compact';
  showBack?: boolean;
};

  function iconForTitle(title: string): keyof typeof Ionicons.glyphMap {
  const value = title.toLowerCase();
  if (value.includes('assignment') || value.includes('job order')) return 'briefcase-outline';
  if (value.includes('clock') || value.includes('attendance')) return 'time-outline';
  if (value.includes('timesheet')) return 'calendar-outline';
  if (value.includes('message')) return 'chatbubbles-outline';
  if (value.includes('task')) return 'checkbox-outline';
  if (value.includes('notification')) return 'notifications-outline';
  if (value.includes('profile') || value.includes('account')) return 'person-outline';
  if (value.includes('safety')) return 'shield-checkmark-outline';
  return 'apps-outline';
}

export function ImageBanner({
  source: _source,
  title,
  subtitle,
  variant = 'card',
  showBack = false,
}: ImageBannerProps) {
  const router = useRouter();
  const isFull = variant === 'full';

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/' as never);
  }

  return (
    <View style={[styles.wrap, isFull ? styles.full : styles.card, variant === 'compact' && styles.compact]}>
      {showBack ? (
        <Pressable
          onPress={goBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        >
          <Ionicons name="arrow-back" size={21} color={FF.primary} />
        </Pressable>
      ) : null}
      <View style={styles.icon}>
        <Ionicons name={iconForTitle(title)} size={23} color={FF.primary} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    minHeight: 92,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderWidth: 1,
    borderColor: FF.borderInput,
    backgroundColor: FF.card,
  },
  full: {
    borderLeftWidth: 0,
    borderRightWidth: 0,
    borderRadius: 0,
  },
  card: {
    borderRadius: 20,
    marginBottom: 16,
  },
  compact: {
    minHeight: 78,
    paddingVertical: 14,
  },
  icon: {
    width: 48,
    height: 48,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: 21,
    lineHeight: 27,
    letterSpacing: -0.35,
    color: FF.text,
  },
  subtitle: {
    marginTop: 3,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 19,
    color: FF.textSecondary,
  },
  backButton: {
    width: 42,
    height: 42,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: FF.borderInput,
    backgroundColor: FF.card,
  },
  pressed: {
    opacity: 0.72,
  },
});
