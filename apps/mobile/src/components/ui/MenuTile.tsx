import { View, Text, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { theme, fonts, FF, cardShadow, type AccentKey, accents } from '@/theme/brand';

type MenuTileProps = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent?: AccentKey;
  onPress?: () => void;
};

export function MenuTile({ label, icon, accent = 'blue', onPress }: MenuTileProps) {
  const tone = accents[accent];

  return (
    <Pressable
      style={({ pressed }) => [
        styles.tile,
        { borderColor: pressed ? tone.border : FF.border },
        pressed && styles.pressed,
      ]}
      onPress={onPress}
    >
      <LinearGradient colors={tone.gradient} style={styles.iconWrap}>
        <Ionicons name={icon} size={20} color="#fff" />
      </LinearGradient>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.chevronWrap, { backgroundColor: tone.bg }]}>
        <Ionicons name="chevron-forward" size={14} color={tone.color} />
      </View>
    </Pressable>
  );
}

type HomeHeroProps = {
  firstName: string;
  assignmentCount?: number;
  onShift?: boolean;
};

export function HomeHero({ firstName, assignmentCount = 0, onShift = false }: HomeHeroProps) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <View style={[styles.heroCard, cardShadow]}>
      <View style={styles.heroContent}>
        <View style={styles.heroTopRow}>
          <View style={styles.welcomeIcon}>
            <Ionicons name="hand-left-outline" size={22} color={FF.primary} />
          </View>
          <View style={styles.heroTextBlock}>
            <Text style={styles.heroGreeting}>{greeting}</Text>
            <Text style={styles.heroName}>{firstName}</Text>
            <Text style={styles.heroSub}>Here is your work overview.</Text>
          </View>
          <View style={[styles.heroBadge, onShift && styles.heroBadgeActive]}>
            <Ionicons
              name={onShift ? 'radio-button-on' : 'checkmark-circle-outline'}
              size={14}
              color={onShift ? '#15803D' : FF.textSecondary}
            />
            <Text style={styles.heroBadgeText}>{onShift ? 'On shift' : 'Ready'}</Text>
          </View>
        </View>
        <View style={styles.heroStats}>
          <View style={styles.heroStat}>
            <View style={styles.statIcon}>
              <Ionicons name="briefcase-outline" size={18} color={FF.primary} />
            </View>
            <View>
              <Text style={styles.heroStatValue}>{assignmentCount}</Text>
              <Text style={styles.heroStatLabel}>Assignments</Text>
            </View>
          </View>
          <View style={styles.heroStat}>
            <View style={[styles.statIcon, styles.statIconGreen]}>
              <Ionicons name="time-outline" size={18} color="#15803D" />
            </View>
            <View>
              <Text style={styles.heroStatValueSmall}>{onShift ? 'Working' : 'Not clocked in'}</Text>
              <Text style={styles.heroStatLabel}>Shift status</Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

/** Login hero — authentication artwork with a modern frosted brand wash */
export function AuthHero() {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <View style={[styles.authHeroCard, cardShadow]}>
      <LinearGradient
        colors={[
          '#2563EB',
          '#3B82F6',
          '#4F46E5',
        ]}
        locations={[0, 0.42, 1]}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={['rgba(255, 255, 255, 0.16)', 'rgba(255, 255, 255, 0)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.authHeroSheen}
      />
      <View style={styles.authBadge}>
        <Ionicons name="shield-checkmark" size={14} color="#fff" />
        <Text style={styles.heroBadgeText}>Secure</Text>
      </View>
      <View style={styles.authHeroContent}>
        <View style={styles.authGlassPanel}>
          <Text style={styles.authGreeting}>{greeting}</Text>
          <Text style={styles.authTitle}>Worker Portal</Text>
          <Text style={styles.authSub}>Sign in to your field command center</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    borderRadius: 20,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: FF.borderInput,
    backgroundColor: FF.card,
  },
  heroContent: {
    padding: 18,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  welcomeIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: FF.blue50,
  },
  heroTextBlock: {
    flex: 1,
  },
  heroGreeting: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: FF.textSecondary,
  },
  heroName: {
    fontFamily: fonts.bold,
    fontSize: 22,
    color: FF.text,
    marginTop: 1,
    letterSpacing: -0.4,
  },
  heroSub: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: FF.textSecondary,
    marginTop: 2,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: FF.borderInput,
  },
  heroBadgeActive: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  heroBadgeText: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    color: FF.textSecondary,
  },
  heroStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 16,
  },
  heroStat: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 64,
    paddingHorizontal: 12,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: FF.border,
    backgroundColor: '#F8FAFC',
  },
  statIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
    backgroundColor: FF.blue50,
  },
  statIconGreen: {
    backgroundColor: '#F0FDF4',
  },
  heroStatValue: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: FF.text,
  },
  heroStatValueSmall: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: FF.text,
  },
  heroStatLabel: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: FF.textSecondary,
  },
  authHeroCard: {
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: 20,
    minHeight: 188,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    backgroundColor: '#1E3A8A',
  },
  authHeroSheen: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.9,
  },
  authBadge: {
    position: 'absolute',
    top: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.32)',
  },
  authHeroContent: {
    flex: 1,
    minHeight: 188,
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 16,
  },
  authGlassPanel: {
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.22)',
  },
  authGreeting: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.82)',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  authTitle: {
    fontFamily: fonts.bold,
    fontSize: 24,
    color: '#fff',
    marginTop: 4,
    letterSpacing: -0.5,
  },
  authSub: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.86)',
    marginTop: 4,
    lineHeight: 18,
  },
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: FF.card,
    borderRadius: theme.radius.card,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
    ...cardShadow,
  },
  pressed: {
    opacity: 0.96,
    transform: [{ scale: 0.985 }],
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  label: {
    flex: 1,
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: FF.text,
  },
  chevronWrap: {
    width: 28,
    height: 28,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
