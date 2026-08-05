import { useEffect, useState } from 'react';
import { Text, View, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import {
  Button,
  Card,
  DetailRow,
  ErrorBanner,
  ImageBanner,
  Screen,
  SectionTitle,
  StackAppHeader,
  SummaryBar,
  screenLayout,
} from '@/components/ui';
import { FF, fonts, statusColors } from '@/theme/brand';
import { IMAGERY } from '@/constants/imagery';
import { mobileApi } from '@/lib/api';

export default function JobOrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [item, setItem] = useState<Awaited<ReturnType<typeof mobileApi.getJobOrder>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [ackLoading, setAckLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    mobileApi
      .getJobOrder(id)
      .then(setItem)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [id]);

  const onAcknowledge = async () => {
    if (!id) return;
    setAckLoading(true);
    try {
      const updated = await mobileApi.acknowledgeJobOrder(id);
      setItem(updated);
    } finally {
      setAckLoading(false);
    }
  };

  if (loading) {
    return (
      <Screen padded={false}>
        <StackAppHeader fallbackHref="/job-orders" />
        <ImageBanner variant="full" source={IMAGERY.heroWorkforce} title="Job Order" subtitle="Loading details…" />
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={FF.primary} />
        </View>
      </Screen>
    );
  }

  if (error || !item) {
    return (
      <Screen padded={false}>
        <StackAppHeader fallbackHref="/job-orders" />
        <ImageBanner variant="full" source={IMAGERY.heroWorkforce} title="Job Order" />
        <View style={screenLayout.body}>
          <ErrorBanner message={error || 'Job order not found'} />
        </View>
      </Screen>
    );
  }

  const canAck = item.status === 'SENT';
  const badge = statusColors(item.status);

  return (
    <Screen padded={false}>
      <StackAppHeader fallbackHref="/job-orders" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={screenLayout.listContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <ImageBanner
          variant="full"
          source={IMAGERY.heroWorkforce}
          title={item.title}
          subtitle={item.orderNumber}
        />

        <View style={screenLayout.body}>
          <SummaryBar status={item.status} statusColors={badge} meta={item.jobSite?.name ?? 'Job site'} />

          <SectionTitle>Order details</SectionTitle>
          <Card style={styles.detailsCard}>
            <DetailRow icon="business-outline" label="Job site" value={item.jobSite?.name} />
            <DetailRow
              icon="calendar-outline"
              label="Start"
              value={[item.startDate, item.startTime].filter(Boolean).join(' · ')}
            />
          </Card>

          {(item.description || item.instructions || item.safetyNotes) && (
            <>
              <SectionTitle>Instructions</SectionTitle>
              <Card>
                {item.description ? <Text style={styles.bodyText}>{item.description}</Text> : null}
                {item.instructions ? (
                  <Text style={[styles.bodyText, item.description && styles.bodySpaced]}>{item.instructions}</Text>
                ) : null}
                {item.safetyNotes ? (
                  <Text style={[styles.safety, (item.description || item.instructions) && styles.bodySpaced]}>
                    Safety: {item.safetyNotes}
                  </Text>
                ) : null}
              </Card>
            </>
          )}

          {canAck && (
            <Button
              label={ackLoading ? 'Saving…' : 'Acknowledge'}
              onPress={onAcknowledge}
              loading={ackLoading}
              icon="checkmark-circle-outline"
              style={styles.action}
            />
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  detailsCard: {
    paddingVertical: 4,
    marginBottom: 8,
  },
  bodyText: {
    fontFamily: fonts.regular,
    fontSize: 15,
    color: FF.textSecondary,
    lineHeight: 23,
  },
  bodySpaced: {
    marginTop: 14,
  },
  safety: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: '#D97706',
    lineHeight: 23,
  },
  action: {
    marginTop: 16,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 80,
  },
});
