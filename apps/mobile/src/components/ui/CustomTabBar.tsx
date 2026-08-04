import { View, Text, Pressable, Platform, StyleSheet } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FF, fonts, tabBarShadow } from '@/theme/brand';

function tabLabel(
  label: BottomTabBarProps['descriptors'][string]['options']['tabBarLabel'],
  title: string | undefined,
  routeName: string,
): string {
  if (typeof label === 'string') return label;
  if (typeof title === 'string' && title.length > 0) return title;
  const names: Record<string, string> = {
    index: 'Home',
    assignments: 'Assignments',
    clock: 'Clock',
    profile: 'Profile',
  };
  return names[routeName] ?? routeName;
}

type CustomTabBarProps = BottomTabBarProps & {
  hiddenRoutes?: string[];
};

export function CustomTabBar({ state, descriptors, navigation, hiddenRoutes = [] }: CustomTabBarProps) {
  const insets = useSafeAreaInsets();
  const paddingBottom = Platform.OS === 'web' ? 10 : Math.max(insets.bottom, 8);

  return (
    <View style={[styles.bar, { paddingBottom }]}>
      {state.routes.map((route, index) => {
        if (hiddenRoutes.includes(route.name)) return null;
        const { options } = descriptors[route.key];
        const isFocused = state.index === index;
        const color = isFocused ? FF.primary : FF.textMuted;
        const label = tabLabel(options.tabBarLabel, options.title, route.name);

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        };

        return (
          <Pressable
            key={route.key}
            accessibilityRole="button"
            accessibilityState={isFocused ? { selected: true } : {}}
            onPress={onPress}
            style={({ pressed }) => [
              styles.tab,
              isFocused && styles.tabActive,
              pressed && styles.tabPressed,
            ]}
          >
            {options.tabBarIcon?.({ focused: isFocused, color, size: 22 })}
            <Text style={[styles.label, { color }]} numberOfLines={1}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: FF.card,
    borderWidth: 1,
    borderColor: FF.borderInput,
    borderRadius: 22,
    marginHorizontal: 10,
    marginBottom: 8,
    paddingTop: 6,
    paddingHorizontal: 6,
    ...tabBarShadow,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    gap: 4,
    minHeight: 50,
    borderRadius: 13,
    marginHorizontal: 1,
  },
  tabActive: {
    backgroundColor: '#EAF2FF',
  },
  tabPressed: {
    opacity: 0.85,
  },
  label: {
    fontFamily: Platform.select({ web: 'Montserrat_600SemiBold, system-ui, sans-serif', default: fonts.semiBold }),
    fontSize: 9,
    lineHeight: 14,
    textAlign: 'center',
  },
});
