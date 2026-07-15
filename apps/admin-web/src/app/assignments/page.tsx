'use client';

import { useMemo, useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  createAssignmentSchema,
  updateAssignmentSchema,
  endAssignmentSchema,
  AssignmentStatus,
  type CreateAssignmentInput,
} from '@mc-labor/shared';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { BrandPageTitle } from '@/components/brand';
import { BRAND_HERO_IMAGES } from '@/lib/navigation';
import {
  PortalFilterPanel,
  PortalRecordsPanel,
  PortalSummaryStat,
  PortalFilterField,
  portalFieldClassName,
  portalFormFieldClassName,
  PersonCell,
  TitleCell,
  ActionCell,
  DateCell,
} from '@/components/portal';
import { IconBriefcase, IconClock, IconUsers } from '@/components/dashboard';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { MultiSelect } from '@/components/ui/MultiSelect';
import { Textarea } from '@/components/ui/Textarea';
import { FormField } from '@/components/ui/FormField';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { Table, Th, Td, ThActions } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { LoadingState } from '@/components/ui/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { api, type Assignment, type Employee, DataError } from '@/lib/api-client';
import {
  assignmentCustomerLabel,
  assignmentMatchesCustomer,
  assignmentSalesman,
  assignmentTargetCustomerId,
  customersWithAssignments,
  filterAssignments,
  jobSitesWithAssignments,
  salesmenWithAssignments,
} from '@/lib/assignment-filter-utils';
import { WeekEndingFilter } from '@/components/assignments/WeekEndingFilter';
import { formatWeekEndingFridayLabel, getCurrentWorkingWeek } from '@/lib/working-week';

const OPEN_STATUSES = ['PENDING', 'ACCEPTED', 'ACTIVE'];

