'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { SafetyAudience, createSafetyBulletinSchema } from '@mc-labor/shared';
import type { z } from 'zod';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { BrandPageTitle } from '@/components/brand';
import { BRAND_HERO_IMAGES } from '@/lib/navigation';
import {
  PortalRecordsPanel,
  PortalSummaryStat,
  portalFormFieldClassName,
  TitleCell,
  ActionCell,
} from '@/components/portal';
import { IconShield, IconBell } from '@/components/dashboard';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { FormField } from '@/components/ui/FormField';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { Textarea } from '@/components/ui/Textarea';
import { Table, Th, Td, ThActions } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { LoadingState } from '@/components/ui/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { api, type SafetyBulletin } from '@/lib/api-client';
import safetyTipList from '../../../../../supabase/functions/_shared/safety-tips.json';

type SafetyBulletinFormInput = z.infer<typeof createSafetyBulletinSchema>;
const safetyTips = safetyTipList.tips;
const defaultTipOrder = safetyTips.map((tip) => tip.week);
const weekdays = [
  { value: 1, label: 'Monday' }, { value: 2, label: 'Tuesday' }, { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' }, { value: 5, label: 'Friday' }, { value: 6, label: 'Saturday' }, { value: 7, label: 'Sunday' },
];
const tipTimezones = [
  { value: 'America/New_York', label: 'Eastern Time' },
  { value: 'America/Chicago', label: 'Central Time' },
  { value: 'America/Denver', label: 'Mountain Time' },
  { value: 'America/Los_Angeles', label: 'Pacific Time' },
];

export default function SafetyBulletinsPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [tipLibraryOpen, setTipLibraryOpen] = useState(false);
  const [selectedLibraryTip, setSelectedLibraryTip] = useState<(typeof safetyTips)[number] | null>(null);
  const [tipOrder, setTipOrder] = useState<number[]>(defaultTipOrder);
  const [tipSearch, setTipSearch] = useState('');
  const [draggingTipWeek, setDraggingTipWeek] = useState<number | null>(null);
  const [manualTipWeek, setManualTipWeek] = useState<number | null>(null);
  const [manualTipEmployeeId, setManualTipEmployeeId] = useState('');
  const [selectedTipWeek, setSelectedTipWeek] = useState('');
  const [scheduleEnabled, setScheduleEnabled] = useState(true);
  const [scheduleWeekday, setScheduleWeekday] = useState(4);
  const [scheduleTime, setScheduleTime] = useState('08:00');
  const [scheduleTimezone, setScheduleTimezone] = useState('America/New_York');
  const queryClient = useQueryClient();

  const form = useForm<SafetyBulletinFormInput>({
    resolver: zodResolver(createSafetyBulletinSchema),
    defaultValues: {
      title: '',
      message: '',
      audience: SafetyAudience.ALL_EMPLOYEES,
      jobSiteId: '',
      employeeIds: [],
    },
  });

  const audience = form.watch('audience');
  const employeeIds = form.watch('employeeIds') ?? [];

  const { data, isLoading } = useQuery({
    queryKey: ['safety-bulletins'],
    queryFn: () => api.getSafetyBulletins(),
  });

  const { data: jobSites } = useQuery({
    queryKey: ['job-sites'],
    queryFn: () => api.getJobSites(),
  });

  const { data: employees } = useQuery({
    queryKey: ['employees-active'],
    queryFn: () => api.getEmployees({ status: 'ACTIVE' }),
  });

  const scheduleQuery = useQuery({
    queryKey: ['safety-tip-weekly-schedule'],
    queryFn: () => api.getSafetyTipWeeklySchedule(),
  });
  const orderedTips = useMemo(
    () => tipOrder.map((week) => safetyTips.find((tip) => tip.week === week)).filter((tip): tip is (typeof safetyTips)[number] => Boolean(tip)),
    [tipOrder],
  );
  const filteredOrderedTips = useMemo(() => {
    const query = tipSearch.trim().toLocaleLowerCase();
    if (!query) return orderedTips;
    return orderedTips.filter((tip, index) =>
      tip.title.toLocaleLowerCase().includes(query)
      || String(index + 1).includes(query)
      || String(tip.week).includes(query),
    );
  }, [orderedTips, tipSearch]);
  const savedTipOrder = scheduleQuery.data?.tipOrder ?? defaultTipOrder;
  const hasUnsavedTipOrder = tipOrder.join(',') !== savedTipOrder.join(',');
  const runsQuery = useQuery({
    queryKey: ['safety-tip-weekly-runs'],
    queryFn: () => api.getSafetyTipWeeklyRuns(),
    refetchInterval: 30000,
  });
  useEffect(() => {
    if (!scheduleQuery.data) return;
    setScheduleEnabled(scheduleQuery.data.enabled);
    setScheduleWeekday(scheduleQuery.data.weekday);
    setScheduleTime(scheduleQuery.data.sendTime.slice(0, 5));
    setScheduleTimezone(scheduleQuery.data.timezone);
    setTipOrder(scheduleQuery.data.tipOrder);
  }, [scheduleQuery.data]);

  const stats = useMemo(() => {
    const bulletins = data ?? [];
    return {
      total: bulletins.length,
      sent: bulletins.filter((b) => b.sentAt).length,
      draft: bulletins.filter((b) => !b.sentAt).length,
    };
  }, [data]);

  const canCreate = form.formState.isValid;

  const createMutation = useMutation({
    mutationFn: (values: SafetyBulletinFormInput) =>
      api.createSafetyBulletin({
        title: values.title,
        message: values.message,
        audience: values.audience,
        jobSiteId:
          values.audience === SafetyAudience.SPECIFIC_JOB_SITE ? values.jobSiteId : undefined,
        employeeIds:
          values.audience === SafetyAudience.SPECIFIC_WORKERS ? values.employeeIds : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['safety-bulletins'] });
      setModalOpen(false);
      setSelectedTipWeek('');
      form.reset({
        title: '',
        message: '',
        audience: SafetyAudience.ALL_EMPLOYEES,
        jobSiteId: '',
        employeeIds: [],
      });
    },
  });

  const sendMutation = useMutation({
    mutationFn: (id: string) => api.sendSafetyBulletin(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['safety-bulletins'] }),
  });

  const manualTipSendMutation = useMutation({
    mutationFn: async ({ week, employeeId }: { week: number; employeeId: string }) => {
      const tip = safetyTips.find((item) => item.week === week);
      if (!tip || tip.isPlaceholder) throw new Error('Replace this placeholder with approved safety guidance before sending.');
      const employee = employees?.find((item) => item.id === employeeId);
      if (!employee) throw new Error('Could not find the selected worker. Refresh the page and try again.');
      const message = tip.message.replace(/\[EmFirstName\]/gi, employee.firstName || 'there');
      const bulletin = await api.createSafetyBulletin({
        title: tip.title,
        message,
        audience: SafetyAudience.SPECIFIC_WORKERS,
        employeeIds: [employeeId],
      });
      return api.sendSafetyBulletin(bulletin.id, { sendEmail: false });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['safety-bulletins'] });
    },
    onError: () => queryClient.invalidateQueries({ queryKey: ['safety-bulletins'] }),
  });

  const scheduleMutation = useMutation({
    mutationFn: () => api.updateSafetyTipWeeklySchedule({
      enabled: scheduleEnabled,
      weekday: scheduleWeekday,
      sendTime: scheduleTime,
      timezone: scheduleTimezone,
      tipOrder,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['safety-tip-weekly-schedule'] });
    },
  });

  const tipOrderMutation = useMutation({
    mutationFn: () => api.updateSafetyTipOrder(tipOrder),
    onSuccess: (savedOrder) => {
      setTipOrder(savedOrder);
      queryClient.setQueryData(['safety-tip-weekly-schedule'], (current: typeof scheduleQuery.data) => current ? { ...current, tipOrder: savedOrder } : current);
    },
  });

  function moveTip(week: number, direction: -1 | 1) {
    setTipOrder((current) => {
      const from = current.indexOf(week);
      const to = from + direction;
      if (from < 0 || to < 0 || to >= current.length) return current;
      const next = [...current];
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });
  }

  function moveTipBefore(draggedWeek: number, targetWeek: number) {
    setTipOrder((current) => {
      const from = current.indexOf(draggedWeek);
      const to = current.indexOf(targetWeek);
      if (from < 0 || to < 0 || from === to) return current;
      const next = [...current];
      next.splice(from, 1);
      next.splice(to, 0, draggedWeek);
      return next;
    });
    tipOrderMutation.reset();
  }

  function toggleEmployee(id: string) {
    const next = employeeIds.includes(id)
      ? employeeIds.filter((x) => x !== id)
      : [...employeeIds, id];
    form.setValue('employeeIds', next, { shouldValidate: true });
  }

  function formatRecipients(bulletin: SafetyBulletin) {
    if (!bulletin) return '—';
    if (bulletin.audience === 'SPECIFIC_WORKERS' && bulletin.recipientEmployees?.length) {
      const names = bulletin.recipientEmployees
        .map((e) => `${e.firstName} ${e.lastName}`)
        .slice(0, 2)
        .join(', ');
      const extra =
        bulletin.recipientEmployees.length > 2
          ? ` +${bulletin.recipientEmployees.length - 2}`
          : '';
      return names + extra;
    }
    return bulletin.jobSite?.name ?? '—';
  }

  return (
    <DashboardLayout heroTitle="Safety Bulletins" heroImage={BRAND_HERO_IMAGES.inner}>
      <BrandPageTitle
        title="Safety Bulletins"
        description="Send safety notices to employees"
        action={<div className="flex flex-wrap gap-2"><Button variant="primary" onClick={() => { setSelectedLibraryTip(orderedTips[0] ?? null); setTipLibraryOpen(true); }}>View all safety tips</Button><Button icon="plus" onClick={() => setModalOpen(true)}>Create Bulletin</Button></div>}
      />

      <section className="mb-6 rounded-xl border border-blue-200 bg-blue-50 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Weekly automatic safety tip</h2>
            <p className="mt-1 text-sm text-slate-700">Sends the tip at the current calendar week’s position in your saved 1–52 order to active workers with mobile app accounts. Push alerts follow your company push settings. Manual sends do not change the weekly sequence.</p>
          </div>
          <label className="flex items-center gap-2 font-semibold">
            <input type="checkbox" checked={scheduleEnabled} onChange={(event) => setScheduleEnabled(event.target.checked)} disabled={scheduleQuery.isPending || scheduleMutation.isPending || (!scheduleEnabled && safetyTips.some((tip) => tip.isPlaceholder))} />
            Enable weekly sending
          </label>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <FormField label="Send day">
            <Select value={scheduleWeekday} onChange={(event) => setScheduleWeekday(Number(event.target.value))} className={portalFormFieldClassName} disabled={scheduleMutation.isPending}>
              {weekdays.map((day) => <option key={day.value} value={day.value}>{day.label}</option>)}
            </Select>
          </FormField>
          <FormField label="Send time">
            <Input type="time" value={scheduleTime} onChange={(event) => setScheduleTime(event.target.value)} className={portalFormFieldClassName} disabled={scheduleMutation.isPending} />
          </FormField>
          <FormField label="Timezone">
            <Select value={scheduleTimezone} onChange={(event) => setScheduleTimezone(event.target.value)} className={portalFormFieldClassName} disabled={scheduleMutation.isPending}>
              {tipTimezones.map((timezone) => <option key={timezone.value} value={timezone.value}>{timezone.label}</option>)}
            </Select>
          </FormField>
        </div>
        {safetyTips.some((tip) => tip.isSample) ? <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Weekly sending is scheduled, but these are temporary sample tips and will not be delivered. Replace them with approved safety guidance before automatic delivery begins.</p> : null}
        {scheduleQuery.error ? <p role="alert" className="mt-3 text-sm text-red-700">Could not load weekly schedule: {scheduleQuery.error.message}</p> : null}
        {scheduleMutation.error ? <p role="alert" className="mt-3 text-sm text-red-700">Could not save weekly schedule: {scheduleMutation.error.message}</p> : null}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button type="button" onClick={() => scheduleMutation.mutate()} loading={scheduleMutation.isPending} disabled={scheduleQuery.isPending || (scheduleEnabled && safetyTips.some((tip) => tip.isPlaceholder) && !scheduleQuery.data?.enabled)}>Save weekly schedule</Button>
          {scheduleMutation.isSuccess ? <span className="text-sm font-semibold text-emerald-800">Schedule saved.</span> : null}
        </div>
        {runsQuery.data?.length ? <div className="mt-5 border-t border-blue-200 pt-4">
          <h3 className="font-semibold">Recent automatic sends</h3>
          <ul className="mt-2 space-y-1 text-sm text-slate-700">{runsQuery.data.slice(0, 3).map((run) => <li key={run.id}>Week {run.isoWeek}, {run.isoYear} · Tip {run.tipNumber} · {run.status.toLowerCase()} · {run.recipientsCount} recipients{run.errorMessage ? ` · ${run.errorMessage}` : ''}</li>)}</ul>
        </div> : null}
      </section>

      {data && data.length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3">
          <PortalSummaryStat label="Total bulletins" value={stats.total} icon={<IconShield className="h-5 w-5" />} />
          <PortalSummaryStat
            label="Sent"
            value={stats.sent}
            icon={<IconBell className="h-5 w-5" />}
            accent="green"
          />
          <PortalSummaryStat
            label="Draft"
            value={stats.draft}
            icon={<IconShield className="h-5 w-5" />}
            accent="slate"
          />
        </div>
      )}

      {isLoading && <LoadingState />}
      {!isLoading && data?.length === 0 && (
        <EmptyState title="No safety bulletins" description="Create and send safety notices to your workforce." />
      )}
      {data && data.length > 0 && (
        <PortalRecordsPanel title="Safety bulletins" count={data.length} countLabel="bulletins">
          <Table hasActions>
            <thead>
              <tr>
                <Th>Bulletin</Th>
                <Th>Audience</Th>
                <Th>Target</Th>
                <Th>Status</Th>
                <ThActions />
              </tr>
            </thead>
            <tbody>
              {data.map((bulletin) => (
                <tr key={bulletin.id}>
                  <Td>
                    <TitleCell
                      title={bulletin.title}
                      subtitle={bulletin.message.slice(0, 80) + (bulletin.message.length > 80 ? '…' : '')}
                    />
                  </Td>
                  <Td>{bulletin.audience.replace(/_/g, ' ')}</Td>
                  <Td>{formatRecipients(bulletin)}</Td>
                  <Td>
                    {bulletin.sentAt ? (
                      <Badge status="SENT" className="rounded-full normal-case" />
                    ) : (
                      <Badge status="DRAFT" className="rounded-full normal-case" />
                    )}
                  </Td>
                  <Td>
                    {!bulletin.sentAt && (
                      <ActionCell>
                        <Button
                          size="sm"
                          variant="softPrimary"
                          icon="send"
                          onClick={() => sendMutation.mutate(bulletin.id)}
                          loading={sendMutation.isPending}
                        >
                          Send
                        </Button>
                      </ActionCell>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </PortalRecordsPanel>
      )}

      <Modal
        open={tipLibraryOpen}
        onClose={() => setTipLibraryOpen(false)}
        title="Safety tip library"
        subtitle="Arrange the weekly delivery order and preview each safety tip."
        icon="shield"
        tone="success"
        size="2xl"
        fullScreen
        contentClassName="flex flex-col overflow-hidden"
      >
        <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(15rem,0.85fr)_minmax(0,1.15fr)] overflow-hidden rounded-xl border border-slate-200 bg-white md:grid-cols-[minmax(17rem,0.72fr)_minmax(0,1.6fr)] md:grid-rows-1">
          <section className="flex min-h-0 flex-col border-b border-blue-200 md:border-b-0 md:border-r" aria-label="Safety tip sequence">
            <div className="shrink-0 space-y-3 border-b border-slate-200 bg-white p-3 sm:p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-slate-900">Weekly order</h3>
                  <p className="mt-0.5 text-xs text-slate-600">Drag a tip or use the arrows to reorder.</p>
                </div>
                <Button type="button" size="sm" onClick={() => tipOrderMutation.mutate()} disabled={!hasUnsavedTipOrder || tipOrderMutation.isPending || scheduleQuery.isLoading} loading={tipOrderMutation.isPending}>{hasUnsavedTipOrder ? 'Save order' : 'Saved'}</Button>
              </div>
              <Input value={tipSearch} onChange={(event) => setTipSearch(event.target.value)} placeholder="Find by tip name or number…" aria-label="Search safety tips" className="h-9 bg-white text-sm" />
              <div className="flex min-h-4 items-center justify-between gap-2 text-xs">
                <span className="text-slate-500">{filteredOrderedTips.length} of 52 tips</span>
                {hasUnsavedTipOrder ? <span className="font-medium text-amber-700">Unsaved changes</span> : tipOrderMutation.isSuccess ? <span role="status" className="font-medium text-emerald-700">Order saved</span> : null}
              </div>
              {tipOrderMutation.error ? <p role="alert" className="text-xs text-red-700">Could not save: {tipOrderMutation.error.message}</p> : null}
            </div>
            <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto bg-slate-50/80 p-2.5" role="list" aria-label="Tips in weekly send order">
              {filteredOrderedTips.map((tip) => {
                const index = orderedTips.findIndex((item) => item.week === tip.week);
                const selected = selectedLibraryTip?.week === tip.week;
                return (
                  <div
                    key={tip.week}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = 'move';
                      event.dataTransfer.setData('text/plain', String(tip.week));
                      setDraggingTipWeek(tip.week);
                      event.currentTarget.classList.add('is-dragging-tip');
                      const dragPreview = event.currentTarget.cloneNode(true) as HTMLElement;
                      const bounds = event.currentTarget.getBoundingClientRect();
                      dragPreview.dataset.tipDragPreview = 'true';
                      Object.assign(dragPreview.style, {
                        position: 'fixed',
                        top: '-1000px',
                        left: '-1000px',
                        width: `${bounds.width}px`,
                        opacity: '1',
                        background: '#eff6ff',
                        border: '1px solid #3b82f6',
                        boxShadow: '0 12px 24px rgba(15, 23, 42, 0.2)',
                        pointerEvents: 'none',
                      });
                      document.body.appendChild(dragPreview);
                      event.dataTransfer.setDragImage(dragPreview, Math.min(event.clientX - bounds.left, bounds.width), Math.min(event.clientY - bounds.top, bounds.height));
                    }}
                    onDragEnd={(event) => {
                      event.currentTarget.classList.remove('is-dragging-tip');
                      document.querySelector('[data-tip-drag-preview="true"]')?.remove();
                      setDraggingTipWeek(null);
                    }}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => { event.preventDefault(); moveTipBefore(Number(event.dataTransfer.getData('text/plain')), tip.week); }}
                    role="listitem"
                    className={`group flex cursor-grab items-center gap-1 rounded-xl border p-1.5 shadow-sm transition duration-150 active:cursor-grabbing ${draggingTipWeek === tip.week ? 'relative z-10 scale-[1.02] border-blue-500 bg-blue-50 shadow-lg ring-2 ring-blue-300' : selected ? 'border-blue-500 bg-white shadow-[0_0_0_2px_rgba(59,130,246,0.14)]' : 'border-slate-200 bg-white hover:border-blue-300 hover:shadow-md'}`}
                  >
                    <button
                      type="button"
                      onClick={() => { setSelectedLibraryTip(tip); setManualTipWeek(null); setManualTipEmployeeId(''); manualTipSendMutation.reset(); }}
                      aria-current={selected ? 'true' : undefined}
                      aria-label={`Show send order ${index + 1}: ${tip.title}`}
                      className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold tabular-nums transition-colors ${selected ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-700 group-hover:bg-blue-50 group-hover:text-blue-800'}`}>{String(index + 1).padStart(2, '0')}</span>
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-sm font-semibold ${selected ? 'text-blue-950' : 'text-slate-800'}`}>{tip.title}</span>
                        <span className="mt-0.5 block text-[11px] text-slate-500">Tip ID {String(tip.week).padStart(2, '0')}</span>
                      </span>
                    </button>
                    <div className="flex shrink-0 flex-col gap-0.5 rounded-lg bg-slate-50 p-0.5 opacity-70 transition group-hover:opacity-100">
                      <button type="button" aria-label={`Move ${tip.title} earlier`} title="Move earlier" disabled={index === 0 || tipOrderMutation.isPending} onClick={() => { moveTip(tip.week, -1); tipOrderMutation.reset(); }} className="h-6 w-7 rounded-md text-sm font-semibold text-slate-500 hover:bg-white hover:text-blue-700 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-30">↑</button>
                      <button type="button" aria-label={`Move ${tip.title} later`} title="Move later" disabled={index === orderedTips.length - 1 || tipOrderMutation.isPending} onClick={() => { moveTip(tip.week, 1); tipOrderMutation.reset(); }} className="h-6 w-7 rounded-md text-sm font-semibold text-slate-500 hover:bg-white hover:text-blue-700 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-30">↓</button>
                    </div>
                  </div>
                );
              })}
              {filteredOrderedTips.length === 0 ? <p className="px-3 py-8 text-center text-sm text-slate-500">No tips match “{tipSearch}”.</p> : null}
            </div>
          </section>

          <section className="flex min-h-0 flex-col" aria-label="Selected safety tip details">
            {selectedLibraryTip ? (
              <>
                <header className="shrink-0 border-b border-slate-200 bg-white px-5 py-4 sm:px-8 sm:py-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-blue-700">Weekly position {String(tipOrder.indexOf(selectedLibraryTip.week) + 1).padStart(2, '0')} / 52</span>
                        <span className="text-xs text-slate-500">Preview</span>
                      </div>
                      <h3 className="mt-2 break-words text-xl font-bold tracking-tight text-slate-900">{selectedLibraryTip.title}</h3>
                    </div>
                    <span className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600">Library ID {String(selectedLibraryTip.week).padStart(2, '0')}</span>
                  </div>
                  {selectedLibraryTip.isSample ? <p className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-5 text-amber-900"><span aria-hidden="true">⚠</span><span><strong>Sample content.</strong> Replace it with approved safety guidance before sending.</span></p> : null}
                </header>
                <article className="min-h-0 flex-1 overflow-y-auto bg-slate-100/70 px-4 py-5 sm:px-8 sm:py-7">
                  <div className="mx-auto max-w-4xl rounded-2xl border border-slate-200/80 bg-white px-5 py-6 shadow-sm sm:px-9 sm:py-8">
                    <p className="whitespace-pre-wrap break-words text-[15px] leading-8 text-slate-700">{selectedLibraryTip.message}</p>
                  </div>
                </article>
                <footer className="shrink-0 border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
                  <Button
                    type="button"
                    size="sm"
                    variant="softPrimary"
                    disabled={selectedLibraryTip.isPlaceholder || !employees?.length || manualTipSendMutation.isPending}
                    onClick={() => {
                      setManualTipWeek((current) => current === selectedLibraryTip.week ? null : selectedLibraryTip.week);
                      setManualTipEmployeeId('');
                      manualTipSendMutation.reset();
                    }}
                  >Send to a worker</Button>
                  {manualTipWeek === selectedLibraryTip.week ? (
                    <div className="mt-3 space-y-3 rounded-lg border border-blue-200 bg-blue-50/60 p-3">
                      <p className="text-xs text-slate-600">Choose one active worker to receive this tip in the mobile app.</p>
                      <Select value={manualTipEmployeeId} onChange={(event) => setManualTipEmployeeId(event.target.value)} className={portalFormFieldClassName} disabled={manualTipSendMutation.isPending}>
                        <option value="">Choose a worker</option>
                        {employees?.map((employee) => <option key={employee.id} value={employee.id}>{employee.firstName} {employee.lastName}</option>)}
                      </Select>
                      {manualTipSendMutation.error ? <p role="alert" className="text-sm text-red-700">Could not send tip: {manualTipSendMutation.error.message}</p> : null}
                      {manualTipSendMutation.isSuccess ? <p role="status" className="text-sm font-semibold text-emerald-800">Tip sent to {employees?.find((employee) => employee.id === manualTipEmployeeId)?.firstName} {employees?.find((employee) => employee.id === manualTipEmployeeId)?.lastName}.</p> : null}
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" size="sm" onClick={() => manualTipSendMutation.mutate({ week: selectedLibraryTip.week, employeeId: manualTipEmployeeId })} disabled={!manualTipEmployeeId || manualTipSendMutation.isSuccess} loading={manualTipSendMutation.isPending}>{manualTipSendMutation.isSuccess ? 'Sent' : 'Send tip'}</Button>
                        <Button type="button" size="sm" variant="secondary" disabled={manualTipSendMutation.isPending} onClick={() => { setManualTipWeek(null); setManualTipEmployeeId(''); manualTipSendMutation.reset(); }}>Cancel</Button>
                      </div>
                    </div>
                  ) : null}
                </footer>
              </>
            ) : <div className="flex flex-1 items-center justify-center p-8 text-sm text-slate-500">Select a tip on the left to preview its details.</div>}
          </section>
        </div>
      </Modal>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Create Safety Bulletin"
        subtitle="Draft a safety notice for your workforce"
        icon="bell"
        tone="success"
        size="lg"
      >
        <form
          className="space-y-4"
          onSubmit={form.handleSubmit((values) => createMutation.mutate(values))}
        >
          <FormField label="Choose from tip library (optional)">
            <Select value={selectedTipWeek} onChange={(event) => {
              const selected = safetyTips.find((tip) => String(tip.week) === event.target.value);
              setSelectedTipWeek(event.target.value);
              if (selected) {
                form.setValue('title', selected.title, { shouldValidate: true });
                form.setValue('message', selected.message, { shouldValidate: true });
              }
            }} className={portalFormFieldClassName}>
              <option value="">Write a custom bulletin</option>
              {orderedTips.map((tip, index) => <option key={tip.week} value={tip.week}>Send order {index + 1}: {tip.title}</option>)}
            </Select>
          </FormField>
          {selectedTipWeek && safetyTips.find((tip) => String(tip.week) === selectedTipWeek)?.isPlaceholder ? <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">This is placeholder text. Replace it with approved safety guidance before creating or sending the bulletin.</p> : null}
          <FormField label="Title">
            <Input {...form.register('title')} className={portalFormFieldClassName} />
          </FormField>
          <FormField label="Message">
            <Textarea {...form.register('message')} rows={4} className={portalFormFieldClassName} />
          </FormField>
          <FormField label="Audience">
            <Select
              {...form.register('audience')}
              onChange={(e) => {
                form.setValue('audience', e.target.value as SafetyAudience, { shouldValidate: true });
                form.setValue('jobSiteId', '');
                form.setValue('employeeIds', []);
              }}
              className={portalFormFieldClassName}
            >
              {Object.values(SafetyAudience).map((a) => (
                <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>
              ))}
            </Select>
          </FormField>
          {audience === SafetyAudience.SPECIFIC_JOB_SITE && (
            <FormField label="Job Site">
              <Select {...form.register('jobSiteId')} className={portalFormFieldClassName}>
                <option value="">Select job site</option>
                {jobSites?.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
            </FormField>
          )}
          {audience === SafetyAudience.SPECIFIC_WORKERS && (
            <FormField label="Workers">
              <div className="max-h-48 space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-white p-3">
                {employees?.map((emp) => (
                  <label key={emp.id} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={employeeIds.includes(emp.id)}
                      onChange={() => toggleEmployee(emp.id)}
                      className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                    />
                    {emp.firstName} {emp.lastName}
                  </label>
                ))}
                {!employees?.length ? (
                  <p className="text-sm text-slate-500">No active employees found.</p>
                ) : null}
              </div>
            </FormField>
          )}
          <ModalFooter>
            <Button variant="secondary" icon="cancel" type="button" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              icon="save"
              loading={createMutation.isPending}
              disabled={!canCreate}
            >
              Create
            </Button>
          </ModalFooter>
        </form>
      </Modal>
    </DashboardLayout>
  );
}
