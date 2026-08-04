import { Image, StyleSheet } from 'react-native';

export function BrandHeaderLogo() {
  return (
    <Image
      source={require('../../../assets/logo.png')}
      style={styles.logo}
      resizeMode="contain"
      accessibilityLabel="MC Labor Sources"
    />
  );
}

const styles = StyleSheet.create({
  logo: {
    width: 146,
    height: 28,
  },
});
