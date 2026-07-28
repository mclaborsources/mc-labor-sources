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
  createWorkerUserSchema,
  type CreateAssignmentInput,
  type CreateWorkerUserInput,
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
import { Textarea } from '@/components/ui/Textarea';
import { FormField } from '@/components/ui/FormField';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { Table, Th, Td, ThActions } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { LoadingState } from '@/components/ui/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { api, type Assignment, type Customer, type Employee, type JobSite, DataError } from '@/lib/api-client';
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
import { AssignmentCustomerEditModal, AssignmentEmployeeEditModal, AssignmentJobSiteEditModal } from '@/components/assignments/AssignmentProfileEditModals';
import { AssignmentDetailsModal } from '@/components/assignments/AssignmentDetailsModal';
import { AssignmentsControlBar } from '@/components/assignments/AssignmentsControlBar';
import {
  AssignmentColumnHeader,
  type AssignmentSortDirection,
} from '@/components/assignments/AssignmentColumnHeader';
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
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [employeeColumnFilter, setEmployeeColumnFilter] = useState<string[]>([]);
  const [foremanFilter, setForemanFilter] = useState<string[]>([]);
  const [dateFilter, setDateFilter] = useState<string[]>([]);
  const [startFilter, setStartFilter] = useState<string[]>([]);
  const [sort, setSort] = useState<{ column: string; direction: AssignmentSortDirection }>({
    column: 'employee',
    direction: 'asc',
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Assignment | null>(null);
  const [profileEmployee, setProfileEmployee] = useState<Employee | null>(null);
  const [profileCustomer, setProfileCustomer] = useState<Customer | null>(null);
  const [editEmployee, setEditEmployee] = useState<Employee | null>(null);
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);
  const [editJobSite, setEditJobSite] = useState<JobSite | null>(null);
  const [detailAssignment, setDetailAssignment] = useState<Assignment | null>(null);
  const [foremanAssignment, setForemanAssignment] = useState<Assignment | null>(null);
  const [endTarget, setEndTarget] = useState<Assignment | null>(null);
  const [conflictPrompt, setConflictPrompt] = useState<{
    values: CreateAssignmentInput;
    conflicts: Assignment[];
  } | null>(null);
  const [saveError, setSaveError] = useState('');
  const [portalEmployee, setPortalEmployee] = useState<Employee | null>(null);
  const [portalNoticeEmployee, setPortalNoticeEmployee] = useState<Employee | null>(null);
  const [portalError, setPortalError] = useState('');
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

  const { data: clockedInAttendance } = useQuery({
    queryKey: ['attendance', 'clocked-in'],
    queryFn: () => api.getAttendance({ status: 'CLOCKED_IN' }),
    refetchInterval: 30_000,
  });

  const clockedInAssignmentIds = useMemo(
    () =>
      new Set(
        (clockedInAttendance ?? [])
          .map((log) => log.assignmentId)
          .filter((assignmentId): assignmentId is string => Boolean(assignmentId)),
      ),
    [clockedInAttendance],
  );

  const clockedInEmployeeSites = useMemo(
    () =>
      new Set(
        (clockedInAttendance ?? []).map(
          (log) => `${log.employeeId}:${log.jobSiteId}`,
        ),
      ),
    [clockedInAttendance],
  );

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
        const normalizedEmployeeSearch = employeeSearch.trim().toLocaleLowerCase();
        const normalizedCustomerSearch = customerSearch.trim().toLocaleLowerCase();
        const assignmentEmployeeName = assignment.employee
          ? `${assignment.employee.firstName} ${assignment.employee.lastName}`.toLocaleLowerCase()
          : '';
        const assignmentCustomerName =
          assignmentCustomerLabel(assignment)?.toLocaleLowerCase() ?? '';
        const matchesSalesman =
          salesmanFilter.length === 0 ||
          salesmanFilter.includes(assignmentSalesman(assignment, customers) ?? '');
        const matchesCustomer =
          customerFilter.length === 0 ||
          customerFilter.some((customerId) => assignmentMatchesCustomer(assignment, customerId));
        const matchesJobSite =
          jobSiteFilter.length === 0 || jobSiteFilter.includes(assignment.jobSiteId);
        const matchesEmployeeSearch =
          !normalizedEmployeeSearch || assignmentEmployeeName.includes(normalizedEmployeeSearch);
        const matchesCustomerSearch =
          !normalizedCustomerSearch || assignmentCustomerName.includes(normalizedCustomerSearch);
        const employeeName = assignment.employee
          ? `${assignment.employee.firstName} ${assignment.employee.lastName}`
          : '';
        const matchesEmployeeColumn =
          employeeColumnFilter.length === 0 || employeeColumnFilter.includes(employeeName);
        const matchesForeman =
          foremanFilter.length === 0 || foremanFilter.includes(assignment.jobSite?.foremanName ?? '');
        const matchesDate =
          dateFilter.length === 0 || dateFilter.includes(assignment.assignedDate.split('T')[0]);
        const matchesStart =
          startFilter.length === 0 || startFilter.includes(assignment.startTime ?? '');
        return (
          matchesSalesman &&
          matchesCustomer &&
          matchesJobSite &&
          matchesEmployeeSearch &&
          matchesCustomerSearch &&
          matchesEmployeeColumn &&
          matchesForeman &&
          matchesDate &&
          matchesStart
        );
      });
    },
    [
      weekFiltered,
      customerFilter,
      jobSiteFilter,
      salesmanFilter,
      statusFilter,
      employeeSearch,
      customerSearch,
      employeeColumnFilter,
      foremanFilter,
      dateFilter,
      startFilter,
      customers,
    ],
  );

  const sorted = useMemo(() => {
    const direction = sort.direction === 'asc' ? 1 : -1;
    const valueFor = (assignment: Assignment) => {
      switch (sort.column) {
        case 'customer': return assignmentCustomerLabel(assignment) ?? '';
        case 'jobSite': return assignment.jobSite?.name ?? '';
        case 'foreman': return assignment.jobSite?.foremanName ?? '';
        case 'salesman': return assignmentSalesman(assignment, customers) ?? '';
        case 'date': return assignment.assignedDate;
        case 'start': return assignment.startTime ?? '';
        case 'status': return assignment.status;
        default: return assignment.employee
          ? `${assignment.employee.lastName}, ${assignment.employee.firstName}`
          : '';
      }
    };
    return [...filtered].sort((a, b) =>
      valueFor(a).localeCompare(valueFor(b), undefined, { numeric: true }) * direction,
    );
  }, [filtered, sort, customers]);

  const columnOptions = useMemo(() => {
    const unique = (values: Array<string | null | undefined>) =>
      [...new Set(values.map((value) => value ?? ''))]
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
        .map((value) => ({ value, label: value || '(Blanks)' }));
    return {
      employees: unique(weekFiltered.map((a) => a.employee ? `${a.employee.firstName} ${a.employee.lastName}` : '')),
      foremen: unique(weekFiltered.map((a) => a.jobSite?.foremanName)),
      dates: unique(weekFiltered.map((a) => a.assignedDate.split('T')[0])),
      starts: unique(weekFiltered.map((a) => a.startTime)),
    };
  }, [weekFiltered]);

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
      statusFilter ||
      employeeColumnFilter.length > 0 ||
      foremanFilter.length > 0 ||
      dateFilter.length > 0 ||
      startFilter.length > 0 ||
      employeeSearch.trim() ||
      customerSearch.trim(),
  );

  function clearFilters() {
    setCustomerFilter([]);
    setJobSiteFilter([]);
    setSalesmanFilter([]);
    setStatusFilter('');
    setEmployeeColumnFilter([]);
    setForemanFilter([]);
    setDateFilter([]);
    setStartFilter([]);
    setEmployeeSearch('');
    setCustomerSearch('');
  }

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

  const portalForm = useForm<CreateWorkerUserInput>({
    resolver: zodResolver(createWorkerUserSchema),
    defaultValues: { name: '', email: '', password: '', phone: '' },
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

  const createPortalMutation = useMutation({
    mutationFn: (values: CreateWorkerUserInput) => api.createWorkerUser(portalEmployee!.id, values),
    onSuccess: () => {
      setPortalEmployee(null);
      setPortalError('');
      portalForm.reset();
    },
    onError: (err: Error) => setPortalError(err.message || 'Failed to create portal access'),
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

  async function openJobSiteEdit(assignment: Assignment) {
    const jobSite = await api.getJobSite(assignment.jobSiteId);
    setEditJobSite(jobSite);
  }

  function openPortalAccess(employee: Employee | null | undefined) {
    if (!employee) return;
    if (!employee.email || !employee.phone) {
      setPortalNoticeEmployee(employee);
      return;
    }
    setPortalError('');
    setPortalEmployee(employee);
    portalForm.reset({
      name: `${employee.firstName} ${employee.lastName}`.trim(),
      email: employee.email,
      phone: employee.phone,
      password: employee.phone.replace(/\D/g, ''),
    });
  }

  const employeeName = (a: Assignment) =>
    a.employee ? `${a.employee.firstName} ${a.employee.lastName}` : 'Employee';

  return (
    <DashboardLayout heroTitle="Assignments" heroImage={BRAND_HERO_IMAGES.default} contentClassName="brand-container py-2">
      <AssignmentsControlBar
        value={workingWeek}
        onChange={setWorkingWeek}
        stats={stats}
        onNewAssignment={() => openCreate()}
      />

      <div className="hidden">
        <div className="min-w-0 2xl:w-52">
          <BrandPageTitle title="Assignments" compact />
        </div>

      {data && data.length > 0 && (
        <div className="min-w-0 overflow-hidden">
          <p className="sr-only">
            Week ending {formatWeekEndingFridayLabel(workingWeek.weekEnd)} · showing {filtered.length} of{' '}
            {weekFiltered.length} assignment{weekFiltered.length === 1 ? '' : 's'}
            {selectedJobSiteName
              ? ` at ${selectedJobSiteName}`
              : selectedCustomerName
                ? ` for ${selectedCustomerName}`
                : ''}
            {hasActiveFilters && weekFiltered.length !== filtered.length ? ' (filtered)' : ''}.
          </p>
          <div className="grid min-w-0 grid-cols-2 gap-2 lg:grid-cols-4">
            <PortalSummaryStat compact label="Total" value={stats.total} icon={<IconBriefcase className="h-4 w-4" />} />
            <PortalSummaryStat
              label="Active"
              value={stats.active}
              icon={<IconUsers className="h-5 w-5" />}
              accent="green"
              compact
            />
            <PortalSummaryStat
              label="Pending"
              value={stats.pending}
              icon={<IconClock className="h-5 w-5" />}
              accent="amber"
              compact
            />
            <PortalSummaryStat
              label="Completed"
              value={stats.completed}
              icon={<IconBriefcase className="h-5 w-5" />}
              accent="slate"
              compact
            />
          </div>
        </div>
      )}

        <Button className="shrink-0" icon="plus" onClick={() => openCreate()}>New Assignment</Button>
      </div>

      <PortalFilterPanel compact showHeader={false}>
        <div className="space-y-2">
          <div className="hidden"><WeekEndingFilter value={workingWeek} onChange={setWorkingWeek} /></div>

          <div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_2.5fr]">
              <PortalFilterField label="Search Employee">
                <Input
                  type="search"
                  value={employeeSearch}
                  onChange={(event) => setEmployeeSearch(event.target.value)}
                  placeholder="Search by employee name"
                  className={portalFieldClassName}
                  aria-label="Search assignments by employee"
                />
              </PortalFilterField>
              <PortalFilterField label="Search Customer">
                <Input
                  type="search"
                  value={customerSearch}
                  onChange={(event) => setCustomerSearch(event.target.value)}
                  placeholder="Search by customer name"
                  className={portalFieldClassName}
                  aria-label="Search assignments by customer"
                />
              </PortalFilterField>
              <div className="hidden items-end justify-end xl:flex">
                <Button type="button" variant="secondary" onClick={clearFilters} disabled={!hasActiveFilters}>
                  Clear Filters
                </Button>
              </div>
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
        <PortalRecordsPanel showHeader={false} title="Assignment schedule" count={filtered.length} countLabel="assignments">
          <Table
            hasActions
            compact
            layoutFixed
            noHorizontalScroll
            className="w-full [&_th]:!border-r [&_th]:!border-slate-500 [&_th]:!bg-slate-300 [&_th]:!font-extrabold [&_th]:!text-black [&_td]:border-r [&_td]:border-slate-200 [&_tr>*:last-child]:!border-r-0"
            containerClassName="h-[max(18rem,calc(100dvh-22rem))] overflow-auto overscroll-contain"
          >
            <colgroup>
              <col className="w-[12%]" />
              <col className="w-[13%]" />
              <col className="w-[15%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
              <col className="w-[8%]" />
              <col className="w-[7%]" />
              <col className="w-[8%]" />
              <col className="w-[17%]" />
            </colgroup>
            <thead>
              <tr>
                <Th><AssignmentColumnHeader label="Employees" options={columnOptions.employees} selected={employeeColumnFilter} onSelectedChange={setEmployeeColumnFilter} sortDirection={sort.column === 'employee' ? sort.direction : undefined} onSort={(direction) => setSort({ column: 'employee', direction })} /></Th>
                <Th><AssignmentColumnHeader label="Customers" options={filterCustomers.map((customer) => ({ value: customer.id, label: customer.companyName }))} selected={customerFilter} onSelectedChange={setCustomerFilter} sortDirection={sort.column === 'customer' ? sort.direction : undefined} onSort={(direction) => setSort({ column: 'customer', direction })} /></Th>
                <Th><AssignmentColumnHeader label="Job Sites" options={filterJobSites.map((site) => ({ value: site.id, label: site.name }))} selected={jobSiteFilter} onSelectedChange={setJobSiteFilter} sortDirection={sort.column === 'jobSite' ? sort.direction : undefined} onSort={(direction) => setSort({ column: 'jobSite', direction })} /></Th>
                <Th><AssignmentColumnHeader label="Foreman" options={columnOptions.foremen} selected={foremanFilter} onSelectedChange={setForemanFilter} sortDirection={sort.column === 'foreman' ? sort.direction : undefined} onSort={(direction) => setSort({ column: 'foreman', direction })} /></Th>
                <Th><AssignmentColumnHeader label="Salesman" options={filterSalesmen.map((salesman) => ({ value: salesman, label: salesman }))} selected={salesmanFilter} onSelectedChange={setSalesmanFilter} sortDirection={sort.column === 'salesman' ? sort.direction : undefined} onSort={(direction) => setSort({ column: 'salesman', direction })} /></Th>
                <Th><AssignmentColumnHeader label="Date" options={columnOptions.dates} selected={dateFilter} onSelectedChange={setDateFilter} sortDirection={sort.column === 'date' ? sort.direction : undefined} onSort={(direction) => setSort({ column: 'date', direction })} /></Th>
                <Th><AssignmentColumnHeader label="Start" options={columnOptions.starts} selected={startFilter} onSelectedChange={setStartFilter} sortDirection={sort.column === 'start' ? sort.direction : undefined} onSort={(direction) => setSort({ column: 'start', direction })} /></Th>
                <Th><AssignmentColumnHeader label="Status" options={Object.values(AssignmentStatus).map((status) => ({ value: status, label: status.replace(/_/g, ' ') }))} selected={statusFilter ? [statusFilter] : []} onSelectedChange={(values) => setStatusFilter(values.at(-1) ?? '')} sortDirection={sort.column === 'status' ? sort.direction : undefined} onSort={(direction) => setSort({ column: 'status', direction })} /></Th>
                <ThActions className="sticky right-0 z-20 !min-w-0 shadow-[-8px_0_12px_-12px_rgba(15,23,42,0.45)]" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((a) => (
                <tr
                  key={a.id}
                  tabIndex={0}
                  onDoubleClick={() => setDetailAssignment(a)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && event.target === event.currentTarget) {
                      setDetailAssignment(a);
                    }
                  }}
                  className="cursor-pointer outline-none ring-inset ring-primary/30 hover:bg-primary/[0.025] focus:ring-2"
                  title="Double-click to view assignment attendance details"
                >
                  <Td>
                    {a.employee ? (
                      <button
                        type="button"
                        onDoubleClick={(event) => {
                          event.stopPropagation();
                          setEditEmployee(a.employee!);
                        }}
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.stopPropagation();
                            setEditEmployee(a.employee!);
                          }
                        }}
                        className="rounded-lg text-left outline-none ring-primary/30 hover:bg-primary/[0.04] focus:ring-2"
                        title="Double-click to edit employee profile"
                      >
                        <PersonCell name={`${a.employee.firstName} ${a.employee.lastName}`} />
                      </button>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </Td>
                  <Td className="font-medium text-slate-700">
                    {(() => {
                      const customerId = assignmentTargetCustomerId(a) ?? a.jobSite?.customerId;
                      const customer = customers?.find((item) => item.id === customerId);
                      return customer ? (
                        <button
                          type="button"
                          onClick={(event) => event.stopPropagation()}
                          onDoubleClick={(event) => {
                            event.stopPropagation();
                            setEditCustomer(customer);
                          }}
                          className="rounded-md text-left font-medium outline-none ring-primary/30 hover:text-primary focus:ring-2"
                          title="Double-click to edit customer profile"
                        >
                          {assignmentCustomerLabel(a)}
                        </button>
                      ) : assignmentCustomerLabel(a) ?? <span className="text-gray-400">—</span>;
                    })()}
                  </Td>
                  <Td className="break-words">
                    {(() => {
                      const customerId = assignmentTargetCustomerId(a) ?? a.jobSite?.customerId;
                      const customer = customers?.find((item) => item.id === customerId);
                      return customer ? (
                        <button
                          type="button"
                          onClick={(event) => event.stopPropagation()}
                          onDoubleClick={(event) => {
                            event.stopPropagation();
                            void openJobSiteEdit(a);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' && a.jobSite) {
                              event.stopPropagation();
                              void openJobSiteEdit(a);
                            }
                          }}
                          className="w-full rounded-lg text-left outline-none ring-primary/30 hover:bg-primary/[0.04] focus:ring-2"
                          title="Double-click to edit job site profile"
                        >
                          <TitleCell
                            title={a.jobSite?.name ?? '—'}
                            wrap
                          />
                        </button>
                      ) : (
                        <TitleCell
                          title={a.jobSite?.name ?? '—'}
                          wrap
                        />
                      );
                    })()}
                  </Td>
                  <Td className="font-medium text-slate-700">
                    <button
                      type="button"
                      onDoubleClick={(event) => {
                        event.stopPropagation();
                        void openJobSiteEdit(a);
                      }}
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.stopPropagation();
                          void openJobSiteEdit(a);
                        }
                      }}
                      className="rounded-md text-left font-medium text-primary underline decoration-primary/30 underline-offset-2 outline-none ring-primary/30 hover:decoration-primary focus:ring-2"
                      title="Double-click to edit foreman and job site details"
                    >
                    {a.jobSite?.foremanName || <span className="text-gray-400">—</span>}
                    </button>
                  </Td>
                  <Td className="hidden">
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
                    <Badge
                      status={
                        clockedInAssignmentIds.has(a.id) ||
                        clockedInEmployeeSites.has(`${a.employeeId}:${a.jobSiteId}`)
                          ? 'CLOCKED_IN'
                          : a.status
                      }
                      className="rounded-full normal-case transition duration-200 ease-out hover:-translate-y-0.5 hover:scale-105 hover:shadow-md"
                    />
                  </Td>
                  <Td
                    className="sticky right-0 z-[5] bg-white shadow-[-8px_0_12px_-12px_rgba(15,23,42,0.45)]"
                    onDoubleClick={(event) => event.stopPropagation()}
                  >
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
                      <Button
                        size="sm"
                        variant="softPrimary"
                        icon="userPlus"
                        onClick={() => openPortalAccess(a.employee)}
                      >
                        Portal Access
                      </Button>
                    </ActionCell>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </PortalRecordsPanel>
      )}

      <AssignmentDetailsModal
        assignment={detailAssignment}
        onClose={() => setDetailAssignment(null)}
      />

      <Modal
        open={!!foremanAssignment}
        onClose={() => setForemanAssignment(null)}
        title={foremanAssignment?.jobSite?.foremanName ?? 'Foreman Contact'}
        subtitle={foremanAssignment?.jobSite?.name ?? 'Job site contact information'}
        icon="users"
        size="sm"
      >
        <dl className="grid gap-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cell Number</dt>
            <dd className="mt-1 font-medium text-slate-900">
              {foremanAssignment?.jobSite?.foremanPhone ? (
                <a href={`tel:${foremanAssignment.jobSite.foremanPhone}`} className="text-primary hover:underline">
                  {foremanAssignment.jobSite.foremanPhone}
                </a>
              ) : '—'}
            </dd>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Office Phone</dt>
            <dd className="mt-1 font-medium text-slate-900">
              {foremanAssignment?.jobSite?.foremanOfficePhone ? (
                <a href={`tel:${foremanAssignment.jobSite.foremanOfficePhone}`} className="text-primary hover:underline">
                  {foremanAssignment.jobSite.foremanOfficePhone}
                </a>
              ) : '—'}
            </dd>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Email</dt>
            <dd className="mt-1 break-all font-medium text-slate-900">
              {foremanAssignment?.jobSite?.foremanEmail ? (
                <a href={`mailto:${foremanAssignment.jobSite.foremanEmail}`} className="text-primary hover:underline">
                  {foremanAssignment.jobSite.foremanEmail}
                </a>
              ) : '—'}
            </dd>
          </div>
          <ModalFooter>
            <Button type="button" variant="secondary" onClick={() => setForemanAssignment(null)}>Close</Button>
          </ModalFooter>
        </dl>
      </Modal>

      <AssignmentEmployeeEditModal employee={editEmployee} onClose={() => setEditEmployee(null)} />
      <AssignmentCustomerEditModal customer={editCustomer} onClose={() => setEditCustomer(null)} />
      <AssignmentJobSiteEditModal jobSite={editJobSite} onClose={() => setEditJobSite(null)} />

      <Modal
        open={!!portalNoticeEmployee}
        onClose={() => setPortalNoticeEmployee(null)}
        title="Portal Access Cannot Be Created"
        subtitle="Employee contact information is incomplete"
        icon="userPlus"
        tone="danger"
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {portalNoticeEmployee ? (
              <>
                <strong>{portalNoticeEmployee.firstName} {portalNoticeEmployee.lastName}</strong> needs{' '}
                {!portalNoticeEmployee.email && !portalNoticeEmployee.phone
                  ? 'an email address and phone number'
                  : !portalNoticeEmployee.email
                    ? 'an email address'
                    : 'a phone number'}{' '}
                before portal access can be created.
              </>
            ) : null}
          </div>
          <p className="text-sm text-slate-600">
            Add the missing information from the Employees page, then try again. The phone number is used as the initial password.
          </p>
          <ModalFooter>
            <Button type="button" variant="secondary" onClick={() => setPortalNoticeEmployee(null)}>OK</Button>
          </ModalFooter>
        </div>
      </Modal>

      <Modal
        open={!!portalEmployee}
        onClose={() => {
          setPortalEmployee(null);
          setPortalError('');
        }}
        title="Create Portal Access"
        subtitle={portalEmployee ? `Mobile login for ${portalEmployee.firstName} ${portalEmployee.lastName}` : undefined}
        icon="userPlus"
        tone="success"
      >
        <form
          onSubmit={portalForm.handleSubmit((values) => createPortalMutation.mutate(values))}
          className="space-y-4"
        >
          {portalError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{portalError}</p>
          ) : null}
          <FormField label="Name" error={portalForm.formState.errors.name?.message}>
            <Input {...portalForm.register('name')} className={portalFormFieldClassName} />
          </FormField>
          <FormField label="Email" error={portalForm.formState.errors.email?.message}>
            <Input type="email" {...portalForm.register('email')} className={portalFormFieldClassName} />
          </FormField>
          <FormField label="Password" error={portalForm.formState.errors.password?.message}>
            <Input type="text" {...portalForm.register('password')} className={portalFormFieldClassName} />
          </FormField>
          <p className="text-xs text-slate-500">
            The employee phone number is prefilled as digits only for the initial password.
          </p>
          <ModalFooter>
            <Button type="button" variant="secondary" icon="cancel" onClick={() => setPortalEmployee(null)}>
              Cancel
            </Button>
            <Button type="submit" icon="userPlus" loading={createPortalMutation.isPending}>
              Create User
            </Button>
          </ModalFooter>
        </form>
      </Modal>

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
        open={!!profileCustomer}
        onClose={() => setProfileCustomer(null)}
        title={profileCustomer?.companyName ?? 'Customer Profile'}
        subtitle="Customer profile"
        icon="building"
        tone="primary"
      >
        {profileCustomer ? (
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {profileCustomer.masterCustomerId ? (
              <div className="rounded-xl bg-slate-50 p-4">
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Customer ID</dt>
                <dd className="mt-1 font-medium text-slate-900">{profileCustomer.masterCustomerId}</dd>
              </div>
            ) : null}
            <div className="rounded-xl bg-slate-50 p-4">
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</dt>
              <dd className="mt-1"><Badge status={profileCustomer.status} /></dd>
            </div>
            {profileCustomer.customerType ? (
              <div className="rounded-xl bg-slate-50 p-4">
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Customer Type</dt>
                <dd className="mt-1 font-medium text-slate-900">{profileCustomer.customerType}</dd>
              </div>
            ) : null}
            {profileCustomer.salesman ? (
              <div className="rounded-xl bg-slate-50 p-4">
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Salesman</dt>
                <dd className="mt-1 font-medium text-slate-900">{profileCustomer.salesman}</dd>
              </div>
            ) : null}
            {profileCustomer._count ? (
              <div className="rounded-xl bg-slate-50 p-4">
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Job Sites</dt>
                <dd className="mt-1 font-medium text-slate-900">{profileCustomer._count.jobSites}</dd>
              </div>
            ) : null}
            {profileCustomer.contactName ? (
              <div className="rounded-xl bg-slate-50 p-4">
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Contact</dt>
                <dd className="mt-1 font-medium text-slate-900">{profileCustomer.contactName}</dd>
              </div>
            ) : null}
            {profileCustomer.contactPhone ? (
              <div className="rounded-xl bg-slate-50 p-4">
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Phone</dt>
                <dd className="mt-1 font-medium text-slate-900">
                  <a href={`tel:${profileCustomer.contactPhone}`} className="text-primary hover:underline">{profileCustomer.contactPhone}</a>
                </dd>
              </div>
            ) : null}
            <div className="rounded-xl bg-slate-50 p-4 sm:col-span-2">
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Email</dt>
              <dd className="mt-1 min-h-6 font-medium text-slate-900">
                {profileCustomer.contactEmail || profileCustomer.officeEmail ? (
                  <a href={`mailto:${profileCustomer.contactEmail || profileCustomer.officeEmail}`} className="text-primary hover:underline">
                    {profileCustomer.contactEmail || profileCustomer.officeEmail}
                  </a>
                ) : null}
              </dd>
            </div>
            {profileCustomer.address ? (
              <div className="rounded-xl bg-slate-50 p-4 sm:col-span-2">
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Address</dt>
                <dd className="mt-1 font-medium text-slate-900">{profileCustomer.address}</dd>
              </div>
            ) : null}
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
