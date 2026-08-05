import { type ReactElement, type ReactNode } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  View,
  type ImageSourcePropType,
  type ListRenderItem,
} from 'react-native';
import { EmptyState, ErrorBanner, ImageBanner, Screen, StackAppHeader } from '@/components/ui';
import { FF, theme } from '@/theme/brand';
import { screenLayout } from './Screen';

type StackListScreenProps<T> = {
  loading: boolean;
  loadingLabel?: string;
  refreshing: boolean;
  onRefresh: () => void | Promise<void>;
  error?: string;
  items: T[];
  keyExtractor: (item: T) => string;
  renderItem: ListRenderItem<T>;
  banner: {
    source: ImageSourcePropType;
    title: string;
    subtitle?: string;
  };
  emptyMessage: string;
  emptyIcon?: string;
  headerExtra?: ReactNode;
  fallbackHref?: string;
  hideBack?: boolean;
};

export function StackListScreen<T>({
  loading,
  loadingLabel = 'Loading…',
  refreshing,
  onRefresh,
  error,
  items,
  keyExtractor,
  renderItem,
  banner,
  emptyMessage,
  emptyIcon,
  headerExtra,
  fallbackHref,
  hideBack = false,
}: StackListScreenProps<T>) {
  if (loading) {
    return (
      <Screen padded={false}>
        <StackAppHeader fallbackHref={fallbackHref} hideBack={hideBack} />
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={FF.primary} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <StackAppHeader fallbackHref={fallbackHref} hideBack={hideBack} />
      <FlatList
        style={styles.listFlex}
        data={items}
        keyExtractor={keyExtractor}
        ListHeaderComponent={
          <>
            <ImageBanner variant="full" source={banner.source} title={banner.title} subtitle={banner.subtitle} />
            <View style={screenLayout.listSpacer} />
            {error || headerExtra ? (
              <View style={screenLayout.itemWrap}>
                {error ? <ErrorBanner message={error} /> : null}
                {headerExtra}
              </View>
            ) : null}
          </>
        }
        contentContainerStyle={screenLayout.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />
        }
        ListEmptyComponent={
          <View style={screenLayout.itemWrap}>
            <EmptyState message={emptyMessage} icon={emptyIcon} />
          </View>
        }
        renderItem={renderItem}
      />
    </Screen>
  );
}

/** Wrap each list row for consistent horizontal inset */
export function StackListItem({ children }: { children: ReactNode }): ReactElement {
  return <View style={screenLayout.itemWrap}>{children}</View>;
}

const styles = StyleSheet.create({
  listFlex: {
    flex: 1,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 80,
  },
});
