import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabHeaderProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { FF, fonts } from '@/theme/brand';

export function TabAppHeader({ options }: BottomTabHeaderProps) {
  const insets = useSafeAreaInsets();
  const title = typeof options.title === 'string' ? options.title : 'MC Labor';

  return (
    <View style={[styles.bar, { paddingTop: insets.top + 8 }]}>
      <View style={styles.brandMark}>
        <Ionicons name="construct-outline" size={19} color="#fff" />
      </View>
      <View style={styles.copy}>
        <Text style={styles.brand}>MC LABOR SOURCES</Text>
        <Text style={styles.pageTitle}>{title}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 18,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: FF.borderInput,
    backgroundColor: FF.card,
  },
  brandMark: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: FF.primary,
  },
  copy: {
    flex: 1,
  },
  brand: {
    fontFamily: fonts.bold,
    fontSize: 9,
    letterSpacing: 0.8,
    color: FF.primary,
  },
  pageTitle: {
    marginTop: 1,
    fontFamily: fonts.semiBold,
    fontSize: 16,
    color: FF.text,
  },
});
