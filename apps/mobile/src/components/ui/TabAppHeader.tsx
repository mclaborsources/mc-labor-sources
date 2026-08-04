import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabHeaderProps } from '@react-navigation/bottom-tabs';
import { FF, fonts } from '@/theme/brand';
import { BrandHeaderLogo } from './BrandHeaderLogo';

export function TabAppHeader({ options }: BottomTabHeaderProps) {
  const insets = useSafeAreaInsets();
  const title = typeof options.title === 'string' ? options.title : 'MC Labor';

  return (
    <View style={[styles.bar, { paddingTop: insets.top + 8 }]}>
      <BrandHeaderLogo />
      <View style={styles.copy}>
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
  copy: {
    flex: 1,
  },
  pageTitle: {
    marginTop: 1,
    fontFamily: fonts.semiBold,
    fontSize: 16,
    color: FF.text,
  },
});
