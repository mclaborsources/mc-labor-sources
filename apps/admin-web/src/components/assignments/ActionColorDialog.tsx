'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createPortal } from 'react-dom';
import { api } from '@/lib/api-client';
import type { Employee } from '@/lib/domain-types';
type ActionButtonColor = 'BLUE' | 'ORANGE' | 'GREEN' | 'RED';
import { EMPLOYEE_ACTION_COLORS } from '@/lib/employee-action-status';

export function ActionColorDialog({ employee, onClose, onSelect, pending, error, anchor }: {
  employee: Employee | null; onClose: () => void; onSelect: (color: ActionButtonColor) => void;
  pending: boolean; error: string; anchor: HTMLElement | null;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 8, top: 8 });
  const client = useQueryClient();
  const [editing, setEditing] = useState<ActionButtonColor | null>(null);
  const [draft, setDraft] = useState('');
  const settings = useQuery({ queryKey: ['company-settings'], queryFn: () => api.getSettings(), enabled: Boolean(employee) });
  const save = useMutation({
    mutationFn: ({ color, description }: { color: ActionButtonColor; description: string }) => api.updateSettings({ actionColorDescriptions: { [color]: description.trim() } }),
    onSuccess: result => { client.setQueryData(['company-settings'], result); setEditing(null); },
  });
  useEffect(() => { setEditing(null); }, [employee?.id]);
  useLayoutEffect(() => {
    if (!employee) return;
    const place = () => {
      if (!panel.current) return;
      const rect = anchor?.getBoundingClientRect();
      const width = panel.current.offsetWidth, height = panel.current.offsetHeight;
      setPosition({
        left: Math.max(8, Math.min((rect?.right ?? 0) + 12, window.innerWidth - width - 8)),
        top: Math.max(8, Math.min(rect?.bottom ?? 8, window.innerHeight - height - 8)),
      });
    };
    place();
    const observer = new ResizeObserver(place);
    if (panel.current) observer.observe(panel.current);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { observer.disconnect(); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [employee?.id, anchor]);
  useEffect(() => {
    if (!employee) return;
    panel.current?.focus();
  }, [employee?.id]);
  useEffect(() => {
    if (!employee) return;
    const outside = (event: PointerEvent) => {
      if (!pending && !save.isPending && !panel.current?.contains(event.target as Node)) onClose();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pending && !save.isPending) { onClose(); anchor?.focus(); }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [employee?.id, pending, save.isPending, onClose, anchor]);
  if (!employee || typeof document === 'undefined') return null;
  return createPortal(<div ref={panel} tabIndex={-1} role="dialog" aria-labelledby="action-colour-title"
    style={position} className="fixed z-[110] max-h-[calc(100dvh-1rem)] w-[min(26rem,calc(100vw-1rem))] overflow-y-auto rounded-xl border border-blue-300 bg-blue-50 p-4 shadow-2xl outline-none">
    <div className="mb-3 flex items-start justify-between gap-3">
      <div><h2 id="action-colour-title" className="text-xl font-bold">Actions button colour</h2><p className="text-base text-slate-600">{employee.firstName} {employee.lastName}</p></div>
      <button type="button" aria-label="Close colour picker" disabled={pending || save.isPending} onClick={onClose} className="rounded px-3 py-1 text-xl hover:bg-blue-100">×</button>
    </div>
    <p className="mb-3 text-lg text-slate-700">Choose a colour for this employee. Descriptions are shared by all office users.</p>
    <div className="space-y-2">
      {EMPLOYEE_ACTION_COLORS.map(color => <div key={color.value} className="grid grid-cols-[6rem_minmax(0,1fr)] items-center gap-2 rounded-xl border border-blue-200 p-2 sm:grid-cols-[6rem_minmax(0,1fr)_auto]">
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
  </div>, document.body);
}
