import { useEffect, useState } from 'react';
import { Text, View, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import {
  Button,
  Card,
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
  const snapshot = item.snapshot;
  const value = (key: string) => {
    const raw = snapshot[key];
    if (raw === null || raw === undefined || raw === '') return '—';
    if (key === 'payRate') return `$${Number(raw).toFixed(2)}`;
    return String(raw);
  };

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

          <SectionTitle>Employee Job Order</SectionTitle>
          <Card style={styles.documentCard}>
            <View style={styles.companyHeader}>
              <Text style={styles.companyName}>Industrial Power Group, Inc.</Text>
              <Text style={styles.companyAddress}>4 Arlington Road, Needham, MA 02494 · (800) 439-3360</Text>
            </View>
            {[
              ['Job Order #', 'jobOrderNumber'], ['Employee Name', 'employeeName'],
              ['Employee Address', 'employeeAddress'], ['Email', 'employeeEmail'],
              ['Rate of hourly pay (USD)', 'payRate'], ['Home Phone', 'homePhone'],
              ['Mobile Phone', 'mobilePhone'],
            ].map(([label, key]) => <OrderRow key={key} label={label} value={value(key)} />)}

            <View style={styles.divider} />
            {[
              ['Customer Name', 'customerName'], ['Customer Mailing Address', 'customerMailingAddress'],
              ['Job Name', 'jobName'], ['Site Address', 'siteAddress'],
              ["Foreman's Name", 'foremanName'], ["Foreman's Phone", 'foremanPhone'],
              ["Foreman's Email Address", 'foremanEmail'], ['Start Time', 'startTime'],
              ['Estimated End Date', 'estimatedEndDate'],
            ].map(([label, key]) => <OrderRow key={key} label={label} value={value(key)} />)}
            <OrderRow label="Worksite on strike or lockout" value={value('strikeOrLockout') === 'true' ? 'Yes' : 'No'} />
            <OrderRow label="Anticipated overtime" value={value('anticipatedOvertime') === 'true' ? 'Yes' : 'No'} />

            <Text style={styles.protective}>{value('protectiveEquipment')}</Text>
            <Text style={styles.sectionLabel}>Job Instructions</Text>
            <Text style={styles.instructions}>{value('jobInstructions')}</Text>
            <Text style={styles.scopeNotice}>{value('scopeChangeNotice')}</Text>

            {[
              ['Special training required', value('specialTraining') === 'true' ? 'Yes' : 'No'],
              ['Job position', value('jobPosition')], ['Description and nature of assignment', value('assignmentNature')],
              ['Start date', value('startDate')], ['Pay date', value('payDate')],
              ['Special site data', value('specialSiteData')],
              ['Transportation and meals', value('transportationAndMeals')],
              ['Method of delivery', value('deliveryMethod')],
              ["Workers' Comp Info", value('workersCompCompany')],
              ['Address', value('workersCompAddress')],
            ].map(([label, rowValue]) => <OrderRow key={label} label={label} value={rowValue} />)}

            <Text style={styles.footerNote}>{value('footerNote')}</Text>
          </Card>

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

function OrderRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.orderRow}>
      <Text style={styles.orderLabel}>{label}:</Text>
      <Text style={styles.orderValue}>{value}</Text>
    </View>
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
  documentCard: {
    padding: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  companyHeader: {
    alignItems: 'center',
    padding: 10,
    marginBottom: 12,
    backgroundColor: '#E5E7EB',
    borderWidth: 1,
    borderColor: '#111827',
  },
  companyName: { fontFamily: fonts.bold, fontSize: 14, color: '#111827' },
  companyAddress: { fontFamily: fonts.medium, fontSize: 10, color: '#111827', textAlign: 'center' },
  orderRow: { flexDirection: 'row', paddingVertical: 3 },
  orderLabel: { width: 142, fontFamily: fonts.bold, fontSize: 11, color: '#111827' },
  orderValue: { flex: 1, fontFamily: fonts.medium, fontSize: 11, color: '#111827' },
  divider: { height: 2, backgroundColor: '#111827', marginVertical: 10 },
  protective: { marginTop: 12, padding: 8, borderWidth: 1, borderColor: '#111827', fontFamily: fonts.bold, fontSize: 11, color: '#DC2626' },
  sectionLabel: { marginTop: 12, padding: 5, backgroundColor: '#D1D5DB', fontFamily: fonts.bold, fontSize: 11, color: '#111827' },
  instructions: { padding: 5, backgroundColor: '#E5E7EB', fontFamily: fonts.medium, fontSize: 11, color: '#111827' },
  scopeNotice: { padding: 5, backgroundColor: '#D1D5DB', fontFamily: fonts.bold, fontSize: 10, color: '#DC2626', marginBottom: 10 },
  footerNote: { marginTop: 14, fontFamily: fonts.regular, fontSize: 9, lineHeight: 13, color: '#334155' },
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
