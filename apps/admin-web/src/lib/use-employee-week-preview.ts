'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

// A large assignment table must not send hundreds of simultaneous RPCs.
let requests = 0;
const waiting: Array<() => void> = [];
async function withPreviewSlot<T>(fetch: () => Promise<T>): Promise<T> {
  if (requests >= 6) await new Promise<void>(resolve => waiting.push(resolve));
  else requests += 1;
  try { return await fetch(); }
  finally {
    const next = waiting.shift();
    if (next) next(); else requests -= 1;
  }
}

export function useEmployeeWeekPreview(employeeId: string, enabled = true) {
  const [, tick] = useState(0);
  const query = useQuery({
    queryKey: ['employee-week-preview', employeeId],
    enabled: enabled && Boolean(employeeId),
    staleTime: 30_000,
    refetchInterval: enabled ? 60_000 : false,
    queryFn: () => withPreviewSlot(async () => {
      const requestedAt = Date.now();
      const { data, error } = await createClient().rpc('get_employee_week_preview', { p_employee: employeeId });
      if (error) throw error;
      const preview = data as { nextWeekEnabled: boolean; previewWeekStart: string; expiresAt: string; serverNow: string };
      return { ...preview, deadline: requestedAt + Date.parse(preview.expiresAt) - Date.parse(preview.serverNow) };
    }),
  });
  const deadline = query.data?.deadline;
  const refetch = query.refetch;
  useEffect(() => {
    if (!deadline || deadline <= Date.now()) return;
    const timer = setTimeout(() => { tick(value => value + 1); if (enabled) void refetch(); }, deadline - Date.now());
    return () => clearTimeout(timer);
  }, [deadline, enabled, refetch]);
  const fresh = Boolean(query.data && query.data.deadline > Date.now() && !query.isError);
  return { ...query, nextWeekEnabled: fresh && Boolean(query.data?.nextWeekEnabled), statusKnown: fresh };
}
