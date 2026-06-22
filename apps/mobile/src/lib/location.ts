import { Linking, Platform } from 'react-native';
import * as Location from 'expo-location';
import { formatLocationLabel } from '@mc-labor/shared';

export type ClockLocation = {
  latitude: number;
  longitude: number;
  label: string | null;
};

export type GpsStatus = 'idle' | 'ready' | 'denied' | 'disabled' | 'unavailable';

const LOCATION_TIMEOUT_MS = 20_000;

function isRecent(timestamp: number, maxAgeMs: number) {
  return Date.now() - timestamp <= maxAgeMs;
}

async function reverseGeocodeLabel(latitude: number, longitude: number): Promise<string | null> {
  try {
    const [geo] = await Location.reverseGeocodeAsync({ latitude, longitude });
    if (!geo) return null;
    return formatLocationLabel({
      city: geo.city ?? geo.subregion,
      region: geo.region,
      subregion: geo.district,
      country: geo.country,
    });
  } catch {
    return null;
  }
}

function toClockLocation(
  position: Location.LocationObject,
  label: string | null,
): ClockLocation {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    label,
  };
}

async function getPositionWithTimeout(): Promise<Location.LocationObject> {
  return new Promise((resolve, reject) => {
    let subscription: Location.LocationSubscription | null = null;
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void subscription?.remove();
      fn();
    };

    const timer = setTimeout(() => {
      finish(() => reject(new Error('GPS timed out — move outdoors or try again')));
    }, LOCATION_TIMEOUT_MS);

    Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Balanced,
        distanceInterval: 1,
        timeInterval: 1000,
        mayShowUserSettingsDialog: true,
      },
      (location) => {
        finish(() => resolve(location));
      },
    )
      .then((sub) => {
        subscription = sub;
      })
      .catch((err) => {
        finish(() => reject(err instanceof Error ? err : new Error('Could not read GPS')));
      });
  });
}

export async function openLocationSettings(): Promise<boolean> {
  if (Platform.OS === 'web') {
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status === 'granted';
  }

  if (typeof Linking.openSettings === 'function') {
    await Linking.openSettings();
    return true;
  }

  return false;
}

/** Resolve GPS for clock in/out with permission checks, fallbacks, and a human-readable label. */
export async function getClockLocation(): Promise<ClockLocation> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Location permission is required to clock in/out. Enable it in Settings.');
  }

  const servicesEnabled = await Location.hasServicesEnabledAsync();
  if (!servicesEnabled) {
    if (Platform.OS === 'android') {
      try {
        await Location.enableNetworkProviderAsync();
      } catch {
        // User declined — fall through to error below.
      }
    }
    const enabledAfterPrompt = await Location.hasServicesEnabledAsync();
    if (!enabledAfterPrompt) {
      throw new Error(
        'Location services are turned off. Enable GPS in your device Settings, then try again.',
      );
    }
  }

  const recent = await Location.getLastKnownPositionAsync({
    maxAge: 5 * 60 * 1000,
    requiredAccuracy: 500,
  });
  if (recent && isRecent(recent.timestamp, 5 * 60 * 1000)) {
    const label = await reverseGeocodeLabel(recent.coords.latitude, recent.coords.longitude);
    return toClockLocation(recent, label);
  }

  try {
    const current = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
      mayShowUserSettingsDialog: true,
    });
    const label = await reverseGeocodeLabel(current.coords.latitude, current.coords.longitude);
    return toClockLocation(current, label);
  } catch {
    // Balanced fix can fail indoors — wait briefly for a watch update.
    try {
      const watched = await getPositionWithTimeout();
      const label = await reverseGeocodeLabel(watched.coords.latitude, watched.coords.longitude);
      return toClockLocation(watched, label);
    } catch {
      const stale = await Location.getLastKnownPositionAsync({ maxAge: 24 * 60 * 60 * 1000 });
      if (stale) {
        const label = await reverseGeocodeLabel(stale.coords.latitude, stale.coords.longitude);
        return toClockLocation(stale, label);
      }
      throw new Error(
        'Current location is unavailable. Turn on location services, move to an open area, and try again.',
      );
    }
  }
}

/** Force a fresh GPS read (used by Refresh GPS). */
export async function refreshClockLocation(): Promise<{
  status: GpsStatus;
  coords: ClockLocation | null;
  message: string;
}> {
  try {
    const coords = await getClockLocation();
    return { status: 'ready', coords, message: 'GPS ready' };
  } catch (err) {
    return {
      status: 'unavailable',
      coords: null,
      message: err instanceof Error ? err.message : 'GPS unavailable',
    };
  }
}
