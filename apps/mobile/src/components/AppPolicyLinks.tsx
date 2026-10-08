import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { BRAND_PRIVACY_URL, BRAND_SUPPORT_URL } from '@mc-labor/shared';
import { fonts, FF } from '@/theme/brand';

export function AppPolicyLinks() {
  return (
    <View style={styles.links}>
      {[
        { label: 'Support', url: BRAND_SUPPORT_URL },
        { label: 'Privacy Policy', url: BRAND_PRIVACY_URL },
      ].map(({ label, url }) => (
        <Pressable key={url} accessibilityRole="link" onPress={() => void Linking.openURL(url)} style={styles.link}>
          <Text style={styles.label}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  links: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  link: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 10 },
  label: { fontFamily: fonts.medium, fontSize: 12, color: FF.primary, textDecorationLine: 'underline' },
});
