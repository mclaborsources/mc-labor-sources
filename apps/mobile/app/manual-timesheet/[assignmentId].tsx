import { useCallback, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  Button,
  Card,
  ErrorBanner,
  ImageBanner,
  InfoBanner,
  LoadingView,
  ModalSheet,
  Screen,
  StackAppHeader,
  SuccessBanner,
} from '@/components/ui';
import { IMAGERY } from '@/constants/imagery';
import { mobileApi } from '@/lib/api';
import { FF, cardShadow, fonts, theme } from '@/theme/brand';

type DayEntry = {
  workDate: string;
  dayLabel: string;
  hours: number;
  startTime?: string;
  endTime?: string;
  attendanceLogId?: string;
  source: 'recorded' | 'manual';
};

const HOUR_OPTIONS = Array.from({ length: 97 }, (_, index) => index / 4);

function addDays(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function currentSaturday() {
  const today = new Date();
  const day = today.getDay();
  const daysSinceSaturday = (day + 1) % 7;
  today.setDate(today.getDate() - daysSinceSaturday);
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate(),
  ).padStart(2, '0')}`;
}

function easternDate(isoTimestamp: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(isoTimestamp));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function easternTime(isoTimestamp: string) {
  return new Date(isoTimestamp).toLocaleTimeString(undefined, {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function displayDate(isoDate: string) {
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString(undefined, {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function ManualTimesheetScreen() {
  const { assignmentId, weekStart: requestedWeekStart } = useLocalSearchParams<{
    assignmentId: string;
    weekStart?: string;
  }>();
  const router = useRouter();
  const [weekStart, setWeekStart] = useState(() => requestedWeekStart || currentSaturday());
  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);
  const [data, setData] =
    useState<Awaited<ReturnType<typeof mobileApi.getManualTimesheetGenerator>> | null>(null);
  const [entries, setEntries] = useState<DayEntry[]>([]);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectingIndex, setSelectingIndex] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!assignmentId) return;
      let active = true;
      setLoading(true);
      setError('');
      setSuccess('');
      mobileApi
        .getManualTimesheetGenerator(assignmentId, weekStart, weekEnd)
        .then((result) => {
          if (!active) return;
        const existingByDate = new Map(
          result.existingEntries.map((entry) => [entry.workDate, entry]),
        );
        const attendanceByDate = new Map<
          string,
          Array<(typeof result.attendance)[number]>
        >();
        result.attendance.forEach((record) => {
          const date = easternDate(record.clockInTime);
          const records = attendanceByDate.get(date) ?? [];
          records.push(record);
          attendanceByDate.set(date, records);
        });

        setData(result);
        setNotes(result.notes);
        setEntries(
          Array.from({ length: 7 }, (_, index) => {
            const workDate = addDays(weekStart, index);
            const existing = existingByDate.get(workDate);
            const recorded = attendanceByDate.get(workDate) ?? [];
            const recordedHours = recorded.reduce((sum, row) => sum + row.totalHours, 0);
            return {
              workDate,
              dayLabel: new Date(`${workDate}T12:00:00`).toLocaleDateString(undefined, {
                weekday: 'long',
              }),
              hours: existing ? existing.hours : Math.round(recordedHours * 4) / 4,
              startTime: existing?.startTime ?? (recorded[0] ? easternTime(recorded[0].clockInTime) : undefined),
              endTime:
                existing?.endTime ??
                (recorded.at(-1)?.clockOutTime
                  ? easternTime(recorded.at(-1)!.clockOutTime)
                  : undefined),
              attendanceLogId: existing ? undefined : recorded[0]?.id,
              source:
                existing?.notes === 'Imported from recorded attendance' || (!existing && recorded.length)
                  ? 'recorded'
                  : 'manual',
            };
          }),
        );
        })
        .catch((err) => {
          if (active) {
            setError(err instanceof Error ? err.message : 'Failed to load timesheet');
          }
        })
        .finally(() => {
          if (active) setLoading(false);
        });

      return () => {
        active = false;
      };
    }, [assignmentId, weekEnd, weekStart]),
  );

  const totalHours = useMemo(
    () => entries.reduce((sum, entry) => sum + entry.hours, 0),
    [entries],
  );
  const isSigned = Boolean(data?.signature);

  function selectHours(hours: number) {
    if (selectingIndex === null) return;
    setEntries((current) =>
      current.map((entry, index) =>
        index === selectingIndex
          ? {
              ...entry,
              hours,
              attendanceLogId: undefined,
              startTime: undefined,
              endTime: undefined,
              source: 'manual',
            }
          : entry,
      ),
    );
    setSelectingIndex(null);
  }

  async function saveTimesheet() {
    if (!assignmentId) return;
    const normalizedEntries = entries.map((entry) => ({
      ...entry,
      hours: Math.round(Number(entry.hours) * 4) / 4,
    }));
    const invalidEntry = normalizedEntries.find(
      (entry) => !Number.isFinite(entry.hours) || entry.hours < 0 || entry.hours > 24,
    );
    if (invalidEntry) {
      setError(`${invalidEntry.dayLabel} must contain between 0 and 24 hours.`);
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const timesheetId = await mobileApi.saveManualTimesheet({
        assignmentId,
        weekStart,
        weekEnd,
        notes,
        entries: normalizedEntries.map((entry) => ({
          workDate: entry.workDate,
          hours: entry.hours,
          startTime: entry.startTime,
          endTime: entry.endTime,
          attendanceLogId: entry.attendanceLogId,
        })),
      });
      setSuccess('Timesheet saved. Hand the device to the foreman for signature.');
      router.push(`/my-timesheets/${timesheetId}?sign=1` as never);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save timesheet');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingView label="Preparing weekly timesheet…" />;

  return (
    <Screen padded={false} scroll>
      <StackAppHeader />
      <ImageBanner
        variant="full"
        source={IMAGERY.heroTimesheets}
        title="MC Labor Timesheet"
        subtitle={`${displayDate(weekStart)} – ${displayDate(weekEnd)}`}
      />
      <View style={styles.body}>
        {error ? <ErrorBanner message={error} /> : null}
        {success ? <SuccessBanner message={success} /> : null}
        <InfoBanner message="Recorded clock hours are prefilled. Tap any day to enter or correct hours in 15-minute increments." />

        <View style={styles.weekControls}>
          <Pressable
            style={styles.weekButton}
            onPress={() => setWeekStart((current) => addDays(current, -7))}
          >
            <Text style={styles.weekButtonText}>‹ Previous week</Text>
          </Pressable>
          <Pressable
            style={styles.weekButton}
            onPress={() => setWeekStart((current) => addDays(current, 7))}
          >
            <Text style={styles.weekButtonText}>Next week ›</Text>
          </Pressable>
        </View>

        <Card style={styles.headerCard}>
          <ReadonlyField label="Company Name" value={data?.assignment.customer?.companyName} />
          <ReadonlyField label="Job Name" value={data?.assignment.jobSite?.name} />
          <ReadonlyField label="Job Address" value={data?.assignment.jobSite?.address} />
          <ReadonlyField label="Employee Name" value={data?.employeeName} />
        </Card>

        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderText, styles.dayColumn]}>Day / Date</Text>
          <Text style={styles.tableHeaderText}>Hours worked</Text>
        </View>
        <Card style={styles.entriesCard}>
          {entries.map((entry, index) => (
            <View key={entry.workDate} style={[styles.dayRow, index > 0 && styles.dayBorder]}>
              <View style={styles.dayColumn}>
                <Text style={styles.dayName}>{entry.dayLabel}</Text>
                <Text style={styles.dayDate}>{displayDate(entry.workDate)}</Text>
                <Text style={entry.source === 'recorded' ? styles.recorded : styles.manual}>
                  {entry.source === 'recorded' ? 'Recorded hours' : 'Manual entry'}
                </Text>
              </View>
              <Pressable style={styles.hoursButton} onPress={() => setSelectingIndex(index)}>
                <Text style={styles.hoursText}>{entry.hours.toFixed(2)} hrs</Text>
                <Text style={styles.chevron}>⌄</Text>
              </Pressable>
            </View>
          ))}
          <View style={[styles.dayRow, styles.totalRow]}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{totalHours.toFixed(2)} hrs</Text>
          </View>
        </Card>

        <Text style={styles.label}>Notes</Text>
        <TextInput
          style={[styles.input, styles.notes]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Optional timesheet notes"
          placeholderTextColor={FF.textMuted}
          multiline
        />

        <Card style={styles.signoffCard}>
          <ReadonlyField
            label="Foreman's Name"
            value={
              data?.signature?.foremanName ||
              data?.foremanName ||
              'To be completed by the foreman'
            }
          />
          {data?.signature?.imageUrl ? (
            <View style={styles.signatureSection}>
              <Text style={styles.signatureHeading}>SIGNATURE</Text>
              <View style={styles.signatureCanvas}>
                <Image
                  source={{ uri: data.signature.imageUrl }}
                  style={styles.signatureImage}
                  resizeMode="contain"
                />
              </View>
            </View>
          ) : (
            <>
              <Text style={styles.label}>Foreman's Signature</Text>
              <View style={styles.readonlyValue}>
                <Text style={styles.readonlyText}>Completed after saving</Text>
              </View>
            </>
          )}
          <ReadonlyField
            label="Date"
            value={displayDate(
              data?.signature?.signedAt?.slice(0, 10) ||
                new Date().toISOString().slice(0, 10),
            )}
          />
        </Card>

        <Button
          label={isSigned ? 'Timesheet Signed' : 'Save & Continue to Foreman Signature'}
          icon={isSigned ? 'checkmark-circle-outline' : 'create-outline'}
          loading={saving}
          disabled={isSigned || totalHours <= 0}
          onPress={() => void saveTimesheet()}
        />
      </View>

      <ModalSheet
        visible={selectingIndex !== null}
        title={
          selectingIndex === null
            ? 'Select hours'
            : `${entries[selectingIndex]?.dayLabel} · ${displayDate(entries[selectingIndex]?.workDate)}`
        }
        onClose={() => setSelectingIndex(null)}
      >
        <Text style={styles.selectorHint}>Choose hours in 15-minute increments.</Text>
        <View style={styles.hourGrid}>
          {HOUR_OPTIONS.map((hours) => (
            <Pressable
              key={hours}
              style={[
                styles.hourOption,
                selectingIndex !== null &&
                  entries[selectingIndex]?.hours === hours &&
                  styles.hourOptionSelected,
              ]}
              onPress={() => selectHours(hours)}
            >
              <Text
                style={[
                  styles.hourOptionText,
                  selectingIndex !== null &&
                    entries[selectingIndex]?.hours === hours &&
                    styles.hourOptionTextSelected,
                ]}
              >
                {hours.toFixed(2)}
              </Text>
            </Pressable>
          ))}
        </View>
      </ModalSheet>
    </Screen>
  );
}

function ReadonlyField({ label, value }: { label: string; value?: string }) {
  return (
    <View style={styles.readonlyField}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.readonlyValue}>
        <Text style={styles.readonlyText}>{value || '—'}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: theme.spacing.screen, paddingBottom: 40 },
  weekControls: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  weekButton: { paddingVertical: 8, paddingHorizontal: 4 },
  weekButtonText: { fontFamily: fonts.semiBold, color: FF.primary, fontSize: 13 },
  headerCard: { padding: 16, marginBottom: 18 },
  readonlyField: { marginBottom: 12 },
  label: { fontFamily: fonts.semiBold, color: FF.textSecondary, fontSize: 12, marginBottom: 6 },
  readonlyValue: {
    borderWidth: 1,
    borderColor: FF.borderInput,
    backgroundColor: FF.bg,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  readonlyText: { fontFamily: fonts.medium, color: FF.text, fontSize: 14 },
  signatureSection: {
    borderWidth: 1,
    borderColor: FF.border,
    borderRadius: 14,
    backgroundColor: FF.card,
    padding: 16,
    marginBottom: 12,
  },
  signatureHeading: {
    fontFamily: fonts.semiBold,
    color: FF.textSecondary,
    fontSize: 12,
    letterSpacing: 1.4,
    marginBottom: 10,
  },
  signatureCanvas: {
    borderWidth: 1,
    borderColor: FF.borderInput,
    borderRadius: 10,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
  },
  signatureImage: {
    width: '100%',
    height: 140,
  },
  tableHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#111827',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  tableHeaderText: { fontFamily: fonts.semiBold, color: '#fff', fontSize: 12 },
  entriesCard: { borderTopLeftRadius: 0, borderTopRightRadius: 0, marginBottom: 18 },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  dayBorder: { borderTopWidth: 1, borderTopColor: FF.border },
  dayColumn: { flex: 1 },
  dayName: { fontFamily: fonts.semiBold, color: FF.text, fontSize: 14 },
  dayDate: { fontFamily: fonts.regular, color: FF.textSecondary, fontSize: 12, marginTop: 2 },
  recorded: { fontFamily: fonts.medium, color: FF.green500, fontSize: 10, marginTop: 3 },
  manual: { fontFamily: fonts.medium, color: FF.amber500, fontSize: 10, marginTop: 3 },
  hoursButton: {
    minWidth: 112,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: FF.borderInput,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: FF.card,
  },
  hoursText: { fontFamily: fonts.semiBold, color: FF.text, fontSize: 13 },
  chevron: { color: FF.primary, fontSize: 15 },
  totalRow: { backgroundColor: FF.bg, borderTopWidth: 2, borderTopColor: FF.text },
  totalLabel: { fontFamily: fonts.bold, color: FF.text, fontSize: 14 },
  totalValue: { fontFamily: fonts.bold, color: FF.primary, fontSize: 16 },
  input: {
    borderWidth: 1,
    borderColor: FF.borderInput,
    borderRadius: 12,
    backgroundColor: FF.card,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: fonts.regular,
    color: FF.text,
    fontSize: 14,
  },
  notes: { minHeight: 82, textAlignVertical: 'top', marginBottom: 18 },
  signoffCard: { padding: 16, marginBottom: 8 },
  selectorHint: { fontFamily: fonts.regular, color: FF.textSecondary, fontSize: 13, marginBottom: 14 },
  hourGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 24 },
  hourOption: {
    width: '22%',
    borderWidth: 1,
    borderColor: FF.borderInput,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    backgroundColor: FF.card,
  },
  hourOptionSelected: { backgroundColor: FF.primary, borderColor: FF.primary, ...cardShadow },
  hourOptionText: { fontFamily: fonts.medium, color: FF.text, fontSize: 12 },
  hourOptionTextSelected: { color: '#fff', fontFamily: fonts.bold },
});
