import { useEffect, useState } from 'react';
import { Alert, Text, View, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Button,
  Card,
  DetailRow,
  ErrorBanner,
  SuccessBanner,
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

function formatAssignmentDate(value: string) {
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatShiftTime(start: string | null, end: string | null) {
  if (!start && !end) return null;
  if (start && end) return `${start} – ${end}`;
  return start ?? end;
}

export default function AssignmentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [item, setItem] = useState<Awaited<ReturnType<typeof mobileApi.getAssignment>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [responding, setResponding] = useState<'ACCEPTED' | 'DECLINED' | null>(null);

  useEffect(() => {
    if (!id) return;
    mobileApi
      .getAssignment(id)
      .then(setItem)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [id]);

  const respond = async (response: 'ACCEPTED' | 'DECLINED') => {
    if (!id || responding) return;
    setError('');
    setSuccess('');
    setResponding(response);
    try {
      const updated = await mobileApi.respondToAssignment(id, response);
      setItem(updated);
      setSuccess(response === 'ACCEPTED' ? 'Assignment accepted.' : 'Assignment declined.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update assignment');
    } finally {
      setResponding(null);
    }
  };

  const confirmDecline = () => {
    Alert.alert(
      'Decline assignment?',
      'You will not be able to change this response in the mobile app.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Decline', style: 'destructive', onPress: () => void respond('DECLINED') },
      ],
    );
  };

  if (loading) {
    return (
      <Screen padded={false}>
        <StackAppHeader />
        <ImageBanner variant="full" source={IMAGERY.heroSite} title="Assignment" subtitle="Loading details…" />
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={FF.primary} />
        </View>
      </Screen>
    );
  }

  if (error || !item) {
    return (
      <Screen padded={false}>
        <StackAppHeader />
        <ImageBanner variant="full" source={IMAGERY.heroSite} title="Assignment" />
        <View style={screenLayout.body}>
          <ErrorBanner message={error || 'Assignment not found'} />
        </View>
      </Screen>
    );
  }

  const badge = statusColors(item.status);
  const shift = formatShiftTime(item.startTime, item.endTime);
  const siteName = item.jobSite?.name ?? 'Job Site';

  return (
    <Screen padded={false}>
      <StackAppHeader />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={screenLayout.listContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <ImageBanner
          variant="full"
          source={IMAGERY.heroSite}
          title={siteName}
          subtitle={item.customer?.companyName}
        />

        <View style={screenLayout.body}>
          <SummaryBar status={item.status} statusColors={badge} meta={formatAssignmentDate(item.assignedDate)} />
          {error ? <ErrorBanner message={error} /> : null}
          {success ? <SuccessBanner message={success} /> : null}

          <SectionTitle>Details</SectionTitle>
          <Card style={styles.detailsCard}>
            <DetailRow icon="business-outline" label="Customer" value={item.customer?.companyName} />
            <DetailRow icon="location-outline" label="Address" value={item.jobSite?.address} />
            <DetailRow icon="calendar-outline" label="Date" value={formatAssignmentDate(item.assignedDate)} />
            {shift ? <DetailRow icon="time-outline" label="Shift" value={shift} /> : null}
            {item.notes ? <DetailRow icon="document-text-outline" label="Notes" value={item.notes} /> : null}
          </Card>

          {item.status === 'PENDING' ? (
            <View style={styles.responseActions}>
              <Button
                label="Accept Assignment"
                onPress={() => void respond('ACCEPTED')}
                loading={responding === 'ACCEPTED'}
                disabled={responding !== null}
                icon="checkmark-circle-outline"
              />
              <Button
                label="Decline Assignment"
                onPress={confirmDecline}
                loading={responding === 'DECLINED'}
                disabled={responding !== null}
                variant="ghostDanger"
                icon="close-circle-outline"
              />
            </View>
          ) : null}

          {['ACCEPTED', 'ACTIVE'].includes(item.status) ? (
            <Button
              label="Go to Clock In / Out"
              onPress={() => router.push('/(tabs)/clock')}
              icon="time-outline"
              style={styles.action}
            />
          ) : null}
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
  action: {
    marginTop: 16,
  },
  responseActions: {
    marginTop: 16,
    gap: 4,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 80,
  },
});
