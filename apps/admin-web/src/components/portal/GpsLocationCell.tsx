'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

const locationCache = new Map<string, Promise<string | null>>();
let lookupQueue = Promise.resolve();

function resolveLocation(latitude: number, longitude: number) {
  const key = `${latitude.toFixed(5)},${longitude.toFixed(5)}`;
  const cached = locationCache.get(key);
  if (cached) return cached;

  const lookup = lookupQueue.then(async () => {
    try {
      const { data, error } = await createClient().functions.invoke('reverse-geocode-location', {
        body: { latitude, longitude },
      });
      if (error) return null;
      const label = typeof data?.label === 'string' ? data.label.trim() : '';
      return label || null;
    } catch {
      return null;
    }
  });
  locationCache.set(key, lookup);
  void lookup.then((label) => {
    if (!label) locationCache.delete(key);
  });
  lookupQueue = lookup.then(
    () => new Promise<void>((resolve) => setTimeout(resolve, 1100)),
    () => new Promise<void>((resolve) => setTimeout(resolve, 1100)),
  );
  return lookup;
}

interface GpsLocationCellProps {
  lat?: string | number | null;
  lng?: string | number | null;
  label?: string | null;
}

/**
 * Render location data captured by the mobile clock workflow. When the mobile
 * record has no saved label, resolve its coordinates through the authenticated
 * reverse-geocoding Edge Function.
 */
export function GpsLocationCell({ lat, lng, label }: GpsLocationCellProps) {
  const cleanLabel = label?.trim();
  const [resolvedLabel, setResolvedLabel] = useState<string | null>(cleanLabel || null);
  const [resolving, setResolving] = useState(false);
  const latitude = Number(lat);
  const longitude = Number(lng);
  const hasCoordinates =
    lat != null &&
    lng != null &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude);

  useEffect(() => {
    if (cleanLabel) {
      setResolvedLabel(cleanLabel);
      setResolving(false);
      return;
    }
    if (!hasCoordinates) {
      setResolvedLabel(null);
      setResolving(false);
      return;
    }
    let cancelled = false;
    setResolvedLabel(null);
    setResolving(true);
    void resolveLocation(latitude, longitude).then((result) => {
      if (!cancelled) {
        setResolvedLabel(result);
        setResolving(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [cleanLabel, hasCoordinates, latitude, longitude]);

  if (!hasCoordinates) {
    return <span className="text-xs text-slate-400">Not recorded</span>;
  }

  return (
    <span className="block min-w-24 max-w-[190px] whitespace-normal break-words text-xs font-medium leading-4 text-slate-700">
      {resolvedLabel ?? (resolving ? 'Finding location…' : `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`)}
    </span>
  );
}
