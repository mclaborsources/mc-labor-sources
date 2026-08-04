import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { Button, Card, ErrorBanner, LoadingView, Screen } from '@/components/ui';
import { mobileApi } from '@/lib/api';
import { FF, fonts } from '@/theme/brand';

type WeekChoice = 'last' | 'this';

function toIsoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

function shiftDate(date: Date, days: number) {
  const shifted = new Date(date);
  shifted.setDate(shifted.getDate() + days);
  return shifted;
}

function startOfCurrentWorkWeek() {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - ((date.getDay() + 1) % 7));
  return date;
}

function displayDate(date: Date) {
  return date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
}

export default function StandaloneManualTimesheetScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [featureEnabled, setFeatureEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [employeeName, setEmployeeName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [jobName, setJobName] = useState('');
  const [jobAddress, setJobAddress] = useState('');
  const [foremanName, setForemanName] = useState('');
  const [notes, setNotes] = useState('');
  const [weekChoice, setWeekChoice] = useState<WeekChoice>('this');
  const [hours, setHours] = useState<string[]>(Array(7).fill('0'));

  const weekStart = useMemo(
    () => shiftDate(startOfCurrentWorkWeek(), weekChoice === 'last' ? -7 : 0),
    [weekChoice],
  );
  const weekEnd = useMemo(() => shiftDate(weekStart, 6), [weekStart]);
  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) => {
        const date = shiftDate(weekStart, index);
        return {
          date,
          isoDate: toIsoDate(date),
          label: date.toLocaleDateString('en-US', { weekday: 'long' }),
        };
      }),
    [weekStart],
  );
  const totalHours = useMemo(
    () => hours.reduce((total, value) => total + (Number(value) || 0), 0),
    [hours],
  );

  useEffect(() => {
    let active = true;
    Promise.all([
      mobileApi.getMobileFeatures(),
      mobileApi.getStandaloneManualTimesheetDefaults(),
    ])
      .then(([features, defaults]) => {
        if (!active) return;
        setFeatureEnabled(features.manualTimesheetEnabled);
        if (!features.manualTimesheetEnabled) return;
        setEmployeeName(defaults.employeeName);
        setCompanyName(defaults.companyName);
        setJobName(defaults.jobName);
        setJobAddress(defaults.jobAddress);
        setForemanName(defaults.foremanName);
      })
      .catch((err) => {
        if (!active) return;
        setFeatureEnabled(false);
        setError(err instanceof Error ? err.message : 'Failed to load defaults');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  function updateHours(index: number, value: string) {
    const cleaned = value.replace(/[^0-9.]/g, '');
    setHours((current) => current.map((item, itemIndex) => (itemIndex === index ? cleaned : item)));
  }

  async function saveAndSign() {
    setError('');
    if (!companyName.trim() || !jobName.trim() || !jobAddress.trim()) {
      setError('Company, job name, and job address are required.');
      return;
    }
    const numericHours = hours.map((value) => Number(value || 0));
    const invalidIndex = numericHours.findIndex(
      (value) => !Number.isFinite(value) || value < 0 || value > 24 || value * 4 % 1 !== 0,
    );
    if (invalidIndex >= 0) {
      setError(`${days[invalidIndex].label} must use 15-minute increments between 0 and 24 hours.`);
      return;
    }
    if (numericHours.every((value) => value === 0)) {
      setError('Enter hours for at least one day.');
      return;
    }

    setSaving(true);
    try {
      const timesheetId = await mobileApi.saveStandaloneManualTimesheet({
        weekStart: toIsoDate(weekStart),
        weekEnd: toIsoDate(weekEnd),
        companyName,
        jobName,
        jobAddress,
        foremanName,
        notes,
        entries: days.map((day, index) => ({ workDate: day.isoDate, hours: numericHours[index] })),
      });
      router.push(`/my-timesheets/${timesheetId}?sign=1` as never);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save manual timesheet');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingView label="Preparing manual timesheet…" />;
  if (!featureEnabled) return <Redirect href="/(tabs)" />;

  return (
    <Screen scroll>
      <View style={styles.body}>
        {error ? <ErrorBanner message={error} /> : null}
        <Card style={styles.introCard}>
          <Text style={styles.title}>Create Manual Timesheet</Text>
          <Text style={styles.subtitle}>
            Create a standalone timesheet without attaching it to an assignment.
          </Text>
        </Card>

        <View style={styles.weekSelector}>
          <Button
            label="Last Week"
            variant={weekChoice === 'last' ? 'primary' : 'ghost'}
            style={styles.weekButton}
            onPress={() => setWeekChoice('last')}
          />
          <Button
            label="This Week"
            variant={weekChoice === 'this' ? 'primary' : 'ghost'}
            style={styles.weekButton}
            onPress={() => setWeekChoice('this')}
          />
        </View>
        <Text style={styles.period}>{displayDate(weekStart)} – {displayDate(weekEnd)}</Text>

        <Card style={styles.formCard}>
          <Field label="Employee Name" value={employeeName} editable={false} />
          <Field label="Company Name" value={companyName} onChangeText={setCompanyName} />
          <Field label="Job Name" value={jobName} onChangeText={setJobName} />
          <Field label="Job Address" value={jobAddress} onChangeText={setJobAddress} multiline />
          <Field label="Foreman's Name" value={foremanName} onChangeText={setForemanName} />
        </Card>

        <View style={styles.tableHeader}>
          <Text style={styles.tableHeaderText}>Day / Date</Text>
          <Text style={styles.tableHeaderText}>Hours worked</Text>
        </View>
        <Card style={styles.entriesCard}>
          {days.map((day, index) => (
            <View key={day.isoDate} style={[styles.dayRow, index > 0 && styles.dayBorder]}>
              <View>
                <Text style={styles.dayName}>{day.label}</Text>
                <Text style={styles.dayDate}>{displayDate(day.date)}</Text>
              </View>
              <TextInput
                style={styles.hoursInput}
                value={hours[index]}
                onChangeText={(value) => updateHours(index, value)}
                onBlur={() => updateHours(index, String(Number(hours[index] || 0)))}
                keyboardType="decimal-pad"
                selectTextOnFocus
                accessibilityLabel={`${day.label} hours`}
              />
            </View>
          ))}
          <View style={[styles.dayRow, styles.totalRow]}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{totalHours.toFixed(2)} hrs</Text>
          </View>
        </Card>

        <Text style={styles.label}>Employee Note (optional)</Text>
        <TextInput
          style={[styles.input, styles.notesInput]}
          value={notes}
          onChangeText={setNotes}
          multiline
          placeholder="Add information for the foreman or office"
          placeholderTextColor={FF.textMuted}
        />

        <Button
          label="Save & Continue to Foreman Signature"
          icon="create-outline"
          loading={saving}
          disabled={saving || totalHours <= 0}
          onPress={() => void saveAndSign()}
        />
        <Text style={styles.hint}>
          After signing, this remains Signed — Not Submitted until you submit it from My Timesheets.
        </Text>
      </View>
    </Screen>
  );
}

function Field({
  label,
  value,
  onChangeText,
  editable = true,
  multiline = false,
}: {
  label: string;
  value: string;
  onChangeText?: (value: string) => void;
  editable?: boolean;
  multiline?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, !editable && styles.readonlyInput, multiline && styles.multilineInput]}
        value={value}
        onChangeText={onChangeText}
        editable={editable}
        multiline={multiline}
        placeholderTextColor={FF.textMuted}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: 10, padding: 12, paddingBottom: 24 },
  introCard: { gap: 4, padding: 14 },
  title: { color: FF.text, fontFamily: fonts.bold, fontSize: 18 },
  subtitle: { color: FF.textSecondary, fontFamily: fonts.regular, fontSize: 12, lineHeight: 18 },
  weekSelector: { flexDirection: 'row', gap: 8 },
  weekButton: { flex: 1 },
  period: { color: FF.primary, fontFamily: fonts.semiBold, fontSize: 13, textAlign: 'center' },
  formCard: { padding: 12 },
  field: { marginBottom: 9 },
  label: { color: FF.textSecondary, fontFamily: fonts.semiBold, fontSize: 11, marginBottom: 4 },
  input: {
    backgroundColor: '#fff',
    borderColor: FF.borderInput,
    borderRadius: 10,
    borderWidth: 1,
    color: FF.text,
    fontFamily: fonts.medium,
    fontSize: 13,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  readonlyInput: { backgroundColor: FF.bg, color: FF.textSecondary },
  multilineInput: { minHeight: 58, textAlignVertical: 'top' },
  tableHeader: {
    backgroundColor: '#111827',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  tableHeaderText: { color: '#fff', fontFamily: fonts.semiBold, fontSize: 11 },
  entriesCard: { borderTopLeftRadius: 0, borderTopRightRadius: 0, padding: 0 },
  dayRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  dayBorder: { borderTopColor: FF.border, borderTopWidth: 1 },
  dayName: { color: FF.text, fontFamily: fonts.semiBold, fontSize: 13 },
  dayDate: { color: FF.textSecondary, fontFamily: fonts.regular, fontSize: 11 },
  hoursInput: {
    backgroundColor: '#fff',
    borderColor: FF.borderInput,
    borderRadius: 9,
    borderWidth: 1,
    color: FF.text,
    fontFamily: fonts.semiBold,
    minWidth: 84,
    paddingHorizontal: 10,
    paddingVertical: 8,
    textAlign: 'right',
  },
  totalRow: { backgroundColor: FF.bg, borderTopColor: FF.text, borderTopWidth: 2 },
  totalLabel: { color: FF.text, fontFamily: fonts.bold, fontSize: 13 },
  totalValue: { color: FF.primary, fontFamily: fonts.bold, fontSize: 14 },
  notesInput: { minHeight: 86, textAlignVertical: 'top' },
  hint: { color: FF.textSecondary, fontFamily: fonts.regular, fontSize: 11, lineHeight: 16, textAlign: 'center' },
});
