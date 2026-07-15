import { forwardRef, type ReactNode } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
  type PressableProps,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme, fonts, cardShadow, statusColors, glassStyle, type AccentKey, accents } from '@/theme/brand';

type CardProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  variant?: 'default' | 'success' | 'selected';
};

export function Card({ children, style, variant = 'default' }: CardProps) {
  return (
    <View
      style={[
        styles.card,
        variant === 'success' && styles.cardSuccess,
        variant === 'selected' && styles.cardSelected,
        style,
      ]}
    >
      {children}
    </View>
  );
}

type ListCardProps = {
  title: string;
  subtitle?: string;
  meta?: string;
  status?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  iconAccent?: AccentKey;
  /** default = fixed height; comfortable = auto height for longer copy */
  size?: 'default' | 'comfortable';
  titleLines?: number;
  subtitleLines?: number;
  selected?: boolean;
} & Omit<PressableProps, 'children'>;

const LIST_CARD_HEIGHT = 108;

export const ListCard = forwardRef<React.ElementRef<typeof Pressable>, ListCardProps>(
  function ListCard(
    {
      title,
      subtitle,
      meta,
      status,
      icon,
      iconAccent = 'blue',
      size = 'default',
      titleLines,
      subtitleLines = 1,
      selected = false,
      onPress,
      style,
      disabled,
      ...rest
    },
    ref,
  ) {
    const badge = status ? statusColors(status) : null;
    const tone = accents[iconAccent];
    const isInteractive = Boolean(onPress) && disabled !== true;
    const comfortable = size === 'comfortable';
    const resolvedTitleLines = titleLines ?? (comfortable ? 1 : 2);
    const resolvedSubtitleLines = comfortable ? subtitleLines : 1;

    return (
      <Pressable
        ref={ref}
        style={(state) => [
          styles.listCard,
          comfortable ? styles.listCardComfortable : styles.listCardFixed,
          selected && styles.listCardSelected,
          isInteractive && state.pressed && styles.pressed,
          typeof style === 'function' ? style(state) : style,
        ]}
        onPress={onPress}
        disabled={disabled ?? !onPress}
        {...rest}
      >
        {icon ? (
          <View
            style={[
              styles.listIconWrap,
              comfortable && styles.listIconWrapComfortable,
              { backgroundColor: tone.bg, borderColor: tone.border },
            ]}
          >
            <Ionicons name={icon} size={20} color={tone.color} />
          </View>
        ) : null}

        <View style={[styles.listBody, comfortable ? styles.listBodyComfortable : styles.listBodyFixed]}>
          <Text
            style={[styles.listTitleText, comfortable ? styles.listTitleComfortable : styles.listTitleFixed]}
            numberOfLines={resolvedTitleLines}
            ellipsizeMode="tail"
          >
            {title}
          </Text>
          <Text
            style={[
              styles.listSubtitleText,
              comfortable ? styles.listSubtitleComfortable : styles.listSubtitleFixed,
            ]}
            numberOfLines={resolvedSubtitleLines}
            ellipsizeMode="tail"
          >
            {subtitle || ' '}
          </Text>
          <View style={styles.metaRow}>
            {meta ? (
              <>
                <Ionicons name="calendar-outline" size={13} color={theme.colors.textMuted} />
                <Text style={styles.listMeta} numberOfLines={1} ellipsizeMode="tail">
                  {meta}
                </Text>
              </>
            ) : (
              <Text style={styles.listMeta}> </Text>
            )}
          </View>
        </View>

        <View style={[styles.listTrailing, comfortable ? styles.listTrailingComfortable : styles.listTrailingFixed]}>
          {badge ? (
            <View style={[styles.badge, { backgroundColor: badge.bg, borderColor: badge.border }]}>
              <Text
                style={[styles.badgeText, { color: badge.text }]}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {status}
              </Text>
            </View>
          ) : (
            <View style={styles.badgePlaceholder} />
          )}
          {isInteractive && !selected ? (
            <View style={styles.chevronWrap}>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.textLight} />
            </View>
          ) : selected ? (
            <View style={styles.chevronWrap}>
              <Ionicons name="checkmark-circle" size={20} color={theme.colors.primaryDark} />
            </View>
          ) : null}
        </View>
      </Pressable>
    );
  },
);

