'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Modal } from '@/components/ui/Modal';
import { api } from '@/lib/api-client';
import type { Employee } from '@/lib/domain-types';
type ActionButtonColor = 'BLUE' | 'ORANGE' | 'GREEN' | 'RED';
import { EMPLOYEE_ACTION_COLORS } from '@/lib/employee-action-status';

export function ActionColorDialog({ employee, onClose, onSelect, pending, error }: {
  employee: Employee | null; onClose: () => void; onSelect: (color: ActionButtonColor) => void;
  pending: boolean; error: string;
}) {
  const client = useQueryClient();
  const [editing, setEditing] = useState<ActionButtonColor | null>(null);
  const [draft, setDraft] = useState('');
  const settings = useQuery({ queryKey: ['company-settings'], queryFn: () => api.getSettings(), enabled: Boolean(employee) });
  const save = useMutation({
    mutationFn: ({ color, description }: { color: ActionButtonColor; description: string }) => api.updateSettings({ actionColorDescriptions: { [color]: description.trim() } }),
    onSuccess: result => { client.setQueryData(['company-settings'], result); setEditing(null); },
  });
  useEffect(() => { setEditing(null); }, [employee?.id]);
  return <Modal open={Boolean(employee)} onClose={() => { if (!pending && !save.isPending) onClose(); }}
    title="Actions button colour" subtitle={employee ? `${employee.firstName} ${employee.lastName}` : ''}
    size="lg" titleClassName="!text-2xl">
    <p className="mb-3 text-lg text-slate-700">Choose a colour for this employee. Descriptions are shared by all office users.</p>
    <div className="space-y-2">
      {EMPLOYEE_ACTION_COLORS.map(color => <div key={color.value} className="grid grid-cols-[8rem_minmax(0,1fr)] items-center gap-3 rounded-xl border border-blue-200 p-3 sm:grid-cols-[8rem_minmax(0,1fr)_auto]">
        <button type="button" disabled={pending || save.isPending} onClick={() => onSelect(color.value)} aria-pressed={(employee?.actionButtonColor ?? 'BLUE') === color.value}
          className="min-h-11 rounded-lg border px-3 py-2 text-lg font-bold text-slate-950 disabled:opacity-60"
          style={{ backgroundColor: color.background, borderColor: color.border }}>
          {(employee?.actionButtonColor ?? 'BLUE') === color.value ? '✓ ' : ''}{color.label}
        </button>
        {editing === color.value ? <form className="col-span-full flex flex-wrap gap-2 sm:col-span-2" onSubmit={event => { event.preventDefault(); save.mutate({ color: color.value, description: draft }); }}>
          <input autoFocus aria-label={`${color.label} description`} maxLength={200} value={draft} onChange={event => setDraft(event.target.value)} disabled={save.isPending} className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-lg" />
          <button disabled={save.isPending} className="rounded bg-blue-600 px-3 py-2 text-base font-bold text-white">{save.isPending ? 'Saving…' : 'Save'}</button>
          <button type="button" disabled={save.isPending} onClick={() => setEditing(null)} className="px-2 text-base">Cancel</button>
        </form> : <>
          <p className="break-words text-lg text-slate-800">{settings.isPending ? 'Loading…' : settings.data?.actionColorDescriptions?.[color.value] || 'No description'}</p>
          <button type="button" disabled={!settings.data || settings.isError || save.isPending} onClick={() => { save.reset(); setEditing(color.value); setDraft(settings.data?.actionColorDescriptions?.[color.value] ?? ''); }} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-base font-semibold">Edit</button>
        </>}
      </div>)}
    </div>
    {pending ? <p role="status" className="mt-3 text-lg">Saving colour…</p> : null}
    {error || settings.error || save.error ? <p role="alert" className="mt-3 text-lg text-red-700">{error || settings.error?.message || save.error?.message}</p> : null}
  </Modal>;
}
