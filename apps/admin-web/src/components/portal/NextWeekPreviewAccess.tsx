'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEmployeeWeekPreview } from '@/lib/use-employee-week-preview';
import { createClient } from '@/lib/supabase/client';
import { Modal } from '@/components/ui/Modal';

export function NextWeekPreviewAccess({ employeeId }: { employeeId: string }) {
  const [rules, setRules] = useState(false);
  const queryClient = useQueryClient();
  const { data, isPending, error, nextWeekEnabled, statusKnown } = useEmployeeWeekPreview(employeeId);
  const override = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error: updateError } = await createClient().rpc('set_employee_next_week_override', { p_employee: employeeId, p_enabled: enabled });
      if (updateError) throw updateError;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['employee-week-preview', employeeId] }),
  });
  const checking = isPending || !statusKnown || Boolean(error);
  return <div className="grid grid-cols-[minmax(0,1fr)_5.5rem_5.5rem] items-center gap-x-2 border-t border-slate-200 px-3 py-2">
    <div>
      <div className="flex flex-wrap items-center gap-2"><p className="text-[15px] leading-[18px] font-semibold text-slate-900">Next work week (NW) · Automatic</p>
        <button type="button" onClick={() => setRules(true)} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold">View Rules</button>
      </div>
      <p className={`mt-1 text-[13px] leading-4 font-semibold ${nextWeekEnabled ? 'text-emerald-700' : 'text-slate-500'}`}>
        {error ? 'Unable to check preview access. Please retry.' : isPending || !statusKnown ? 'Checking access…' : nextWeekEnabled ? `Enabled for week starting ${data?.previewWeekStart}` : 'Not enabled — employee is not eligible this week.'}
      </p>
      {nextWeekEnabled && data ? <p className="mt-1 text-[13px] leading-4 text-slate-500">Expires {new Date(data.expiresAt).toLocaleString('en-US', { timeZone: 'America/New_York' })} Eastern Time</p> : null}
    </div>
    <button type="button" disabled={checking || override.isPending || nextWeekEnabled} onClick={() => override.mutate(true)}
      className={`rounded-lg px-2 py-1.5 text-[13px] leading-4 font-bold ${!checking && nextWeekEnabled ? 'bg-emerald-600 text-white ring-2 ring-emerald-200' : 'border border-slate-300 bg-white text-slate-500'}`}>
      {!checking && nextWeekEnabled ? '✓ Enabled' : 'Enable'}
    </button>
    <button type="button" disabled={checking || override.isPending || !nextWeekEnabled} onClick={() => override.mutate(false)}
      className={`rounded-lg px-2 py-1.5 text-[13px] leading-4 font-bold ${!checking && !nextWeekEnabled ? 'bg-red-600 text-white ring-2 ring-red-200' : 'border border-slate-300 bg-white text-slate-500'}`}>
      {!checking && !nextWeekEnabled ? '✓ Disabled' : 'Disable'}
    </button>
    {override.error ? <p className="col-span-3 mt-1 text-xs font-semibold text-red-600">{override.error instanceof Error ? override.error.message : 'Could not update next-week access.'}</p> : null}
    <Modal open={rules} onClose={() => setRules(false)} title="Next Work Week Rules" size="md">
      <div className="space-y-3 text-sm text-slate-700">
        <p>Only employees highlighted in the current work week can preview their own next-week assignments: their customer/job changed, or they had no assignment in the previous week.</p>
        <p>Access expires at 12:00 AM Saturday, Eastern Time. The previewed assignments then appear under This Week.</p>
        <p>Eligibility is checked again for the new week using its assignments. An old permission never carries forward; only employees highlighted in the new week receive its next-week preview.</p>
        <p>This rule does not change previous-week access or enable a disabled portal account.</p>
      </div>
    </Modal>
  </div>;
}