export default function AssignmentsPage() {
  const [workingWeek, setWorkingWeek] = useState(() => {
    const current = getCurrentWorkingWeek();
    return { weekStart: current.weekStart, weekEnd: current.weekEnd };
  });
  const [customerFilter, setCustomerFilter] = useState<string[]>([]);
  const [jobSiteFilter, setJobSiteFilter] = useState<string[]>([]);
  const [salesmanFilter, setSalesmanFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Assignment | null>(null);
  const [profileEmployee, setProfileEmployee] = useState<Employee | null>(null);
  const [endTarget, setEndTarget] = useState<Assignment | null>(null);
  const [conflictPrompt, setConflictPrompt] = useState<{
    values: CreateAssignmentInput;
    conflicts: Assignment[];
  } | null>(null);
  const [saveError, setSaveError] = useState('');
  const queryClient = useQueryClient();

  const { data: customers } = useQuery({
    queryKey: ['customers'],
    queryFn: () => api.getCustomers(),
  });

  const { data: employees } = useQuery({
    queryKey: ['employees'],
    queryFn: () => api.getEmployees({ status: 'ACTIVE' }),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['assignments'],
    queryFn: () => api.getAssignments(),
  });

  const weekFiltered = useMemo(
    () =>
      filterAssignments(data ?? [], {
        weekStart: workingWeek.weekStart,
        weekEnd: workingWeek.weekEnd,
      }),
    [data, workingWeek.weekStart, workingWeek.weekEnd],
  );

  const filtered = useMemo(
    () => {
      const base = filterAssignments(
        weekFiltered,
        {
          status: statusFilter || undefined,
        },
        customers,
      );
      return base.filter((assignment) => {
        const matchesSalesman =
          salesmanFilter.length === 0 ||
          salesmanFilter.includes(assignmentSalesman(assignment, customers) ?? '');
        const matchesCustomer =
          customerFilter.length === 0 ||
          customerFilter.some((customerId) => assignmentMatchesCustomer(assignment, customerId));
        const matchesJobSite =
          jobSiteFilter.length === 0 || jobSiteFilter.includes(assignment.jobSiteId);
        return matchesSalesman && matchesCustomer && matchesJobSite;
      });
    },
    [weekFiltered, customerFilter, jobSiteFilter, salesmanFilter, statusFilter, customers],
  );

  const filterSalesmen = useMemo(
    () => salesmenWithAssignments(customers ?? [], weekFiltered),
    [customers, weekFiltered],
  );

  const filterCustomers = useMemo(() => {
    let list = customersWithAssignments(customers ?? [], weekFiltered);
    if (salesmanFilter.length > 0) {
      list = list.filter((c) =>
        weekFiltered.some(
          (a) =>
            assignmentTargetCustomerId(a) === c.id &&
            salesmanFilter.includes(c.salesman ?? ''),
        ),
      );
    }
    return list;
  }, [customers, weekFiltered, salesmanFilter]);

  const filterJobSites = useMemo(() => {
    let base = weekFiltered;
    if (salesmanFilter.length > 0) {
      base = base.filter((assignment) =>
        salesmanFilter.includes(assignmentSalesman(assignment, customers) ?? ''),
      );
    }
    if (customerFilter.length > 0) {
      base = base.filter((assignment) =>
        customerFilter.some((customerId) => assignmentMatchesCustomer(assignment, customerId)),
      );
    }
    return jobSitesWithAssignments(base);
  }, [weekFiltered, salesmanFilter, customerFilter, customers]);

  const selectedCustomerName = useMemo(
    () =>
      customerFilter.length === 1
        ? customers?.find((c) => c.id === customerFilter[0])?.companyName
        : customerFilter.length > 1
          ? `${customerFilter.length} customers`
          : undefined,
    [customers, customerFilter],
  );

  const selectedJobSiteName = useMemo(
    () =>
      jobSiteFilter.length === 1
        ? filterJobSites.find((site) => site.id === jobSiteFilter[0])?.name
        : jobSiteFilter.length > 1
          ? `${jobSiteFilter.length} job sites`
          : undefined,
    [filterJobSites, jobSiteFilter],
  );

  const hasActiveFilters = Boolean(
    customerFilter.length > 0 ||
      jobSiteFilter.length > 0 ||
      salesmanFilter.length > 0 ||
      statusFilter,
  );

  useEffect(() => {
    if (customerFilter.length === 0 || filterCustomers.length === 0) return;
    const available = new Set(filterCustomers.map((customer) => customer.id));
    setCustomerFilter((current) => {
      const next = current.filter((id) => available.has(id));
      return next.length === current.length ? current : next;
    });
  }, [customerFilter, filterCustomers]);

  useEffect(() => {
    if (salesmanFilter.length === 0 || filterSalesmen.length === 0) return;
    const available = new Set(filterSalesmen);
    setSalesmanFilter((current) => {
      const next = current.filter((salesman) => available.has(salesman));
      return next.length === current.length ? current : next;
    });
  }, [salesmanFilter, filterSalesmen]);

  useEffect(() => {
    if (jobSiteFilter.length === 0 || filterJobSites.length === 0) return;
    const available = new Set(filterJobSites.map((site) => site.id));
    setJobSiteFilter((current) => {
      const next = current.filter((id) => available.has(id));
      return next.length === current.length ? current : next;
    });
  }, [jobSiteFilter, filterJobSites]);

  const stats = useMemo(() => {
    const items = filtered;
    return {
      total: items.length,
      active: items.filter((a) => a.status === 'ACTIVE').length,
      pending: items.filter((a) => a.status === 'PENDING').length,
      completed: items.filter((a) => a.status === 'COMPLETED').length,
    };
  }, [filtered]);

  const form = useForm<CreateAssignmentInput>({
    resolver: async (data, context, options) =>
      zodResolver(editing ? updateAssignmentSchema : createAssignmentSchema)(data, context, options),
    defaultValues: {
      employeeId: '',
      customerId: '',
      jobSiteId: '',
      assignedDate: new Date().toISOString().split('T')[0],
      status: AssignmentStatus.PENDING,
    },
  });

  const watchCustomer = form.watch('customerId');

  const { data: filteredSites } = useQuery({
    queryKey: ['job-sites-assign', watchCustomer],
    queryFn: () => api.getJobSites({ customerId: watchCustomer }),
    enabled: !!watchCustomer,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['assignments'] });

  const saveMutation = useMutation({
    mutationFn: async (values: CreateAssignmentInput) => {
      if (editing) return api.updateAssignment(editing.id, values);
      return api.createAssignmentResolvingConflicts(values, false);
    },
    onSuccess: () => {
      invalidate();
      setModalOpen(false);
      setEditing(null);
      setSaveError('');
    },
    onError: async (err: Error, values: CreateAssignmentInput) => {
      if (!editing && err instanceof DataError && values.employeeId && values.assignedDate) {
        const conflicts = await api.getOpenAssignmentsForEmployee(
          values.employeeId,
          values.assignedDate,
        );
        if (conflicts.length > 0) {
          setConflictPrompt({ values, conflicts });
          return;
        }
      }
      setSaveError(err.message || 'Failed to save assignment');
    },
  });

  const conflictMutation = useMutation({
    mutationFn: (values: CreateAssignmentInput) =>
      api.createAssignmentResolvingConflicts(values, true),
    onSuccess: () => {
      invalidate();
      setModalOpen(false);
      setEditing(null);
      setConflictPrompt(null);
      setSaveError('');
    },
    onError: (err: Error) => setSaveError(err.message || 'Failed to create assignment'),
  });

  const endMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'COMPLETED' | 'CANCELLED' }) => {
      endAssignmentSchema.parse({ status });
      return api.endAssignment(id, status);
    },
    onSuccess: () => {
      invalidate();
      setEndTarget(null);
    },
  });

  function openCreate(prefill?: Partial<CreateAssignmentInput>) {
    setEditing(null);
    setSaveError('');
    form.reset({
      employeeId: prefill?.employeeId ?? '',
      customerId: prefill?.customerId ?? '',
      jobSiteId: prefill?.jobSiteId ?? '',
      assignedDate: prefill?.assignedDate ?? new Date().toISOString().split('T')[0],
      startTime: prefill?.startTime ?? '',
      endTime: prefill?.endTime ?? '',
      status: prefill?.status ?? AssignmentStatus.PENDING,
      notes: prefill?.notes ?? '',
    });
    setModalOpen(true);
  }

  function openEdit(a: Assignment) {
    setEditing(a);
    setSaveError('');
    form.reset({
      employeeId: a.employeeId,
      customerId: a.customerId,
      jobSiteId: a.jobSiteId,
      assignedDate: a.assignedDate.split('T')[0],
      startTime: a.startTime || '',
      endTime: a.endTime || '',
      status: a.status as CreateAssignmentInput['status'],
      notes: a.notes || '',
    });
    setModalOpen(true);
  }

  function openReassign(a: Assignment) {
    openCreate({
      employeeId: a.employeeId,
      assignedDate: new Date().toISOString().split('T')[0],
      status: AssignmentStatus.PENDING,
    });
  }

  const employeeName = (a: Assignment) =>
    a.employee ? `${a.employee.firstName} ${a.employee.lastName}` : 'Employee';

  return (
    <DashboardLayout heroTitle="Assignments" heroImage={BRAND_HERO_IMAGES.default}>
      <BrandPageTitle
        title="Assignments"
        description="Assign employees to job sites"
        action={<Button icon="plus" onClick={() => openCreate()}>New Assignment</Button>}
      />

      {data && data.length > 0 && (
        <div className="mb-6 space-y-2">
          <p className="text-sm text-slate-600">
            Week ending {formatWeekEndingFridayLabel(workingWeek.weekEnd)} · showing {filtered.length} of{' '}
            {weekFiltered.length} assignment{weekFiltered.length === 1 ? '' : 's'}
            {selectedJobSiteName
              ? ` at ${selectedJobSiteName}`
              : selectedCustomerName
                ? ` for ${selectedCustomerName}`
                : ''}
            {hasActiveFilters && weekFiltered.length !== filtered.length ? ' (filtered)' : ''}.
          </p>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <PortalSummaryStat label="Total" value={stats.total} icon={<IconBriefcase className="h-5 w-5" />} />
            <PortalSummaryStat
              label="Active"
              value={stats.active}
              icon={<IconUsers className="h-5 w-5" />}
              accent="green"
            />
            <PortalSummaryStat
              label="Pending"
              value={stats.pending}
              icon={<IconClock className="h-5 w-5" />}
              accent="amber"
            />
            <PortalSummaryStat
              label="Completed"
              value={stats.completed}
              icon={<IconBriefcase className="h-5 w-5" />}
              accent="slate"
            />
          </div>
        </div>
      )}

      <PortalFilterPanel>
        <div className="space-y-6">
          <WeekEndingFilter value={workingWeek} onChange={setWorkingWeek} />

          <div className="border-t border-slate-100 pt-6">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-[1fr_1fr_1fr_1fr_auto] 2xl:items-end">
              <PortalFilterField
                label="Salesman"
                hint={
                  filterSalesmen.length === 0
                    ? 'Set salesman on customers (edit or import) to enable filtering'
                    : undefined
                }
              >
                <MultiSelect
                  value={salesmanFilter}
                  onChange={setSalesmanFilter}
                  options={filterSalesmen.map((salesman) => ({
                    value: salesman,
                    label: salesman,
                  }))}
                  allLabel="All salesmen"
                  selectedLabel="salesmen selected"
                  className={portalFieldClassName}
                />
              </PortalFilterField>

              <PortalFilterField label="Customer">
                <MultiSelect
                  value={customerFilter}
                  onChange={setCustomerFilter}
                  options={filterCustomers.map((customer) => ({
                    value: customer.id,
                    label: customer.companyName,
                  }))}
                  allLabel="All customers"
                  selectedLabel="customers selected"
                  className={portalFieldClassName}
                />
              </PortalFilterField>

              <PortalFilterField label="Job Site">
                <MultiSelect
                  value={jobSiteFilter}
                  onChange={setJobSiteFilter}
                  options={filterJobSites.map((site) => ({
                    value: site.id,
                    label:
                      customerFilter.length > 0 || !site.customerName
                        ? site.name
                        : `${site.name} — ${site.customerName}`,
                  }))}
                  allLabel="All job sites"
                  selectedLabel="job sites selected"
                  className={portalFieldClassName}
                />
              </PortalFilterField>

              <PortalFilterField label="Status">
                <Select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className={portalFieldClassName}
                >
                  <option value="">All statuses</option>
                  {Object.values(AssignmentStatus).map((s) => (
                    <option key={s} value={s}>
                      {s.replace(/_/g, ' ')}
                    </option>
                  ))}
                </Select>
              </PortalFilterField>

              {hasActiveFilters ? (
                <Button
                  type="button"
                  variant="soft"
                  className="h-[42px] w-full xl:w-auto"
                  onClick={() => {
                    setCustomerFilter([]);
                    setJobSiteFilter([]);
                    setSalesmanFilter([]);
                    setStatusFilter('');
                  }}
                >
                  Clear filters
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </PortalFilterPanel>

      {isLoading && <LoadingState />}
      {!isLoading && filtered.length === 0 && (
        <EmptyState
          title={
            weekFiltered.length === 0 && data?.length
              ? 'No assignments this week'
              : hasActiveFilters && weekFiltered.length
                ? 'No assignments for this filter'
                : data?.length
                  ? 'No assignments match your filters'
                  : 'No assignments found'
          }
          description={
            weekFiltered.length === 0 && data?.length
              ? `No assignments overlap the week ending ${formatWeekEndingFridayLabel(workingWeek.weekEnd)}. Try Last Week, another week ending date, or All customers.`
              : hasActiveFilters && weekFiltered.length
                ? `There are ${weekFiltered.length} assignment${weekFiltered.length === 1 ? '' : 's'} this week, but none match the current filters. Choose All customers, All job sites, All salesmen, or clear filters.`
                : 'Create an assignment to schedule an employee at a job site.'
          }
        />
      )}
      {filtered.length > 0 && (
        <PortalRecordsPanel title="Assignment schedule" count={filtered.length} countLabel="assignments">
          <Table
            hasActions
            className="min-w-[1380px]"
            containerClassName="max-h-[70vh] overflow-auto"
          >
            <thead>
              <tr>
                <Th className="min-w-52">Employee</Th>
                <Th className="w-80 min-w-80 max-w-80">Job Site</Th>
                <Th className="min-w-44">Foreman Name</Th>
                <Th className="min-w-40">Cell Number</Th>
                <Th>Salesman</Th>
                <Th>Date</Th>
                <Th>Start</Th>
                <Th>Status</Th>
                <ThActions className="sticky right-0 z-20 bg-slate-50 shadow-[-8px_0_12px_-12px_rgba(15,23,42,0.45)]" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id}>
                  <Td>
                    {a.employee ? (
                      <button
                        type="button"
                        onDoubleClick={() => setProfileEmployee(a.employee ?? null)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') setProfileEmployee(a.employee ?? null);
                        }}
                        className="rounded-lg text-left outline-none ring-primary/30 hover:bg-primary/[0.04] focus:ring-2"
                        title="Double-click to open employee profile"
                      >
                        <PersonCell name={`${a.employee.firstName} ${a.employee.lastName}`} />
                      </button>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </Td>
                  <Td className="w-80 min-w-80 max-w-80">
                    <TitleCell
                      title={a.jobSite?.name ?? '—'}
                      subtitle={assignmentCustomerLabel(a)}
                      wrap
                    />
                  </Td>
                  <Td className="font-medium text-slate-700">
                    {a.jobSite?.foremanName || <span className="text-gray-400">—</span>}
                  </Td>
                  <Td>
                    {a.jobSite?.foremanPhone ? (
                      <span className="whitespace-nowrap text-slate-700">
                        {a.jobSite.foremanPhone}
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </Td>
                  <Td className="text-slate-700">
                    {assignmentSalesman(a, customers) ?? (
                      <span className="text-gray-400">—</span>
                    )}
                  </Td>
                  <Td>
                    <DateCell value={a.assignedDate} />
                  </Td>
                  <Td>
                    {a.startTime ? (
                      <span className="inline-flex rounded-lg bg-slate-100 px-2.5 py-1 text-sm font-medium text-slate-700">
                        {a.startTime}
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </Td>
                  <Td>
                    <Badge status={a.status} className="rounded-full normal-case" />
                  </Td>
                  <Td className="sticky right-0 z-[5] bg-white shadow-[-8px_0_12px_-12px_rgba(15,23,42,0.45)]">
                    <ActionCell>
                      <Button size="sm" variant="secondary" icon="edit" onClick={() => openEdit(a)}>
                        Edit
                      </Button>
                      {OPEN_STATUSES.includes(a.status) ? (
                        <>
                          <Button size="sm" variant="softDanger" icon="stop" onClick={() => setEndTarget(a)}>
                            End
                          </Button>
                          <Button size="sm" variant="softPrimary" icon="swap" onClick={() => openReassign(a)}>
                            Reassign
                          </Button>
                        </>
                      ) : null}
                    </ActionCell>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </PortalRecordsPanel>
      )}

      <Modal
        open={!!profileEmployee}
        onClose={() => setProfileEmployee(null)}
        title={
          profileEmployee
            ? `${profileEmployee.firstName} ${profileEmployee.lastName}`
            : 'Employee Profile'
        }
        subtitle="Employee profile"
        icon="user"
        tone="primary"
      >
        {profileEmployee ? (
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-xl bg-slate-50 p-4">
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Employee ID</dt>
              <dd className="mt-1 font-medium text-slate-900">{profileEmployee.masterEmployeeId || '—'}</dd>
            </div>
            <div className="rounded-xl bg-slate-50 p-4">
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</dt>
              <dd className="mt-1"><Badge status={profileEmployee.status} /></dd>
            </div>
            <div className="rounded-xl bg-slate-50 p-4">
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Position</dt>
              <dd className="mt-1 font-medium text-slate-900">{profileEmployee.position || '—'}</dd>
            </div>
            <div className="rounded-xl bg-slate-50 p-4">
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Phone</dt>
              <dd className="mt-1 font-medium text-slate-900">
                {profileEmployee.phone ? <a href={`tel:${profileEmployee.phone}`} className="text-primary hover:underline">{profileEmployee.phone}</a> : '—'}
              </dd>
            </div>
            <div className="rounded-xl bg-slate-50 p-4 sm:col-span-2">
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Email</dt>
              <dd className="mt-1 font-medium text-slate-900">
                {profileEmployee.email ? <a href={`mailto:${profileEmployee.email}`} className="text-primary hover:underline">{profileEmployee.email}</a> : '—'}
              </dd>
            </div>
          </dl>
        ) : null}
      </Modal>

      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setSaveError('');
        }}
        title={editing ? 'Edit Assignment' : 'New Assignment'}
        subtitle={editing ? 'Update schedule and status' : 'Schedule an employee at a job site'}
        icon={editing ? 'edit' : 'plus'}
        tone={editing ? 'primary' : 'success'}
        size="lg"
      >
        <form
          onSubmit={form.handleSubmit((v) => saveMutation.mutate(v))}
          className="space-y-4"
        >
          {saveError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {saveError}
            </p>
          ) : null}
          <FormField label="Customer" error={form.formState.errors.customerId?.message}>
            <Select {...form.register('customerId')} className={portalFormFieldClassName}>
              <option value="">Select customer</option>
              {customers?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.companyName}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Job Site" error={form.formState.errors.jobSiteId?.message}>
            <Select {...form.register('jobSiteId')} className={portalFormFieldClassName}>
              <option value="">Select job site</option>
              {filteredSites?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Employee" error={form.formState.errors.employeeId?.message}>
            <Select
              {...form.register('employeeId')}
              className={portalFormFieldClassName}
              disabled={!!editing}
            >
              <option value="">Select employee</option>
              {employees?.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.firstName} {e.lastName}
                </option>
              ))}
            </Select>
          </FormField>
          <div className="grid grid-cols-3 gap-4">
            <FormField label="Assigned Date" error={form.formState.errors.assignedDate?.message}>
              <Input type="date" {...form.register('assignedDate')} className={portalFormFieldClassName} />
            </FormField>
            <FormField label="Start Time">
              <Input type="time" {...form.register('startTime')} className={portalFormFieldClassName} />
            </FormField>
            <FormField label="End Time">
              <Input type="time" {...form.register('endTime')} className={portalFormFieldClassName} />
            </FormField>
          </div>
          <FormField label="Status">
            <Select {...form.register('status')} className={portalFormFieldClassName}>
              <option value="PENDING">Pending</option>
              <option value="ACCEPTED">Accepted</option>
              <option value="ACTIVE">Active</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
            </Select>
          </FormField>
          <FormField label="Notes">
            <Textarea {...form.register('notes')} rows={2} className={portalFormFieldClassName} />
          </FormField>
          <ModalFooter>
            <Button type="button" variant="secondary" icon="cancel" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" icon="save" loading={saveMutation.isPending}>
              {editing ? 'Save Changes' : 'Create Assignment'}
            </Button>
          </ModalFooter>
        </form>
      </Modal>

      <Modal
        open={!!endTarget}
        onClose={() => setEndTarget(null)}
        title="End Assignment"
        subtitle="Choose how to close this assignment"
        icon="stop"
        tone="danger"
      >
        {endTarget ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              End assignment for <strong>{employeeName(endTarget)}</strong> at{' '}
              <strong>{endTarget.jobSite?.name}</strong>?
            </p>
            <ModalFooter>
              <Button variant="secondary" icon="cancel" onClick={() => setEndTarget(null)}>
                Keep Open
              </Button>
              <Button
                variant="ghost"
                icon="cancel"
                loading={endMutation.isPending}
                onClick={() => endMutation.mutate({ id: endTarget.id, status: 'CANCELLED' })}
              >
                Cancel Assignment
              </Button>
              <Button
                icon="checkCircle"
                loading={endMutation.isPending}
                onClick={() => endMutation.mutate({ id: endTarget.id, status: 'COMPLETED' })}
              >
                Mark Completed
              </Button>
            </ModalFooter>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={!!conflictPrompt}
        onClose={() => setConflictPrompt(null)}
        title="Assignment Conflict"
        subtitle="This employee already has an open assignment on the selected date"
        icon="swap"
        tone="neutral"
      >
        {conflictPrompt ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              This employee already has an open assignment on{' '}
              <strong>{conflictPrompt.values.assignedDate}</strong>:
            </p>
            <ul className="list-inside list-disc text-sm text-slate-700">
              {conflictPrompt.conflicts.map((c) => (
                <li key={c.id}>
                  {c.jobSite?.name} ({c.status})
                </li>
              ))}
            </ul>
            <p className="text-sm text-slate-600">
              End the existing assignment(s) and create this new one?
            </p>
            <ModalFooter>
              <Button variant="secondary" icon="arrowLeft" onClick={() => setConflictPrompt(null)}>
                Go Back
              </Button>
              <Button
                icon="swap"
                loading={conflictMutation.isPending}
                onClick={() => conflictMutation.mutate(conflictPrompt.values)}
              >
                End &amp; Create New
              </Button>
            </ModalFooter>
          </div>
        ) : null}
      </Modal>
    </DashboardLayout>
  );
}
