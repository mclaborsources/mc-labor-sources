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
import { downloadTimesheetImage } from '@/lib/timesheet-download';

export default function SupervisorTimesheetDetailScreen() {
  const { id, sign, download } = useLocalSearchParams<{
    id: string;
    sign?: string;
    download?: string;
  }>();
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
  const [downloading, setDownloading] = useState(false);
  const [submittingToOffice, setSubmittingToOffice] = useState(false);
  const signaturePadRef = useRef<SignaturePadRef>(null);
  const exportRef = useRef<View>(null);
  const automaticDownloadStartedRef = useRef(false);
  const pendingSubmitRef = useRef(false);
  const timesheetListHref =
    user?.role === 'WORKER' ? '/my-timesheets' : '/(supervisor)/timesheets';

  useEffect(() => {
    if (!id) return;
    mobileApi
      .getSupervisorTimesheet(id)
      .then((ts) => {
        setItem(ts);
        setForemanName(
          user?.role === 'WORKER' ? ts.jobSite?.foremanName ?? '' : user?.name ?? '',
        );
        setForemanEmail(
          user?.role === 'WORKER' ? ts.jobSite?.foremanEmail ?? '' : user?.email ?? '',
        );
        if (
          (user?.role === 'WORKER' || user?.role === 'SUPERVISOR') &&
          sign === '1' &&
          (ts.status === 'DRAFT' || ts.status === 'SUBMITTED') &&
          !ts.signature
        ) {
          setShowSignPad(true);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [id, sign, user?.email, user?.name, user?.role]);

  const canSign =
    (user?.role === 'WORKER' || user?.role === 'SUPERVISOR') &&
    item &&
    (item.status === 'DRAFT' || item.status === 'SUBMITTED') &&
    !item.signature;

  function openSignModal() {
    if (user?.role !== 'WORKER' && user?.role !== 'SUPERVISOR') {
      setError('Only the foreman or assigned supervisor can sign this timesheet.');
      return;
    }
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
    if (user?.role !== 'WORKER' && user?.role !== 'SUPERVISOR') {
      setError('Only the foreman or assigned supervisor can sign this timesheet.');
      pendingSubmitRef.current = false;
      return;
    }
    if (!item || !foremanName.trim()) {
      setError('Enter the foreman name and sign in the box.');
      pendingSubmitRef.current = false;
      return;
    }
    setSigning(true);
    setError('');
    try {
      const result = await mobileApi.signSupervisorTimesheet(item.id, {
        foremanName: foremanName.trim(),
        foremanEmail: foremanEmail.trim() || undefined,
        signatureDataUrl: dataUrl,
      });
      setItem(result.timesheet);
      setShowSignPad(false);
      setSignatureDataUrl('');
      setSuccess('Signature saved. The timesheet was automatically submitted to the office.');
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
      setError('Enter the foreman name before signing.');
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

  async function downloadTimesheet() {
    if (!item || !exportRef.current) return;
    setDownloading(true);
    setError('');
    setSuccess('');
    try {
      await downloadTimesheetImage(
        exportRef,
        `timesheet-${item.weekStartDate ?? item.workDate ?? item.id}.png`,
      );
      setSuccess('Timesheet image downloaded.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not download the timesheet image');
    } finally {
      setDownloading(false);
    }
  }

  async function submitToOffice() {
    if (!item || submittingToOffice) return;
    setSubmittingToOffice(true);
    setError('');
    setSuccess('');
    try {
      if (item.signature) {
        await mobileApi.submitSignedTimesheets([item.id]);
      } else {
        await mobileApi.submitTimesheetWithoutSignature(item.id);
      }
      setItem(await mobileApi.getSupervisorTimesheet(item.id));
      setSuccess('Timesheet submitted to the office.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit the timesheet');
    } finally {
      setSubmittingToOffice(false);
    }
  }

  useEffect(() => {
    if (download !== '1' || !item?.signature || automaticDownloadStartedRef.current) return;
    automaticDownloadStartedRef.current = true;
    const timer = setTimeout(() => void downloadTimesheet(), 500);
    return () => clearTimeout(timer);
  }, [download, item]);

  if (loading) {
    return (
      <Screen padded={false}>
        <StackAppHeader fallbackHref={timesheetListHref} />
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
        <StackAppHeader fallbackHref={timesheetListHref} />
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
        <StackAppHeader fallbackHref={timesheetListHref} />
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
      <StackAppHeader fallbackHref={timesheetListHref} />
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

          <SectionTitle>Timesheet preview</SectionTitle>
          <View ref={exportRef} collapsable={false} style={styles.exportSheet}>
            <View style={styles.exportHeader}>
              <View style={styles.exportBrandRow}>
                <Image
                  source={require('../../../assets/logo.png')}
                  style={styles.exportLogo}
                  resizeMode="contain"
                />
                <Text style={styles.exportBrand}>MC Labor Sources</Text>
              </View>
            </View>
            <Text style={styles.exportTitle}>{item.signature ? 'SIGNED TIMESHEET' : 'TIMESHEET'}</Text>

            <View style={styles.exportGrid}>
              <ExportField label="Employee" value={employeeName} />
              <ExportField label="Company" value={item.companyName ?? 'MC Labor Sources'} />
              <ExportField label="Job site" value={item.jobSite?.name ?? 'Job site'} />
              <ExportField label="Period" value={periodLabel} />
              <ExportField label="Total hours" value={`${item.totalHours}h`} accent />
              <ExportField label="Status" value={item.status} />
            </View>

            <Text style={styles.exportSectionLabel}>TIME ENTRIES</Text>
            <View style={styles.exportTableHeader}>
              <Text style={styles.exportTableHeading}>Date</Text>
              <Text style={[styles.exportTableHeading, styles.exportRight]}>Hours</Text>
            </View>
            {enumerateDates(
              item.weekStartDate ?? item.workDate,
              item.weekEndDate ?? item.workDate,
            ).map((date) => {
              const entry = item.entries?.find((candidate) => candidate.workDate === date);
              return (
                <View key={`export-${date}`} style={styles.exportTableRow}>
                  <Text style={styles.exportTableText}>{date}</Text>
                  <Text style={[styles.exportTableText, styles.exportRight]}>{entry?.hours ?? 0}h</Text>
                </View>
              );
            })}

            {item.signature ? (
              <>
              <View style={styles.exportSignoffBlock}>
                <View style={styles.exportGrid}>
                  <ExportField label="Foreman" value={item.signature.foremanName} />
                  <ExportField
                    label="Signed"
                    value={
                      item.signature.signedAt
                        ? new Date(item.signature.signedAt).toLocaleString()
                        : 'Signed'
                    }
                  />
                </View>
              </View>
                {item.signature.signatureImageUrl ? (
                  <View style={styles.exportSignatureBlock}>
                    <Text style={styles.exportSignatureLabel}>SIGNATURE</Text>
                    <Image
                      source={{ uri: item.signature.signatureImageUrl }}
                      style={styles.exportSignatureImage}
                      resizeMode="contain"
                    />
                  </View>
                ) : null}
              </>
            ) : null}
            <Text style={styles.exportFooter}>Generated by MC Labor Sources</Text>
          </View>

          {user?.role === 'WORKER' && item.signature ? (
            <Pressable
              style={[styles.downloadBtn, downloading && styles.submitDisabled]}
              onPress={downloadTimesheet}
              disabled={downloading}
            >
              {downloading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.downloadBtnText}>Download Timesheet</Text>
              )}
            </Pressable>
          ) : null}

          <SectionTitle>Summary</SectionTitle>
          <Card style={styles.detailsCard}>
            {item.isStandaloneManual ? (
              <DetailRow icon="document-text-outline" label="Type" value="Manual timesheet" />
            ) : null}
            {item.manualCompanyName ? (
              <DetailRow icon="business-outline" label="Company" value={item.manualCompanyName} />
            ) : null}
            <DetailRow icon="business-outline" label="Job site" value={item.jobSite?.name} />
            {item.manualJobAddress ? (
              <DetailRow icon="location-outline" label="Job address" value={item.manualJobAddress} />
            ) : null}
            <DetailRow icon="time-outline" label="Total hours" value={`${item.totalHours}h`} />
            <DetailRow icon="calendar-outline" label="Period" value={periodLabel} />
            {item.notes ? <DetailRow icon="reader-outline" label="Employee note" value={item.notes} /> : null}
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
                <DetailRow icon="person-outline" label="Foreman's Name" value={item.signature.foremanName} />
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

          {user?.role === 'WORKER' &&
          (item.status === 'DRAFT' || item.status === 'SIGNED' || Boolean(item.signature)) ? (
            <Pressable
              style={[
                styles.officeSubmitBtn,
                (submittingToOffice || ['SUBMITTED', 'SENT', 'APPROVED'].includes(item.status)) &&
                  styles.submitDisabled,
              ]}
              onPress={() => void submitToOffice()}
              disabled={
                submittingToOffice || ['SUBMITTED', 'SENT', 'APPROVED'].includes(item.status)
              }
            >
              {submittingToOffice ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.officeSubmitBtnText}>
                  {['SUBMITTED', 'SENT', 'APPROVED'].includes(item.status)
                    ? 'Already Submitted to Office'
                    : item.signature
                      ? 'Submit Signed Timesheet to Office'
                      : 'Submit to Office Without Signature'}
                </Text>
              )}
            </Pressable>
          ) : null}

          {success ? (
            <Pressable style={styles.backBtn} onPress={() => router.replace(timesheetListHref as never)}>
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
                <Text style={styles.submitText}>Save Signature</Text>
              )}
            </Pressable>
          </View>
        }
      >
        {error ? <ErrorBanner message={error} /> : null}
        <Text style={styles.fieldLabel}>Foreman's Name</Text>
        <TextInput
          style={styles.input}
          value={foremanName}
          onChangeText={setForemanName}
          placeholder="Foreman name"
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
        <Text style={styles.signHint}>Draw the signature below, then tap Save Signature.</Text>
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

function enumerateDates(start?: string | null, end?: string | null) {
  if (!start || !end) return start ? [start] : [];
  const dates: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cursor <= last && dates.length < 31) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function ExportField({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <View style={styles.exportField}>
      <Text style={styles.exportLabel}>{label.toUpperCase()}</Text>
      <Text style={[styles.exportValue, accent && styles.exportValueAccent]}>{value}</Text>
    </View>
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
  exportSheet: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    padding: 16,
    backgroundColor: '#fff',
  },
  exportHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingBottom: 8,
  },
  exportBrandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  exportLogo: { width: 110, height: 24 },
  exportBrand: { fontFamily: fonts.bold, fontSize: 20, color: FF.primary },
  exportTitle: { marginBottom: 12, fontFamily: fonts.semiBold, fontSize: 9, color: '#65758f' },
  exportHours: { fontFamily: fonts.bold, fontSize: 20, color: FF.primary },
  exportGrid: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: '#f7f9fc' },
  exportField: { width: '50%', minHeight: 54, padding: 10 },
  exportLabel: { fontFamily: fonts.medium, fontSize: 8, color: FF.textMuted },
  exportValue: { marginTop: 5, fontFamily: fonts.semiBold, fontSize: 11, color: FF.text },
  exportValueAccent: { color: FF.primary },
  exportSectionLabel: {
    marginTop: 16,
    marginBottom: 7,
    fontFamily: fonts.medium,
    fontSize: 8,
    color: FF.textMuted,
  },
  exportTableHeader: {
    flexDirection: 'row',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: '#dfe5ed',
  },
  exportTableHeading: { flex: 1, fontFamily: fonts.semiBold, fontSize: 8, color: '#65758f' },
  exportTableRow: {
    flexDirection: 'row',
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#dfe5ed',
  },
  exportTableText: { flex: 1, fontFamily: fonts.regular, fontSize: 8, color: FF.text },
  exportRight: { textAlign: 'right' },
  exportEmpty: { paddingVertical: 12, fontFamily: fonts.regular, fontSize: 10, color: FF.textMuted },
  exportSignoffBlock: { marginTop: 16, borderWidth: 1, borderColor: '#dfe5ed' },
  exportSignatureBlock: {
    marginTop: 14,
    minHeight: 120,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#dfe5ed',
  },
  exportSignatureLabel: { marginTop: 10, fontFamily: fonts.medium, fontSize: 8, color: '#65758f' },
  exportSignatureImage: { width: '100%', height: 82, backgroundColor: '#fff' },
  exportFooter: { marginTop: 14, fontFamily: fonts.regular, fontSize: 8, color: FF.textMuted },
  downloadBtn: {
    marginTop: 14,
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: FF.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  downloadBtnText: { fontFamily: fonts.semiBold, fontSize: 15, color: '#fff' },
  officeSubmitBtn: {
    marginTop: 10,
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  officeSubmitBtnText: {
    textAlign: 'center',
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: '#fff',
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
