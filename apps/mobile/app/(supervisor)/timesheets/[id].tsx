import { useEffect, useRef, useState } from 'react';
import {
  Text,
  View,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  TextInput,
  Image,
  Pressable,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Card,
  DetailRow,
  ErrorBanner,
  ImageBanner,
  ModalSheet,
  Screen,
  SectionTitle,
  StackAppHeader,
  SummaryBar,
  screenLayout,
  SuccessBanner,
} from '@/components/ui';
import { SignaturePad, type SignaturePadRef } from '@/components/SignaturePad';
import { FF, fonts, statusColors } from '@/theme/brand';
import { IMAGERY } from '@/constants/imagery';
import { mobileApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

export default function SupervisorTimesheetDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [item, setItem] = useState<Awaited<ReturnType<typeof mobileApi.getSupervisorTimesheet>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [signing, setSigning] = useState(false);
  const [showSignPad, setShowSignPad] = useState(false);
  const [foremanName, setForemanName] = useState('');
  const [foremanEmail, setForemanEmail] = useState('');
  const [signatureDataUrl, setSignatureDataUrl] = useState('');
  const [success, setSuccess] = useState('');
  const signaturePadRef = useRef<SignaturePadRef>(null);
  const pendingSubmitRef = useRef(false);

  useEffect(() => {
    if (!id) return;
    mobileApi
      .getSupervisorTimesheet(id)
      .then((ts) => {
        setItem(ts);
        setForemanName(user?.name ?? '');
        setForemanEmail(user?.email ?? '');
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [id, user?.email, user?.name]);

  const canSign = item && (item.status === 'DRAFT' || item.status === 'SUBMITTED') && !item.signature;

  function openSignModal() {
    setError('');
    setSignatureDataUrl('');
    pendingSubmitRef.current = false;
    setShowSignPad(true);
  }

  function closeSignModal() {
    if (signing) return;
    pendingSubmitRef.current = false;
    setShowSignPad(false);
    setSignatureDataUrl('');
  }

  function clearSignature() {
    signaturePadRef.current?.clear();
    setSignatureDataUrl('');
    setError('');
  }

  async function submitSign(dataUrl: string) {
    if (!item || !foremanName.trim()) {
      setError('Enter foreman name and sign in the box.');
      pendingSubmitRef.current = false;
      return;
    }
    setSigning(true);
    setError('');
    try {
      const updated = await mobileApi.signSupervisorTimesheet(item.id, {
        foremanName: foremanName.trim(),
        foremanEmail: foremanEmail.trim() || undefined,
        signatureDataUrl: dataUrl,
      });
      setItem(updated);
      setShowSignPad(false);
      setSignatureDataUrl('');
      setSuccess('Timesheet signed successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign timesheet');
    } finally {
      setSigning(false);
      pendingSubmitRef.current = false;
    }
  }

  function handleSignPress() {
    if (!item) return;
    if (!foremanName.trim()) {
      setError('Enter foreman name before signing.');
      return;
    }
    if (signatureDataUrl) {
      void submitSign(signatureDataUrl);
      return;
    }
    pendingSubmitRef.current = true;
    signaturePadRef.current?.capture();
  }

  function handleSignatureCaptured(dataUrl: string) {
    setSignatureDataUrl(dataUrl);
    setError('');
    if (pendingSubmitRef.current) {
      void submitSign(dataUrl);
    }
  }

  if (loading) {
    return (
      <Screen padded={false}>
        <StackAppHeader />
        <ImageBanner variant="full" source={IMAGERY.heroTimesheets} title="Timesheet" subtitle="Loading…" />
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={FF.primary} />
        </View>
      </Screen>
    );
  }

  if (error && !item) {
    return (
      <Screen padded={false}>
        <StackAppHeader />
        <ImageBanner variant="full" source={IMAGERY.heroTimesheets} title="Timesheet" />
        <View style={screenLayout.body}>
          <ErrorBanner message={error} />
        </View>
      </Screen>
    );
  }

  if (!item) {
    return (
      <Screen padded={false}>
        <StackAppHeader />
        <ImageBanner variant="full" source={IMAGERY.heroTimesheets} title="Timesheet" />
        <View style={screenLayout.body}>
          <ErrorBanner message="Timesheet not found" />
        </View>
      </Screen>
    );
  }

  const badge = statusColors(item.status);
  const employeeName = item.employee
    ? `${item.employee.firstName} ${item.employee.lastName}`
    : 'Employee';
  const periodLabel =
    item.weekStartDate && item.weekEndDate
      ? `${item.weekStartDate} – ${item.weekEndDate}`
      : item.workDate ?? '—';

  return (
    <Screen padded={false}>
      <StackAppHeader />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={screenLayout.listContent}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!showSignPad}
      >
        <ImageBanner
          variant="full"
          source={IMAGERY.heroTimesheets}
          title={employeeName}
          subtitle={`${item.totalHours}h · ${item.jobSite?.name ?? 'Job site'}`}
        />

        <View style={screenLayout.body}>
          {success ? <SuccessBanner message={success} /> : null}
          {error && !showSignPad ? <ErrorBanner message={error} /> : null}

          <SummaryBar status={item.status} statusColors={badge} meta={periodLabel} />

          <SectionTitle>Summary</SectionTitle>
          <Card style={styles.detailsCard}>
            <DetailRow icon="business-outline" label="Job site" value={item.jobSite?.name} />
            <DetailRow icon="time-outline" label="Total hours" value={`${item.totalHours}h`} />
            <DetailRow icon="calendar-outline" label="Period" value={periodLabel} />
          </Card>

          {item.entries && item.entries.length > 0 && (
            <>
              <SectionTitle>Time entries</SectionTitle>
              <Card>
                {item.entries.map((entry, index) => (
                  <View key={entry.id} style={[styles.entryRow, index > 0 && styles.entryBorder]}>
                    <Text style={styles.entryDate}>{entry.workDate}</Text>
                    <Text style={styles.entryTime}>
                      {entry.startTime} – {entry.endTime}
                    </Text>
                    <Text style={styles.entryHours}>{entry.hours}h</Text>
                  </View>
                ))}
              </Card>
            </>
          )}

          {item.signature?.signatureImageUrl ? (
            <>
              <SectionTitle>Signature</SectionTitle>
              <Card>
                <DetailRow icon="person-outline" label="Foreman" value={item.signature.foremanName} />
                <Image
                  source={{ uri: item.signature.signatureImageUrl }}
                  style={styles.signatureImage}
                  resizeMode="contain"
                />
              </Card>
            </>
          ) : null}

          {canSign ? (
            <Pressable style={styles.signBtn} onPress={openSignModal}>
              <Text style={styles.signBtnText}>Sign timesheet</Text>
            </Pressable>
          ) : null}

          {success ? (
            <Pressable style={styles.backBtn} onPress={() => router.back()}>
              <Text style={styles.backBtnText}>Back to list</Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>

      <ModalSheet
        visible={showSignPad}
        title="Foreman sign-off"
        onClose={closeSignModal}
        scrollable={false}
        dismissOnBackdrop={false}
        footer={
          <View style={styles.signActions}>
            <Pressable style={styles.footerBtnSecondary} onPress={clearSignature} disabled={signing}>
              <Text style={styles.footerBtnSecondaryText}>Clear</Text>
            </Pressable>
            <Pressable style={styles.footerBtnSecondary} onPress={closeSignModal} disabled={signing}>
              <Text style={styles.footerBtnSecondaryText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.footerBtnPrimary, signing && styles.submitDisabled]}
              onPress={handleSignPress}
              disabled={signing}
            >
              {signing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitText}>Sign & submit</Text>
              )}
            </Pressable>
          </View>
        }
      >
        {error ? <ErrorBanner message={error} /> : null}
        <Text style={styles.fieldLabel}>Foreman name</Text>
        <TextInput
          style={styles.input}
          value={foremanName}
          onChangeText={setForemanName}
          placeholder="Your name"
          placeholderTextColor={FF.textMuted}
        />
        <Text style={styles.fieldLabel}>Foreman email</Text>
        <TextInput
          style={styles.input}
          value={foremanEmail}
          onChangeText={setForemanEmail}
          placeholder="Email (optional)"
          autoCapitalize="none"
          keyboardType="email-address"
          placeholderTextColor={FF.textMuted}
        />
        <Text style={styles.signHint}>Draw your signature below, then tap Sign & submit.</Text>
        <SignaturePad
          key={showSignPad ? 'sign-open' : 'sign-closed'}
          ref={signaturePadRef}
          showActions={false}
          height={240}
          onSignature={handleSignatureCaptured}
          onError={(msg) => {
            pendingSubmitRef.current = false;
            setError(msg);
          }}
        />
        {signatureDataUrl ? (
          <Text style={styles.captured}>Signature ready.</Text>
        ) : null}
      </ModalSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  detailsCard: { paddingVertical: 4, marginBottom: 8 },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    gap: 8,
  },
  entryBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: FF.border,
  },
  entryDate: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: 14,
    color: FF.text,
  },
  entryTime: {
    flex: 1.2,
    fontFamily: fonts.regular,
    fontSize: 13,
    color: FF.textSecondary,
  },
  entryHours: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: FF.primary,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 80,
  },
  signatureImage: {
    width: '100%',
    height: 120,
    marginTop: 8,
    borderRadius: 8,
    backgroundColor: FF.bg,
  },
  signBtn: {
    marginTop: 16,
    backgroundColor: FF.primary,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  signBtnText: {
    fontFamily: fonts.semiBold,
    fontSize: 15,
    color: '#fff',
  },
  fieldLabel: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: FF.textSecondary,
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: FF.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: fonts.medium,
    fontSize: 14,
    color: FF.text,
    backgroundColor: '#fff',
    marginBottom: 8,
  },
  signHint: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: FF.textMuted,
    marginBottom: 8,
    lineHeight: 16,
  },
  captured: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: '#15803d',
    marginTop: 8,
  },
  signActions: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
  },
  footerBtnSecondary: {
    minWidth: 72,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: FF.border,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerBtnSecondaryText: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: FF.textSecondary,
  },
  footerBtnPrimary: {
    flex: 1,
    minHeight: 44,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: FF.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitDisabled: {
    opacity: 0.7,
  },
  submitText: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: '#fff',
  },
  backBtn: {
    marginTop: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  backBtnText: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: FF.primary,
  },
});
