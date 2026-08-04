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
import { cn } from '@/lib/utils';
import { TimesheetDetailModal } from '@/components/portal/TimesheetDetailModal';
import type { Timesheet } from '@/lib/domain-types';

const OPEN_STATUSES = ['PENDING', 'ACCEPTED', 'ACTIVE'];
const SUBMITTED_TIMESHEET_STATUSES = new Set(['SUBMITTED', 'SENT', 'APPROVED']);
const FINALIZED_TIMESHEET_STATUSES = new Set(['SIGNED', 'SUBMITTED', 'SENT', 'APPROVED']);

function timesheetBelongsToWeek(
  timesheet: Timesheet,
  weekStart: string,
  weekEnd: string,
): boolean {
  if (timesheet.weekStartDate || timesheet.weekEndDate) {
    return timesheet.weekStartDate === weekStart && timesheet.weekEndDate === weekEnd;
  }

  return Boolean(
    timesheet.workDate && timesheet.workDate >= weekStart && timesheet.workDate <= weekEnd,
  );
}

type TimesheetProgress = 'RECEIVED' | 'PARTIALLY_RECEIVED' | 'NOT_RECEIVED';
type DeliveryProgress = 'SENT' | 'PARTIALLY_SENT' | 'NOT_SENT';
type ReadyProgress = 'READY' | 'PARTIALLY_READY' | 'NOT_READY';

function assignmentDisplayKey(assignment: Assignment): string {
  return assignment.status === 'COMPLETED'
    ? [
        assignment.employeeId,
        assignmentTargetCustomerId(assignment) ?? assignment.customerId,
        assignment.jobSiteId,
      ].join(':')
    : assignment.id;
}

