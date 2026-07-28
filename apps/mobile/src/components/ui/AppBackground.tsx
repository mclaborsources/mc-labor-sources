import { type ReactNode } from 'react';
import { View, StyleSheet, type ViewStyle } from 'react-native';
import { FF } from '@/theme/brand';

type AppBackgroundProps = {
  children?: ReactNode;
  style?: ViewStyle;
  photo?: boolean;
};

/** Clean application canvas shared by every worker and supervisor screen. */
export function AppBackground({ children, style }: AppBackgroundProps) {
  return (
    <View style={[styles.root, style]}>
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: '100%',
    backgroundColor: '#F6F8FC',
  },
  content: {
    flex: 1,
  },
});