export function DetailRow({
  icon,
  label,
  value,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string | null;
}) {
  if (!value) return null;
  return (
    <View style={styles.detailRow}>
      {icon ? (
        <View style={styles.detailIconWrap}>
          <Ionicons name={icon} size={16} color={theme.colors.primary} />
        </View>
      ) : null}
      <View style={styles.detailText}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{value}</Text>
      </View>
    </View>
  );
}

export function SectionTitle({ children }: { children: string }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

const styles = StyleSheet.create({
  card: {
    ...glassStyle,
    borderRadius: theme.radius.card,
    padding: theme.spacing.card,
    marginBottom: 12,
    ...cardShadow,
  },
  cardSuccess: {
    backgroundColor: theme.colors.successBg,
    borderColor: theme.colors.successBorder,
  },
  cardSelected: {
    borderColor: theme.colors.primaryDark,
    borderWidth: 2,
    backgroundColor: theme.colors.infoBg,
  },
  pressed: {
    opacity: 0.92,
    transform: [{ scale: 0.985 }],
  },
  listCard: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 12,
    ...cardShadow,
  },
  listCardFixed: {
    alignItems: 'center',
    height: LIST_CARD_HEIGHT,
  },
  listCardComfortable: {
    alignItems: 'flex-start',
    minHeight: LIST_CARD_HEIGHT,
    paddingVertical: 18,
  },
  listCardSelected: {
    borderColor: theme.colors.primaryDark,
    borderWidth: 2,
    backgroundColor: theme.colors.infoBg,
  },
  listIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginRight: 12,
  },
  listIconWrapComfortable: {
    marginTop: 2,
  },
  listBody: {
    flex: 1,
    minWidth: 0,
  },
  listBodyFixed: {
    height: 84,
    justifyContent: 'space-between',
  },
  listBodyComfortable: {
    minHeight: 72,
    gap: 6,
    paddingVertical: 2,
    justifyContent: 'center',
  },
  listTitleText: {
    fontFamily: fonts.semiBold,
    color: theme.colors.text,
  },
  listTitleFixed: {
    fontSize: 14,
    lineHeight: 20,
    height: 40,
  },
  listTitleComfortable: {
    fontSize: 15,
    lineHeight: 22,
  },
  listSubtitleText: {
    fontFamily: fonts.regular,
    color: theme.colors.textSecondary,
  },
  listSubtitleFixed: {
    fontSize: 13,
    lineHeight: 18,
    height: 18,
  },
  listSubtitleComfortable: {
    fontSize: 14,
    lineHeight: 21,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 18,
  },
  listMeta: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 12,
    color: theme.colors.textMuted,
    lineHeight: 16,
  },
  listTrailing: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    flexShrink: 0,
    marginLeft: 8,
  },
  listTrailingFixed: {
    width: 72,
    height: 84,
  },
  listTrailingComfortable: {
    width: 80,
    minHeight: 72,
    paddingTop: 2,
  },
  badge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    maxWidth: 80,
  },
  badgePlaceholder: {
    height: 24,
  },
  badgeText: {
    fontFamily: fonts.semiBold,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.35,
    textAlign: 'center',
  },
  chevronWrap: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  detailIconWrap: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.infoBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  detailText: {
    flex: 1,
    minWidth: 0,
  },
  detailLabel: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  detailValue: {
    fontFamily: fonts.regular,
    fontSize: 15,
    color: theme.colors.text,
    lineHeight: 22,
  },
  sectionTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
    marginTop: 4,
  },
});
