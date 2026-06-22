import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatCoordsWithLabel } from '@mc-labor/shared';
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  ImageBanner,
  ListCard,
  LoadingView,
  Screen,
  SectionTitle,
  screenLayout,
} from '@/components/ui';
import { theme, fonts } from '@/theme/brand';
import { IMAGERY } from '@/constants/imagery';
import { mobileApi } from '@/lib/api';
import {
  getClockLocation,
  openLocationSettings,
  refreshClockLocation,
  type GpsStatus,
} from '@/lib/location';

export default function ClockScreen() {
  const [assignments, setAssignments] = useState<Awaited<ReturnType<typeof mobileApi.getAssignments>>>([]);
  const [active, setActive] = useState<Awaited<ReturnType<typeof mobileApi.getActiveClockIn>>>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [gpsRefreshing, setGpsRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>('idle');
  const [gpsMessage, setGpsMessage] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number; label: string | null } | null>(
    null,
  );

  const refreshGps = useCallback(async () => {
    setGpsRefreshing(true);
    try {
      const result = await refreshClockLocation();
      setGpsStatus(result.status);
      setGpsMessage(result.message);
      if (result.coords) {
        setCoords({
          lat: result.coords.latitude,
          lng: result.coords.longitude,
          label: result.coords.label,
        });
      }
    } finally {
      setGpsRefreshing(false);
    }
  }, []);

  const load = useCallback(async () => {
    setError('');
    try {
      const [assignmentList, activeSession] = await Promise.all([
        mobileApi.getAssignments(),
        mobileApi.getActiveClockIn(),
      ]);
      const eligible = assignmentList.filter((a) => ['ACTIVE', 'ACCEPTED'].includes(a.status));
      setAssignments(eligible);
      setActive(activeSession);
      if (eligible.length && !selectedId) {
        setSelectedId(eligible[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load clock data');
    }
  }, [selectedId]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    void refreshGps();
  }, [refreshGps]);

  const onClockIn = async () => {
    const assignment = assignments.find((a) => a.id === selectedId);
    if (!assignment) {
      setError('Select an assignment first');
      return;
    }
    setActionLoading(true);
    setError('');
    try {
      const coordsPos = await getClockLocation();
      setCoords({ lat: coordsPos.latitude, lng: coordsPos.longitude, label: coordsPos.label });
      setGpsStatus('ready');
      await mobileApi.clockIn({
        customerId: assignment.customerId,
        jobSiteId: assignment.jobSiteId,
        assignmentId: assignment.id,
        clockInLatitude: coordsPos.latitude,
        clockInLongitude: coordsPos.longitude,
        clockInLocationLabel: coordsPos.label,
      });
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Clock in failed';
      setError(message);
      if (message.toLowerCase().includes('location') || message.toLowerCase().includes('gps')) {
        setGpsStatus('unavailable');
        setGpsMessage(message);
      }
    } finally {
      setActionLoading(false);
    }
  };

  const onClockOut = async () => {
    if (!active) return;
    setActionLoading(true);
    setError('');
    try {
      const coordsPos = await getClockLocation();
      setCoords({ lat: coordsPos.latitude, lng: coordsPos.longitude, label: coordsPos.label });
      setGpsStatus('ready');
      await mobileApi.clockOut({
        attendanceId: active.id,
        clockOutLatitude: coordsPos.latitude,
        clockOutLongitude: coordsPos.longitude,
        clockOutLocationLabel: coordsPos.label,
      });
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Clock out failed';
      setError(message);
      if (message.toLowerCase().includes('location') || message.toLowerCase().includes('gps')) {
        setGpsStatus('unavailable');
        setGpsMessage(message);
      }
    } finally {
      setActionLoading(false);
    }
  };

  const gpsNeedsAttention =
    gpsStatus === 'denied' || gpsStatus === 'disabled' || gpsStatus === 'unavailable';

  if (loading) return <LoadingView label="Loading clock status…" />;

  return (
    <Screen scroll padded={false}>
      <ImageBanner
        variant="full"
        source={IMAGERY.heroAttendance}
        title="Clock In / Out"
        subtitle="GPS-verified time tracking"
      />
      <View style={screenLayout.body}>
        <ErrorBanner message={error} />

        <Card style={[styles.gpsCard, gpsNeedsAttention ? styles.gpsCardWarn : undefined]}>
          <View style={styles.gpsHeader}>
            <Ionicons
              name={
                gpsStatus === 'ready'
                  ? 'checkmark-circle'
                  : gpsRefreshing
                    ? 'locate'
                    : 'location-outline'
              }
              size={18}
              color={
                gpsStatus === 'ready'
                  ? theme.colors.success
                  : gpsNeedsAttention
                    ? theme.colors.danger
                    : theme.colors.primary
              }
            />
            <Text style={[styles.gpsTitle, gpsNeedsAttention && styles.gpsTitleWarn]}>
              {gpsStatus === 'ready'
                ? 'GPS ready'
                : gpsRefreshing
                  ? 'Locating…'
                  : gpsStatus === 'denied'
                    ? 'Location permission needed'
                    : gpsStatus === 'disabled'
                      ? 'Location services off'
                      : gpsStatus === 'idle'
                        ? 'GPS not refreshed yet'
                        : 'GPS unavailable'}
            </Text>
          </View>
          {gpsMessage && gpsStatus !== 'ready' ? (
            <Text style={styles.gpsHint}>{gpsMessage}</Text>
          ) : null}
          {coords ? (
            <Text style={styles.gpsCoords}>
              {formatCoordsWithLabel(coords.lat, coords.lng, coords.label)}
            </Text>
          ) : null}
          <View style={styles.gpsActions}>
            <Pressable style={styles.gpsBtn} onPress={() => void refreshGps()} disabled={gpsRefreshing}>
              <Text style={styles.gpsBtnText}>{gpsRefreshing ? 'Refreshing…' : 'Refresh GPS'}</Text>
            </Pressable>
            {gpsNeedsAttention ? (
              <Pressable
                style={styles.gpsBtn}
                onPress={async () => {
                  const granted = await openLocationSettings();
                  if (Platform.OS === 'web') {
                    if (granted) {
                      void refreshGps();
                    } else {
                      setError('Allow location in your browser, then tap Refresh GPS.');
                    }
                  }
                }}
              >
                <Text style={styles.gpsBtnText}>
                  {Platform.OS === 'web' ? 'Allow location' : 'Open Settings'}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </Card>

        {active ? (
          <Card variant="success" style={styles.activeCard}>
            <View style={styles.activeHeader}>
              <View style={styles.pulseDot} />
              <Text style={styles.activeTitle}>Currently clocked in</Text>
            </View>
            <Text style={styles.activeSite}>{active.jobSiteName}</Text>
            <Text style={styles.activeTime}>Since {new Date(active.clockInTime).toLocaleString()}</Text>
            <Button
              label={actionLoading ? 'Working…' : 'Clock Out'}
              onPress={onClockOut}
              loading={actionLoading}
              variant="danger"
              icon="log-out-outline"
              style={styles.actionBtn}
            />
          </Card>
        ) : (
          <>
            <SectionTitle>Select assignment</SectionTitle>
            {assignments.length === 0 ? (
              <EmptyState message="No active assignments available to clock in." icon="⏱️" />
            ) : (
              assignments.map((item) => (
                <ListCard
                  key={item.id}
                  size="comfortable"
                  titleLines={1}
                  icon="location-outline"
                  iconAccent="green"
                  title={item.jobSite?.name ?? 'Job Site'}
                  subtitle={item.customer?.companyName}
                  selected={selectedId === item.id}
                  onPress={() => setSelectedId(item.id)}
                />
              ))
            )}
            <Button
              label={actionLoading ? 'Working…' : 'Clock In'}
              onPress={onClockIn}
              loading={actionLoading}
              icon="log-in-outline"
              style={styles.actionBtn}
              disabled={assignments.length === 0}
            />
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  gpsCard: {
    marginBottom: 16,
    gap: 8,
  },
  gpsCardWarn: {
    borderColor: theme.colors.dangerBorder,
    backgroundColor: theme.colors.dangerBg,
  },
  gpsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  gpsTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: theme.colors.text,
  },
  gpsTitleWarn: {
    color: theme.colors.danger,
  },
  gpsHint: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: theme.colors.textSecondary,
    lineHeight: 18,
  },
  gpsCoords: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  gpsActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  gpsBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: '#fff',
  },
  gpsBtnText: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: theme.colors.primary,
  },
  activeCard: { marginTop: 4 },
  activeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  pulseDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.success,
  },
  activeTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: theme.colors.success,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  activeSite: {
    fontFamily: fonts.bold,
    fontSize: 20,
    color: theme.colors.text,
    marginBottom: 4,
  },
  activeTime: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  actionBtn: { marginTop: 16 },
});