function assignmentGroupProgress(
  assignment: Assignment,
  assignments: Assignment[],
  timesheets: Timesheet[],
  weekStart: string,
  weekEnd: string,
): {
  expectedCount: number;
  receivedCount: number;
  readyCount: number;
  sentCount: number;
  timesheetProgress: TimesheetProgress;
  readyProgress: ReadyProgress;
  deliveryProgress: DeliveryProgress;
} {
  const key = assignmentDisplayKey(assignment);
  const group = assignments.filter((item) => assignmentDisplayKey(item) === key);
  let expectedCount = 0;
  let receivedCount = 0;
  let readyCount = 0;
  let sentCount = 0;

  for (const item of group) {
    const itemTimesheets = timesheets.filter(
      (timesheet) =>
        timesheet.assignmentId === item.id &&
        timesheetBelongsToWeek(timesheet, weekStart, weekEnd),
    );
    expectedCount += Math.max(1, itemTimesheets.length);
    receivedCount += itemTimesheets.filter((timesheet) =>
      SUBMITTED_TIMESHEET_STATUSES.has(timesheet.status),
    ).length;
    readyCount += itemTimesheets.filter((timesheet) => timesheet.readyToSend).length;
    sentCount += itemTimesheets.filter((timesheet) =>
        Boolean(timesheet.deliveries?.length || timesheet.signature?.sentToCustomerOffice),
    ).length;
  }

  expectedCount = Math.max(1, expectedCount);

  return {
    expectedCount,
    receivedCount,
    readyCount,
    sentCount,
    timesheetProgress:
      receivedCount === 0
        ? 'NOT_RECEIVED'
        : receivedCount === expectedCount
          ? 'RECEIVED'
          : 'PARTIALLY_RECEIVED',
    readyProgress:
      readyCount === 0
        ? 'NOT_READY'
        : readyCount === expectedCount
          ? 'READY'
          : 'PARTIALLY_READY',
    deliveryProgress:
      sentCount === 0
        ? 'NOT_SENT'
        : sentCount === expectedCount
          ? 'SENT'
          : 'PARTIALLY_SENT',
  };
}

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
  const [timesheetFilter, setTimesheetFilter] = useState<string[]>([]);
  const [customerSentFilter, setCustomerSentFilter] = useState<string[]>([]);
  const [selectedDeliveryTimesheetIds, setSelectedDeliveryTimesheetIds] = useState<string[]>([]);
  const [deliveryTimesheetOptions, setDeliveryTimesheetOptions] = useState<Timesheet[]>([]);
  const [deliveryCustomerId, setDeliveryCustomerId] = useState('');
  const [viewingDeliveryTimesheetId, setViewingDeliveryTimesheetId] = useState('');
  const [updatingReadyTimesheetId, setUpdatingReadyTimesheetId] = useState('');
  const [customerDeliveryOpen, setCustomerDeliveryOpen] = useState(false);
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [deliveryError, setDeliveryError] = useState('');
  const [deliveryResult, setDeliveryResult] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [sort, setSort] = useState<{ column: string; direction: AssignmentSortDirection }>({
    column: 'employee',
    direction: 'asc',
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Assignment | null>(null);
  const [assignmentEmployeeQuery, setAssignmentEmployeeQuery] = useState('');
  const [assignmentEmployeeResultsOpen, setAssignmentEmployeeResultsOpen] = useState(false);
  const [profileEmployee, setProfileEmployee] = useState<Employee | null>(null);
  const [manualAccessError, setManualAccessError] = useState('');
  const [profileCustomer, setProfileCustomer] = useState<Customer | null>(null);
  const [editEmployee, setEditEmployee] = useState<Employee | null>(null);
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);
  const [editJobSite, setEditJobSite] = useState<JobSite | null>(null);
  const [detailAssignment, setDetailAssignment] = useState<Assignment | null>(null);
  const [selectedTimesheet, setSelectedTimesheet] = useState<Timesheet | null>(null);
  const [assignmentTimesheetOptions, setAssignmentTimesheetOptions] = useState<Timesheet[]>([]);
  const [missingTimesheetAssignments, setMissingTimesheetAssignments] = useState<Assignment[]>([]);
  const [timesheetGroupAssignments, setTimesheetGroupAssignments] = useState<Assignment[]>([]);
  const [foremanAssignment, setForemanAssignment] = useState<Assignment | null>(null);
  const [endTarget, setEndTarget] = useState<Assignment | null>(null);
  const [newTimesheetTarget, setNewTimesheetTarget] = useState<Assignment | null>(null);
  const [newTimesheetError, setNewTimesheetError] = useState('');
  const [conflictPrompt, setConflictPrompt] = useState<{
    values: CreateAssignmentInput;
    conflicts: Assignment[];
  } | null>(null);
  const [saveError, setSaveError] = useState('');
  const [portalEmployee, setPortalEmployee] = useState<Employee | null>(null);
  const [portalNoticeEmployee, setPortalNoticeEmployee] = useState<Employee | null>(null);
  const [portalError, setPortalError] = useState('');
  const [bulkPortalOpen, setBulkPortalOpen] = useState(false);
  const [bulkPortalText, setBulkPortalText] = useState('');
  const [bulkPortalSubmitting, setBulkPortalSubmitting] = useState(false);
  const [bulkPortalResults, setBulkPortalResults] = useState<
    Array<{ line: string; status: 'success' | 'error'; message: string }>
  >([]);
  const [testJobOpen, setTestJobOpen] = useState(false);
  const [testJobEmployeeId, setTestJobEmployeeId] = useState('');
  const [testJobError, setTestJobError] = useState('');
  const [testerPendingRemovalId, setTesterPendingRemovalId] = useState('');
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

  const { data: trainingAccounts } = useQuery({
    queryKey: ['employees', 'training-accounts'],
    queryFn: () => api.getEmployees({ status: 'ACTIVE', includeTraining: 'only' }),
  });

  const { data: weekTimesheets } = useQuery({
    queryKey: ['timesheets', 'assignments'],
    queryFn: () => api.getTimesheets(),
  });

  const manualAccessMutation = useMutation({
    mutationFn: (employee: Employee) =>
      api.updateEmployee(employee.id, {
        manualTimesheetEnabled: !employee.manualTimesheetEnabled,
      }),
    onSuccess: (employee) => {
      setManualAccessError('');
      setProfileEmployee(employee);
      void queryClient.invalidateQueries({ queryKey: ['employees'] });
      void queryClient.invalidateQueries({ queryKey: ['assignments'] });
    },
    onError: (error) => {
      setManualAccessError(
        error instanceof Error ? error.message : 'Could not update Manual tab access',
      );
    },
  });

  const selectedDeliveryTimesheets = useMemo(
    () =>
      deliveryTimesheetOptions.filter((timesheet) =>
        selectedDeliveryTimesheetIds.includes(timesheet.id),
      ),
    [deliveryTimesheetOptions, selectedDeliveryTimesheetIds],
  );
  const selectedDeliveryCustomer = customers?.find(
    (customer) => customer.id === deliveryCustomerId,
  );

  useEffect(() => {
    setSelectedDeliveryTimesheetIds([]);
    setDeliveryTimesheetOptions([]);
    setDeliveryCustomerId('');
    setCustomerDeliveryOpen(false);
    setDeliveryOpen(false);
    setDeliveryError('');
    setDeliveryResult('');
  }, [workingWeek.weekStart, workingWeek.weekEnd]);

  const deliverTimesheetsMutation = useMutation({
    mutationFn: () => api.deliverTimesheetsToCustomer(selectedDeliveryTimesheetIds),
    onSuccess: (result) => {
      setDeliveryError('');
      setDeliveryResult(
        `${result.timesheetsSent} timesheet${result.timesheetsSent === 1 ? '' : 's'} sent to ${result.recipientEmail}.`,
      );
      void queryClient.invalidateQueries({ queryKey: ['timesheets'] });
      void queryClient.invalidateQueries({ queryKey: ['assignments'] });
    },
    onError: (error) => {
      setDeliveryError(error instanceof Error ? error.message : 'Failed to send timesheets');
    },
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

  const customerDeliveryGroups = useMemo(() => {
    const assignmentIds = new Set(weekFiltered.map((assignment) => assignment.id));
    const groups = new Map<string, Timesheet[]>();
    (weekTimesheets ?? [])
      .filter((timesheet) => {
        const belongsToSelectedWeek =
          timesheetBelongsToWeek(
            timesheet,
            workingWeek.weekStart,
            workingWeek.weekEnd,
          ) &&
          ((Boolean(timesheet.assignmentId) && assignmentIds.has(timesheet.assignmentId!)) ||
            timesheet.isStandaloneManual === true);
        return (
          belongsToSelectedWeek &&
          timesheet.status === 'SUBMITTED' &&
          !timesheet.isTraining &&
          !timesheet.deliveries?.length &&
          !timesheet.signature?.sentToCustomerOffice
        );
      })
      .forEach((timesheet) => {
        groups.set(timesheet.customerId, [
          ...(groups.get(timesheet.customerId) ?? []),
          timesheet,
        ]);
      });
    return [...groups.entries()]
      .map(([customerId, timesheets]) => ({
        customerId,
        customer: customers?.find((customer) => customer.id === customerId),
        timesheets: [...timesheets].sort((left, right) => {
          const leftName = left.employee
            ? `${left.employee.lastName}, ${left.employee.firstName}`
            : '';
          const rightName = right.employee
            ? `${right.employee.lastName}, ${right.employee.firstName}`
            : '';
          return leftName.localeCompare(rightName);
        }),
        employeeCount: new Set(timesheets.map((timesheet) => timesheet.employeeId)).size,
        totalHours: timesheets.reduce(
          (total, timesheet) => total + Number(timesheet.totalHours ?? 0),
          0,
        ),
      }))
      .sort((left, right) =>
        (left.customer?.companyName ?? '').localeCompare(right.customer?.companyName ?? ''),
      );
  }, [customers, weekFiltered, weekTimesheets, workingWeek.weekEnd, workingWeek.weekStart]);

  const filtered = useMemo(
    () => {
      const base = filterAssignments(
        weekFiltered,
        {
          status: statusFilter && statusFilter !== 'CLOCKED_IN' ? statusFilter : undefined,
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
        const isClockedIn =
          clockedInAssignmentIds.has(assignment.id) ||
          clockedInEmployeeSites.has(`${assignment.employeeId}:${assignment.jobSiteId}`);
        const matchesStatus = statusFilter !== 'CLOCKED_IN' || isClockedIn;
        const progress = assignmentGroupProgress(
          assignment,
          weekFiltered,
          weekTimesheets ?? [],
          workingWeek.weekStart,
          workingWeek.weekEnd,
        );
        const matchesTimesheet =
          timesheetFilter.length === 0 ||
          timesheetFilter.includes(progress.timesheetProgress);
        const matchesCustomerSent =
          customerSentFilter.length === 0 ||
          customerSentFilter.includes(progress.deliveryProgress) ||
          customerSentFilter.includes(progress.readyProgress);
        return (
          matchesSalesman &&
          matchesCustomer &&
          matchesJobSite &&
          matchesEmployeeSearch &&
          matchesCustomerSearch &&
          matchesEmployeeColumn &&
          matchesForeman &&
          matchesDate &&
          matchesStart &&
          matchesStatus &&
          matchesTimesheet &&
          matchesCustomerSent
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
      timesheetFilter,
      customerSentFilter,
      weekTimesheets,
      customers,
      workingWeek.weekStart,
      workingWeek.weekEnd,
      clockedInAssignmentIds,
      clockedInEmployeeSites,
    ],
  );

  const sorted = useMemo(() => {
    const direction = sort.direction === 'asc' ? 1 : -1;
    const valueFor = (assignment: Assignment) => {
      const progress = assignmentGroupProgress(
        assignment,
        weekFiltered,
        weekTimesheets ?? [],
        workingWeek.weekStart,
        workingWeek.weekEnd,
      );
      switch (sort.column) {
        case 'customer': return assignmentCustomerLabel(assignment) ?? '';
        case 'jobSite': return assignment.jobSite?.name ?? '';
        case 'foreman': return assignment.jobSite?.foremanName ?? '';
        case 'salesman': return assignmentSalesman(assignment, customers) ?? '';
        case 'date': return assignment.assignedDate;
        case 'start': return assignment.startTime ?? '';
        case 'status': return assignment.status;
        case 'timesheet': return progress.timesheetProgress;
        case 'customerSent': return progress.deliveryProgress;
        default: return assignment.employee
          ? `${assignment.employee.lastName}, ${assignment.employee.firstName}`
          : '';
      }
    };
    return [...filtered].sort((a, b) =>
      valueFor(a).localeCompare(valueFor(b), undefined, { numeric: true }) * direction,
    );
  }, [filtered, sort, customers, weekFiltered, weekTimesheets, workingWeek.weekEnd, workingWeek.weekStart]);

  const assignmentDisplayGroups = useMemo(() => {
    const groups = new Map<string, Assignment[]>();
    sorted.forEach((assignment) => {
      const key = assignmentDisplayKey(assignment);
      groups.set(key, [...(groups.get(key) ?? []), assignment]);
    });
    return [...groups.entries()].map(([key, assignments]) => ({
      key,
      assignment: assignments[0],
      assignments: [...assignments].sort((left, right) =>
        left.assignedDate.localeCompare(right.assignedDate) ||
        (left.startTime ?? '').localeCompare(right.startTime ?? ''),
      ),
    }));
  }, [sorted]);

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
      timesheetFilter.length > 0 ||
      customerSentFilter.length > 0 ||
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
    setTimesheetFilter([]);
    setCustomerSentFilter([]);
    setEmployeeSearch('');
    setCustomerSearch('');
  }

  async function refreshAssignmentData() {
    setIsRefreshing(true);
    try {
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ['assignments'] }),
        queryClient.refetchQueries({ queryKey: ['timesheets'] }),
        queryClient.refetchQueries({ queryKey: ['attendance'] }),
        queryClient.refetchQueries({ queryKey: ['customers'] }),
        queryClient.refetchQueries({ queryKey: ['employees'] }),
      ]);
    } finally {
      setIsRefreshing(false);
    }
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
  const assignmentEmployeeResults = useMemo(() => {
    const query = assignmentEmployeeQuery.trim().toLocaleLowerCase();
    if (!query) return employees ?? [];
    return (employees ?? []).filter((employee) => {
      const name = `${employee.firstName} ${employee.lastName}`.toLocaleLowerCase();
      return (
        name.includes(query) ||
        employee.email?.toLocaleLowerCase().includes(query) ||
        employee.masterEmployeeId?.toLocaleLowerCase().includes(query)
      );
    });
  }, [assignmentEmployeeQuery, employees]);

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

  const newTimesheetMutation = useMutation({
    mutationFn: async (source: Assignment) => {
      const assignment = await api.createAssignmentResolvingConflicts({
        employeeId: source.employeeId,
        customerId: source.customerId,
        jobSiteId: source.jobSiteId,
        assignedDate: source.assignedDate.split('T')[0],
        startTime: source.startTime || '',
        endTime: source.endTime || '',
        status: AssignmentStatus.PENDING,
        notes: source.notes || '',
      }, true);
      try {
        const week = getCurrentWorkingWeek(
          new Date(`${source.assignedDate.split('T')[0]}T12:00:00`),
        );
        const timesheet = await api.createTimesheet({
          employeeId: source.employeeId,
          customerId: source.customerId,
          jobSiteId: source.jobSiteId,
          assignmentId: assignment.id,
          weekStartDate: week.weekStart,
          weekEndDate: week.weekEnd,
          totalHours: 0,
          notes: source.notes || undefined,
          status: 'DRAFT',
        });
        return { assignment, timesheet };
      } catch (error) {
        await api.deleteAssignment(assignment.id).catch(() => undefined);
        throw error;
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['assignments'] }),
        queryClient.invalidateQueries({ queryKey: ['timesheets'] }),
      ]);
      setNewTimesheetTarget(null);
      setNewTimesheetError('');
      setModalOpen(false);
      setEditing(null);
    },
    onError: (error: Error) =>
      setNewTimesheetError(error.message || 'The new timesheet could not be created.'),
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

  const createTestJobMutation = useMutation({
    mutationFn: (employeeId: string) => api.createTrainingAssignment(employeeId),
    onSuccess: async ({ timesheetId }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['assignments'] }),
        queryClient.invalidateQueries({ queryKey: ['timesheets'] }),
      ]);
      setTestJobOpen(false);
      setTestJobEmployeeId('');
      setTestJobError('');
      setSelectedTimesheet(await api.getTimesheet(timesheetId));
    },
    onError: (error: Error) =>
      setTestJobError(error.message || 'The training assignment could not be created.'),
  });

  const deleteTesterMutation = useMutation({
    mutationFn: (employeeId: string) => api.deleteTrainingAccount(employeeId),
    onSuccess: async (_, employeeId) => {
      if (testJobEmployeeId === employeeId) setTestJobEmployeeId('');
      setTesterPendingRemovalId('');
      setTestJobError('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['employees', 'training-accounts'] }),
        queryClient.invalidateQueries({ queryKey: ['assignments'] }),
        queryClient.invalidateQueries({ queryKey: ['timesheets'] }),
      ]);
    },
    onError: (error: Error) =>
      setTestJobError(error.message || 'The tester account could not be removed.'),
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
    const prefilledEmployee = employees?.find((employee) => employee.id === prefill?.employeeId);
    setAssignmentEmployeeQuery(
      prefilledEmployee ? `${prefilledEmployee.firstName} ${prefilledEmployee.lastName}` : '',
    );
    setAssignmentEmployeeResultsOpen(false);
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
    setAssignmentEmployeeQuery(
      a.employee ? `${a.employee.firstName} ${a.employee.lastName}` : '',
    );
    setAssignmentEmployeeResultsOpen(false);
    setModalOpen(true);
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

  async function createBulkPortalAccess() {
    const lines = bulkPortalText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      setBulkPortalResults([
        { line: 'No entries', status: 'error', message: 'Paste at least one employee.' },
      ]);
      return;
    }

    setBulkPortalSubmitting(true);
    setBulkPortalResults([]);
    const results: Array<{ line: string; status: 'success' | 'error'; message: string }> = [];
    const digits = (value: string | null | undefined) => (value ?? '').replace(/\D/g, '');

    for (const line of lines) {
      const commaIndex = line.lastIndexOf(',');
      if (commaIndex < 1) {
        results.push({
          line,
          status: 'error',
          message: 'Invalid format. Use Full Name,Phone Number.',
        });
        continue;
      }

      const name = line.slice(0, commaIndex).trim();
      const phone = digits(line.slice(commaIndex + 1));
      if (!name || phone.length < 8) {
        results.push({ line, status: 'error', message: 'Name or phone number is invalid.' });
        continue;
      }

      try {
        await api.createTrainingPortalUser(name, phone);
        results.push({
          line,
          status: 'success',
          message: `Training account created. Login name: ${name}; password: ${phone}.`,
        });
      } catch (error) {
        results.push({
          line,
          status: 'error',
          message: error instanceof Error ? error.message : 'Portal access could not be created.',
        });
      }
    }

    setBulkPortalResults(results);
    setBulkPortalSubmitting(false);
    await queryClient.invalidateQueries({ queryKey: ['employees', 'training-accounts'] });
  }

  const employeeName = (a: Assignment) =>
    a.employee ? `${a.employee.firstName} ${a.employee.lastName}` : 'Employee';

  const timesheetsForAssignment = (assignment: Assignment) =>
    (weekTimesheets ?? []).filter(
      (timesheet) =>
        timesheet.assignmentId === assignment.id &&
        timesheetBelongsToWeek(timesheet, workingWeek.weekStart, workingWeek.weekEnd),
    );

  const timesheetForAssignment = (assignment: Assignment) =>
    timesheetsForAssignment(assignment)[0];

  const timesheetsForAssignmentGroup = (assignments: Assignment[]) => {
    const representative = assignments[0];
    if (!representative) return [];
    const assignmentIds = new Set(assignments.map((assignment) => assignment.id));
    const customerId =
      assignmentTargetCustomerId(representative) ?? representative.customerId;
    return (weekTimesheets ?? []).filter(
      (timesheet) =>
        timesheetBelongsToWeek(timesheet, workingWeek.weekStart, workingWeek.weekEnd) &&
        ((Boolean(timesheet.assignmentId) && assignmentIds.has(timesheet.assignmentId!)) ||
          (timesheet.isStandaloneManual === true &&
            timesheet.employeeId === representative.employeeId &&
            timesheet.customerId === customerId)),
    );
  };

  async function openAssignmentTimesheet(assignment: Assignment) {
    const timesheets = await api.getTimesheets({
      employeeId: assignment.employeeId,
      assignmentId: assignment.id,
      weekStart: workingWeek.weekStart,
      weekEnd: workingWeek.weekEnd,
    });
    if (timesheets.length) {
      const sorted = timesheets.sort((left, right) =>
        (right.createdAt ?? '').localeCompare(left.createdAt ?? ''),
      );
      setAssignmentTimesheetOptions(sorted);
      setSelectedTimesheet(sorted[0]);
      return;
    }

    const customerId = assignmentTargetCustomerId(assignment) ?? assignment.customerId;
    const customer =
      customers?.find((item) => item.id === customerId) ??
      assignment.customer ??
      assignment.jobSite?.customer;
    const preview: Timesheet = {
      id: `preview-${assignment.id}`,
      assignmentId: assignment.id,
      employeeId: assignment.employeeId,
      customerId,
      jobSiteId: assignment.jobSiteId,
      weekStartDate: workingWeek.weekStart,
      weekEndDate: workingWeek.weekEnd,
      totalHours: 0,
      status: 'DRAFT',
      employee: assignment.employee,
      customer: customer
        ? { id: customer.id, companyName: customer.companyName }
        : undefined,
      jobSite: assignment.jobSite
        ? { id: assignment.jobSite.id, name: assignment.jobSite.name }
        : undefined,
      entries: [],
      deliveries: [],
    };
    setAssignmentTimesheetOptions([preview]);
    setSelectedTimesheet(preview);
  }

  async function openDeliveryTimesheet(timesheet: Timesheet) {
    setViewingDeliveryTimesheetId(timesheet.id);
    try {
      const fullTimesheets = await Promise.all(
        deliveryTimesheetOptions.map((option) => api.getTimesheet(option.id)),
      );
      setAssignmentTimesheetOptions(fullTimesheets);
      setSelectedTimesheet(
        fullTimesheets.find((option) => option.id === timesheet.id) ?? fullTimesheets[0],
      );
    } catch (error) {
      setDeliveryError(error instanceof Error ? error.message : 'Failed to open timesheet');
    } finally {
      setViewingDeliveryTimesheetId('');
    }
  }

  async function toggleTimesheetReady(timesheet: Timesheet) {
    setUpdatingReadyTimesheetId(timesheet.id);
    setDeliveryError('');
    try {
      const updated = await api.updateTimesheet(timesheet.id, {
        readyToSend: !timesheet.readyToSend,
      });
      setDeliveryTimesheetOptions((current) =>
        current.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)),
      );
      setSelectedDeliveryTimesheetIds((current) =>
        updated.readyToSend
          ? current
          : current.filter((timesheetId) => timesheetId !== updated.id),
      );
      await queryClient.invalidateQueries({ queryKey: ['timesheets'] });
    } catch (error) {
      setDeliveryError(error instanceof Error ? error.message : 'Could not update ready status');
    } finally {
      setUpdatingReadyTimesheetId('');
    }
  }

  const timesheetSiteSummary = useMemo(() => {
    if (!selectedTimesheet) return undefined;
    const siteAssignments = weekFiltered.filter(
      (assignment) =>
        assignment.jobSiteId === selectedTimesheet.jobSiteId &&
        (assignmentTargetCustomerId(assignment) ?? assignment.customerId) ===
          selectedTimesheet.customerId,
    );
    const received = siteAssignments.filter((assignment) => {
      const timesheet = timesheetForAssignment(assignment);
      return timesheet && SUBMITTED_TIMESHEET_STATUSES.has(timesheet.status);
    });
    const missing = siteAssignments.filter(
      (assignment) => !received.some((item) => item.id === assignment.id),
    );
    return {
      missing,
      notice: missing.length === 0 ? {
        tone: 'complete' as const,
        message: `All ${siteAssignments.length} assignment timesheets have been submitted for this job site.`,
      } : {
        tone: 'warning' as const,
        message: `${received.length} of ${siteAssignments.length} assignment timesheets have been submitted. ${missing.length} timesheet${missing.length === 1 ? '' : 's'} still waiting.`,
      },
    };
  }, [
    selectedTimesheet,
    weekFiltered,
    weekTimesheets,
    workingWeek.weekEnd,
    workingWeek.weekStart,
  ]);

  return (
    <DashboardLayout
      heroTitle="Assignments"
      heroImage={BRAND_HERO_IMAGES.default}
      contentClassName="brand-container py-2"
    >
      <AssignmentsControlBar
        value={workingWeek}
        onChange={setWorkingWeek}
        stats={stats}
        onNewAssignment={() => openCreate()}
        onTestJob={() => {
          setTestJobError('');
          setTestJobOpen(true);
        }}
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
              <div className="flex items-end justify-end gap-2">
                <Button
                  type="button"
                  icon="send"
                  onClick={() => setCustomerDeliveryOpen(true)}
                >
                  Send Customer Timesheets
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  icon={<span className="text-base leading-none" aria-hidden="true">↻</span>}
                  loading={isRefreshing}
                  onClick={() => void refreshAssignmentData()}
                >
                  Refresh Data
                </Button>
                <Button type="button" variant="secondary" onClick={clearFilters} disabled={!hasActiveFilters}>
                  Clear Filters
                </Button>
              </div>
            </div>
          </div>
        </div>
      </PortalFilterPanel>

      {isLoading && <LoadingState />}
      {!isLoading && (
        <PortalRecordsPanel showHeader={false} title="Assignment schedule" count={filtered.length} countLabel="assignments">
          <Table
            hasActions
            compact
            layoutFixed
            className="h-full w-full min-w-[90rem] [&_th]:!border-r [&_th]:!border-slate-500 [&_th]:!bg-slate-300 [&_th]:!font-extrabold [&_th]:!text-black [&_td]:border-r [&_td]:border-slate-200 [&_tr>*:last-child]:!border-r-0"
            containerClassName="assignment-table-scroll h-[max(28rem,calc(100dvh-18rem))] overflow-auto overscroll-contain"
          >
            <colgroup>
              <col className="w-[12%]" />
              <col className="w-[12%]" />
              <col className="w-[14%]" />
              <col className="w-[10%]" />
              <col className="w-[9%]" />
              <col className="w-[9%]" />
              <col className="w-[12%]" />
              <col className="w-[22%]" />
            </colgroup>
            <thead>
              <tr>
                <Th><AssignmentColumnHeader label="Employees" options={columnOptions.employees} selected={employeeColumnFilter} onSelectedChange={setEmployeeColumnFilter} sortDirection={sort.column === 'employee' ? sort.direction : undefined} onSort={(direction) => setSort({ column: 'employee', direction })} /></Th>
                <Th><AssignmentColumnHeader label="Customers" options={filterCustomers.map((customer) => ({ value: customer.id, label: customer.companyName }))} selected={customerFilter} onSelectedChange={setCustomerFilter} sortDirection={sort.column === 'customer' ? sort.direction : undefined} onSort={(direction) => setSort({ column: 'customer', direction })} /></Th>
                <Th><AssignmentColumnHeader label="Job Sites" options={filterJobSites.map((site) => ({ value: site.id, label: site.name }))} selected={jobSiteFilter} onSelectedChange={setJobSiteFilter} sortDirection={sort.column === 'jobSite' ? sort.direction : undefined} onSort={(direction) => setSort({ column: 'jobSite', direction })} /></Th>
                <Th><AssignmentColumnHeader label="Salesman" options={filterSalesmen.map((salesman) => ({ value: salesman, label: salesman || '(Blanks)' }))} selected={salesmanFilter} onSelectedChange={setSalesmanFilter} sortDirection={sort.column === 'salesman' ? sort.direction : undefined} onSort={(direction) => setSort({ column: 'salesman', direction })} /></Th>
                <Th><AssignmentColumnHeader label="Status" options={[...Object.values(AssignmentStatus), 'CLOCKED_IN'].map((status) => ({ value: status, label: status.replace(/_/g, ' ') }))} selected={statusFilter ? [statusFilter] : []} onSelectedChange={(values) => setStatusFilter(values.at(-1) ?? '')} sortDirection={sort.column === 'status' ? sort.direction : undefined} onSort={(direction) => setSort({ column: 'status', direction })} /></Th>
                <Th>
                  <AssignmentColumnHeader
                    label="Time Sheet"
                    options={[
                      { value: 'RECEIVED', label: 'Received' },
                      { value: 'PARTIALLY_RECEIVED', label: 'Partially received' },
                      { value: 'NOT_RECEIVED', label: 'Not received' },
                    ]}
                    selected={timesheetFilter}
                    onSelectedChange={setTimesheetFilter}
                    sortDirection={sort.column === 'timesheet' ? sort.direction : undefined}
                    onSort={(direction) => setSort({ column: 'timesheet', direction })}
                  />
                </Th>
                <Th>
                  <AssignmentColumnHeader
                    label="Sent to Customer"
                    options={[
                      { value: 'READY', label: 'Ready to send' },
                      { value: 'PARTIALLY_READY', label: 'Partially ready' },
                      { value: 'NOT_READY', label: 'Not ready' },
                      { value: 'SENT', label: 'Sent' },
                      { value: 'PARTIALLY_SENT', label: 'Partially sent' },
                      { value: 'NOT_SENT', label: 'Not sent' },
                    ]}
                    selected={customerSentFilter}
                    onSelectedChange={setCustomerSentFilter}
                    sortDirection={sort.column === 'customerSent' ? sort.direction : undefined}
                    onSort={(direction) => setSort({ column: 'customerSent', direction })}
                  />
                </Th>
                <ThActions className="!min-w-0" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr className="bg-white hover:!bg-white">
                  <td colSpan={8} className="border-0 p-0">
                    <EmptyState
                      className="min-h-[max(24rem,calc(100dvh-22rem))]"
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
                  </td>
                </tr>
              ) : null}
              {assignmentDisplayGroups.map(({ key, assignment: a, assignments: groupedAssignments }) => (
                <tr
                  key={key}
                  tabIndex={0}
                  onDoubleClick={() => {
                    if (groupedAssignments.length > 1) {
                      setTimesheetGroupAssignments(groupedAssignments);
                    } else {
                      setDetailAssignment(a);
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && event.target === event.currentTarget) {
                      if (groupedAssignments.length > 1) {
                        setTimesheetGroupAssignments(groupedAssignments);
                      } else {
                        setDetailAssignment(a);
                      }
                    }
                  }}
                  className="cursor-pointer outline-none ring-inset ring-primary/30 hover:bg-primary/[0.025] focus:ring-2"
                  title={
                    groupedAssignments.length > 1
                      ? 'Double-click to choose an assignment timesheet'
                      : 'Double-click to view assignment attendance details'
                  }
                >
                  <Td>
                    {a.employee ? (
                      <button
                        type="button"
                        onDoubleClick={(event) => {
                          event.stopPropagation();
                          setProfileEmployee(null);
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
                  <Td className="hidden font-medium text-slate-700">
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
                  <Td className="hidden">
                    {groupedAssignments.length === 1 ? (
                      <DateCell value={a.assignedDate} />
                    ) : (
                      <button
                        type="button"
                        className="rounded-lg bg-slate-100 px-2.5 py-1 text-left text-xs font-semibold text-slate-700 hover:bg-slate-200"
                        onClick={(event) => {
                          event.stopPropagation();
                          setTimesheetGroupAssignments(groupedAssignments);
                        }}
                        title="View assignment dates and timesheets"
                      >
                        {groupedAssignments.length} visits
                      </button>
                    )}
                  </Td>
                  <Td className="hidden">
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
                          : groupedAssignments.some(
                              (assignment) => timesheetForAssignment(assignment)?.status === 'SIGNED',
                            )
                            ? 'SIGNED'
                          : a.status
                      }
                      className="rounded-full normal-case transition duration-200 ease-out hover:-translate-y-0.5 hover:scale-105 hover:shadow-md"
                    />
                  </Td>
                  <Td onDoubleClick={(event) => event.stopPropagation()}>
                    {(() => {
                      const progress = assignmentGroupProgress(
                        a,
                        weekFiltered,
                        weekTimesheets ?? [],
                        workingWeek.weekStart,
                        workingWeek.weekEnd,
                      );
                      return (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              if (groupedAssignments.length > 1) {
                                setTimesheetGroupAssignments(groupedAssignments);
                              } else {
                                void openAssignmentTimesheet(a);
                              }
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-primary/20 bg-white px-2.5 py-1 text-xs font-semibold text-primary shadow-sm hover:bg-primary/5"
                            title="View employee timesheet"
                          >
                            <span aria-hidden="true">⊙</span>
                            {groupedAssignments.length > 1
                              ? `View (${groupedAssignments.length})`
                              : 'View'}
                          </button>
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide',
                              progress.timesheetProgress === 'RECEIVED'
                                ? 'bg-emerald-100 text-emerald-700'
                                : progress.timesheetProgress === 'PARTIALLY_RECEIVED'
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-slate-100 text-slate-600',
                            )}
                            title={`${progress.receivedCount} of ${progress.expectedCount} timesheets received`}
                          >
                            {progress.receivedCount}/{progress.expectedCount}{' '}
                            {progress.timesheetProgress === 'NOT_RECEIVED'
                              ? 'Not Received'
                              : 'Received'}
                          </span>
                        </div>
                      );
                    })()}
                  </Td>
                  <Td>
                    {(() => {
                      const groupTimesheets = timesheetsForAssignmentGroup(groupedAssignments);
                      const progress = assignmentGroupProgress(
                        a,
                        weekFiltered,
                        weekTimesheets ?? [],
                        workingWeek.weekStart,
                        workingWeek.weekEnd,
                      );
                      const sendableTimesheets = groupTimesheets.filter(
                        (timesheet) =>
                          timesheet.status === 'SUBMITTED' &&
                          !timesheet.isTraining &&
                          !timesheet.deliveries?.length &&
                          !timesheet.signature?.sentToCustomerOffice,
                      );
                      const sent = progress.deliveryProgress === 'SENT';
                      return (
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            disabled={sent}
                            onClick={(event) => {
                              event.stopPropagation();
                              if (sent) return;
                              setDeliveryTimesheetOptions(groupTimesheets);
                              setDeliveryCustomerId(
                                groupTimesheets[0]?.customerId ??
                                  assignmentTargetCustomerId(a) ??
                                  a.customerId,
                              );
                            setSelectedDeliveryTimesheetIds(
                              sendableTimesheets
                                .filter((timesheet) => timesheet.readyToSend)
                                .map((timesheet) => timesheet.id),
                              );
                              setDeliveryError('');
                              setDeliveryResult('');
                              setDeliveryOpen(true);
                            }}
                            title={sent ? 'All timesheets have been sent' : 'Review and send submitted timesheets'}
                            className="inline-flex items-center rounded-lg border border-emerald-700 bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-default disabled:opacity-50"
                          >
                            Send
                          </button>
                          <div className="text-xs font-semibold">
                            <p className={progress.readyProgress === 'READY' ? 'text-emerald-700' : progress.readyProgress === 'PARTIALLY_READY' ? 'text-amber-700' : 'text-slate-500'}>
                              {progress.readyCount}/{progress.expectedCount} Ready
                            </p>
                            <p className={sent ? 'text-emerald-700' : progress.deliveryProgress === 'PARTIALLY_SENT' ? 'text-amber-700' : 'text-slate-500'}>
                              {progress.sentCount}/{progress.expectedCount} Sent
                            </p>
                          </div>
                        </div>
                      );
                    })()}
                  </Td>
                  <Td
                    className="[&_.portal-action-cell]:!grid [&_.portal-action-cell]:grid-cols-2 [&_.portal-action-cell]:gap-1.5 [&_.portal-action-cell>button]:w-full"
                    onDoubleClick={(event) => event.stopPropagation()}
                  >
                    <ActionCell>
                      <Button
                        size="sm"
                        variant="secondary"
                        icon="edit"
                        onClick={() =>
                          openEdit(groupedAssignments[groupedAssignments.length - 1] ?? a)
                        }
                      >
                        Edit
                      </Button>
                      {groupedAssignments.length === 1 && OPEN_STATUSES.includes(a.status) ? (
                        <Button size="sm" variant="softDanger" icon="stop" onClick={() => setEndTarget(a)}>
                          End
                        </Button>
                      ) : null}
                      {(() => {
                        const visitTimesheets = groupedAssignments.flatMap((assignment) =>
                          timesheetsForAssignment(assignment),
                        );
                        const canCreateTimesheet =
                          visitTimesheets.length > 0 &&
                          visitTimesheets.every((timesheet) =>
                            FINALIZED_TIMESHEET_STATUSES.has(timesheet.status),
                          );
                        if (!canCreateTimesheet) return null;
                        const latestAssignment =
                          groupedAssignments[groupedAssignments.length - 1] ?? a;
                        return (
                          <Button
                            size="sm"
                            variant="softPrimary"
                            icon="plus"
                            onClick={() => {
                              setNewTimesheetError('');
                              setNewTimesheetTarget(latestAssignment);
                            }}
                          >
                            New Timesheet
                          </Button>
                        );
                      })()}
                      <Button
                        size="sm"
                        variant={a.employee?.manualTimesheetEnabled ? 'soft' : 'softPrimary'}
                        icon="edit"
                        onClick={() => {
                          if (!a.employee) return;
                          setManualAccessError('');
                          setProfileEmployee(a.employee);
                        }}
                      >
                        {a.employee?.manualTimesheetEnabled ? 'Manual Enabled' : 'Manual Tab'}
                      </Button>
                    </ActionCell>
                  </Td>
                </tr>
              ))}
              {filtered.length > 0 ? (
                <tr aria-hidden="true" className="h-full bg-white hover:!bg-white">
                  {Array.from({ length: 8 }, (_, index) => (
                    <td
                      key={`assignment-grid-filler-${index}`}
                      className="h-full border-r border-t border-slate-200 p-0 last:border-r-0"
                    />
                  ))}
                </tr>
              ) : null}
            </tbody>
          </Table>
        </PortalRecordsPanel>
      )}

      <AssignmentDetailsModal
        assignment={detailAssignment}
        onClose={() => setDetailAssignment(null)}
      />

      <Modal
        open={customerDeliveryOpen}
        onClose={() => setCustomerDeliveryOpen(false)}
        title="Send Customer Timesheets"
        subtitle="Combine submitted timesheets from multiple employees into one customer email"
        icon="send"
        tone="success"
        size="lg"
      >
        <div className="space-y-4">
          {customerDeliveryGroups.length > 0 ? (
            <div className="max-h-[28rem] divide-y divide-slate-100 overflow-auto rounded-xl border border-slate-200 bg-white">
              {customerDeliveryGroups.map((group) => (
                <div
                  key={group.customerId}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-4"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">
                      {group.customer?.companyName ?? group.timesheets[0]?.customer?.companyName ?? 'Customer'}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {group.timesheets.length} submitted timesheet{group.timesheets.length === 1 ? '' : 's'} ·{' '}
                      {group.employeeCount} employee{group.employeeCount === 1 ? '' : 's'} ·{' '}
                      {group.totalHours.toFixed(2)}h total
                    </p>
                    <p className="mt-1 text-xs font-semibold text-emerald-700">
                      {group.timesheets.filter((timesheet) => timesheet.readyToSend).length}/{group.timesheets.length} ready to send
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Recipient: {group.customer?.officeEmail || 'No office email configured'}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    icon="eye"
                    onClick={() => {
                      setDeliveryTimesheetOptions(group.timesheets);
                      setSelectedDeliveryTimesheetIds(
                        group.timesheets
                          .filter((timesheet) => timesheet.readyToSend)
                          .map((timesheet) => timesheet.id),
                      );
                      setDeliveryCustomerId(group.customerId);
                      setDeliveryError('');
                      setDeliveryResult('');
                      setCustomerDeliveryOpen(false);
                      setDeliveryOpen(true);
                    }}
                  >
                    Review &amp; Send
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
              No submitted, unsent customer timesheets are available for this work week.
            </div>
          )}
          <ModalFooter>
            <Button
              type="button"
              variant="secondary"
              icon="cancel"
              onClick={() => setCustomerDeliveryOpen(false)}
            >
              Close
            </Button>
          </ModalFooter>
        </div>
      </Modal>

      <Modal
        open={deliveryOpen}
        onClose={() => {
          if (!deliverTimesheetsMutation.isPending) setDeliveryOpen(false);
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
              <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Customer</p>
                  <p className="mt-1 font-semibold text-slate-800">
                    {selectedDeliveryCustomer?.companyName ?? selectedDeliveryTimesheets[0]?.customer?.companyName ?? '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Recipient</p>
                  <p className="mt-1 font-semibold text-slate-800">
                    {selectedDeliveryCustomer?.officeEmail || 'No office email configured'}
                  </p>
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="mb-3 text-xs font-medium uppercase tracking-widest text-slate-500">
                  Choose submitted timesheets
                </p>
                {deliveryTimesheetOptions.length > 0 ? (
                  <div className="max-h-72 divide-y divide-slate-100 overflow-auto">
                    {deliveryTimesheetOptions.map((timesheet) => {
                      const alreadySent = Boolean(
                        timesheet.deliveries?.length ||
                        timesheet.signature?.sentToCustomerOffice,
                      );
                      const selectable =
                        timesheet.status === 'SUBMITTED' &&
                        !timesheet.isTraining &&
                        !alreadySent &&
                        timesheet.readyToSend === true;
                      return (
                        <div
                          key={timesheet.id}
                          className="flex items-center gap-3 py-3"
                        >
                          <input
                            type="checkbox"
                            checked={selectedDeliveryTimesheetIds.includes(timesheet.id)}
                            disabled={!selectable}
                            onChange={(event) =>
                              setSelectedDeliveryTimesheetIds((current) =>
                                event.target.checked
                                  ? [...new Set([...current, timesheet.id])]
                                  : current.filter((id) => id !== timesheet.id),
                              )
                            }
                            className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-semibold text-slate-800">
                                {timesheet.employee
                                  ? `${timesheet.employee.firstName} ${timesheet.employee.lastName}`
                                  : 'Employee'}
                              </p>
                              {timesheet.isStandaloneManual ? (
                                <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-700">
                                  Manual Timesheet
                                </span>
                              ) : null}
                            </div>
                            <p className="text-xs text-slate-500">
                              {timesheet.jobSite?.name ?? 'Job site'} ·{' '}
                              {timesheet.weekStartDate && timesheet.weekEndDate
                                ? `${timesheet.weekStartDate} – ${timesheet.weekEndDate}`
                                : timesheet.workDate ?? 'No period'}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-primary">{timesheet.totalHours}h</p>
                            <p className={`text-[11px] font-bold uppercase ${selectable ? 'text-emerald-600' : 'text-slate-500'}`}>
                              {alreadySent
                                ? 'Sent'
                                : timesheet.status === 'SUBMITTED'
                                  ? 'Submitted'
                                  : 'Not submitted'}
                            </p>
                          </div>
                          {!alreadySent && timesheet.status === 'SUBMITTED' ? (
                            <Button
                              type="button"
                              size="sm"
                              variant={timesheet.readyToSend ? 'softPrimary' : 'secondary'}
                              icon={timesheet.readyToSend ? 'check' : 'checkCircle'}
                              loading={updatingReadyTimesheetId === timesheet.id}
                              disabled={Boolean(
                                updatingReadyTimesheetId &&
                                updatingReadyTimesheetId !== timesheet.id,
                              )}
                              onClick={() => void toggleTimesheetReady(timesheet)}
                            >
                              {timesheet.readyToSend ? 'Ready' : 'Mark Ready'}
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            icon="eye"
                            loading={viewingDeliveryTimesheetId === timesheet.id}
                            disabled={Boolean(
                              viewingDeliveryTimesheetId &&
                              viewingDeliveryTimesheetId !== timesheet.id,
                            )}
                            onClick={() => void openDeliveryTimesheet(timesheet)}
                          >
                            View
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="rounded-lg bg-slate-50 px-3 py-4 text-sm text-slate-600">
                    No timesheet has been created for this assignment yet.
                  </p>
                )}
              </div>
              {deliveryTimesheetOptions.length > 0 &&
                !deliveryTimesheetOptions.some(
                  (timesheet) =>
                    timesheet.status === 'SUBMITTED' &&
                    !timesheet.isTraining &&
                    !timesheet.deliveries?.length &&
                    !timesheet.signature?.sentToCustomerOffice,
                ) && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    No submitted, unsent timesheets are available. The employee must submit a timesheet to the office before it can be selected.
                  </div>
                )}
              {!selectedDeliveryCustomer?.officeEmail && (
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
                type="button"
                icon="check"
                onClick={() => {
                  setDeliveryOpen(false);
                  setSelectedDeliveryTimesheetIds([]);
                  setDeliveryTimesheetOptions([]);
                  setDeliveryCustomerId('');
                  setDeliveryResult('');
                }}
              >
                Done
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  icon="cancel"
                  disabled={deliverTimesheetsMutation.isPending}
                  onClick={() => setDeliveryOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  icon="send"
                  loading={deliverTimesheetsMutation.isPending}
                  disabled={
                    !selectedDeliveryTimesheetIds.length ||
                    !selectedDeliveryCustomer?.officeEmail
                  }
                  onClick={() => deliverTimesheetsMutation.mutate()}
                >
                  Send {selectedDeliveryTimesheetIds.length} Timesheet{selectedDeliveryTimesheetIds.length === 1 ? '' : 's'}
                </Button>
              </>
            )}
          </ModalFooter>
        </div>
      </Modal>

      <Modal
        open={timesheetGroupAssignments.length > 0}
        onClose={() => setTimesheetGroupAssignments([])}
        title="Assignment Timesheets"
        subtitle={
          timesheetGroupAssignments[0]
            ? `${employeeName(timesheetGroupAssignments[0])} · ${timesheetGroupAssignments[0].jobSite?.name ?? 'Job site'}`
            : undefined
        }
        icon="clock"
        size="lg"
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Select the visit day and timesheet you want to view.
          </p>
          <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
            {timesheetGroupAssignments.map((assignment) => {
              const timesheet = timesheetForAssignment(assignment);
              const received =
                !!timesheet && SUBMITTED_TIMESHEET_STATUSES.has(timesheet.status);
              return (
                <div
                  key={assignment.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800">
                      {new Date(`${assignment.assignedDate.split('T')[0]}T00:00:00`).toLocaleDateString(
                        undefined,
                        { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' },
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {assignment.startTime ? `Starts ${assignment.startTime} · ` : ''}
                      {timesheet
                        ? `${timesheet.totalHours ?? 0}h · ${timesheet.status}`
                        : 'Not submitted · 0h'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={
                        received
                          ? 'rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700'
                          : 'rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500'
                      }
                    >
                      {received ? 'Received' : 'Not submitted'}
                    </span>
                    <Button
                      size="sm"
                      variant="softPrimary"
                      icon="eye"
                      onClick={() => {
                        setTimesheetGroupAssignments([]);
                        void openAssignmentTimesheet(assignment);
                      }}
                    >
                      View Timesheet
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <ModalFooter>
          <Button
            variant="secondary"
            icon="cancel"
            onClick={() => setTimesheetGroupAssignments([])}
          >
            Close
          </Button>
        </ModalFooter>
      </Modal>

      <TimesheetDetailModal
        open={!!selectedTimesheet}
        onClose={() => {
          setSelectedTimesheet(null);
          setAssignmentTimesheetOptions([]);
        }}
        timesheet={selectedTimesheet}
        relatedTimesheets={assignmentTimesheetOptions}
        onSelectTimesheet={(timesheetId) => {
          const timesheet = assignmentTimesheetOptions.find((item) => item.id === timesheetId);
          if (timesheet) setSelectedTimesheet(timesheet);
        }}
        notice={timesheetSiteSummary?.notice}
        onViewMissingTimesheets={
          timesheetSiteSummary?.missing.length
            ? () => {
                setMissingTimesheetAssignments(timesheetSiteSummary.missing);
                setSelectedTimesheet(null);
              }
            : undefined
        }
        onEditHours={() => {
          window.location.assign('/timesheets');
        }}
      />

      <Modal
        open={missingTimesheetAssignments.length > 0}
        onClose={() => setMissingTimesheetAssignments([])}
        title="Unsubmitted Timesheets"
        subtitle={`${missingTimesheetAssignments.length} employee${missingTimesheetAssignments.length === 1 ? '' : 's'} still outstanding`}
        icon="clock"
        size="lg"
      >
        <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {missingTimesheetAssignments.map((assignment) => (
            <div
              key={assignment.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <div>
                <p className="font-semibold text-slate-800">{employeeName(assignment)}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {assignment.jobSite?.name ?? 'Job site'} · Assignment{' '}
                  {assignment.assignedDate.split('T')[0]}
                  {assignment.startTime ? ` at ${assignment.startTime}` : ''} · Week ending{' '}
                  {formatWeekEndingFridayLabel(workingWeek.weekEnd)}
                </p>
              </div>
              <Button
                size="sm"
                variant="softPrimary"
                icon="eye"
                onClick={() => {
                  setMissingTimesheetAssignments([]);
                  void openAssignmentTimesheet(assignment);
                }}
              >
                View Timesheet
              </Button>
            </div>
          ))}
        </div>
        <ModalFooter>
          <Button
            variant="secondary"
            icon="cancel"
            onClick={() => setMissingTimesheetAssignments([])}
          >
            Close
          </Button>
        </ModalFooter>
      </Modal>

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
        open={testJobOpen}
        onClose={() => {
          if (!createTestJobMutation.isPending) setTestJobOpen(false);
        }}
        title="Create Test Job"
        subtitle="Prepare a permanent training assignment and sample timesheet"
        icon="clock"
        tone="success"
      >
        <div className="space-y-4">
          {testJobError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {testJobError}
            </p>
          ) : null}
          <FormField label="Employee">
            <Select
              value={testJobEmployeeId}
              onChange={(event) => {
                setTestJobEmployeeId(event.target.value);
                setTestJobError('');
              }}
              className={portalFormFieldClassName}
              disabled={createTestJobMutation.isPending}
            >
              <option value="">Select employee</option>
              {(trainingAccounts ?? []).map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.firstName} {employee.lastName}
                </option>
              ))}
            </Select>
          </FormField>
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            This creates a blank training timesheet for the current work week under the
            permanent Timesheet Training Job. Hours come from the tester&apos;s actual
            clock-in/clock-out or manual entries. It can be reviewed and signed normally,
            but cannot be sent to a customer.
          </div>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-2">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-600">
                Manage Tester Accounts
              </p>
            </div>
            {(trainingAccounts ?? []).length ? (
              <div className="max-h-56 divide-y divide-slate-100 overflow-auto">
                {(trainingAccounts ?? []).map((employee) => (
                  <div
                    key={employee.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                  >
                    <div>
                      <p className="font-semibold text-slate-800">
                        {employee.firstName} {employee.lastName}
                      </p>
                      <p className="text-xs text-slate-500">{employee.phone}</p>
                    </div>
                    {testerPendingRemovalId === employee.id ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-red-700">
                          Delete account and training data?
                        </span>
                        <Button
                          size="sm"
                          variant="softDanger"
                          loading={deleteTesterMutation.isPending}
                          onClick={() => deleteTesterMutation.mutate(employee.id)}
                        >
                          Confirm
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={deleteTesterMutation.isPending}
                          onClick={() => setTesterPendingRemovalId('')}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="softDanger"
                        icon="cancel"
                        onClick={() => setTesterPendingRemovalId(employee.id)}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="px-4 py-5 text-center text-sm text-slate-500">
                No tester accounts have been created.
              </p>
            )}
          </div>
          <ModalFooter>
            <Button
              variant="secondary"
              icon="cancel"
              disabled={createTestJobMutation.isPending}
              onClick={() => setTestJobOpen(false)}
            >
              Cancel
            </Button>
            <Button
              icon="plus"
              loading={createTestJobMutation.isPending}
              disabled={!testJobEmployeeId}
              onClick={() => {
                if (testJobEmployeeId) createTestJobMutation.mutate(testJobEmployeeId);
              }}
            >
              Create Training Timesheet
            </Button>
          </ModalFooter>
        </div>
      </Modal>

      <Modal
        open={bulkPortalOpen}
        onClose={() => {
          if (bulkPortalSubmitting) return;
          setBulkPortalOpen(false);
        }}
        title="Bulk Portal Access"
        subtitle="Paste employees copied from the existing system"
        icon="userPlus"
        tone="success"
        size="lg"
      >
        <div className="space-y-4">
          <FormField label="Employees — one per line">
            <Textarea
              value={bulkPortalText}
              onChange={(event) => {
                setBulkPortalText(event.target.value);
                setBulkPortalResults([]);
              }}
              rows={8}
              placeholder={'Raymond McVeigh,6172934069\nJohn Smith,7815551234'}
              className={portalFormFieldClassName}
              disabled={bulkPortalSubmitting}
            />
          </FormField>
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
            Required format: <strong>Full Name,Phone Number</strong>. This creates an
            isolated tester account—it does not add the person to the real Employees list.
            The tester signs in with their full name and uses the phone digits as the password.
          </div>

          {bulkPortalResults.length > 0 ? (
            <div className="max-h-64 divide-y divide-slate-100 overflow-auto rounded-xl border border-slate-200 bg-white">
              {bulkPortalResults.map((result, index) => (
                <div
                  key={`${result.line}-${index}`}
                  className="flex items-start gap-3 px-4 py-3 text-sm"
                >
                  <span
                    className={
                      result.status === 'success'
                        ? 'mt-0.5 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700'
                        : 'mt-0.5 rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700'
                    }
                  >
                    {result.status === 'success' ? 'Created' : 'Failed'}
                  </span>
                  <div className="min-w-0">
                    <p className="break-words font-semibold text-slate-800">{result.line}</p>
                    <p className="mt-0.5 text-xs text-slate-600">{result.message}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <ModalFooter>
            <Button
              type="button"
              variant="secondary"
              icon="cancel"
              disabled={bulkPortalSubmitting}
              onClick={() => setBulkPortalOpen(false)}
            >
              Close
            </Button>
            <Button
              type="button"
              icon="userPlus"
              loading={bulkPortalSubmitting}
              onClick={() => void createBulkPortalAccess()}
            >
              Create Portal Access
            </Button>
          </ModalFooter>
        </div>
      </Modal>

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
          <div className="space-y-5">
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
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Manual Timesheet mobile tab</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {profileEmployee.manualTimesheetEnabled
                      ? 'This employee can see and use the Manual tab.'
                      : 'The Manual tab is hidden for this employee.'}
                  </p>
                </div>
                <Button
                  type="button"
                  variant={profileEmployee.manualTimesheetEnabled ? 'secondary' : 'primary'}
                  loading={manualAccessMutation.isPending}
                  onClick={() => manualAccessMutation.mutate(profileEmployee)}
                >
                  {profileEmployee.manualTimesheetEnabled ? 'Disable Manual Tab' : 'Enable Manual Tab'}
                </Button>
              </div>
              {manualAccessError ? (
                <p className="mt-3 text-sm font-medium text-red-600">{manualAccessError}</p>
              ) : null}
            </div>
          </div>
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
            <input type="hidden" {...form.register('employeeId')} />
            <div className="relative">
              <Input
                value={assignmentEmployeeQuery}
                className={portalFormFieldClassName}
                placeholder="Type an employee name"
                autoComplete="off"
                disabled={!!editing}
                onFocus={() => setAssignmentEmployeeResultsOpen(true)}
                onBlur={() => setAssignmentEmployeeResultsOpen(false)}
                onChange={(event) => {
                  const value = event.target.value;
                  setAssignmentEmployeeQuery(value);
                  setAssignmentEmployeeResultsOpen(true);
                  const exact = employees?.find(
                    (employee) =>
                      `${employee.firstName} ${employee.lastName}`.toLocaleLowerCase() ===
                      value.trim().toLocaleLowerCase(),
                  );
                  form.setValue('employeeId', exact?.id ?? '', {
                    shouldDirty: true,
                    shouldValidate: false,
                  });
                }}
              />
              {!editing && assignmentEmployeeResultsOpen ? (
                <div className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
                  {assignmentEmployeeResults.length ? (
                    assignmentEmployeeResults.slice(0, 12).map((employee) => (
                      <button
                        key={employee.id}
                        type="button"
                        className="block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-blue-50 hover:text-primary"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          setAssignmentEmployeeQuery(`${employee.firstName} ${employee.lastName}`);
                          form.setValue('employeeId', employee.id, {
                            shouldDirty: true,
                            shouldValidate: true,
                          });
                          setAssignmentEmployeeResultsOpen(false);
                        }}
                      >
                        <span className="font-semibold">{employee.firstName} {employee.lastName}</span>
                        {employee.masterEmployeeId ? (
                          <span className="ml-2 text-xs text-slate-400">{employee.masterEmployeeId}</span>
                        ) : null}
                      </button>
                    ))
                  ) : (
                    <p className="px-3 py-2 text-sm text-slate-500">No employees found.</p>
                  )}
                </div>
              ) : null}
            </div>
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
        open={!!newTimesheetTarget}
        onClose={() => setNewTimesheetTarget(null)}
        title="Create New Timesheet"
        subtitle="Confirm a separate visit for this assignment"
        icon="plus"
        tone="primary"
      >
        {newTimesheetTarget ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Proceed to create a new timesheet for <strong>{employeeName(newTimesheetTarget)}</strong>{' '}
              at <strong>{newTimesheetTarget.jobSite?.name ?? 'this job site'}</strong>?
            </p>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              <p><strong>Customer:</strong> {assignmentCustomerLabel(newTimesheetTarget) ?? 'Customer'}</p>
              <p><strong>Date:</strong> {newTimesheetTarget.assignedDate.split('T')[0]}</p>
            </div>
            <p className="text-xs text-slate-500">
              The original signed timesheet will remain unchanged. A separate assignment visit will be created with the same details.
            </p>
            {newTimesheetError ? (
              <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {newTimesheetError}
              </p>
            ) : null}
            <ModalFooter>
              <Button
                type="button"
                variant="secondary"
                icon="cancel"
                onClick={() => setNewTimesheetTarget(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                icon="plus"
                loading={newTimesheetMutation.isPending}
                onClick={() => newTimesheetMutation.mutate(newTimesheetTarget)}
              >
                Proceed
              </Button>
            </ModalFooter>
          </div>
        ) : null}
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
