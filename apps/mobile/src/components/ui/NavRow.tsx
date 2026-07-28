import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { accents, cardShadow, FF, fonts, type AccentKey } from '@/theme/brand';

type NavRowProps = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent?: AccentKey;
  onPress?: () => void;
};

/** Navigation row — matches MenuTile styling for profile shortcuts and links */
export function NavRow({ label, icon, accent = 'blue', onPress }: NavRowProps) {
  const tone = accents[accent];

  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        { borderColor: pressed ? tone.border : FF.border },
        pressed && styles.pressed,
        cardShadow,
      ]}
      onPress={onPress}
    >
      <View style={[styles.iconWrap, { backgroundColor: tone.bg, borderColor: tone.border }]}>
        <Ionicons name={icon} size={20} color={tone.color} />
      </View>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.chevronWrap, { backgroundColor: tone.bg }]}>
        <Ionicons name="chevron-forward" size={14} color={tone.color} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: FF.card,
    borderRadius: 16,
    borderWidth: 1,
    padding: 13,
    marginBottom: 9,
  },
  pressed: {
    opacity: 0.96,
    transform: [{ scale: 0.985 }],
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
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
