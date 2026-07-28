import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { FF, fonts } from '@/theme/brand';

export function AuthAppHeader() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { paddingTop: insets.top + 8 }]}>
      <View style={styles.mark}>
        <Ionicons name="construct-outline" size={19} color="#fff" />
      </View>
      <View>
        <Text style={styles.brand}>MC LABOR SOURCES</Text>
        <Text style={styles.subtitle}>Worker Portal</Text>
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
  mark: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: FF.primary,
  },
  brand: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 0.7,
    color: FF.text,
  },
  subtitle: {
    marginTop: 2,
    fontFamily: fonts.regular,
    fontSize: 11,
    color: FF.textSecondary,
  },
});
