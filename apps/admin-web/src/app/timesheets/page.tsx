'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createTimesheetSchema, signTimesheetSchema, type CreateTimesheetInput, type SignTimesheetInput } from '@mc-labor/shared';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { BrandPageTitle } from '@/components/brand';
import { BRAND_HERO_IMAGES } from '@/lib/navigation';
import {
  PortalFilterPanel,
  PortalRecordsPanel,
  PortalSummaryStat,
  portalFieldClassName,
  portalFormFieldClassName,
  PersonCell,
  HoursCell,
  ActionCell,
} from '@/components/portal';
import { IconClipboard, IconClock, IconUsers } from '@/components/dashboard';
import { SignaturePad } from '@/components/ui/SignaturePad';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { FormField } from '@/components/ui/FormField';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { Table, Th, Td, ThActions } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { LoadingState } from '@/components/ui/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { api, type Timesheet } from '@/lib/api-client';
import { formatEmployeeName } from '@/lib/portal-stats';
import { downloadCsv } from '@/lib/export-csv';

function addIsoDays(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function getTimesheetDays(timesheet: Timesheet | null) {
  if (!timesheet) return [];
  const existingByDate = new Map(
    (timesheet.entries ?? []).map((entry) => [entry.workDate, entry]),
  );
  const dates =
    timesheet.weekStartDate && timesheet.weekEndDate
      ? Array.from({ length: 7 }, (_, index) => addIsoDays(timesheet.weekStartDate!, index)).filter(
          (date) => date <= timesheet.weekEndDate!,
        )
      : timesheet.workDate
        ? [timesheet.workDate]
        : [...existingByDate.keys()].sort();

  return dates.map((workDate) => {
    const entry = existingByDate.get(workDate);
    return {
      id: entry?.id,
      workDate,
      startTime: entry?.startTime ?? '',
      endTime: entry?.endTime ?? '',
      hours: Number(entry?.hours ?? 0),
      hasEntry: Boolean(entry),
    };
  });
}

export default function TimesheetsPage() {
  const [customerId, setCustomerId] = useState('');
  const [status, setStatus] = useState('');
  const [pendingCustomerId, setPendingCustomerId] = useState('');
  const [pendingStatus, setPendingStatus] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [rollupOpen, setRollupOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [manualChooserGroup, setManualChooserGroup] = useState<Timesheet[]>([]);
  const [signOpen, setSignOpen] = useState(false);
  const [selected, setSelected] = useState<Timesheet | null>(null);
  const [editPinOpen, setEditPinOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editPin, setEditPin] = useState('');
  const [editHours, setEditHours] = useState<Record<string, string>>({});
  const [editError, setEditError] = useState('');
  const [selectedTimesheetIds, setSelectedTimesheetIds] = useState<string[]>([]);
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [deliveryError, setDeliveryError] = useState('');
  const [deliveryResult, setDeliveryResult] = useState('');
  const [rollupEmployeeId, setRollupEmployeeId] = useState('');
  const [rollupCustomerId, setRollupCustomerId] = useState('');
  const [rollupJobSiteId, setRollupJobSiteId] = useState('');
  const [rollupWeekStart, setRollupWeekStart] = useState('');
  const [rollupWeekEnd, setRollupWeekEnd] = useState('');
  const queryClient = useQueryClient();

  const filters = useMemo(
    () => ({
      ...(customerId && { customerId }),
      ...(status && { status }),
    }),
    [customerId, status],
  );

  const { data: customers } = useQuery({
    queryKey: ['customers', 'ACTIVE'],
    queryFn: () => api.getCustomers({ status: 'ACTIVE' }),
  });

  const { data: employees } = useQuery({
    queryKey: ['employees'],
    queryFn: () => api.getEmployees({ status: 'ACTIVE' }),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['timesheets', filters],
    queryFn: () => api.getTimesheets(filters),
  });

  const regularTimesheets = useMemo(
    () => (data ?? []).filter((timesheet) => !timesheet.isStandaloneManual),
    [data],
  );
  const manualTimesheetGroups = useMemo(() => {
    const groups = new Map<string, Timesheet[]>();
    (data ?? [])
      .filter(
        (timesheet) =>
          timesheet.isStandaloneManual &&
          ['SUBMITTED', 'SENT', 'APPROVED'].includes(timesheet.status),
      )
      .forEach((timesheet) => {
        const key = [
          timesheet.employeeId,
          timesheet.customerId,
          timesheet.jobSiteId,
          timesheet.weekStartDate ?? timesheet.workDate ?? '',
          timesheet.weekEndDate ?? '',
        ].join(':');
        groups.set(key, [...(groups.get(key) ?? []), timesheet]);
      });
    return [...groups.values()].map((timesheets) => ({
      timesheets: [...timesheets].sort((left, right) =>
        (right.createdAt ?? '').localeCompare(left.createdAt ?? ''),
      ),
      totalHours: timesheets.reduce(
        (total, timesheet) => total + Number(timesheet.totalHours ?? 0),
        0,
      ),
    }));
  }, [data]);

  const stats = useMemo(() => {
    const sheets = manualMode
      ? manualTimesheetGroups.flatMap((group) => group.timesheets)
      : regularTimesheets;
    return {
      total: sheets.length,
      received: sheets.filter((t) =>
        ['SUBMITTED', 'SIGNED', 'SENT', 'APPROVED'].includes(t.status),
      ).length,
      draft: sheets.filter((t) => t.status === 'DRAFT').length,
      totalHours: sheets.reduce((sum, t) => sum + Number(t.totalHours || 0), 0).toFixed(1),
    };
  }, [manualMode, manualTimesheetGroups, regularTimesheets]);

  const editedTotalHours = useMemo(
    () =>
      Object.values(editHours).reduce((sum, value) => {
        const hours = Number(value);
        return sum + (Number.isFinite(hours) ? hours : 0);
      }, 0),
    [editHours],
  );
  const editableDays = useMemo(() => getTimesheetDays(selected), [selected]);
  const selectedTimesheets = useMemo(
    () => (data ?? []).filter((timesheet) => selectedTimesheetIds.includes(timesheet.id)),
    [data, selectedTimesheetIds],
  );
  const selectedCustomerId = selectedTimesheets[0]?.customerId ?? '';
  const selectedCustomer = customers?.find((customer) => customer.id === selectedCustomerId);

  function exportTimesheets() {
    const exportRows = manualMode
      ? manualTimesheetGroups.flatMap((group) => group.timesheets)
      : regularTimesheets;
    if (!exportRows.length) return;
    downloadCsv(
      `timesheets-${status || 'all'}.csv`,
      ['Employee', 'Customer', 'Job Site', 'Hours', 'Foreman', 'Status', 'Sent To', 'Sent At', 'Sent By'],
      exportRows.map((ts) => [
        formatEmployeeName(ts.employee),
        ts.customer?.companyName ?? '',
        ts.jobSite?.name ?? '',
        String(ts.totalHours ?? ''),
        ts.signature?.foremanName ?? '',
        ts.status,
        ts.deliveries?.[0]?.recipientEmail ?? '',
        ts.deliveries?.[0]?.sentAt ?? '',
        ts.deliveries?.[0]?.sentBy?.name ?? '',
      ]),
    );
  }

  const form = useForm<CreateTimesheetInput>({
    resolver: zodResolver(createTimesheetSchema),
    defaultValues: {
      employeeId: '',
      customerId: '',
      jobSiteId: '',
      totalHours: 40,
    },
  });

  const signForm = useForm<SignTimesheetInput>({
    resolver: zodResolver(signTimesheetSchema),
    defaultValues: { foremanName: '', foremanEmail: '', signatureDataUrl: '' },
  });

  const watchCustomerId = form.watch('customerId');

  const { data: jobSites } = useQuery({
    queryKey: ['job-sites', watchCustomerId],
    queryFn: () => api.getJobSites({ customerId: watchCustomerId }),
    enabled: !!watchCustomerId,
  });

  const { data: rollupJobSites } = useQuery({
    queryKey: ['job-sites', rollupCustomerId],
    queryFn: () => api.getJobSites({ customerId: rollupCustomerId }),
    enabled: !!rollupCustomerId,
  });

  const createMutation = useMutation({
    mutationFn: (values: CreateTimesheetInput) => api.createTimesheet(values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timesheets'] });
      setModalOpen(false);
    },
  });

  const signMutation = useMutation({
    mutationFn: (values: SignTimesheetInput) =>
      api.signTimesheet(selected!.id, {
        foremanName: values.foremanName,
        foremanEmail: values.foremanEmail || undefined,
        signatureDataUrl: values.signatureDataUrl,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timesheets'] });
      setSignOpen(false);
      setDetailOpen(false);
      signForm.reset();
    },
  });

  const markSentMutation = useMutation({
    mutationFn: (flags: { sentToCustomerOffice?: boolean; sentToMcLaborOffice?: boolean }) =>
      api.markTimesheetSent(selected!.id, flags),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['timesheets'] });
      if (selected) {
        const updated = await api.getTimesheet(selected.id);
        setSelected(updated);
      }
    },
  });

  const unlockEditMutation = useMutation({
    mutationFn: () => api.verifyTimesheetEditPin(selected!.id, editPin),
    onSuccess: () => {
      setEditHours(
        Object.fromEntries(
          editableDays.map((day) => [day.workDate, String(day.hours)]),
        ),
      );
      setEditError('');
      setEditPinOpen(false);
      setEditMode(true);
    },
    onError: (error) => {
      setEditError(error instanceof Error ? error.message : 'Incorrect edit PIN');
    },
  });

  const saveHoursMutation = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error('No timesheet selected');
      const entries = editableDays.map((day) => ({
        id: day.id,
        workDate: day.workDate,
        hours: Number(editHours[day.workDate]),
      }));
      const invalid = entries.find(
        (entry) =>
          !Number.isFinite(entry.hours) ||
          entry.hours < 0 ||
          entry.hours > 24 ||
          Math.round(entry.hours * 4) !== entry.hours * 4,
      );
      if (invalid) {
        throw new Error('Hours must be between 0 and 24 in 15-minute increments.');
      }
      return api.updateTimesheetEntryHours(selected.id, editPin, entries);
    },
    onSuccess: (updated) => {
      setSelected(updated);
      setEditMode(false);
      setEditPin('');
      setEditHours({});
      setEditError('');
      queryClient.invalidateQueries({ queryKey: ['timesheets'] });
    },
    onError: (error) => {
      setEditError(error instanceof Error ? error.message : 'Failed to update hours');
    },
  });

  const deliverMutation = useMutation({
    mutationFn: () => api.deliverTimesheetsToCustomer(selectedTimesheetIds),
    onSuccess: (result) => {
      setDeliveryError('');
      setDeliveryResult(
        `${result.timesheetsSent} timesheet${result.timesheetsSent === 1 ? '' : 's'} sent to ${result.recipientEmail}.`,
      );
      queryClient.invalidateQueries({ queryKey: ['timesheets'] });
    },
    onError: (error) => {
      setDeliveryError(error instanceof Error ? error.message : 'Failed to send timesheets');
    },
  });

  const rollupMutation = useMutation({
    mutationFn: () =>
      api.rollupWeeklyTimesheet({
        employeeId: rollupEmployeeId,
        customerId: rollupCustomerId,
        jobSiteId: rollupJobSiteId,
        weekStart: rollupWeekStart,
        weekEnd: rollupWeekEnd,
      }),
    onSuccess: async (ts) => {
      queryClient.invalidateQueries({ queryKey: ['timesheets'] });
      setRollupOpen(false);
      setSelected(ts);
      setDetailOpen(true);
    },
  });

  async function openDetail(ts: Timesheet) {
    const full = await api.getTimesheet(ts.id);
    setSelected(full);
    setEditMode(false);
    setEditPin('');
    setEditHours({});
    setEditError('');
    setDetailOpen(true);
  }

  return (
    <DashboardLayout heroTitle="Timesheets" heroImage={BRAND_HERO_IMAGES.timesheets}>
      <BrandPageTitle
        title="Timesheets"
        description="View and manage employee timesheets"
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              variant={manualMode ? 'primary' : 'secondary'}
              icon="clipboard"
              onClick={() => {
                setManualMode((current) => !current);
                setSelectedTimesheetIds([]);
              }}
            >
              {manualMode ? 'Regular Timesheets' : 'Manual Timesheets'}
            </Button>
            <Button variant="secondary" icon="calendar" onClick={() => setRollupOpen(true)}>
              Generate from Attendance
            </Button>
            <Button icon="plus" onClick={() => setModalOpen(true)}>Add Timesheet</Button>
          </div>
        }
      />

      {data && data.length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <PortalSummaryStat label="Total timesheets" value={stats.total} icon={<IconClipboard className="h-5 w-5" />} />
          <PortalSummaryStat
            label="Received / sent"
            value={stats.received}
            icon={<IconUsers className="h-5 w-5" />}
            accent="green"
          />
          <PortalSummaryStat
            label="Draft"
            value={stats.draft}
            icon={<IconClock className="h-5 w-5" />}
            accent="slate"
          />
          <PortalSummaryStat
            label="Total hours"
            value={stats.totalHours}
            icon={<IconClock className="h-5 w-5" />}
            accent="amber"
          />
        </div>
      )}

      <PortalFilterPanel>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <FormField label="Customer">
            <Select
              value={pendingCustomerId}
              onChange={(e) => setPendingCustomerId(e.target.value)}
              className={portalFieldClassName}
            >
              <option value="">All customers</option>
              {customers?.map((c) => (
                <option key={c.id} value={c.id}>{c.companyName}</option>
              ))}
            </Select>
          </FormField>
          <FormField label="Status">
            <Select
              value={pendingStatus}
              onChange={(e) => setPendingStatus(e.target.value)}
              className={portalFieldClassName}
            >
              <option value="">All statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="SIGNED">Signed</option>
              <option value="SENT">Sent</option>
            </Select>
          </FormField>
          <div className="flex items-end">
            <div className="flex w-full gap-2">
              <Button
                className="flex-1"
                onClick={() => {
                  setCustomerId(pendingCustomerId);
                  setStatus(pendingStatus);
                  setSelectedTimesheetIds([]);
                }}
              >
                Filter
              </Button>
              {(customerId || status || pendingCustomerId || pendingStatus) && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setPendingCustomerId('');
                    setPendingStatus('');
                    setCustomerId('');
                    setStatus('');
                    setSelectedTimesheetIds([]);
                  }}
                >
                  Clear
                </Button>
              )}
            </div>
          </div>
          <div className="flex items-end">
            <Button
              variant="secondary"
              icon="download"
              disabled={manualMode ? manualTimesheetGroups.length === 0 : regularTimesheets.length === 0}
              onClick={exportTimesheets}
            >
              Export CSV
            </Button>
          </div>
        </div>
      </PortalFilterPanel>

      {selectedTimesheetIds.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-slate-800">
              {selectedTimesheetIds.length} timesheet{selectedTimesheetIds.length === 1 ? '' : 's'} selected
            </p>
            <p className="text-xs text-slate-500">
              {selectedTimesheets[0]?.customer?.companyName ?? 'Customer'} · One grouped email
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon="cancel"
              onClick={() => setSelectedTimesheetIds([])}
            >
              Clear
            </Button>
            <Button
              size="sm"
              icon="send"
              onClick={() => {
                setDeliveryError('');
                setDeliveryResult('');
                setDeliveryOpen(true);
              }}
            >
              Send to Customer
            </Button>
          </div>
        </div>
      )}

      {isLoading && <LoadingState />}
      {!isLoading && (manualMode ? manualTimesheetGroups.length === 0 : regularTimesheets.length === 0) && (
        <EmptyState
          title={manualMode ? 'No submitted manual timesheets' : 'No timesheets found'}
          description={
            manualMode
              ? 'Employee-created manual timesheets will appear here after submission.'
              : 'Create a timesheet for an employee and job site.'
          }
        />
      )}
      {manualMode && manualTimesheetGroups.length > 0 && (
        <PortalRecordsPanel
          title="Manual timesheet records"
          count={manualTimesheetGroups.length}
          countLabel="groups"
        >
          <Table hasActions>
            <thead>
              <tr>
                <Th>Select</Th>
                <Th>Employee</Th>
                <Th>Job Site</Th>
                <Th>Hours</Th>
                <Th>Timesheets</Th>
                <Th>Status</Th>
                <Th>Customer Delivery</Th>
                <ThActions />
              </tr>
            </thead>
            <tbody>
              {manualTimesheetGroups.map((group) => {
                const representative = group.timesheets[0];
                const delivered = group.timesheets.filter((timesheet) => timesheet.deliveries?.length).length;
                const groupIds = group.timesheets.map((timesheet) => timesheet.id);
                const canSendGroup = group.timesheets.every(
                  (timesheet) =>
                    timesheet.status === 'SUBMITTED' &&
                    !timesheet.deliveries?.length &&
                    !timesheet.signature?.sentToCustomerOffice,
                );
                const wrongCustomer =
                  Boolean(selectedCustomerId) && representative.customerId !== selectedCustomerId;
                const groupSelected = groupIds.every((id) => selectedTimesheetIds.includes(id));
                return (
                  <tr
                    key={`${representative.employeeId}-${representative.customerId}-${representative.jobSiteId}-${representative.weekStartDate}`}
                  >
                    <Td>
                      <input
                        type="checkbox"
                        checked={groupSelected}
                        disabled={!canSendGroup || wrongCustomer}
                        title={
                          !canSendGroup
                            ? 'Every timesheet in this group must be submitted and not previously sent'
                            : wrongCustomer
                              ? 'Select manual timesheets for one customer at a time'
                              : `Select all ${group.timesheets.length} timesheets in this group`
                        }
                        onChange={(event) =>
                          setSelectedTimesheetIds((current) =>
                            event.target.checked
                              ? [...new Set([...current, ...groupIds])]
                              : current.filter((id) => !groupIds.includes(id)),
                          )
                        }
                        className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                        aria-label={`Select all manual timesheets for ${formatEmployeeName(representative.employee)}`}
                      />
                    </Td>
                    <Td><PersonCell name={formatEmployeeName(representative.employee)} /></Td>
                    <Td>{representative.jobSite?.name}</Td>
                    <Td><HoursCell value={group.totalHours.toFixed(2)} /></Td>
                    <Td>
                      <span className="font-semibold text-slate-700">
                        {group.timesheets.length} timesheet{group.timesheets.length === 1 ? '' : 's'}
                      </span>
                    </Td>
                    <Td><Badge status="SUBMITTED" className="rounded-full normal-case" /></Td>
                    <Td>
                      <span className="text-xs font-medium text-slate-500">
                        {delivered}/{group.timesheets.length} sent
                      </span>
                    </Td>
                    <Td>
                      <ActionCell>
                        <Button
                          size="sm"
                          variant="softPrimary"
                          icon="eye"
                          onClick={() => setManualChooserGroup(group.timesheets)}
                        >
                          Choose Timesheet
                        </Button>
                      </ActionCell>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </PortalRecordsPanel>
      )}
      {!manualMode && regularTimesheets.length > 0 && (
        <PortalRecordsPanel title="Timesheet records" count={regularTimesheets.length} countLabel="timesheets">
          <Table hasActions>
            <thead>
              <tr>
                <Th>Select</Th>
                <Th>Employee</Th>
                <Th>Job Site</Th>
                <Th>Hours</Th>
                <Th>Foreman</Th>
                <Th>Status</Th>
                <Th>Customer Delivery</Th>
                <ThActions />
              </tr>
            </thead>
            <tbody>
              {regularTimesheets.map((ts) => {
                const canSend =
                  (ts.status === 'SIGNED' || ts.status === 'SUBMITTED') &&
                  !ts.deliveries?.length &&
                  !ts.signature?.sentToCustomerOffice;
                const wrongCustomer =
                  Boolean(selectedCustomerId) && ts.customerId !== selectedCustomerId;
                const latestDelivery = ts.deliveries?.[0];
                return (
                <tr key={ts.id}>
                  <Td>
                    <input
                      type="checkbox"
                      checked={selectedTimesheetIds.includes(ts.id)}
                      disabled={!canSend || wrongCustomer}
                      title={
                        !canSend
                          ? 'Only unsent signed or submitted timesheets can be selected'
                          : wrongCustomer
                            ? 'Select timesheets for one customer at a time'
                            : undefined
                      }
                      onChange={(event) =>
                        setSelectedTimesheetIds((current) =>
                          event.target.checked
                            ? [...current, ts.id]
                            : current.filter((id) => id !== ts.id),
                        )
                      }
                      className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                      aria-label={`Select ${formatEmployeeName(ts.employee)} timesheet`}
                    />
                  </Td>
                  <Td>
                    <PersonCell
                      name={formatEmployeeName(ts.employee)}
                    />
                  </Td>
                  <Td>{ts.jobSite?.name}</Td>
                  <Td>
                    <HoursCell value={ts.totalHours} />
                  </Td>
                  <Td>{ts.signature?.foremanName ?? '—'}</Td>
                  <Td>
                    <Badge status={ts.status} className="rounded-full normal-case" />
                  </Td>
                  <Td>
                    {latestDelivery ? (
                      <div className="min-w-44 text-xs">
                        <p className="font-semibold text-emerald-700">
                          Sent {new Date(latestDelivery.sentAt).toLocaleString()}
                        </p>
                        <p className="mt-0.5 text-slate-600">{latestDelivery.recipientEmail}</p>
                        <p className="mt-0.5 text-gray-500">
                          by {latestDelivery.sentBy?.name ?? 'Administrator'}
                        </p>
                      </div>
                    ) : (
                      <span className="text-xs font-medium text-gray-500">Not sent</span>
                    )}
                  </Td>
                  <Td>
                    <ActionCell>
                      <Button
                        size="sm"
                        variant="softPrimary"
                        icon="eye"
                        onClick={() => openDetail(ts)}
                      >
                        View
                      </Button>
                    </ActionCell>
                  </Td>
                </tr>
                );
              })}
            </tbody>
          </Table>
        </PortalRecordsPanel>
      )}

      <Modal
        open={manualChooserGroup.length > 0}
        onClose={() => setManualChooserGroup([])}
        title="Choose Manual Timesheet"
        subtitle={
          manualChooserGroup[0]
            ? `${formatEmployeeName(manualChooserGroup[0].employee)} · ${manualChooserGroup[0].jobSite?.name ?? 'Manual job'}`
            : undefined
        }
        icon="clock"
        size="lg"
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Select which individual timesheet you want to open.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {manualChooserGroup.map((timesheet, index) => {
              const period =
                timesheet.weekStartDate && timesheet.weekEndDate
                  ? `${timesheet.weekStartDate} – ${timesheet.weekEndDate}`
                  : timesheet.workDate ?? 'No date';
              return (
                <button
                  key={timesheet.id}
                  type="button"
                  onClick={() => {
                    setManualChooserGroup([]);
                    void openDetail(timesheet);
                  }}
                  className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 text-left shadow-sm transition hover:border-primary hover:bg-blue-50 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <span className="block text-sm font-bold text-primary">Timesheet {index + 1}</span>
                  <span className="mt-2 block text-sm font-semibold text-slate-800">{period}</span>
                  <span className="mt-1 block text-xs text-slate-600">
                    {timesheet.totalHours}h · {timesheet.status}
                  </span>
                  {timesheet.createdAt ? (
                    <span className="mt-2 block text-[11px] text-slate-400">
                      Created {new Date(timesheet.createdAt).toLocaleString()}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
        <ModalFooter>
          <Button variant="secondary" icon="cancel" onClick={() => setManualChooserGroup([])}>
            Close
          </Button>
        </ModalFooter>
      </Modal>

      <Modal
        open={deliveryOpen}
        onClose={() => {
          if (!deliverMutation.isPending) setDeliveryOpen(false);
        }}
        title="Send Timesheets to Customer"
        subtitle="The selected timesheets will be combined into one email"
        icon="send"
        tone="success"
        size="lg"
      >
        <div className="space-y-4">
          {deliveryResult ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm font-medium text-emerald-800">
              {deliveryResult}
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-gray-100 bg-slate-50 p-4 text-sm">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Customer</p>
                    <p className="mt-1 font-semibold text-slate-800">
                      {selectedCustomer?.companyName ?? selectedTimesheets[0]?.customer?.companyName ?? '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Recipient</p>
                    <p className="mt-1 font-semibold text-slate-800">
                      {selectedCustomer?.officeEmail || 'No office email configured'}
                    </p>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-gray-100 bg-white p-4">
                <p className="mb-3 text-xs font-medium uppercase tracking-widest text-gray-500">
                  Timesheets in this email
                </p>
                <div className="divide-y divide-gray-100">
                  {selectedTimesheets.map((timesheet) => (
                    <div key={timesheet.id} className="flex items-center justify-between gap-4 py-2 text-sm">
                      <div>
                        <p className="font-semibold text-slate-800">
                          {formatEmployeeName(timesheet.employee)}
                        </p>
                        <p className="text-xs text-gray-500">
                          {timesheet.jobSite?.name ?? 'Job site'} ·{' '}
                          {timesheet.weekStartDate && timesheet.weekEndDate
                            ? `${timesheet.weekStartDate} – ${timesheet.weekEndDate}`
                            : timesheet.workDate ?? 'No period'}
                        </p>
                      </div>
                      <span className="font-semibold text-primary">{timesheet.totalHours}h</span>
                    </div>
                  ))}
                </div>
              </div>
              {!selectedCustomer?.officeEmail && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Add an office email to this customer before sending.
                </div>
              )}
              {deliveryError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {deliveryError}
                </div>
              )}
            </>
          )}
          <ModalFooter>
            {deliveryResult ? (
              <Button
                icon="check"
                onClick={() => {
                  setDeliveryOpen(false);
                  setSelectedTimesheetIds([]);
                  setDeliveryResult('');
                }}
              >
                Done
              </Button>
            ) : (
              <>
                <Button
                  variant="secondary"
                  icon="cancel"
                  disabled={deliverMutation.isPending}
                  onClick={() => setDeliveryOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  icon="send"
                  loading={deliverMutation.isPending}
                  disabled={!selectedTimesheetIds.length || !selectedCustomer?.officeEmail}
                  onClick={() => deliverMutation.mutate()}
                >
                  Send {selectedTimesheetIds.length} Timesheet{selectedTimesheetIds.length === 1 ? '' : 's'}
                </Button>
              </>
            )}
          </ModalFooter>
        </div>
      </Modal>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Add Timesheet"
        subtitle="Create a manual timesheet entry"
        icon="plus"
        tone="success"
        size="lg"
      >
        <form onSubmit={form.handleSubmit((v) => createMutation.mutate(v))} className="space-y-4">
          <FormField label="Employee" error={form.formState.errors.employeeId?.message}>
            <Select {...form.register('employeeId')} className={portalFormFieldClassName}>
              <option value="">Select employee</option>
              {employees?.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.firstName} {e.lastName}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Customer" error={form.formState.errors.customerId?.message}>
            <Select {...form.register('customerId')} className={portalFormFieldClassName}>
              <option value="">Select customer</option>
              {customers?.map((c) => (
                <option key={c.id} value={c.id}>{c.companyName}</option>
              ))}
            </Select>
          </FormField>
          <FormField label="Job Site" error={form.formState.errors.jobSiteId?.message}>
            <Select {...form.register('jobSiteId')} className={portalFormFieldClassName}>
              <option value="">Select job site</option>
              {jobSites?.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          </FormField>
          <FormField label="Total Hours" error={form.formState.errors.totalHours?.message}>
            <Input
              type="number"
              step="0.5"
              {...form.register('totalHours', { valueAsNumber: true })}
              className={portalFormFieldClassName}
            />
          </FormField>
          <FormField label="Work Date">
            <Input type="date" {...form.register('workDate')} className={portalFormFieldClassName} />
          </FormField>
          <ModalFooter>
            <Button type="button" variant="secondary" icon="cancel" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" icon="save" loading={createMutation.isPending}>Create</Button>
          </ModalFooter>
        </form>
      </Modal>

      <Modal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        title="Timesheet Detail"
        subtitle="Read-only review of the complete timesheet"
        icon="eye"
        size="lg"
      >
        {selected && (
          <div className="space-y-5">
            <div className="grid gap-3 rounded-xl border border-gray-100 bg-slate-50/80 p-4 text-sm sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Employee</p>
                <p className="mt-1 font-semibold text-slate-800">
                  {formatEmployeeName(selected.employee)}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Company</p>
                <p className="mt-1 font-semibold text-slate-800">
                  {selected.customer?.companyName ?? '—'}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Job site</p>
                <p className="mt-1 font-semibold text-slate-800">
                  {selected.jobSite?.name ?? '—'}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Period</p>
                <p className="mt-1 font-semibold text-slate-800">
                  {selected.weekStartDate && selected.weekEndDate
                    ? `${selected.weekStartDate} – ${selected.weekEndDate}`
                    : selected.workDate ?? '—'}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Total hours</p>
                <p className="mt-1 font-semibold text-primary">
                  {editMode ? editedTotalHours.toFixed(2) : selected.totalHours}h
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Status</p>
                <div className="mt-1">
                  <Badge status={selected.status} className="rounded-full normal-case" />
                </div>
              </div>
            </div>
            <div className="hidden">
              <span className="font-semibold">{formatEmployeeName(selected.employee)}</span>
              {' · '}
              {selected.jobSite?.name}
              {' · '}
              <span className="font-semibold text-primary">{selected.totalHours}h</span>
              {selected.weekStartDate && selected.weekEndDate ? (
                <span className="text-gray-500">
                  {' '}
                  · Week {selected.weekStartDate} – {selected.weekEndDate}
                </span>
              ) : selected.workDate ? (
                <span className="text-gray-500"> · {selected.workDate}</span>
              ) : null}
            </div>
            {editableDays.length > 0 && (
              <div className="rounded-xl border border-gray-100 bg-white p-4">
                <p className="mb-3 text-xs font-medium uppercase tracking-widest text-gray-500">
                  Time entries
                </p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500">
                      <th className="pb-2">Date</th>
                      <th className="pb-2">Start</th>
                      <th className="pb-2">End</th>
                      <th className="pb-2">Entry</th>
                      <th className="pb-2">Hours</th>
                    </tr>
                  </thead>
                  <tbody>
                    {editableDays.map((day) => (
                      <tr key={day.workDate} className="border-t border-gray-50">
                        <td className="py-2">{day.workDate}</td>
                        <td className="py-2">{day.startTime || '—'}</td>
                        <td className="py-2">{day.endTime || '—'}</td>
                        <td className="py-2 text-xs text-gray-500">
                          {day.hasEntry ? 'Recorded' : 'No logged time'}
                        </td>
                        <td className="py-2 font-medium">
                          {editMode ? (
                            <Input
                              type="number"
                              min="0"
                              max="24"
                              step="0.25"
                              value={editHours[day.workDate] ?? ''}
                              onChange={(event) =>
                                setEditHours((current) => ({
                                  ...current,
                                  [day.workDate]: event.target.value,
                                }))
                              }
                              className="w-24"
                              aria-label={`Hours for ${day.workDate}`}
                            />
                          ) : (
                            `${day.hours}h`
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {selected.notes && (
              <div className="rounded-xl border border-gray-100 bg-white p-4">
                <p className="mb-2 text-xs font-medium uppercase tracking-widest text-gray-500">
                  Notes
                </p>
                <p className="whitespace-pre-wrap text-sm text-slate-700">{selected.notes}</p>
              </div>
            )}
            {selected.signature && (
              <div className="grid gap-3 rounded-xl border border-gray-100 bg-white p-4 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-xs text-gray-500">Foreman</p>
                  <p className="font-semibold text-slate-800">{selected.signature.foremanName}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Signed</p>
                  <p className="font-semibold text-slate-800">
                    {selected.signature.signedAt
                      ? new Date(selected.signature.signedAt).toLocaleString()
                      : '—'}
                  </p>
                </div>
              </div>
            )}
            {selected.signature?.signatureImageUrl && (
              <div className="rounded-xl border border-gray-100 bg-white p-4">
                <p className="mb-2 text-xs font-medium uppercase tracking-widest text-gray-500">Signature</p>
                <img
                  src={selected.signature.signatureImageUrl}
                  alt="Signature"
                  className="max-h-32 rounded-lg border border-gray-100"
                />
              </div>
            )}
            <div className="rounded-xl border border-gray-100 bg-white p-4">
              <p className="mb-3 text-xs font-medium uppercase tracking-widest text-gray-500">
                Customer delivery history
              </p>
              {selected.deliveries?.length ? (
                <div className="divide-y divide-gray-100">
                  {selected.deliveries.map((delivery) => (
                    <div key={delivery.batchId} className="grid gap-2 py-3 text-sm sm:grid-cols-3">
                      <div>
                        <p className="text-xs text-gray-500">Sent to</p>
                        <p className="font-semibold text-slate-800">{delivery.recipientEmail}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Date and time</p>
                        <p className="font-semibold text-slate-800">
                          {new Date(delivery.sentAt).toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Sent by</p>
                        <p className="font-semibold text-slate-800">
                          {delivery.sentBy?.name ?? 'Administrator'}
                        </p>
                        {delivery.sentBy?.email && (
                          <p className="text-xs text-gray-500">{delivery.sentBy.email}</p>
                        )}
                      </div>
                      {delivery.timesheetCount > 1 && (
                        <p className="text-xs text-primary sm:col-span-3">
                          Sent as part of a batch containing {delivery.timesheetCount} timesheets.
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">This timesheet has not been sent to a customer.</p>
              )}
            </div>
            {editError && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {editError}
              </div>
            )}
            <ModalFooter>
              {editMode ? (
                <>
                  <Button
                    variant="secondary"
                    icon="cancel"
                    onClick={() => {
                      setEditMode(false);
                      setEditHours({});
                      setEditError('');
                    }}
                  >
                    Cancel Editing
                  </Button>
                  <Button
                    icon="save"
                    loading={saveHoursMutation.isPending}
                    onClick={() => saveHoursMutation.mutate()}
                  >
                    Save Changes
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="secondary" icon="cancel" onClick={() => setDetailOpen(false)}>
                    Close
                  </Button>
                  <Button
                    icon="edit"
                    disabled={!editableDays.length}
                    onClick={() => {
                      setEditPin('');
                      setEditError('');
                      setEditPinOpen(true);
                    }}
                  >
                    Edit Hours
                  </Button>
                </>
              )}
            </ModalFooter>
          </div>
        )}
      </Modal>

      <Modal
        open={editPinOpen}
        onClose={() => {
          if (!unlockEditMutation.isPending) setEditPinOpen(false);
        }}
        title="Unlock Timesheet Editing"
        subtitle="Enter the administrator PIN to edit employee hours"
        icon="lock"
        size="sm"
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            setEditError('');
            unlockEditMutation.mutate();
          }}
        >
          <FormField label="Administrator PIN">
            <Input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              value={editPin}
              onChange={(event) => {
                setEditPin(event.target.value.replace(/\D/g, '').slice(0, 4));
                setEditError('');
              }}
              autoFocus
              className={portalFormFieldClassName}
            />
          </FormField>
          {editError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {editError}
            </div>
          )}
          <ModalFooter>
            <Button
              type="button"
              variant="secondary"
              icon="cancel"
              disabled={unlockEditMutation.isPending}
              onClick={() => setEditPinOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              icon="lock"
              loading={unlockEditMutation.isPending}
              disabled={editPin.length !== 4}
            >
              Unlock Editing
            </Button>
          </ModalFooter>
        </form>
      </Modal>

      <Modal
        open={rollupOpen}
        onClose={() => setRollupOpen(false)}
        title="Generate from Attendance"
        subtitle="Roll up daily drafts into a weekly timesheet"
        icon="calendar"
        size="lg"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Roll up daily draft timesheets from attendance into a weekly timesheet.
          </p>
          <FormField label="Employee">
            <Select
              value={rollupEmployeeId}
              onChange={(e) => setRollupEmployeeId(e.target.value)}
              className={portalFormFieldClassName}
            >
              <option value="">Select employee</option>
              {employees?.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.firstName} {e.lastName}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Customer">
            <Select
              value={rollupCustomerId}
              onChange={(e) => {
                setRollupCustomerId(e.target.value);
                setRollupJobSiteId('');
              }}
              className={portalFormFieldClassName}
            >
              <option value="">Select customer</option>
              {customers?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.companyName}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Job Site">
            <Select
              value={rollupJobSiteId}
              onChange={(e) => setRollupJobSiteId(e.target.value)}
              className={portalFormFieldClassName}
            >
              <option value="">Select job site</option>
              {rollupJobSites?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Week start">
              <Input
                type="date"
                value={rollupWeekStart}
                onChange={(e) => setRollupWeekStart(e.target.value)}
                className={portalFormFieldClassName}
              />
            </FormField>
            <FormField label="Week end">
              <Input
                type="date"
                value={rollupWeekEnd}
                onChange={(e) => setRollupWeekEnd(e.target.value)}
                className={portalFormFieldClassName}
              />
            </FormField>
          </div>
          <ModalFooter>
            <Button type="button" variant="secondary" icon="cancel" onClick={() => setRollupOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              icon="calendar"
              onClick={() => rollupMutation.mutate()}
              loading={rollupMutation.isPending}
              disabled={
                !rollupEmployeeId ||
                !rollupCustomerId ||
                !rollupJobSiteId ||
                !rollupWeekStart ||
                !rollupWeekEnd
              }
            >
              Generate Timesheet
            </Button>
          </ModalFooter>
        </div>
      </Modal>

      <Modal
        open={signOpen}
        onClose={() => setSignOpen(false)}
        title="Sign Timesheet"
        subtitle="Capture foreman signature and contact details"
        icon="signature"
      >
        <form
          className="space-y-4"
          onSubmit={signForm.handleSubmit((values) => signMutation.mutate(values))}
        >
          <FormField label="Foreman Name">
            <Input {...signForm.register('foremanName')} className={portalFormFieldClassName} />
          </FormField>
          <FormField label="Foreman Email">
            <Input type="email" {...signForm.register('foremanEmail')} className={portalFormFieldClassName} />
          </FormField>
          <FormField label="Signature">
            <SignaturePad
              onChange={(url) => signForm.setValue('signatureDataUrl', url, { shouldValidate: true })}
            />
          </FormField>
          <ModalFooter>
            <Button type="submit" icon="save" loading={signMutation.isPending}>
              Save Signature
            </Button>
          </ModalFooter>
        </form>
      </Modal>
    </DashboardLayout>
  );
}
