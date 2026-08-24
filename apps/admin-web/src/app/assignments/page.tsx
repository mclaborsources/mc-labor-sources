'use client';

import { useMemo, useState, useEffect, type FormEvent } from 'react';
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
  DateCell,
} from '@/components/portal';
import { IconBriefcase, IconClock, IconUsers } from '@/components/dashboard';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { FormField } from '@/components/ui/FormField';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { DESTRUCTIVE_ACTION_PASS_CODE, PassCodeDialog } from '@/components/ui/PassCodeDialog';
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

function readableError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  if (typeof Event !== 'undefined' && error instanceof Event) {
    return 'The data request could not reach the server. Check the connection and try again.';
  }
  return fallback;
}

function canDeliverTimesheet(timesheet: Timesheet) {
  const latestDelivery = timesheet.deliveries?.[0];
  return !latestDelivery || Boolean(latestDelivery.reviewRequestedAt);
}

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

function addDaysToIsoDate(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatCompactHours(hours: number): string {
  if (Math.abs(hours) < 0.000001) return '';
  return hours.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

function workflowLogLabel(eventType: string): string {
  switch (eventType) {
    case 'TIMESHEET_APPROVED': return 'Timesheet Approved';
    case 'TIMESHEET_APPROVAL_REMOVED': return 'Approval Removed';
    case 'BULK_SEND_MARKED': return 'Marked for Bulk Send';
    case 'BULK_SEND_UNMARKED': return 'Removed from Bulk Send';
    case 'TIMESHEET_SENT': return 'Timesheet Sent';
    default: return eventType.replace(/_/g, ' ');
  }
}

function workflowLogTone(eventType: string): string {
  if (eventType === 'TIMESHEET_SENT') return 'bg-blue-100 text-blue-800';
  if (eventType === 'TIMESHEET_APPROVED') return 'bg-emerald-100 text-emerald-800';
  if (eventType === 'BULK_SEND_MARKED') return 'bg-violet-100 text-violet-800';
  return 'bg-amber-100 text-amber-900';
}

type TimesheetProgress = 'RECEIVED' | 'PARTIALLY_RECEIVED' | 'NOT_RECEIVED';
type DeliveryProgress = 'SENT' | 'PARTIALLY_SENT' | 'NOT_SENT';
type ReadyProgress = 'READY' | 'PARTIALLY_READY' | 'NOT_READY';
type TimesheetQuantityKey = 'received' | 'approved' | 'bulkSend' | 'sent' | 'rejected' | 'customerApproved';

const TIMESHEET_QUANTITY_OPTIONS: Array<{ value: TimesheetQuantityKey; label: string }> = [
  { value: 'received', label: 'Received EE' },
  { value: 'approved', label: 'Approved' },
  { value: 'bulkSend', label: 'Bulk Send' },
  { value: 'sent', label: 'Sent to Customer' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'customerApproved', label: 'Approved by Customer' },
];

function assignmentDisplayKey(assignment: Assignment): string {
  return assignment.status === 'COMPLETED'
    ? [
        assignment.employeeId,
        assignmentTargetCustomerId(assignment) ?? assignment.customerId,
        assignment.jobSiteId,
      ].join(':')
    : assignment.id;
}

function timesheetsForAssignmentVisits(
  assignments: Assignment[],
  timesheets: Timesheet[],
  weekStart: string,
  weekEnd: string,
): Timesheet[] {
  const representative = assignments[0];
  if (!representative) return [];
  const customerId = assignmentTargetCustomerId(representative) ?? representative.customerId;
  const weeklyTimesheets = timesheets.filter((timesheet) =>
    timesheetBelongsToWeek(timesheet, weekStart, weekEnd),
  );
  const assignmentIds = new Set(assignments.map((assignment) => assignment.id));
  const selected = weeklyTimesheets.filter((timesheet) =>
    (Boolean(timesheet.assignmentId) && assignmentIds.has(timesheet.assignmentId!)) ||
    (
      timesheet.isStandaloneManual === true &&
      timesheet.employeeId === representative.employeeId &&
      timesheet.customerId === customerId &&
      timesheet.jobSiteId === representative.jobSiteId
    ),
  );

  return [...new Map(selected.map((timesheet) => [timesheet.id, timesheet])).values()].sort((left, right) =>
    (left.workDate ?? left.createdAt ?? '').localeCompare(
      right.workDate ?? right.createdAt ?? '',
    ),
  );
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
  bulkSendCount: number;
  sentCount: number;
  rejectedCount: number;
  customerApprovedCount: number;
  timesheetProgress: TimesheetProgress;
  readyProgress: ReadyProgress;
  deliveryProgress: DeliveryProgress;
} {
  const key = assignmentDisplayKey(assignment);
  const group = assignments.filter((item) => assignmentDisplayKey(item) === key);
  const groupTimesheets = timesheetsForAssignmentVisits(group, timesheets, weekStart, weekEnd);
  const expectedCount = Math.max(1, group.length, groupTimesheets.length);
  const receivedCount = groupTimesheets.filter((timesheet) =>
    SUBMITTED_TIMESHEET_STATUSES.has(timesheet.status),
  ).length;
  const readyCount = groupTimesheets.filter((timesheet) => timesheet.readyToSend).length;
  const bulkSendCount = groupTimesheets.filter((timesheet) => timesheet.bulkSendMarked).length;
  const sentCount = groupTimesheets.filter((timesheet) =>
    Boolean(timesheet.deliveries?.length || timesheet.signature?.sentToCustomerOffice),
  ).length;
  const customerApprovedCount = groupTimesheets.filter((timesheet) =>
    Boolean(timesheet.deliveries?.[0]?.customerApprovedAt),
  ).length;
  const rejectedCount = groupTimesheets.filter((timesheet) =>
    Boolean(timesheet.deliveries?.[0]?.reviewRequestedAt),
  ).length;

  return {
    expectedCount,
    receivedCount,
    readyCount,
    bulkSendCount,
    sentCount,
    rejectedCount,
    customerApprovedCount,
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

function ProgressCountBadge({ count, total, label }: { count: number; total: number; label: string }) {
  const complete = count === total;
  const partial = count > 0 && !complete;
  return (
    <span
      className={cn(
        'mx-auto inline-flex items-center justify-center gap-0.5 text-[9px] font-black leading-none',
        complete
          ? 'text-emerald-700'
          : partial
            ? 'text-amber-800'
            : 'text-slate-500',
      )}
      title={`${count} of ${total} ${label}`}
    >
      <span
        className={cn(
          'flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs font-black',
          complete
            ? 'border-emerald-300 bg-emerald-100 text-emerald-700'
            : partial
              ? 'border-amber-300 bg-amber-50 text-amber-700'
              : 'border-slate-300 bg-slate-100 text-slate-400',
        )}
        aria-hidden
      >
        {complete ? '✓' : ''}
      </span>
      <span>{count}/{total}</span>
    </span>
  );
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
  const [customerNavigatorEnabled, setCustomerNavigatorEnabled] = useState(false);
  const [navigatedCustomerId, setNavigatedCustomerId] = useState('');
  const [customerMenuOpen, setCustomerMenuOpen] = useState(false);
  const [customerMenuSearch, setCustomerMenuSearch] = useState('');
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [deleteEmployeePassCodeOpen, setDeleteEmployeePassCodeOpen] = useState(false);
  const [deleteEmployeePassCode, setDeleteEmployeePassCode] = useState('');
  const [deleteEmployeePassCodeError, setDeleteEmployeePassCodeError] = useState('');
  const [removeSelectedWeekOpen, setRemoveSelectedWeekOpen] = useState(false);
  const [removeSelectedWeekError, setRemoveSelectedWeekError] = useState('');
  const [employeeColumnFilter, setEmployeeColumnFilter] = useState<string[]>([]);
  const [foremanFilter, setForemanFilter] = useState<string[]>([]);
  const [dateFilter, setDateFilter] = useState<string[]>([]);
  const [startFilter, setStartFilter] = useState<string[]>([]);
  const [timesheetFilter, setTimesheetFilter] = useState<string[]>([]);
  const [customerSentFilter, setCustomerSentFilter] = useState<string[]>([]);
  const [bulkSendFilter, setBulkSendFilter] = useState<string[]>([]);
  const [rejectedFilter, setRejectedFilter] = useState<string[]>([]);
  const [completionFilter, setCompletionFilter] = useState<string[]>([]);
  const [timesheetQuantityKey, setTimesheetQuantityKey] = useState<TimesheetQuantityKey>('received');
  const [selectedDeliveryTimesheetIds, setSelectedDeliveryTimesheetIds] = useState<string[]>([]);
  const [deliveryTimesheetOptions, setDeliveryTimesheetOptions] = useState<Timesheet[]>([]);
  const [deliveryCustomerId, setDeliveryCustomerId] = useState('');
  const [viewingDeliveryTimesheetId, setViewingDeliveryTimesheetId] = useState('');
  const [updatingReadyTimesheetId, setUpdatingReadyTimesheetId] = useState('');
  const [customerDeliveryOpen, setCustomerDeliveryOpen] = useState(false);
  const [customerHistoryOpen, setCustomerHistoryOpen] = useState(false);
  const [customerHistorySearch, setCustomerHistorySearch] = useState('');
  const [activityLogsOpen, setActivityLogsOpen] = useState(false);
  const [activityLogSearch, setActivityLogSearch] = useState('');
  const [activityLogType, setActivityLogType] = useState('ALL');
  const [reviewCustomerId, setReviewCustomerId] = useState('');
  const [reviewTimesheetFilter, setReviewTimesheetFilter] = useState<'ALL' | 'SUBMITTED' | 'NOT_SUBMITTED' | 'READY' | 'NOT_READY'>('ALL');
  const [reviewCustomerSearch, setReviewCustomerSearch] = useState('');
  const [reviewCustomerProgressFilter, setReviewCustomerProgressFilter] = useState<'ALL' | 'COMPLETE' | 'PARTIAL' | 'NOT_SUBMITTED'>('ALL');
  const [bulkReadyConfirmation, setBulkReadyConfirmation] = useState<boolean | null>(null);
  const [bulkReadyError, setBulkReadyError] = useState('');
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [deliveryError, setDeliveryError] = useState('');
  const [deliveryResult, setDeliveryResult] = useState('');
  const [deliveryMode, setDeliveryMode] = useState<'BULK' | 'INDIVIDUAL'>('BULK');
  const [deliveryConfirmationOpen, setDeliveryConfirmationOpen] = useState(false);
  const [bulkDeliveryOpen, setBulkDeliveryOpen] = useState(false);
  const [bulkDeliveryResults, setBulkDeliveryResults] = useState<Array<{
    customerId: string;
    customerName: string;
    timesheetCount: number;
    status: 'success' | 'error';
    message: string;
  }>>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState('');
  const [selectionActionError, setSelectionActionError] = useState('');
  const [deleteTimesheetsOpen, setDeleteTimesheetsOpen] = useState(false);
  const [deleteTimesheetTargets, setDeleteTimesheetTargets] = useState<Timesheet[]>([]);
  const [sort, setSort] = useState<{ column: string; direction: AssignmentSortDirection }>({
    column: 'employee',
    direction: 'asc',
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Assignment | null>(null);
  const [assignmentEmployeeQuery, setAssignmentEmployeeQuery] = useState('');
  const [assignmentEmployeeResultsOpen, setAssignmentEmployeeResultsOpen] = useState(false);
  const [profileEmployee, setProfileEmployee] = useState<Employee | null>(null);
  const [mobileTabAccessError, setMobileTabAccessError] = useState('');
  const [profileCustomer, setProfileCustomer] = useState<Customer | null>(null);
  const [editEmployee, setEditEmployee] = useState<Employee | null>(null);
  const [editEmployeeAssignment, setEditEmployeeAssignment] = useState<Assignment | null>(null);
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);
  const [editJobSite, setEditJobSite] = useState<JobSite | null>(null);
  const [detailAssignment, setDetailAssignment] = useState<Assignment | null>(null);
  const [selectedTimesheet, setSelectedTimesheet] = useState<Timesheet | null>(null);
  const [assignmentTimesheetOptions, setAssignmentTimesheetOptions] = useState<Timesheet[]>([]);
  const [missingTimesheetAssignments, setMissingTimesheetAssignments] = useState<Assignment[]>([]);
  const [timesheetGroupAssignments, setTimesheetGroupAssignments] = useState<Assignment[]>([]);
  const [timesheetChooserOptions, setTimesheetChooserOptions] = useState<Timesheet[]>([]);
  const [selectedChooserTimesheetIds, setSelectedChooserTimesheetIds] = useState<string[]>([]);
  const [actionAssignments, setActionAssignments] = useState<Assignment[]>([]);
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

  const activityLogsQuery = useQuery({
    queryKey: ['timesheet-workflow-audit'],
    queryFn: () => api.getTimesheetWorkflowAuditLogs(),
    enabled: activityLogsOpen,
  });

  const filteredActivityLogs = useMemo(() => {
    const search = activityLogSearch.trim().toLowerCase();
    return (activityLogsQuery.data ?? []).filter((log) => {
      if (activityLogType !== 'ALL' && log.eventType !== activityLogType) return false;
      if (!search) return true;
      return [log.actor?.name, log.actor?.email, log.employeeName, log.customerName, log.jobSiteName, log.timesheetId]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(search);
    });
  }, [activityLogSearch, activityLogType, activityLogsQuery.data]);

  const markedBulkTimesheets = useMemo(() => {
    const selectedBulkCustomerIds = new Set(
      (weekTimesheets ?? [])
        .filter((timesheet) =>
          selectedEmployeeIds.includes(timesheet.employeeId) &&
          timesheetBelongsToWeek(timesheet, workingWeek.weekStart, workingWeek.weekEnd) &&
          timesheet.bulkSendMarked === true,
        )
        .map((timesheet) => timesheet.customerId),
    );

    if (selectedBulkCustomerIds.size === 0) return [];

    return (weekTimesheets ?? []).filter((timesheet) =>
      selectedBulkCustomerIds.has(timesheet.customerId) &&
      timesheetBelongsToWeek(timesheet, workingWeek.weekStart, workingWeek.weekEnd) &&
      timesheet.status === 'SUBMITTED' &&
      timesheet.readyToSend === true &&
      timesheet.bulkSendMarked === true &&
      !timesheet.isTraining &&
      !timesheet.deliveries?.length,
    );
  }, [selectedEmployeeIds, weekTimesheets, workingWeek.weekEnd, workingWeek.weekStart]);

  const markedBulkCustomerGroups = useMemo(() => {
    const groups = new Map<string, Timesheet[]>();
    markedBulkTimesheets.forEach((timesheet) => {
      groups.set(timesheet.customerId, [...(groups.get(timesheet.customerId) ?? []), timesheet]);
    });
    return [...groups.entries()].map(([customerId, timesheets]) => ({
      customerId,
      customerName: customers?.find((customer) => customer.id === customerId)?.companyName ?? timesheets[0]?.customer?.companyName ?? 'Customer',
      timesheets,
    }));
  }, [customers, markedBulkTimesheets]);

  const mobileTabAccessMutation = useMutation({
    mutationFn: ({
      employee,
      field,
    }: {
      employee: Employee;
      field:
        | 'manualTimesheetEnabled'
        | 'mobileAssignmentsEnabled'
        | 'mobileClockEnabled'
        | 'mobilePreviousWeekEnabled'
        | 'mobileTasksEnabled'
        | 'mobileMessagesEnabled'
        | 'mobileProfileEnabled';
    }) =>
      api.updateEmployee(employee.id, {
        [field]: !employee[field],
      }),
    onSuccess: (employee) => {
      setMobileTabAccessError('');
      setProfileEmployee(employee);
      void queryClient.invalidateQueries({ queryKey: ['employees'] });
      void queryClient.invalidateQueries({ queryKey: ['assignments'] });
    },
    onError: (error) => {
      setMobileTabAccessError(
        error instanceof Error ? error.message : 'Could not update mobile tab access',
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
  const selectableDeliveryTimesheetIds = useMemo(
    () => deliveryTimesheetOptions
      .filter((timesheet) =>
        timesheet.status === 'SUBMITTED' &&
        !timesheet.isTraining &&
        canDeliverTimesheet(timesheet) &&
        timesheet.readyToSend === true &&
        (deliveryMode === 'INDIVIDUAL' || timesheet.bulkSendMarked === true),
      )
      .map((timesheet) => timesheet.id),
    [deliveryMode, deliveryTimesheetOptions],
  );
  const selectedDeliveryCustomer = customers?.find(
    (customer) => customer.id === deliveryCustomerId,
  );

  useEffect(() => {
    setSelectedDeliveryTimesheetIds([]);
    setDeliveryTimesheetOptions([]);
    setDeliveryCustomerId('');
    setCustomerDeliveryOpen(false);
    setReviewCustomerId('');
    setReviewTimesheetFilter('ALL');
    setReviewCustomerSearch('');
    setReviewCustomerProgressFilter('ALL');
    setDeliveryOpen(false);
    setBulkDeliveryOpen(false);
    setBulkDeliveryResults([]);
    setDeliveryError('');
    setDeliveryResult('');
  }, [workingWeek.weekStart, workingWeek.weekEnd]);

  const deliverTimesheetsMutation = useMutation({
    mutationFn: () => api.deliverTimesheetsToCustomer(selectedDeliveryTimesheetIds, deliveryMode),
    onSuccess: (result) => {
      setDeliveryConfirmationOpen(false);
      const failureDetails = result.failures.map((failure) => {
        const timesheet = deliveryTimesheetOptions.find((option) => option.id === failure.timesheetId);
        const employee = timesheet?.employee ? `${timesheet.employee.firstName} ${timesheet.employee.lastName}` : failure.timesheetId;
        return `${employee}: ${failure.error}`;
      });
      setDeliveryError(failureDetails.join('\n'));
      setDeliveryResult(
        `${result.timesheetsSent} timesheet${result.timesheetsSent === 1 ? '' : 's'} sent to ${result.recipientEmail}.${result.timesheetsFailed ? ` ${result.timesheetsFailed} failed and remain available to retry.` : ''}`,
      );
      setSelectedDeliveryTimesheetIds(result.failures.map((failure) => failure.timesheetId));
      void queryClient.invalidateQueries({ queryKey: ['timesheets'] });
      void queryClient.invalidateQueries({ queryKey: ['assignments'] });
    },
    onError: (error) => {
      setDeliveryConfirmationOpen(false);
      setDeliveryError(error instanceof Error ? error.message : 'Failed to send timesheets');
    },
  });

  const deliverMarkedBulkMutation = useMutation({
    mutationFn: async () => {
      const results: Array<{
        customerId: string;
        customerName: string;
        timesheetCount: number;
        status: 'success' | 'error';
        message: string;
      }> = [];
      for (const group of markedBulkCustomerGroups) {
        try {
          const result = await api.deliverTimesheetsToCustomer(
            group.timesheets.map((timesheet) => timesheet.id),
            'BULK',
          );
          results.push({ customerId: group.customerId, customerName: group.customerName, timesheetCount: result.timesheetsSent, status: 'success', message: `Sent to ${result.recipientEmail}` });
        } catch (error) {
          results.push({ customerId: group.customerId, customerName: group.customerName, timesheetCount: group.timesheets.length, status: 'error', message: error instanceof Error ? error.message : 'Delivery failed' });
        }
      }
      return results;
    },
    onSuccess: async (results) => {
      setBulkDeliveryResults(results);
      await queryClient.invalidateQueries({ queryKey: ['timesheets'] });
      await queryClient.invalidateQueries({ queryKey: ['assignments'] });
    },
  });

  const setCustomerBulkReadyMutation = useMutation({
    mutationFn: async (ready: boolean) => {
      if (!reviewCustomerGroup) throw new Error('Choose a customer first.');
      return api.setCustomerWeekBulkMarked(
        reviewCustomerGroup.customerId,
        workingWeek.weekStart,
        workingWeek.weekEnd,
        ready,
      );
    },
    onSuccess: async (updatedCount, ready) => {
      setBulkReadyError('');
      setBulkReadyConfirmation(null);
      await queryClient.invalidateQueries({ queryKey: ['timesheets'] });
      await queryClient.invalidateQueries({ queryKey: ['assignments'] });
      setDeliveryResult(
        ready
          ? `${updatedCount} timesheet${updatedCount === 1 ? '' : 's'} marked for bulk send. No email was sent.`
          : `${updatedCount} timesheet${updatedCount === 1 ? '' : 's'} removed from bulk send.`,
      );
    },
    onError: (error) => {
      setBulkReadyError(error instanceof Error ? error.message : 'Could not update bulk-send readiness.');
    },
  });

  const customerDeliveryHistory = useMemo(() => {
    const search = customerHistorySearch.trim().toLowerCase();
    return (weekTimesheets ?? [])
      .filter((timesheet) =>
        timesheetBelongsToWeek(timesheet, workingWeek.weekStart, workingWeek.weekEnd),
      )
      .filter((timesheet) => {
        const latestDelivery = timesheet.deliveries?.[0];
        return Boolean(latestDelivery?.reviewRequestedAt) && !latestDelivery?.customerApprovedAt;
      })
      .filter((timesheet) => {
        if (!search) return true;
        return [timesheet.customer?.companyName, timesheet.employee?.firstName, timesheet.employee?.lastName, timesheet.jobSite?.name]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(search);
      })
      .sort((left, right) => (right.deliveries?.[0]?.sentAt ?? '').localeCompare(left.deliveries?.[0]?.sentAt ?? ''));
  }, [customerHistorySearch, weekTimesheets, workingWeek.weekEnd, workingWeek.weekStart]);

  const deleteEmployeesMutation = useMutation({
    mutationFn: async (employeeIds: string[]) => {
      await Promise.all(employeeIds.map((employeeId) => api.deleteEmployee(employeeId)));
    },
    onSuccess: () => {
      setSelectedEmployeeIds([]);
      setDeleteEmployeePassCodeOpen(false);
      setDeleteEmployeePassCode('');
      setDeleteEmployeePassCodeError('');
      void queryClient.invalidateQueries({ queryKey: ['employees'] });
      void queryClient.invalidateQueries({ queryKey: ['assignments'] });
      void queryClient.invalidateQueries({ queryKey: ['timesheets'] });
      void queryClient.invalidateQueries({ queryKey: ['attendance'] });
    },
    onError: (error) => {
      setDeleteEmployeePassCodeError(
        error instanceof Error ? error.message : 'Could not delete the selected employees.',
      );
    },
  });

  const removeSelectedWeekMutation = useMutation({
    mutationFn: async () => {
      const selectedAssignments = weekFiltered.filter((assignment) =>
        selectedEmployeeIds.includes(assignment.employeeId),
      );
      await removeAssignmentsFromDisplayedWeek(selectedAssignments);
    },
    onSuccess: async () => {
      setRemoveSelectedWeekOpen(false);
      setRemoveSelectedWeekError('');
      setSelectedEmployeeIds([]);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['assignments'] }),
        queryClient.invalidateQueries({ queryKey: ['timesheets'] }),
      ]);
    },
    onError: (error) => setRemoveSelectedWeekError(
      readableError(error, 'Could not remove the selected employees from this week.'),
    ),
  });

  const deleteSelectedTimesheetsMutation = useMutation({
    mutationFn: async (timesheetIds: string[]) => {
      const failures: string[] = [];
      for (const timesheetId of timesheetIds) {
        try {
          await api.deleteUnsentTimesheet(timesheetId);
        } catch (error) {
          failures.push(readableError(error, `Could not delete timesheet ${timesheetId}.`));
        }
      }
      if (failures.length > 0) throw new Error(failures.join('\n'));
    },
    onSuccess: async () => {
      setDeleteTimesheetsOpen(false);
      setDeleteTimesheetTargets([]);
      setTimesheetChooserOptions([]);
      setSelectedChooserTimesheetIds([]);
      setSelectedEmployeeIds([]);
      setSelectionActionError('');
      await queryClient.invalidateQueries({ queryKey: ['timesheets'] });
      await queryClient.invalidateQueries({ queryKey: ['assignments'] });
    },
    onError: (error) => setSelectionActionError(
      readableError(error, 'Could not delete the selected timesheets.'),
    ),
  });

  function confirmDeleteEmployees(event: FormEvent) {
    event.preventDefault();
    if (deleteEmployeePassCode.trim() !== DESTRUCTIVE_ACTION_PASS_CODE) {
      setDeleteEmployeePassCodeError('Incorrect pass code.');
      return;
    }
    if (selectedEmployeeIds.length === 0) {
      setDeleteEmployeePassCodeError('Select at least one employee.');
      return;
    }
    deleteEmployeesMutation.mutate(selectedEmployeeIds);
  }


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

  const customerNavigatorOptions = useMemo(
    () => customersWithAssignments(customers ?? [], weekFiltered),
    [customers, weekFiltered],
  );

  const navigatedCustomerIndex = customerNavigatorOptions.findIndex(
    (customer) => customer.id === navigatedCustomerId,
  );
  const navigatedCustomer = navigatedCustomerIndex >= 0
    ? customerNavigatorOptions[navigatedCustomerIndex]
    : customerNavigatorOptions[0];

  const customerMenuOptions = useMemo(() => {
    const search = customerMenuSearch.trim().toLocaleLowerCase();
    if (!search) return customerNavigatorOptions;
    return customerNavigatorOptions.filter((customer) =>
      customer.companyName.toLocaleLowerCase().includes(search),
    );
  }, [customerMenuSearch, customerNavigatorOptions]);

  useEffect(() => {
    if (!customerNavigatorEnabled) return;
    if (customerNavigatorOptions.length === 0) {
      setNavigatedCustomerId('');
      return;
    }
    if (!customerNavigatorOptions.some((customer) => customer.id === navigatedCustomerId)) {
      setNavigatedCustomerId(customerNavigatorOptions[0].id);
    }
  }, [customerNavigatorEnabled, customerNavigatorOptions, navigatedCustomerId]);

  function navigateCustomer(direction: -1 | 1) {
    if (customerNavigatorOptions.length === 0) return;
    const currentIndex = Math.max(0, navigatedCustomerIndex);
    const nextIndex = (currentIndex + direction + customerNavigatorOptions.length) % customerNavigatorOptions.length;
    setNavigatedCustomerId(customerNavigatorOptions[nextIndex].id);
  }

  function selectCustomerFromMenu(customerId: string) {
    setNavigatedCustomerId(customerId);
    setCustomerNavigatorEnabled(true);
    setCustomerMenuOpen(false);
    setCustomerMenuSearch('');
  }

  const customerTimesheetReviewGroups = useMemo(() => {
    const groups = new Map<string, {
      customerId: string;
      customerName: string;
      rows: Array<{ key: string; assignment: Assignment | null; timesheet: Timesheet | null }>;
    }>();
    const addRow = (
      customerId: string,
      customerName: string,
      row: { key: string; assignment: Assignment | null; timesheet: Timesheet | null },
    ) => {
      const group = groups.get(customerId) ?? { customerId, customerName, rows: [] };
      group.rows.push(row);
      groups.set(customerId, group);
    };

    weekFiltered.forEach((assignment) => {
      const customerId = assignmentTargetCustomerId(assignment) ?? assignment.customerId;
      const customerName = assignmentCustomerLabel(assignment) ??
        customers?.find((customer) => customer.id === customerId)?.companyName ??
        'Customer';
      const assignmentTimesheets = (weekTimesheets ?? []).filter(
        (timesheet) =>
          timesheet.assignmentId === assignment.id &&
          timesheetBelongsToWeek(timesheet, workingWeek.weekStart, workingWeek.weekEnd),
      );
      if (assignmentTimesheets.length) {
        assignmentTimesheets.forEach((timesheet) => addRow(customerId, customerName, {
          key: timesheet.id,
          assignment,
          timesheet,
        }));
      } else {
        addRow(customerId, customerName, {
          key: `missing-${assignment.id}`,
          assignment,
          timesheet: null,
        });
      }
    });

    (weekTimesheets ?? [])
      .filter((timesheet) =>
        timesheet.isStandaloneManual === true &&
        timesheetBelongsToWeek(timesheet, workingWeek.weekStart, workingWeek.weekEnd),
      )
      .forEach((timesheet) => {
        const customerName = timesheet.customer?.companyName ??
          customers?.find((customer) => customer.id === timesheet.customerId)?.companyName ??
          'Customer';
        addRow(timesheet.customerId, customerName, {
          key: timesheet.id,
          assignment: null,
          timesheet,
        });
      });

    return [...groups.values()]
      .map((group) => {
        const submittedCount = group.rows.filter(({ timesheet }) =>
          Boolean(timesheet && SUBMITTED_TIMESHEET_STATUSES.has(timesheet.status)),
        ).length;
        const readyCount = group.rows.filter(({ timesheet }) =>
          Boolean(timesheet && SUBMITTED_TIMESHEET_STATUSES.has(timesheet.status) && timesheet.readyToSend),
        ).length;
        const bulkSendCount = group.rows.filter(({ timesheet }) => Boolean(timesheet?.bulkSendMarked)).length;
        return {
          ...group,
          submittedCount,
          readyCount,
          bulkSendCount,
          totalCount: group.rows.length,
          allSubmitted: group.rows.length > 0 && submittedCount === group.rows.length,
          allReady: group.rows.length > 0 && readyCount === group.rows.length,
          allBulkMarked: group.rows.length > 0 && bulkSendCount === group.rows.length,
          hasPreviousDelivery: group.rows.some(({ timesheet }) => Boolean(timesheet?.deliveries?.length)),
          canMarkForBulk: group.rows.length > 0 && group.rows.every(({ timesheet }) =>
            Boolean(
              timesheet &&
              timesheet.status === 'SUBMITTED' &&
              !timesheet.isTraining &&
              timesheet.readyToSend &&
              !timesheet.deliveries?.length,
            ),
          ),
          timesheets: group.rows.flatMap(({ timesheet }) => timesheet ? [timesheet] : []),
        };
      })
      .sort((left, right) => left.customerName.localeCompare(right.customerName));
  }, [customers, weekFiltered, weekTimesheets, workingWeek.weekEnd, workingWeek.weekStart]);

  const reviewCustomerGroup = customerTimesheetReviewGroups.find(
    (group) => group.customerId === reviewCustomerId,
  );

  const filteredCustomerTimesheetReviewGroups = customerTimesheetReviewGroups.filter((group) => {
    const matchesSearch = group.customerName.toLocaleLowerCase().includes(
      reviewCustomerSearch.trim().toLocaleLowerCase(),
    );
    const matchesProgress =
      reviewCustomerProgressFilter === 'ALL' ||
      (reviewCustomerProgressFilter === 'COMPLETE' && group.allSubmitted) ||
      (reviewCustomerProgressFilter === 'PARTIAL' && group.submittedCount > 0 && !group.allSubmitted) ||
      (reviewCustomerProgressFilter === 'NOT_SUBMITTED' && group.submittedCount === 0);
    return matchesSearch && matchesProgress;
  });

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
        const matchesCustomerNavigator =
          !customerNavigatorEnabled ||
          !navigatedCustomer?.id ||
          assignmentMatchesCustomer(assignment, navigatedCustomer.id);
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
          (timesheetFilter.includes('RECEIVED') && progress.timesheetProgress === 'RECEIVED') ||
          (timesheetFilter.includes('NOT_RECEIVED') && progress.timesheetProgress !== 'RECEIVED');
        const approvedFilter = customerSentFilter.filter((value) => value.includes('READY'));
        const sentFilter = customerSentFilter.filter((value) => value.includes('SENT'));
        const matchesApproved =
          approvedFilter.length === 0 ||
          (approvedFilter.includes('READY') && progress.readyProgress === 'READY') ||
          (approvedFilter.includes('NOT_READY') && progress.readyProgress !== 'READY');
        const matchesSent =
          sentFilter.length === 0 ||
          (sentFilter.includes('SENT') && progress.deliveryProgress === 'SENT') ||
          (sentFilter.includes('NOT_SENT') && progress.deliveryProgress !== 'SENT');
        const matchesBulkSend =
          bulkSendFilter.length === 0 ||
          (bulkSendFilter.includes('BULK_MARKED') && progress.bulkSendCount === progress.expectedCount) ||
          (bulkSendFilter.includes('NOT_BULK_MARKED') && progress.bulkSendCount !== progress.expectedCount);
        const matchesRejected =
          rejectedFilter.length === 0 ||
          (rejectedFilter.includes('REJECTED') && progress.rejectedCount > 0) ||
          (rejectedFilter.includes('NOT_REJECTED') && progress.rejectedCount === 0);
        const isCustomerApproved = progress.customerApprovedCount === progress.expectedCount;
        const matchesCompletion =
          completionFilter.length === 0 ||
          (completionFilter.includes('COMPLETE') && isCustomerApproved) ||
          (completionFilter.includes('NOT_COMPLETE') && !isCustomerApproved);
        return (
          matchesSalesman &&
          matchesCustomer &&
          matchesCustomerNavigator &&
          matchesJobSite &&
          matchesEmployeeSearch &&
          matchesCustomerSearch &&
          matchesEmployeeColumn &&
          matchesForeman &&
          matchesDate &&
          matchesStart &&
          matchesStatus &&
          matchesTimesheet &&
          matchesApproved &&
          matchesBulkSend &&
          matchesSent &&
          matchesRejected &&
          matchesCompletion
        );
      });
    },
    [
      weekFiltered,
      customerFilter,
      customerNavigatorEnabled,
      navigatedCustomer,
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
      bulkSendFilter,
      rejectedFilter,
      completionFilter,
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
        case 'received': return progress.timesheetProgress;
        case 'approved': return progress.readyProgress;
        case 'bulkSend': return String(progress.bulkSendCount).padStart(4, '0');
        case 'sent': return progress.deliveryProgress;
        case 'rejected': return String(progress.rejectedCount).padStart(4, '0');
        case 'complete': return String(progress.customerApprovedCount).padStart(4, '0');
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

  const timesheetQuantities = useMemo(() => {
    const groups = new Map<string, Assignment[]>();
    weekFiltered.forEach((assignment) => {
      const key = assignmentDisplayKey(assignment);
      groups.set(key, [...(groups.get(key) ?? []), assignment]);
    });

    return [...groups.values()].reduce(
      (summary, assignments) => {
        const progress = assignmentGroupProgress(
          assignments[0],
          weekFiltered,
          weekTimesheets ?? [],
          workingWeek.weekStart,
          workingWeek.weekEnd,
        );
        summary.total += 1;
        summary.received += progress.timesheetProgress === 'RECEIVED' ? 1 : 0;
        summary.approved += progress.readyProgress === 'READY' ? 1 : 0;
        summary.bulkSend += progress.bulkSendCount === progress.expectedCount ? 1 : 0;
        summary.sent += progress.deliveryProgress === 'SENT' ? 1 : 0;
        summary.rejected += progress.rejectedCount > 0 ? 1 : 0;
        summary.customerApproved += progress.customerApprovedCount === progress.expectedCount ? 1 : 0;
        return summary;
      },
      { total: 0, received: 0, approved: 0, bulkSend: 0, sent: 0, rejected: 0, customerApproved: 0 },
    );
  }, [weekFiltered, weekTimesheets, workingWeek.weekEnd, workingWeek.weekStart]);

  const selectedTimesheetQuantity = timesheetQuantities[timesheetQuantityKey];

  const visibleEmployeeSelectionOptions = useMemo(() => {
    const options = new Map<string, string>();
    assignmentDisplayGroups.forEach(({ assignment }) => {
      if (!assignment.employeeId) return;
      options.set(
        assignment.employeeId,
        assignment.employee
          ? `${assignment.employee.firstName} ${assignment.employee.lastName}`
          : 'Unknown employee',
      );
    });
    return [...options.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [assignmentDisplayGroups]);

  const selectedRowTimesheets = useMemo(
    () => (weekTimesheets ?? []).filter((timesheet) =>
      selectedEmployeeIds.includes(timesheet.employeeId) &&
      timesheetBelongsToWeek(timesheet, workingWeek.weekStart, workingWeek.weekEnd),
    ),
    [selectedEmployeeIds, weekTimesheets, workingWeek.weekEnd, workingWeek.weekStart],
  );
  const selectedUnsentTimesheets = useMemo(
    () => selectedRowTimesheets.filter((timesheet) =>
      !timesheet.deliveries?.length && !timesheet.signature?.sentToCustomerOffice,
    ),
    [selectedRowTimesheets],
  );
  const selectedIndividualSendTimesheets = useMemo(
    () => selectedRowTimesheets.filter((timesheet) =>
      timesheet.status === 'SUBMITTED' &&
      timesheet.readyToSend === true &&
      !timesheet.isTraining &&
      canDeliverTimesheet(timesheet),
    ),
    [selectedRowTimesheets],
  );
  const selectedCustomerIds = useMemo(
    () => [...new Set(selectedRowTimesheets.map((timesheet) => timesheet.customerId))],
    [selectedRowTimesheets],
  );

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
      bulkSendFilter.length > 0 ||
      rejectedFilter.length > 0 ||
      completionFilter.length > 0 ||
      customerNavigatorEnabled ||
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
    setBulkSendFilter([]);
    setRejectedFilter([]);
    setCompletionFilter([]);
    setCustomerNavigatorEnabled(false);
    setNavigatedCustomerId('');
    setEmployeeSearch('');
    setCustomerSearch('');
  }

  function applyTimesheetQuantityFilter(scope: 'total' | 'completed' | 'todo') {
    setTimesheetFilter([]);
    setCustomerSentFilter([]);
    setBulkSendFilter([]);
    setRejectedFilter([]);
    setCompletionFilter([]);
    if (scope === 'total') return;

    const completed = scope === 'completed';
    switch (timesheetQuantityKey) {
      case 'received':
        setTimesheetFilter([completed ? 'RECEIVED' : 'NOT_RECEIVED']);
        break;
      case 'approved':
        setCustomerSentFilter([completed ? 'READY' : 'NOT_READY']);
        break;
      case 'bulkSend':
        setBulkSendFilter([completed ? 'BULK_MARKED' : 'NOT_BULK_MARKED']);
        break;
      case 'sent':
        setCustomerSentFilter([completed ? 'SENT' : 'NOT_SENT']);
        break;
      case 'rejected':
        setRejectedFilter([completed ? 'REJECTED' : 'NOT_REJECTED']);
        break;
      case 'customerApproved':
        setCompletionFilter([completed ? 'COMPLETE' : 'NOT_COMPLETE']);
        break;
    }
  }

  async function refreshAssignmentData() {
    setIsRefreshing(true);
    setRefreshError('');
    try {
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ['assignments'] }),
        queryClient.refetchQueries({ queryKey: ['timesheets'] }),
        queryClient.refetchQueries({ queryKey: ['attendance'] }),
        queryClient.refetchQueries({ queryKey: ['customers'] }),
        queryClient.refetchQueries({ queryKey: ['employees'] }),
      ]);
    } catch (error) {
      setRefreshError(readableError(error, 'Could not refresh assignment data. Please try again.'));
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
    return timesheetsForAssignmentVisits(
      assignments,
      weekTimesheets ?? [],
      workingWeek.weekStart,
      workingWeek.weekEnd,
    );
  };

  async function removeAssignmentsFromDisplayedWeek(assignments: Assignment[]) {
    const dayBeforeWeek = addDaysToIsoDate(workingWeek.weekStart, -1);
    const dayAfterWeek = addDaysToIsoDate(workingWeek.weekEnd, 1);
    await Promise.all(assignments.map(async (assignment) => {
      const assignmentStart = assignment.assignedDate.split('T')[0];
      const assignmentEnd = assignment.endDate?.split('T')[0] ?? null;
      const continuesBeforeWeek = assignmentStart < workingWeek.weekStart;
      const continuesAfterWeek = !assignmentEnd || assignmentEnd > workingWeek.weekEnd;

      if (!continuesBeforeWeek && !continuesAfterWeek) {
        await api.deleteAssignment(assignment.id);
        return;
      }
      if (continuesBeforeWeek && !continuesAfterWeek) {
        await api.updateAssignment(assignment.id, { endDate: dayBeforeWeek });
        return;
      }
      if (!continuesBeforeWeek && continuesAfterWeek) {
        await api.updateAssignment(assignment.id, { assignedDate: dayAfterWeek });
        return;
      }

      await api.createAssignment({
        employeeId: assignment.employeeId,
        customerId: assignment.customerId,
        jobSiteId: assignment.jobSiteId,
        assignedDate: dayAfterWeek,
        endDate: assignmentEnd,
        startTime: assignment.startTime,
        endTime: assignment.endTime,
        status: assignment.status,
        notes: assignment.notes,
        payRate: assignment.payRate,
        jobPosition: assignment.jobPosition,
        masterAssignmentId: assignment.masterAssignmentId,
      });
      await api.updateAssignment(assignment.id, { endDate: dayBeforeWeek });
    }));
  }

  async function openAssignmentTimesheet(assignment: Assignment) {
    setSelectionActionError('');
    let timesheets: Timesheet[];
    try {
      timesheets = await api.getTimesheets({
        employeeId: assignment.employeeId,
        assignmentId: assignment.id,
        weekStart: workingWeek.weekStart,
        weekEnd: workingWeek.weekEnd,
      });
    } catch (error) {
      setSelectionActionError(readableError(error, 'Could not open this timesheet.'));
      return;
    }
    if (timesheets.length) {
      const sorted = timesheets.sort((left, right) =>
        (right.createdAt ?? '').localeCompare(left.createdAt ?? ''),
      );
      const openedTimesheet = sorted[0];
      const customerAssignments = weekFiltered.filter(
        (option) =>
          (assignmentTargetCustomerId(option) ?? option.customerId) === openedTimesheet.customerId,
      );
      const customerTimesheets = (weekTimesheets ?? []).filter(
        (option) => option.customerId === openedTimesheet.customerId && timesheetBelongsToWeek(option, workingWeek.weekStart, workingWeek.weekEnd),
      );
      const assignmentTimesheets = customerAssignments.map((assigned) => {
        const assignmentTimesheet = customerTimesheets.find((option) => option.assignmentId === assigned.id);
        if (assignmentTimesheet) return assignmentTimesheet;
        return {
          id: `missing-${assigned.id}`,
          employeeId: assigned.employeeId,
          customerId: openedTimesheet.customerId,
          jobSiteId: assigned.jobSiteId,
          assignmentId: assigned.id,
          weekStartDate: workingWeek.weekStart,
          weekEndDate: workingWeek.weekEnd,
          totalHours: 0,
          status: 'NO TIMESHEET',
          employee: assigned.employee,
          customer: openedTimesheet.customer,
          jobSite: assigned.jobSite,
          entries: [],
          deliveries: [],
        } satisfies Timesheet;
      });
      const optionIds = [...new Set([openedTimesheet.id, ...assignmentTimesheets.filter((option) => !option.id.startsWith('missing-')).map((option) => option.id)])];
      const fullOptions = await Promise.all(
        optionIds.map(async (id) => {
          if (id === openedTimesheet.id) return openedTimesheet;
          const listTimesheet = assignmentTimesheets.find((option) => option.id === id);
          try {
            return await api.getTimesheet(id);
          } catch {
            return listTimesheet!;
          }
        }),
      );
      setAssignmentTimesheetOptions([...fullOptions, ...assignmentTimesheets.filter((option) => option.id.startsWith('missing-'))]);
      setSelectedTimesheet(openedTimesheet);
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
    const customerAssignments = weekFiltered.filter(
      (option) =>
        (assignmentTargetCustomerId(option) ?? option.customerId) === customerId,
    );
    const customerAssignmentOptions = customerAssignments.map((assigned) => {
      if (assigned.id === assignment.id) return preview;
      const existingTimesheet = (weekTimesheets ?? []).find(
        (option) =>
          option.assignmentId === assigned.id &&
          timesheetBelongsToWeek(option, workingWeek.weekStart, workingWeek.weekEnd),
      );
      if (existingTimesheet) return existingTimesheet;
      return {
        id: `missing-${assigned.id}`,
        employeeId: assigned.employeeId,
        customerId,
        jobSiteId: assigned.jobSiteId,
        assignmentId: assigned.id,
        weekStartDate: workingWeek.weekStart,
        weekEndDate: workingWeek.weekEnd,
        totalHours: 0,
        status: 'NO TIMESHEET',
        employee: assigned.employee,
        customer: customer ? { id: customer.id, companyName: customer.companyName } : undefined,
        jobSite: assigned.jobSite,
        entries: [],
        deliveries: [],
      } satisfies Timesheet;
    });
    setAssignmentTimesheetOptions(
      customerAssignmentOptions.some((option) => option.id === preview.id)
        ? customerAssignmentOptions
        : [preview, ...customerAssignmentOptions],
    );
    setSelectedTimesheet(preview);
  }

  async function openDeliveryTimesheet(timesheet: Timesheet, options = deliveryTimesheetOptions) {
    setViewingDeliveryTimesheetId(timesheet.id);
    try {
      const fullTimesheets = await Promise.all(
        options.map((option) => api.getTimesheet(option.id)),
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
      queryClient.setQueryData<Timesheet[]>(
        ['timesheets', 'assignments'],
        (current) => current?.map((item) =>
          item.id === updated.id ? { ...item, ...updated } : item,
        ),
      );
      setSelectedDeliveryTimesheetIds((current) =>
        updated.readyToSend
          ? current
          : current.filter((timesheetId) => timesheetId !== updated.id),
      );
      await queryClient.invalidateQueries({ queryKey: ['timesheets', 'assignments'] });
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
      contentClassName="w-full px-2 py-2 sm:px-3 lg:px-4"
    >
      <div className="relative bg-white lg:sticky lg:top-16 lg:z-30">
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

      <PortalFilterPanel compact showHeader={false} className="!pt-1">
        <div className="space-y-1.5">
          <div className="hidden"><WeekEndingFilter value={workingWeek} onChange={setWorkingWeek} /></div>

          <div>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 xl:grid-cols-[0.8fr_0.8fr_2fr]">
              <PortalFilterField label="Search Employee" className="!space-y-0 [&>span]:sr-only">
                <Input
                  type="search"
                  value={employeeSearch}
                  onChange={(event) => setEmployeeSearch(event.target.value)}
                  placeholder="Search by employee name"
                  className={cn(portalFieldClassName, '!h-8 !min-h-8 !py-1.5 !text-xs')}
                  aria-label="Search assignments by employee"
                />
              </PortalFilterField>
              <PortalFilterField label="Search Customer" className="!space-y-0 [&>span]:sr-only">
                <Input
                  type="search"
                  value={customerSearch}
                  onChange={(event) => setCustomerSearch(event.target.value)}
                  placeholder="Search by customer name"
                  className={cn(portalFieldClassName, '!h-8 !min-h-8 !py-1.5 !text-xs')}
                  aria-label="Search assignments by customer"
                />
              </PortalFilterField>
              <PortalFilterField label="Browse Customers" className="!space-y-0 [&>span]:sr-only">
                <div className="flex h-8 min-w-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => navigateCustomer(-1)}
                    disabled={!customerNavigatorEnabled || customerNavigatorOptions.length < 2}
                    className="hidden"
                    aria-label="Previous customer"
                  >
                    ‹
                  </button>
                  <div
                    className="hidden"
                    title={customerNavigatorEnabled ? navigatedCustomer?.companyName : 'Customer browsing is off'}
                  >
                    <span className="truncate">
                      {customerNavigatorEnabled
                        ? navigatedCustomer?.companyName ?? 'No customers this week'
                        : 'All customers'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigateCustomer(1)}
                    disabled={!customerNavigatorEnabled || customerNavigatorOptions.length < 2}
                    className="hidden"
                    aria-label="Next customer"
                  >
                    ›
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const nextEnabled = !customerNavigatorEnabled;
                      setCustomerNavigatorEnabled(nextEnabled);
                      if (nextEnabled && !navigatedCustomerId && customerNavigatorOptions[0]) {
                        setNavigatedCustomerId(customerNavigatorOptions[0].id);
                      }
                    }}
                    aria-pressed={customerNavigatorEnabled}
                    className={cn(
                      'hidden',
                      customerNavigatorEnabled
                        ? 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700'
                        : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50',
                    )}
                  >
                    {customerNavigatorEnabled ? 'ON' : 'OFF'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomerMenuOpen(true)}
                    className="hidden"
                  >
                    Customer Menu
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomerHistoryOpen(true)}
                    className="hidden"
                  >
                    Customer Reviews
                  </button>
                </div>
              </PortalFilterField>
              <div className="pointer-events-none flex items-start justify-end gap-2 sm:col-span-2 xl:col-span-3 xl:-mt-12">
                <details className="group pointer-events-auto relative shrink-0">
                  <summary className="flex h-10 cursor-pointer list-none items-center rounded-lg border border-slate-700 bg-slate-900 px-4 text-xs font-bold text-white shadow-sm hover:bg-slate-800">
                    Timesheet Menu <span className="ml-2 transition group-open:rotate-180">▾</span>
                  </summary>
                  <div className="absolute right-0 top-11 z-50 grid w-72 gap-1.5 rounded-xl border border-slate-300 bg-white p-2 shadow-xl [&_button]:!w-full [&_button]:!justify-start [&_button]:!text-xs">
                    <Button type="button" icon={selectedRowTimesheets.some((timesheet) => timesheet.bulkSendMarked) ? 'cancel' : 'checkCircle'} disabled={selectedRowTimesheets.length === 0} onClick={() => {
                      setSelectionActionError('');
                      if (selectedCustomerIds.length !== 1) { setSelectionActionError('Select rows for one customer at a time before marking bulk send.'); return; }
                      setReviewCustomerId(selectedCustomerIds[0]); setBulkReadyError(''); setBulkReadyConfirmation(!selectedRowTimesheets.some((timesheet) => timesheet.bulkSendMarked));
                    }}>{selectedRowTimesheets.some((timesheet) => timesheet.bulkSendMarked) ? 'Unmark Customer Bulk Send' : 'Customer Timesheets Ready for Bulk Send'}</Button>
                    <Button type="button" variant="secondary" icon="checkCircle" onClick={() => {
                      setReviewCustomerId(''); setReviewTimesheetFilter('ALL'); setReviewCustomerSearch(''); setReviewCustomerProgressFilter('ALL'); setDeliveryResult(''); setDeliveryError(''); setBulkReadyError(''); setCustomerDeliveryOpen(true);
                    }}>Prepare Customer Timesheets</Button>
                    <Button type="button" icon="send" disabled={markedBulkTimesheets.length === 0} onClick={() => { setBulkDeliveryResults([]); setBulkDeliveryOpen(true); }}>Send Bulk Timesheets{markedBulkTimesheets.length ? ` (${markedBulkTimesheets.length})` : ''}</Button>
                    <Button type="button" variant="secondary" icon="send" disabled={selectedIndividualSendTimesheets.length === 0} onClick={() => {
                      setSelectionActionError(''); const customerIds = [...new Set(selectedIndividualSendTimesheets.map((timesheet) => timesheet.customerId))];
                      if (customerIds.length !== 1) { setSelectionActionError('Select timesheets for one customer at a time before sending.'); return; }
                      setDeliveryMode('INDIVIDUAL'); setDeliveryCustomerId(customerIds[0]); setDeliveryTimesheetOptions(selectedIndividualSendTimesheets); setSelectedDeliveryTimesheetIds(selectedIndividualSendTimesheets.map((timesheet) => timesheet.id)); setDeliveryResult(''); setDeliveryError(''); setDeliveryOpen(true);
                    }}>Send Timesheet{selectedIndividualSendTimesheets.length > 1 ? `s (${selectedIndividualSendTimesheets.length})` : ''}</Button>
                    <Button type="button" variant="softDanger" icon="trash" disabled={selectedUnsentTimesheets.length === 0} onClick={() => { setSelectionActionError(''); setDeleteTimesheetTargets(selectedUnsentTimesheets); setDeleteTimesheetsOpen(true); }}>Delete Timesheet{selectedUnsentTimesheets.length > 1 ? `s (${selectedUnsentTimesheets.length})` : ''}</Button>
                  </div>
                </details>
                <div className="pointer-events-auto grid w-full max-w-xl grid-cols-[minmax(10rem,1fr)_repeat(3,5rem)] overflow-hidden rounded-lg border border-slate-300 bg-white text-xs shadow-sm">
                  <div className="border-r border-slate-200 bg-slate-50 p-1.5">
                    <Select
                      value={timesheetQuantityKey}
                      onChange={(event) => setTimesheetQuantityKey(event.target.value as TimesheetQuantityKey)}
                      className="!h-8 !min-h-8 !py-1 !text-xs font-bold"
                      aria-label="Timesheet quantity"
                    >
                      {TIMESHEET_QUANTITY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </Select>
                  </div>
                  <div className="border-r border-slate-200 text-center">
                    <p className="bg-slate-900 px-1 py-1 font-bold text-white">Total</p>
                    <button type="button" className="h-9 w-full font-black text-slate-800 hover:bg-blue-50 hover:text-blue-700" onClick={() => applyTimesheetQuantityFilter('total')}>
                      {timesheetQuantities.total}
                    </button>
                  </div>
                  <div className="border-r border-slate-200 text-center">
                    <p className="bg-slate-900 px-1 py-1 font-bold text-white">X</p>
                    <button type="button" className="h-9 w-full font-black text-emerald-700 hover:bg-emerald-50" onClick={() => applyTimesheetQuantityFilter('completed')}>
                      {selectedTimesheetQuantity}
                    </button>
                  </div>
                  <div className="text-center">
                    <p className="bg-slate-900 px-1 py-1 font-bold text-white">To Do</p>
                    <button type="button" className="h-9 w-full font-black text-amber-700 hover:bg-amber-50" onClick={() => applyTimesheetQuantityFilter('todo')}>
                      {Math.max(0, timesheetQuantities.total - selectedTimesheetQuantity)}
                    </button>
                  </div>
                </div>
              </div>
              <div className="relative flex min-h-10 flex-wrap items-center justify-start gap-1.5 border-t border-slate-200 pt-1.5 sm:col-span-2 xl:col-span-3 [&_button]:!min-h-8 [&_button]:!py-1.5 [&_button]:!text-xs">
                <div className="order-9 flex h-8 shrink-0 items-center overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm" aria-label="Select assignment rows">
                  <span className="border-r border-slate-200 px-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">Select</span>
                  <button type="button" className="h-full border-r border-slate-200 px-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:text-slate-300" disabled={selectedEmployeeIds.length === 0} onClick={() => setSelectedEmployeeIds([])}>Clear</button>
                  <button type="button" className="h-full px-2 text-xs font-bold text-blue-700 hover:bg-blue-50 disabled:text-slate-300" disabled={visibleEmployeeSelectionOptions.length === 0 || selectedEmployeeIds.length === visibleEmployeeSelectionOptions.length} onClick={() => setSelectedEmployeeIds(visibleEmployeeSelectionOptions.map((option) => option.value))}>All</button>
                </div>
                <Button
                  type="button"
                  variant="softDanger"
                  icon="trash"
                  className="hidden"
                  disabled={selectedUnsentTimesheets.length === 0}
                  onClick={() => {
                    setSelectionActionError('');
                    setDeleteTimesheetTargets(selectedUnsentTimesheets);
                    setDeleteTimesheetsOpen(true);
                  }}
                >
                  Delete Timesheet{selectedUnsentTimesheets.length > 1 ? `s (${selectedUnsentTimesheets.length})` : ''}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  icon="send"
                  className="hidden"
                  disabled={selectedIndividualSendTimesheets.length === 0}
                  onClick={() => {
                    setSelectionActionError('');
                    const customerIds = [...new Set(selectedIndividualSendTimesheets.map((timesheet) => timesheet.customerId))];
                    if (customerIds.length !== 1) {
                      setSelectionActionError('Select timesheets for one customer at a time before sending.');
                      return;
                    }
                    setDeliveryMode('INDIVIDUAL');
                    setDeliveryCustomerId(customerIds[0]);
                    setDeliveryTimesheetOptions(selectedIndividualSendTimesheets);
                    setSelectedDeliveryTimesheetIds(selectedIndividualSendTimesheets.map((timesheet) => timesheet.id));
                    setDeliveryResult('');
                    setDeliveryError('');
                    setDeliveryOpen(true);
                  }}
                >
                  Send Timesheet{selectedIndividualSendTimesheets.length > 1 ? `s (${selectedIndividualSendTimesheets.length})` : ''}
                </Button>
                <Button
                  type="button"
                  className={cn(
                    'hidden',
                    selectedRowTimesheets.some((timesheet) => timesheet.bulkSendMarked)
                      ? '!border-amber-300 !bg-amber-50 !from-amber-50 !via-amber-50 !to-amber-100 !text-amber-900'
                      : '!bg-slate-950 !from-slate-950 !via-slate-950 !to-black',
                  )}
                  icon={selectedRowTimesheets.some((timesheet) => timesheet.bulkSendMarked) ? 'cancel' : 'checkCircle'}
                  disabled={selectedRowTimesheets.length === 0}
                  onClick={() => {
                    setSelectionActionError('');
                    if (selectedCustomerIds.length !== 1) {
                      setSelectionActionError('Select rows for one customer at a time before marking bulk send.');
                      return;
                    }
                    setReviewCustomerId(selectedCustomerIds[0]);
                    setBulkReadyError('');
                    setBulkReadyConfirmation(
                      !selectedRowTimesheets.some((timesheet) => timesheet.bulkSendMarked),
                    );
                  }}
                >
                  {selectedRowTimesheets.some((timesheet) => timesheet.bulkSendMarked)
                    ? 'Unmark Customer Bulk Send'
                    : 'Customer Timesheets Ready for Bulk Send'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  icon="checkCircle"
                  className="hidden"
                  onClick={() => {
                    setReviewCustomerId('');
                    setReviewTimesheetFilter('ALL');
                    setReviewCustomerSearch('');
                    setReviewCustomerProgressFilter('ALL');
                    setDeliveryResult('');
                    setDeliveryError('');
                    setBulkReadyError('');
                    setCustomerDeliveryOpen(true);
                  }}
                >
                  Prepare Customer Timesheets
                </Button>
                <Button
                  type="button"
                  icon="send"
                  className="hidden"
                  disabled={markedBulkTimesheets.length === 0}
                  onClick={() => {
                    setBulkDeliveryResults([]);
                    setBulkDeliveryOpen(true);
                  }}
                >
                  Send Bulk Timesheets{markedBulkTimesheets.length ? ` (${markedBulkTimesheets.length})` : ''}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  icon={<span className="text-base leading-none" aria-hidden="true">↻</span>}
                  className="order-2"
                  loading={isRefreshing}
                  onClick={() => void refreshAssignmentData()}
                >
                  Refresh Data
                </Button>
                <Button
                  type="button"
                  variant="softDanger"
                  icon="trash"
                  className="order-2"
                  disabled={selectedEmployeeIds.length === 0}
                  onClick={() => { setRemoveSelectedWeekError(''); setRemoveSelectedWeekOpen(true); }}
                >
                  Delete Employees ({selectedEmployeeIds.length})
                </Button>
                <div className="order-3 flex items-center gap-1.5 xl:absolute xl:left-1/2 xl:top-1/2 xl:-translate-x-1/2 xl:-translate-y-1/2">
                <div className="flex h-8 w-80 shrink-0 items-center gap-1 overflow-hidden" aria-label="Browse customers">
                  <button type="button" onClick={() => navigateCustomer(-1)} disabled={!customerNavigatorEnabled || customerNavigatorOptions.length < 2} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white font-black text-blue-700 shadow-sm hover:bg-blue-50 disabled:cursor-not-allowed disabled:text-slate-300" aria-label="Previous customer">‹</button>
                  <div className="flex h-8 min-w-0 flex-1 items-center justify-center rounded-lg border border-slate-300 bg-white px-2 text-center text-xs font-semibold text-slate-800" title={customerNavigatorEnabled ? navigatedCustomer?.companyName : 'Customer browsing is off'}>
                    <span className="truncate">{customerNavigatorEnabled ? navigatedCustomer?.companyName ?? 'No customers this week' : 'All customers'}</span>
                  </div>
                  <button type="button" onClick={() => navigateCustomer(1)} disabled={!customerNavigatorEnabled || customerNavigatorOptions.length < 2} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white font-black text-blue-700 shadow-sm hover:bg-blue-50 disabled:cursor-not-allowed disabled:text-slate-300" aria-label="Next customer">›</button>
                  <button type="button" onClick={() => {
                    const nextEnabled = !customerNavigatorEnabled;
                    setCustomerNavigatorEnabled(nextEnabled);
                    if (nextEnabled && !navigatedCustomerId && customerNavigatorOptions[0]) setNavigatedCustomerId(customerNavigatorOptions[0].id);
                  }} aria-pressed={customerNavigatorEnabled} className={cn('h-8 shrink-0 rounded-lg border px-2 text-[10px] font-bold shadow-sm', customerNavigatorEnabled ? 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50')}>
                    {customerNavigatorEnabled ? 'ON' : 'OFF'}
                  </button>
                </div>
                <button type="button" onClick={() => setCustomerMenuOpen(true)} className="h-8 shrink-0 rounded-lg border border-blue-600 bg-blue-50 px-2 text-[10px] font-bold text-blue-700 shadow-sm hover:bg-blue-100">
                  Customer Menu
                </button>
                <button type="button" onClick={() => setCustomerHistoryOpen(true)} className="h-8 shrink-0 rounded-lg border border-violet-300 bg-violet-50 px-2 text-[10px] font-bold text-violet-700 shadow-sm hover:bg-violet-100">
                  Customer Reviews
                </button>
                </div>
                <Button type="button" variant="secondary" icon="clock" className="order-4 ml-auto" onClick={() => setActivityLogsOpen(true)}>
                  Activity Logs
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="order-1"
                  onClick={clearFilters}
                  aria-label="Clear all assignment filters and searches"
                >
                  Clear Filters
                </Button>
              </div>
              {refreshError ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 sm:col-span-2 xl:col-span-3" role="alert">
                  {refreshError}
                </div>
              ) : null}
              {selectionActionError ? (
                <div className="whitespace-pre-line rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 sm:col-span-2 xl:col-span-3" role="alert">
                  {selectionActionError}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </PortalFilterPanel>
      </div>

      <Modal
        open={activityLogsOpen}
        onClose={() => setActivityLogsOpen(false)}
        title="Timesheet Activity Logs"
        subtitle="Who performed each approval, bulk-send preparation, and customer delivery action"
        icon="clock"
        tone="neutral"
        fullScreen
        headerCloseLabel="Close"
      >
        <div className="flex h-full min-h-0 flex-col gap-4">
          <div className="grid shrink-0 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Approvals</p><p className="mt-1 text-2xl font-black text-emerald-950">{(activityLogsQuery.data ?? []).filter((log) => log.eventType.includes('APPROVAL') || log.eventType === 'TIMESHEET_APPROVED').length}</p></div>
            <div className="rounded-xl border border-violet-200 bg-violet-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-violet-700">Bulk Preparation</p><p className="mt-1 text-2xl font-black text-violet-950">{(activityLogsQuery.data ?? []).filter((log) => log.eventType.startsWith('BULK_SEND')).length}</p></div>
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-blue-700">Sent</p><p className="mt-1 text-2xl font-black text-blue-950">{(activityLogsQuery.data ?? []).filter((log) => log.eventType === 'TIMESHEET_SENT').length}</p></div>
          </div>

          <div className="grid shrink-0 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-[minmax(0,1fr)_18rem_auto]">
            <Input type="search" value={activityLogSearch} onChange={(event) => setActivityLogSearch(event.target.value)} placeholder="Search administrator, employee, customer, site, or timesheet ID" aria-label="Search activity logs" />
            <Select value={activityLogType} onChange={(event) => setActivityLogType(event.target.value)} aria-label="Filter activity type">
              <option value="ALL">All activities</option>
              <option value="TIMESHEET_APPROVED">Timesheet approved</option>
              <option value="TIMESHEET_APPROVAL_REMOVED">Approval removed</option>
              <option value="BULK_SEND_MARKED">Marked for bulk send</option>
              <option value="BULK_SEND_UNMARKED">Removed from bulk send</option>
              <option value="TIMESHEET_SENT">Timesheet sent</option>
            </Select>
            <Button
              type="button"
              variant="secondary"
              icon={<span className="text-base leading-none" aria-hidden="true">↻</span>}
              loading={activityLogsQuery.isFetching}
              onClick={() => void activityLogsQuery.refetch()}
            >
              Refresh Logs
            </Button>
          </div>

          <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-slate-200 bg-white">
            {activityLogsQuery.isLoading ? <LoadingState /> : activityLogsQuery.error ? (
              <div className="m-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{readableError(activityLogsQuery.error, 'Could not load activity logs.')}</div>
            ) : filteredActivityLogs.length === 0 ? (
              <EmptyState title="No activity logs found" description="Approval, bulk preparation, and delivery events will appear here." />
            ) : (
              <table className="w-full min-w-[70rem] text-left text-sm">
                <thead className="sticky top-0 z-10 bg-slate-200 text-xs uppercase tracking-wide text-slate-700">
                  <tr><th className="px-4 py-3">When</th><th className="px-4 py-3">Who</th><th className="px-4 py-3">Action</th><th className="px-4 py-3">Employee</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Job Site</th><th className="px-4 py-3">Details</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredActivityLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50">
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-700">{new Date(log.occurredAt).toLocaleString()}</td>
                      <td className="px-4 py-3"><p className="font-bold text-slate-900">{log.actor?.name ?? 'System'}</p>{log.actor?.email ? <p className="text-xs text-slate-500">{log.actor.email}</p> : null}</td>
                      <td className="px-4 py-3"><span className={cn('inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide', workflowLogTone(log.eventType))}>{workflowLogLabel(log.eventType)}</span></td>
                      <td className="px-4 py-3 font-medium text-slate-800">{log.employeeName}</td>
                      <td className="px-4 py-3 text-slate-700">{log.customerName}</td>
                      <td className="px-4 py-3 text-slate-700">{log.jobSiteName}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {log.eventType === 'TIMESHEET_SENT' ? <><p>Mode: {String(log.metadata.delivery_mode ?? 'Previous delivery')}</p><p>Recipient: {String(log.metadata.recipient_email ?? '—')}</p></> : <p>Timesheet owner: {log.employeeName || 'Unknown employee'}</p>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        open={bulkDeliveryOpen}
        onClose={() => { if (!deliverMarkedBulkMutation.isPending) setBulkDeliveryOpen(false); }}
        title="Send Bulk Timesheets"
        subtitle={`Week ending ${formatWeekEndingFridayLabel(workingWeek.weekEnd)}`}
        icon="send"
        tone="success"
        size="lg"
      >
        <div className="space-y-4">
          {bulkDeliveryResults.length === 0 ? (
            <>
              <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
                You are about to email {markedBulkTimesheets.length} marked timesheet{markedBulkTimesheets.length === 1 ? '' : 's'} to {markedBulkCustomerGroups.length} customer{markedBulkCustomerGroups.length === 1 ? '' : 's'}. This action cannot be undone.
              </p>
              <div className="max-h-80 divide-y divide-slate-100 overflow-auto rounded-xl border border-slate-200 bg-white">
                {markedBulkCustomerGroups.map((group) => (
                  <div key={group.customerId} className="flex items-center justify-between gap-4 px-4 py-3">
                    <div><p className="font-semibold text-slate-900">{group.customerName}</p><p className="mt-1 text-xs text-slate-500">{customers?.find((customer) => customer.id === group.customerId)?.officeEmail || 'No office email configured'}</p></div>
                    <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-700">{group.timesheets.length} timesheet{group.timesheets.length === 1 ? '' : 's'}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-slate-800">Bulk delivery finished. Successful customers will not be included in a retry.</p>
              <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
                {bulkDeliveryResults.map((result) => (
                  <div key={result.customerId} className="flex items-start justify-between gap-4 px-4 py-3">
                    <div><p className="font-semibold text-slate-900">{result.customerName}</p><p className={cn('mt-1 text-xs', result.status === 'success' ? 'text-emerald-700' : 'text-red-700')}>{result.message}</p></div>
                    <span className={cn('rounded-full px-3 py-1 text-xs font-bold', result.status === 'success' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700')}>{result.status === 'success' ? 'Sent' : 'Failed'} · {result.timesheetCount}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <ModalFooter>
            {bulkDeliveryResults.length === 0 ? <>
              <Button type="button" variant="secondary" disabled={deliverMarkedBulkMutation.isPending} onClick={() => setBulkDeliveryOpen(false)}>Cancel</Button>
              <Button type="button" icon="send" loading={deliverMarkedBulkMutation.isPending} disabled={markedBulkTimesheets.length === 0} onClick={() => deliverMarkedBulkMutation.mutate()}>Send {markedBulkTimesheets.length} Bulk Timesheet{markedBulkTimesheets.length === 1 ? '' : 's'}</Button>
            </> : <>
              {bulkDeliveryResults.some((result) => result.status === 'error') && markedBulkTimesheets.length > 0 ? <Button type="button" variant="secondary" onClick={() => setBulkDeliveryResults([])}>Review Failed &amp; Retry</Button> : null}
              <Button type="button" onClick={() => setBulkDeliveryOpen(false)}>Close</Button>
            </>}
          </ModalFooter>
        </div>
      </Modal>

      <Modal
        open={customerHistoryOpen}
        onClose={() => { setCustomerHistoryOpen(false); setCustomerHistorySearch(''); }}
        title="Customer Timesheet Reviews"
        subtitle={`Timesheets returned for review in the week ending ${formatWeekEndingFridayLabel(workingWeek.weekEnd)}`}
        icon="eye"
        fullScreen
      >
        <div className="space-y-4">
          <Input type="search" value={customerHistorySearch} onChange={(event) => setCustomerHistorySearch(event.target.value)} placeholder="Search customer, employee, or job site" aria-label="Search customer timesheet history" />
          {customerDeliveryHistory.length ? <div className="overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="divide-y divide-slate-100">{customerDeliveryHistory.map((timesheet) => {
            const delivery = timesheet.deliveries?.find(
              (item) => Boolean(item.reviewRequestedAt) && !item.customerApprovedAt,
            );
            const employee = `${timesheet.employee?.firstName ?? ''} ${timesheet.employee?.lastName ?? ''}`.trim() || 'Employee';
            const decision = 'Changes Requested';
            return <div key={timesheet.id} className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(13rem,1fr)_auto] lg:items-center"><div><p className="font-bold text-slate-900">{timesheet.customer?.companyName ?? 'Customer'}</p><p className="mt-1 text-sm text-slate-700">{employee} · {timesheet.jobSite?.name ?? 'Job site'}</p><p className="mt-1 text-xs text-slate-500">Sent {delivery?.sentAt ? new Date(delivery.sentAt).toLocaleString() : '—'} to {delivery?.recipientEmail ?? 'customer'}</p></div><div><span className={cn('inline-flex rounded-full px-3 py-1 text-xs font-bold', delivery?.customerApprovedAt ? 'bg-emerald-100 text-emerald-700' : delivery?.reviewRequestedAt ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-700')}>{decision}</span>{delivery?.reviewRequestedAt ? <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><p className="font-bold">Customer comment</p><p className="mt-1 whitespace-pre-wrap">{delivery.reviewComment || 'No comment provided.'}</p></div> : null}</div><Button type="button" size="sm" variant="secondary" icon="eye" onClick={() => void openDeliveryTimesheet(timesheet, customerDeliveryHistory)}>View Timesheet</Button></div>;
          })}</div></div> : <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">No unapproved timesheets have been returned by customers for review.</div>}
          <ModalFooter><Button type="button" variant="secondary" icon="cancel" onClick={() => { setCustomerHistoryOpen(false); setCustomerHistorySearch(''); }}>Close</Button></ModalFooter>
        </div>
      </Modal>

      <Modal
        open={customerMenuOpen}
        onClose={() => {
          setCustomerMenuOpen(false);
          setCustomerMenuSearch('');
        }}
        title="Customer Menu"
        subtitle="Choose a company to show only its information on the assignments screen."
        fullScreen
        icon="building"
        headerCloseLabel="Close"
      >
        <div className="flex h-full min-h-0 flex-col">
          <Input
            type="search"
            value={customerMenuSearch}
            onChange={(event) => setCustomerMenuSearch(event.target.value)}
            placeholder="Search companies"
            aria-label="Search customer menu"
            autoFocus
            className="mb-3 shrink-0"
          />

          {customerMenuOptions.length > 0 ? (
          <div className="grid min-h-0 flex-1 auto-rows-[3rem] content-start grid-cols-2 gap-1 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
            {customerMenuOptions.map((customer) => {
              const selected = customerNavigatorEnabled && navigatedCustomer?.id === customer.id;
              return (
                <button
                  key={customer.id}
                  type="button"
                  onClick={() => selectCustomerFromMenu(customer.id)}
                  aria-pressed={selected}
                  className={cn(
                    'flex h-12 items-center rounded-md border px-2.5 py-1.5 text-left text-xs font-semibold leading-tight shadow-sm transition focus:outline-none focus:ring-2 focus:ring-blue-300',
                    selected
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : 'border-slate-300 bg-white text-slate-800 hover:border-blue-400 hover:bg-blue-50',
                  )}
                >
                  {customer.companyName}
                </button>
              );
            })}
          </div>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <EmptyState
                title={customerNavigatorOptions.length ? 'No matching companies' : 'No customers this week'}
                description={
                  customerNavigatorOptions.length
                    ? 'Try a different company name.'
                    : 'There are no customer assignments in the selected working week.'
                }
              />
            </div>
          )}

          <ModalFooter className="mt-3 shrink-0">
          {customerNavigatorEnabled ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setCustomerNavigatorEnabled(false);
                setCustomerMenuOpen(false);
                setCustomerMenuSearch('');
              }}
            >
              Show All Customers
            </Button>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setCustomerMenuOpen(false);
              setCustomerMenuSearch('');
            }}
          >
            Close
          </Button>
          </ModalFooter>
        </div>
      </Modal>

      {isLoading && <LoadingState />}
      {!isLoading && (
        <PortalRecordsPanel showHeader={false} title="Assignment schedule" count={filtered.length} countLabel="assignments">
          <Table
            hasActions
            compact
            layoutFixed
            noHorizontalScroll
            className="h-full w-full min-w-0 text-xs [&_th]:!border-r [&_th]:!border-slate-500 [&_th]:!bg-slate-300 [&_th]:!px-1 [&_th]:!text-center [&_th]:!font-extrabold [&_th]:!tracking-wide [&_th]:!text-slate-950 [&_th>div>button>span:first-child]:whitespace-normal [&_th>div>button>span:first-child]:text-center [&_th>div>button>span:first-child]:leading-tight [&_td]:overflow-hidden [&_td]:text-ellipsis [&_td]:border-r [&_td]:border-slate-200 [&_tr>*:last-child]:!border-r-0"
            containerClassName="assignment-table-scroll h-[max(28rem,calc(100dvh-18rem))] overflow-y-auto overflow-x-hidden overscroll-contain"
          >
            <colgroup>
              <col className="w-[9%]" />
              <col className="w-[10%]" />
              <col className="w-[11%]" />
              <col className="w-[5%]" />
              {Array.from({ length: 10 }, (_, index) => <col key={`hours-column-${index}`} className="w-[3.4%]" />)}
              <col className="w-[5%]" />
              <col className="w-[4%]" />
              <col className="w-[4%]" />
              <col className="w-[4%]" />
              <col className="w-[4%]" />
              <col className="w-[4%]" />
              <col className="w-[4%]" />
              <col className="w-[4%]" />
              <col className="w-[4%]" />
              <col className="w-[4%]" />
              <col className="w-[1.25%]" />
            </colgroup>
            <thead className="sticky top-0 z-20 bg-slate-300">
              <tr>
                <Th><AssignmentColumnHeader label="Employees" options={columnOptions.employees} selected={employeeColumnFilter} onSelectedChange={setEmployeeColumnFilter} sortDirection={sort.column === 'employee' ? sort.direction : undefined} onSort={(direction) => setSort({ column: 'employee', direction })} /></Th>
                <Th><AssignmentColumnHeader label="Customers" options={filterCustomers.map((customer) => ({ value: customer.id, label: customer.companyName }))} selected={customerFilter} onSelectedChange={setCustomerFilter} sortDirection={sort.column === 'customer' ? sort.direction : undefined} onSort={(direction) => setSort({ column: 'customer', direction })} /></Th>
                <Th><AssignmentColumnHeader label="Job Sites" options={filterJobSites.map((site) => ({ value: site.id, label: site.name }))} selected={jobSiteFilter} onSelectedChange={setJobSiteFilter} sortDirection={sort.column === 'jobSite' ? sort.direction : undefined} onSort={(direction) => setSort({ column: 'jobSite', direction })} /></Th>
                <Th><AssignmentColumnHeader label="Salesman" options={filterSalesmen.map((salesman) => ({ value: salesman, label: salesman || '(Blanks)' }))} selected={salesmanFilter} onSelectedChange={setSalesmanFilter} sortDirection={sort.column === 'salesman' ? sort.direction : undefined} onSort={(direction) => setSort({ column: 'salesman', direction })} /></Th>
                {['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'TH', 'RH', 'OT'].map((label) => (
                  <Th key={label} className="!px-0.5 text-center text-[10px] leading-none">{label}</Th>
                ))}
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
                <ThActions className="!min-w-0" />
                <Th>
                  <AssignmentColumnHeader
                    label="Received EE"
                    compact
                    options={[
                      { value: 'RECEIVED', label: 'Yes — received' },
                      { value: 'NOT_RECEIVED', label: 'No — not received' },
                    ]}
                    selected={timesheetFilter}
                    onSelectedChange={setTimesheetFilter}
                    sortDirection={sort.column === 'received' ? sort.direction : undefined}
                    onSort={(direction) => setSort({ column: 'received', direction })}
                  />
                </Th>
                <Th>
                  <AssignmentColumnHeader
                    label="Approved"
                    compact
                    options={[
                      { value: 'READY', label: 'Yes — approved' },
                      { value: 'NOT_READY', label: 'No — not approved' },
                    ]}
                    selected={customerSentFilter.filter((value) => value.includes('READY'))}
                    onSelectedChange={(values) => setCustomerSentFilter((current) => [
                      ...current.filter((value) => !value.includes('READY')),
                      ...values,
                    ])}
                    sortDirection={sort.column === 'approved' ? sort.direction : undefined}
                    onSort={(direction) => setSort({ column: 'approved', direction })}
                  />
                </Th>
                <Th><AssignmentColumnHeader compact label="Bulk Send" options={[{ value: 'BULK_MARKED', label: 'Marked for bulk' }, { value: 'NOT_BULK_MARKED', label: 'Not marked' }]} selected={bulkSendFilter} onSelectedChange={setBulkSendFilter} sortDirection={sort.column === 'bulkSend' ? sort.direction : undefined} onSort={(direction) => setSort({ column: 'bulkSend', direction })} /></Th>
                <Th>
                  <AssignmentColumnHeader
                    label="Sent to CU"
                    compact
                    options={[
                      { value: 'SENT', label: 'Yes — sent' },
                      { value: 'NOT_SENT', label: 'No — not sent' },
                    ]}
                    selected={customerSentFilter.filter((value) => value.includes('SENT'))}
                    onSelectedChange={(values) => setCustomerSentFilter((current) => [
                      ...current.filter((value) => !value.includes('SENT')),
                      ...values,
                    ])}
                    sortDirection={sort.column === 'sent' ? sort.direction : undefined}
                    onSort={(direction) => setSort({ column: 'sent', direction })}
                  />
                </Th>
                <Th><AssignmentColumnHeader compact label="Rejected" options={[{ value: 'REJECTED', label: 'Yes — rejected' }, { value: 'NOT_REJECTED', label: 'No — not rejected' }]} selected={rejectedFilter} onSelectedChange={setRejectedFilter} sortDirection={sort.column === 'rejected' ? sort.direction : undefined} onSort={(direction) => setSort({ column: 'rejected', direction })} /></Th>
                <Th><AssignmentColumnHeader compact label="Approved by CU" options={[{ value: 'COMPLETE', label: 'All approved' }, { value: 'NOT_COMPLETE', label: 'Not all approved' }]} selected={completionFilter} onSelectedChange={setCompletionFilter} sortDirection={sort.column === 'complete' ? sort.direction : undefined} onSort={(direction) => setSort({ column: 'complete', direction })} /></Th>
                <Th
                  className="!px-0 text-center [&>div]:!mx-0 [&>div]:w-full [&_button>span:first-child]:!text-sm [&_button>span:first-child]:!font-black [&_button>span:first-child]:!leading-none"
                  title="Employee selection options"
                >
                  <AssignmentColumnHeader
                    compact
                    label="S"
                    options={visibleEmployeeSelectionOptions}
                    selected={selectedEmployeeIds}
                    onSelectedChange={setSelectedEmployeeIds}
                    selectionMode
                    searchLabel="employees"
                  />
                </Th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr className="bg-white hover:!bg-white">
                  <td colSpan={24} className="border-0 p-0">
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
                  className="hover:bg-primary/[0.025]"
                >
                  <Td>
                    {a.employee ? (
                      <button
                        type="button"
                        onDoubleClick={(event) => {
                          event.stopPropagation();
                          setProfileEmployee(null);
                          setEditEmployeeAssignment(a);
                          setEditEmployee(a.employee!);
                        }}
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.stopPropagation();
                            setEditEmployeeAssignment(a);
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
                  {(() => {
                    const groupTimesheets = timesheetsForAssignmentGroup(groupedAssignments);
                    const entries = groupTimesheets.flatMap((timesheet) => timesheet.entries ?? []);
                    const dailyHours = Array.from({ length: 7 }, (_, dayIndex) => {
                      const workDate = addDaysToIsoDate(workingWeek.weekStart, dayIndex);
                      return entries
                        .filter((entry) => entry.workDate === workDate)
                        .reduce((total, entry) => total + Number(entry.hours || 0), 0);
                    });
                    const totalHours = groupTimesheets.reduce(
                      (total, timesheet) => total + Number(timesheet.totalHours || 0),
                      0,
                    );
                    const regularHours = Math.min(40, totalHours);
                    const overtimeHours = Math.max(0, totalHours - 40);

                    return [...dailyHours, totalHours, regularHours, overtimeHours].map((hours, index) => (
                      <Td
                        key={`weekly-hours-${key}-${index}`}
                        className="!px-0.5 text-center text-[10px] font-semibold tabular-nums text-slate-700"
                        title={hours ? `${formatCompactHours(hours)} hours` : 'No hours'}
                      >
                        {formatCompactHours(hours)}
                      </Td>
                    ));
                  })()}
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
                      className="max-w-full rounded-full !px-1.5 !py-0.5 !text-[9px] !leading-tight normal-case tracking-tight transition duration-200 ease-out hover:-translate-y-0.5 hover:scale-105 hover:shadow-md"
                    />
                  </Td>
                  <Td className="text-center" onDoubleClick={(event) => event.stopPropagation()}>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        const matchingTimesheets = timesheetsForAssignmentGroup(groupedAssignments);
                        if (matchingTimesheets.length > 1) {
                          setTimesheetChooserOptions(matchingTimesheets);
                          setSelectedChooserTimesheetIds([]);
                        } else if (groupedAssignments.length > 1) {
                          setTimesheetGroupAssignments(groupedAssignments);
                        } else {
                          void openAssignmentTimesheet(a);
                        }
                      }}
                      className="inline-flex items-center justify-center rounded-lg border border-primary/20 bg-white px-2 py-1 text-[11px] font-semibold text-primary shadow-sm hover:bg-primary/5"
                      title="View employee timesheet"
                    >
                      {timesheetsForAssignmentGroup(groupedAssignments).length > 1
                        ? `View (${timesheetsForAssignmentGroup(groupedAssignments).length})`
                        : groupedAssignments.length > 1
                          ? `View (${groupedAssignments.length})`
                          : 'View'}
                    </button>
                  </Td>
                  <Td className="text-center">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => setActionAssignments(groupedAssignments)}
                      className="!h-7 !rounded-lg !px-2 !py-1 !text-[10px]"
                    >
                      Actions
                    </Button>
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
                      return <ProgressCountBadge count={progress.receivedCount} total={progress.expectedCount} label="timesheets received from employee" />;
                    })()}
                  </Td>
                  <Td>
                    {(() => {
                      const progress = assignmentGroupProgress(
                        a,
                        weekFiltered,
                        weekTimesheets ?? [],
                        workingWeek.weekStart,
                        workingWeek.weekEnd,
                      );
                      return <ProgressCountBadge count={progress.readyCount} total={progress.expectedCount} label="timesheets approved" />;
                    })()}
                  </Td>
                  <Td>
                    {(() => {
                      const progress = assignmentGroupProgress(a, weekFiltered, weekTimesheets ?? [], workingWeek.weekStart, workingWeek.weekEnd);
                      return <ProgressCountBadge count={progress.bulkSendCount} total={progress.expectedCount} label="timesheets marked for bulk send" />;
                    })()}
                  </Td>
                  <Td>
                    {(() => {
                      const progress = assignmentGroupProgress(a, weekFiltered, weekTimesheets ?? [], workingWeek.weekStart, workingWeek.weekEnd);
                      return <ProgressCountBadge count={progress.sentCount} total={progress.expectedCount} label="timesheets sent to customer" />;
                    })()}
                  </Td>
                  <Td>
                    {(() => {
                      const progress = assignmentGroupProgress(a, weekFiltered, weekTimesheets ?? [], workingWeek.weekStart, workingWeek.weekEnd);
                      return <ProgressCountBadge count={progress.rejectedCount} total={progress.expectedCount} label="timesheets rejected by customer" />;
                    })()}
                  </Td>
                  <Td className="text-center">
                    {(() => {
                      const progress = assignmentGroupProgress(a, weekFiltered, weekTimesheets ?? [], workingWeek.weekStart, workingWeek.weekEnd);
                      return <ProgressCountBadge count={progress.customerApprovedCount} total={progress.expectedCount} label="timesheets approved by customer" />;
                    })()}
                  </Td>
                  <Td className="!p-0 text-center">
                    {a.employeeId ? (
                      <div className="flex w-full items-center justify-center">
                        <input
                          type="checkbox"
                          checked={selectedEmployeeIds.includes(a.employeeId)}
                          onChange={(event) => {
                            const employeeId = a.employeeId;
                            setSelectedEmployeeIds((current) =>
                              event.target.checked
                                ? [...new Set([...current, employeeId])]
                                : current.filter((id) => id !== employeeId),
                            );
                          }}
                          aria-label={`Select ${a.employee ? `${a.employee.firstName} ${a.employee.lastName}` : 'employee'} for timesheet actions`}
                          className="m-0 block h-3.5 w-3.5 cursor-pointer accent-red-600"
                        />
                      </div>
                    ) : null}
                  </Td>
                </tr>
              ))}
              {filtered.length > 0 ? (
                <tr aria-hidden="true" className="h-full bg-white hover:!bg-white">
                  {Array.from({ length: 24 }, (_, index) => (
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

      <Modal
        open={actionAssignments.length > 0}
        onClose={() => setActionAssignments([])}
        title="Assignment Actions"
        subtitle={actionAssignments[0] ? `${employeeName(actionAssignments[0])} · ${assignmentCustomerLabel(actionAssignments[0]) ?? 'Customer'}` : undefined}
        icon="edit"
        size="sm"
      >
        {actionAssignments[0] ? (() => {
          const representative = actionAssignments[0];
          const latestAssignment = actionAssignments[actionAssignments.length - 1] ?? representative;
          const visitTimesheets = actionAssignments.flatMap((assignment) => timesheetsForAssignment(assignment));
          const canCreateTimesheet = visitTimesheets.length > 0 && visitTimesheets.every((timesheet) => FINALIZED_TIMESHEET_STATUSES.has(timesheet.status));
          return (
            <div className="grid gap-3 sm:grid-cols-2">
              <Button type="button" variant="secondary" icon="edit" onClick={() => { setActionAssignments([]); openEdit(latestAssignment); }}>Edit Assignment</Button>
              <Button type="button" variant="softPrimary" icon="edit" onClick={() => { setActionAssignments([]); if (!representative.employee) return; setMobileTabAccessError(''); setProfileEmployee(representative.employee); }}>Mobile Tabs</Button>
              <Button type="button" variant="softPrimary" icon="userPlus" onClick={() => { setActionAssignments([]); openPortalAccess(representative.employee); }}>Portal Access</Button>
              {actionAssignments.length === 1 && OPEN_STATUSES.includes(representative.status) ? <Button type="button" variant="softDanger" icon="stop" onClick={() => { setActionAssignments([]); setEndTarget(representative); }}>End Assignment</Button> : null}
              {canCreateTimesheet ? <Button type="button" variant="softPrimary" icon="plus" onClick={() => { setActionAssignments([]); setNewTimesheetError(''); setNewTimesheetTarget(latestAssignment); }}>New Timesheet</Button> : null}
              <div className="sm:col-span-2"><Button type="button" variant="secondary" icon="cancel" onClick={() => setActionAssignments([])} className="w-full">Close</Button></div>
            </div>
          );
        })() : null}
      </Modal>

      <AssignmentDetailsModal
        assignment={detailAssignment}
        onClose={() => setDetailAssignment(null)}
      />

      <Modal
        open={customerDeliveryOpen}
        onClose={() => setCustomerDeliveryOpen(false)}
        title="Send Customer Timesheets"
        subtitle="Send completed timesheets together or individually"
        icon="send"
        tone="success"
        size="lg"
      >
        <div className="space-y-4">
          {!reviewCustomerGroup && customerTimesheetReviewGroups.length > 0 ? (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_13rem]">
                <Input type="search" value={reviewCustomerSearch} onChange={(event) => setReviewCustomerSearch(event.target.value)} placeholder="Search customer name" aria-label="Search customers with timesheets" />
                <Select value={reviewCustomerProgressFilter} onChange={(event) => setReviewCustomerProgressFilter(event.target.value as 'ALL' | 'COMPLETE' | 'PARTIAL' | 'NOT_SUBMITTED')} aria-label="Filter customers by submission progress">
                  <option value="ALL">All customers</option>
                  <option value="COMPLETE">Complete</option>
                  <option value="PARTIAL">Partially submitted</option>
                  <option value="NOT_SUBMITTED">Not submitted</option>
                </Select>
              </div>
              {filteredCustomerTimesheetReviewGroups.length ? <div className="max-h-[26rem] divide-y divide-slate-100 overflow-auto rounded-xl border border-slate-200 bg-white">
                {filteredCustomerTimesheetReviewGroups.map((group) => (
                  <button key={group.customerId} type="button" onClick={() => { setReviewCustomerId(group.customerId); setReviewTimesheetFilter('ALL'); }} className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left hover:bg-blue-50">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900">{group.customerName}</p>
                      <p className="mt-1 text-xs text-slate-500">Select to review submitted and outstanding timesheets.</p>
                    </div>
                    <span className={cn('shrink-0 rounded-full px-3 py-1.5 text-sm font-bold', group.allSubmitted ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800')}>
                      {group.submittedCount}/{group.totalCount} submitted
                    </span>
                  </button>
                ))}
              </div> : <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">No customers match this search and filter.</div>}
            </div>
          ) : !reviewCustomerGroup ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
              No customer timesheets are expected for this work week.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
                <div>
                  <button type="button" onClick={() => setReviewCustomerId('')} className="mb-2 text-xs font-bold text-blue-700 hover:underline">← All customers</button>
                  <p className="font-bold text-slate-900">{reviewCustomerGroup.customerName}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-600">{reviewCustomerGroup.submittedCount}/{reviewCustomerGroup.totalCount} submitted · {reviewCustomerGroup.readyCount}/{reviewCustomerGroup.totalCount} approved · {reviewCustomerGroup.bulkSendCount}/{reviewCustomerGroup.totalCount} marked for bulk</p>
                </div>
                <div className="flex flex-wrap rounded-lg border border-slate-200 bg-white p-1">
                  {(['ALL', 'SUBMITTED', 'NOT_SUBMITTED', 'READY', 'NOT_READY'] as const).map((filter) => <button key={filter} type="button" onClick={() => setReviewTimesheetFilter(filter)} className={cn('rounded-md px-3 py-1.5 text-xs font-semibold', reviewTimesheetFilter === filter ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100')}>{filter === 'ALL' ? 'All' : filter === 'SUBMITTED' ? 'Submitted' : filter === 'NOT_SUBMITTED' ? 'Not Submitted' : filter === 'READY' ? 'Ready' : 'Not Ready'}</button>)}
                </div>
              </div>
              <div className="max-h-[24rem] divide-y divide-slate-100 overflow-auto rounded-xl border border-slate-200 bg-white">
                {reviewCustomerGroup.rows.filter(({ timesheet }) => {
                  const submitted = Boolean(timesheet && SUBMITTED_TIMESHEET_STATUSES.has(timesheet.status));
                  const ready = Boolean(submitted && timesheet?.readyToSend);
                  return reviewTimesheetFilter === 'ALL' ||
                    (reviewTimesheetFilter === 'SUBMITTED' && submitted) ||
                    (reviewTimesheetFilter === 'NOT_SUBMITTED' && !submitted) ||
                    (reviewTimesheetFilter === 'READY' && ready) ||
                    (reviewTimesheetFilter === 'NOT_READY' && !ready);
                }).map(({ key, assignment, timesheet }) => {
                  const submitted = Boolean(timesheet && SUBMITTED_TIMESHEET_STATUSES.has(timesheet.status));
                  const ready = Boolean(submitted && timesheet?.readyToSend);
                  return <div key={key} className="flex items-center justify-between gap-3 px-4 py-3"><div className="min-w-0"><p className="truncate font-semibold text-slate-800">{timesheet?.employee ? `${timesheet.employee.firstName} ${timesheet.employee.lastName}` : assignment ? employeeName(assignment) : 'Employee'}</p><p className="mt-1 text-xs text-slate-500">{timesheet?.jobSite?.name ?? assignment?.jobSite?.name ?? 'Job site'} · {timesheet?.weekStartDate ?? assignment?.assignedDate ?? workingWeek.weekStart}</p></div><div className="flex shrink-0 items-center gap-2"><span className={cn('rounded-full px-2.5 py-1 text-[10px] font-bold uppercase', submitted ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700')}>{submitted ? 'Submitted' : 'Not submitted'}</span><span className={cn('rounded-full px-2.5 py-1 text-[10px] font-bold uppercase', ready ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-800')}>{ready ? 'Ready' : 'Not ready'}</span>{timesheet ? <Button type="button" size="sm" variant="secondary" icon="eye" onClick={() => void openDeliveryTimesheet(timesheet, reviewCustomerGroup.timesheets)}>View</Button> : null}</div></div>;
                })}
              </div>
              <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
                {reviewCustomerGroup.readyCount} approved timesheet{reviewCustomerGroup.readyCount === 1 ? ' is' : 's are'} available to send individually. Bulk sending becomes available when all {reviewCustomerGroup.totalCount} are submitted, approved, and marked for bulk send.
              </p>
              {reviewCustomerGroup.hasPreviousDelivery ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
                  This customer cannot be marked for bulk send because one or more timesheets for this week were already sent.
                </p>
              ) : null}
              {deliveryResult ? <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">{deliveryResult}</p> : null}
            </div>
          )}
          <ModalFooter>
            {reviewCustomerGroup && reviewCustomerGroup.bulkSendCount > 0 ? <Button type="button" variant="secondary" icon="cancel" onClick={() => { setBulkReadyError(''); setBulkReadyConfirmation(false); }}>Clear Bulk Send</Button> : null}
            {reviewCustomerGroup && !reviewCustomerGroup.allBulkMarked ? <Button type="button" variant="softPrimary" icon="checkCircle" disabled={!reviewCustomerGroup.canMarkForBulk} onClick={() => { setBulkReadyError(''); setBulkReadyConfirmation(true); }}>Mark All for Bulk Send</Button> : null}
            {reviewCustomerGroup ? <Button type="button" variant="secondary" icon="send" disabled={!reviewCustomerGroup.allSubmitted || !reviewCustomerGroup.allReady || !reviewCustomerGroup.allBulkMarked} onClick={() => {
              const sendable = reviewCustomerGroup.timesheets.filter((timesheet) => SUBMITTED_TIMESHEET_STATUSES.has(timesheet.status) && timesheet.readyToSend && timesheet.bulkSendMarked && !timesheet.isTraining && canDeliverTimesheet(timesheet));
              setDeliveryMode('BULK');
              setDeliveryTimesheetOptions(sendable);
              setSelectedDeliveryTimesheetIds(sendable.map((timesheet) => timesheet.id));
              setDeliveryCustomerId(reviewCustomerGroup.customerId);
              setDeliveryError(''); setDeliveryResult(''); setCustomerDeliveryOpen(false); setDeliveryOpen(true);
            }}>Send All as Bulk</Button> : null}
            {reviewCustomerGroup ? <Button type="button" icon="send" disabled={reviewCustomerGroup.readyCount === 0} onClick={() => {
              const sendable = reviewCustomerGroup.timesheets.filter((timesheet) => SUBMITTED_TIMESHEET_STATUSES.has(timesheet.status) && !timesheet.isTraining && canDeliverTimesheet(timesheet));
              setDeliveryMode('INDIVIDUAL');
              setDeliveryTimesheetOptions(sendable);
              setSelectedDeliveryTimesheetIds(sendable.filter((timesheet) => timesheet.readyToSend).map((timesheet) => timesheet.id));
              setDeliveryCustomerId(reviewCustomerGroup.customerId);
              setDeliveryError('');
              setDeliveryResult('');
              setCustomerDeliveryOpen(false);
              setDeliveryOpen(true);
            }}>Send Selected Timesheets</Button> : null}
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
        open={bulkReadyConfirmation !== null}
        onClose={() => { if (!setCustomerBulkReadyMutation.isPending) setBulkReadyConfirmation(null); }}
        title={bulkReadyConfirmation ? 'Mark Timesheets for Bulk Send' : 'Clear Bulk Send'}
        subtitle="This changes preparation status only and does not send email"
        icon={bulkReadyConfirmation ? 'checkCircle' : 'cancel'}
        tone={bulkReadyConfirmation ? 'success' : 'neutral'}
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-700">
            {bulkReadyConfirmation
              ? `Mark every eligible ${reviewCustomerGroup?.customerName ?? 'customer'} timesheet for the selected week as ready for bulk send?`
              : `Remove all ${reviewCustomerGroup?.customerName ?? 'customer'} timesheets for the selected week from bulk send?`}
          </p>
          <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800">No customer email will be sent by this action.</p>
          {bulkReadyError ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{bulkReadyError}</p> : null}
          <ModalFooter>
            <Button type="button" variant="secondary" disabled={setCustomerBulkReadyMutation.isPending} onClick={() => setBulkReadyConfirmation(null)}>Cancel</Button>
            <Button type="button" loading={setCustomerBulkReadyMutation.isPending} onClick={() => { if (bulkReadyConfirmation !== null) setCustomerBulkReadyMutation.mutate(bulkReadyConfirmation); }}>
              {bulkReadyConfirmation ? 'Mark for Bulk Send' : 'Clear Bulk Send'}
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
        subtitle={deliveryMode === 'INDIVIDUAL'
          ? 'Each selected timesheet will be sent in its own email with a separate approval link'
          : 'The selected timesheets will be combined into one email with one approval link'}
        icon="send"
        tone="success"
        size="lg"
      >
        <div className="space-y-4">
          {deliveryResult ? (
            <div className={cn('rounded-xl border px-4 py-4 text-sm font-medium', deliveryError ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-800')}>
              <p>{deliveryResult}</p>
              {deliveryError ? <p className="mt-2 whitespace-pre-line text-xs">{deliveryError}</p> : null}
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
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-medium uppercase tracking-widest text-slate-500">Choose submitted timesheets</p>
                  <div className="flex items-center overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm" aria-label="Select timesheets">
                    <span className="border-r border-slate-200 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">Select</span>
                    <button type="button" className="border-r border-slate-200 px-2 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:text-slate-300" disabled={selectedDeliveryTimesheetIds.length === 0} onClick={() => setSelectedDeliveryTimesheetIds([])}>Clear</button>
                    <button type="button" className="px-2 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-50 disabled:text-slate-300" disabled={selectableDeliveryTimesheetIds.length === 0 || selectableDeliveryTimesheetIds.every((id) => selectedDeliveryTimesheetIds.includes(id))} onClick={() => setSelectedDeliveryTimesheetIds(selectableDeliveryTimesheetIds)}>All</button>
                  </div>
                </div>
                {deliveryTimesheetOptions.length > 0 ? (
                  <div className="max-h-72 divide-y divide-slate-100 overflow-auto">
                    {deliveryTimesheetOptions.map((timesheet) => {
                      const alreadySent = !canDeliverTimesheet(timesheet);
                      const selectable =
                        timesheet.status === 'SUBMITTED' &&
                        !timesheet.isTraining &&
                        !alreadySent &&
                        timesheet.readyToSend === true &&
                        (deliveryMode === 'INDIVIDUAL' || timesheet.bulkSendMarked === true);
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
                    canDeliverTimesheet(timesheet),
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
              <>
                {deliveryError ? <Button type="button" variant="secondary" onClick={() => { setDeliveryResult(''); setDeliveryError(''); }}>Review Failed &amp; Retry</Button> : null}
                <Button type="button" icon="check" onClick={() => { setDeliveryOpen(false); setSelectedDeliveryTimesheetIds([]); setDeliveryTimesheetOptions([]); setDeliveryCustomerId(''); setDeliveryResult(''); setDeliveryError(''); }}>Done</Button>
              </>
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
                  onClick={() => setDeliveryConfirmationOpen(true)}
                >
                  {deliveryMode === 'INDIVIDUAL' ? 'Send Selected Timesheets' : 'Send as Bulk'} ({selectedDeliveryTimesheetIds.length})
                </Button>
              </>
            )}
          </ModalFooter>
        </div>
      </Modal>

      <Modal
        open={deliveryConfirmationOpen}
        onClose={() => { if (!deliverTimesheetsMutation.isPending) setDeliveryConfirmationOpen(false); }}
        title={deliveryMode === 'INDIVIDUAL' ? 'Confirm Individual Delivery' : 'Confirm Bulk Delivery'}
        subtitle="Customer email confirmation"
        icon="send"
        tone="success"
      >
        <div className="space-y-4">
          <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
            {deliveryMode === 'INDIVIDUAL'
              ? `${selectedDeliveryTimesheetIds.length} selected timesheet${selectedDeliveryTimesheetIds.length === 1 ? '' : 's'} will be sent as separate customer email${selectedDeliveryTimesheetIds.length === 1 ? '' : 's'}, each with its own review link.`
              : `${selectedDeliveryTimesheetIds.length} selected bulk timesheet${selectedDeliveryTimesheetIds.length === 1 ? '' : 's'} will be sent together in one customer email with one review link.`}
          </p>
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700"><p><strong>Customer:</strong> {selectedDeliveryCustomer?.companyName ?? 'Customer'}</p><p className="mt-1"><strong>Recipient:</strong> {selectedDeliveryCustomer?.officeEmail ?? 'No email configured'}</p></div>
          <ModalFooter><Button type="button" variant="secondary" disabled={deliverTimesheetsMutation.isPending} onClick={() => setDeliveryConfirmationOpen(false)}>Cancel</Button><Button type="button" icon="send" loading={deliverTimesheetsMutation.isPending} onClick={() => deliverTimesheetsMutation.mutate()}>Confirm &amp; Send</Button></ModalFooter>
        </div>
      </Modal>

      <Modal
        open={timesheetChooserOptions.length > 0}
        onClose={() => {
          setTimesheetChooserOptions([]);
          setSelectedChooserTimesheetIds([]);
        }}
        title="Choose a Timesheet"
        subtitle={
          timesheetChooserOptions[0]?.employee
            ? `${timesheetChooserOptions[0].employee.firstName} ${timesheetChooserOptions[0].employee.lastName} · ${timesheetChooserOptions.length} timesheets`
            : `${timesheetChooserOptions.length} timesheets`
        }
        icon="clock"
        size="lg"
      >
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-slate-600">Select one or more timesheets, or open one to view its details.</p>
            <div className="flex items-center overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm" aria-label="Select chooser timesheets">
              <span className="border-r border-slate-200 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">Select</span>
              <button type="button" className="border-r border-slate-200 px-2 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:text-slate-300" disabled={selectedChooserTimesheetIds.length === 0} onClick={() => setSelectedChooserTimesheetIds([])}>Clear</button>
              <button type="button" className="px-2 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-50 disabled:text-slate-300" disabled={timesheetChooserOptions.length === 0 || selectedChooserTimesheetIds.length === timesheetChooserOptions.length} onClick={() => setSelectedChooserTimesheetIds(timesheetChooserOptions.map((timesheet) => timesheet.id))}>All</button>
            </div>
          </div>
          <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
            {timesheetChooserOptions.map((timesheet, index) => (
              <div key={timesheet.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selectedChooserTimesheetIds.includes(timesheet.id)}
                    onChange={(event) => setSelectedChooserTimesheetIds((current) =>
                      event.target.checked
                        ? [...new Set([...current, timesheet.id])]
                        : current.filter((id) => id !== timesheet.id),
                    )}
                    aria-label={`Select timesheet ${index + 1}`}
                    className="h-4 w-4 shrink-0 cursor-pointer accent-blue-600"
                  />
                  <div className="min-w-0">
                  <p className="font-semibold text-slate-800">
                    Timesheet {index + 1} · {timesheet.workDate ?? timesheet.weekStartDate ?? 'Selected week'}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {timesheet.jobSite?.name ?? 'Job site'} · {timesheet.totalHours ?? 0}h · {timesheet.status}
                  </p>
                  <span
                    className={cn(
                      'mt-1.5 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                      timesheet.readyToSend
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-amber-100 text-amber-800',
                    )}
                  >
                    {timesheet.readyToSend ? 'Ready to Send' : 'Not Ready'}
                  </span>
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="softPrimary"
                  icon="eye"
                  loading={viewingDeliveryTimesheetId === timesheet.id}
                  disabled={Boolean(viewingDeliveryTimesheetId && viewingDeliveryTimesheetId !== timesheet.id)}
                  onClick={() => {
                    const relatedTimesheets = timesheetChooserOptions;
                    setTimesheetChooserOptions([]);
                    void openDeliveryTimesheet(timesheet, relatedTimesheets);
                  }}
                >
                  View Timesheet
                </Button>
              </div>
            ))}
          </div>
          {deliveryError ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{deliveryError}</p> : null}
        </div>
        <ModalFooter>
          <Button
            type="button"
            variant="softDanger"
            icon="trash"
            disabled={!timesheetChooserOptions.some((timesheet) => selectedChooserTimesheetIds.includes(timesheet.id) && !timesheet.deliveries?.length && !timesheet.signature?.sentToCustomerOffice)}
            onClick={() => {
              const targets = timesheetChooserOptions.filter((timesheet) => selectedChooserTimesheetIds.includes(timesheet.id) && !timesheet.deliveries?.length && !timesheet.signature?.sentToCustomerOffice);
              setDeleteTimesheetTargets(targets);
              setTimesheetChooserOptions([]);
              setDeleteTimesheetsOpen(true);
            }}
          >
            Delete Selected ({selectedChooserTimesheetIds.length})
          </Button>
          <Button
            type="button"
            icon="send"
            disabled={!timesheetChooserOptions.some((timesheet) => selectedChooserTimesheetIds.includes(timesheet.id) && timesheet.status === 'SUBMITTED' && timesheet.readyToSend && !timesheet.isTraining && canDeliverTimesheet(timesheet))}
            onClick={() => {
              const targets = timesheetChooserOptions.filter((timesheet) => selectedChooserTimesheetIds.includes(timesheet.id) && timesheet.status === 'SUBMITTED' && timesheet.readyToSend && !timesheet.isTraining && canDeliverTimesheet(timesheet));
              if (!targets.length) return;
              setDeliveryMode('INDIVIDUAL');
              setDeliveryCustomerId(targets[0].customerId);
              setDeliveryTimesheetOptions(targets);
              setSelectedDeliveryTimesheetIds(targets.map((timesheet) => timesheet.id));
              setDeliveryResult('');
              setDeliveryError('');
              setTimesheetChooserOptions([]);
              setSelectedChooserTimesheetIds([]);
              setDeliveryOpen(true);
            }}
          >
            Send Selected ({selectedChooserTimesheetIds.length})
          </Button>
          <Button type="button" variant="secondary" icon="cancel" onClick={() => { setTimesheetChooserOptions([]); setSelectedChooserTimesheetIds([]); }}>Close</Button>
        </ModalFooter>
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
        onSelectTimesheet={async (id) => {
          const option = assignmentTimesheetOptions.find((item) => item.id === id);
          if (!option) return;
          if (!option.id.startsWith('missing-')) {
            setSelectedTimesheet(option);
            return;
          }
          try {
            const created = await api.createTimesheet({
              employeeId: option.employeeId,
              customerId: option.customerId,
              jobSiteId: option.jobSiteId,
              assignmentId: option.assignmentId ?? undefined,
              weekStartDate: option.weekStartDate ?? workingWeek.weekStart,
              weekEndDate: option.weekEndDate ?? workingWeek.weekEnd,
              totalHours: 0,
              status: 'DRAFT',
            });
            const full = await api.getTimesheet(created.id);
            setAssignmentTimesheetOptions((current) => current.map((item) => item.id === option.id ? full : item));
            setSelectedTimesheet(full);
            await queryClient.invalidateQueries({ queryKey: ['timesheets'] });
          } catch (error) {
            setSelectionActionError(readableError(error, 'Could not create this employee’s draft timesheet.'));
            throw error;
          }
        }}
        onRemoveEmployeeFromWeek={async (employeeId) => {
          if (!selectedTimesheet) return;
          const assignmentsToRemove = weekFiltered.filter(
            (assignment) =>
              assignment.employeeId === employeeId &&
              (assignmentTargetCustomerId(assignment) ?? assignment.customerId) === selectedTimesheet.customerId,
          );
          await removeAssignmentsFromDisplayedWeek(assignmentsToRemove);
          setAssignmentTimesheetOptions((current) => current.filter((option) => option.employeeId !== employeeId));
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['assignments'] }),
            queryClient.invalidateQueries({ queryKey: ['timesheets'] }),
          ]);
        }}
        onPreviewSignedPdf={
          selectedTimesheet && !selectedTimesheet.id.startsWith('preview-')
            ? async () => {
                const previewWindow = window.open('', '_blank');
                try {
                  const pdf = await api.previewSignedTimesheet(selectedTimesheet.id);
                  const url = URL.createObjectURL(pdf);
                  if (previewWindow) previewWindow.location.href = url;
                  else window.open(url, '_blank');
                  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
                } catch (error) {
                  previewWindow?.close();
                  setDeliveryError(error instanceof Error ? error.message : 'Could not preview signed PDF');
                  throw error;
                }
              }
            : undefined
        }
        onApproveToSend={
          selectedTimesheet && !selectedTimesheet.id.startsWith('preview-') && !selectedTimesheet.readyToSend
            ? async () => {
                const updated = await api.updateTimesheet(selectedTimesheet.id, {
                  ...(selectedTimesheet.status === 'SIGNED' ? { status: 'SUBMITTED' } : {}),
                  readyToSend: true,
                });
                const full = await api.getTimesheet(updated.id);
                setSelectedTimesheet(full);
                setAssignmentTimesheetOptions((current) => current.map((item) => item.id === full.id ? full : item));
                await queryClient.invalidateQueries({ queryKey: ['timesheets'] });
              }
            : undefined
        }
        onSendToCustomer={
          selectedTimesheet &&
          !selectedTimesheet.id.startsWith('preview-') &&
          selectedTimesheet.status === 'SUBMITTED' &&
          selectedTimesheet.readyToSend &&
          !selectedTimesheet.isTraining &&
          canDeliverTimesheet(selectedTimesheet)
            ? async () => {
                setDeliveryMode('INDIVIDUAL');
                setDeliveryCustomerId(selectedTimesheet.customerId);
                setDeliveryTimesheetOptions([selectedTimesheet]);
                setSelectedDeliveryTimesheetIds([selectedTimesheet.id]);
                setDeliveryResult('');
                setDeliveryError('');
                setSelectedTimesheet(null);
                setAssignmentTimesheetOptions([]);
                setDeliveryConfirmationOpen(true);
              }
            : undefined
        }
        notice={timesheetSiteSummary?.notice}
        onViewMissingTimesheets={
          timesheetSiteSummary?.missing.length
            ? () => {
                setMissingTimesheetAssignments(timesheetSiteSummary.missing);
                setSelectedTimesheet(null);
              }
            : undefined
        }
        onSaveEdits={
          selectedTimesheet && !selectedTimesheet.id.startsWith('preview-')
            ? async ({ dailyHours, officeNotes }) => {
                const entries = Object.entries(dailyHours).flatMap(([workDate, hours]) => {
                  const dayEntries = (selectedTimesheet.entries ?? []).filter(
                    (entry) => entry.workDate === workDate,
                  );
                  if (!dayEntries.length) return [{ workDate, hours }];
                  return dayEntries.map((entry, index) => ({
                    id: entry.id,
                    workDate,
                    hours: index === 0 ? hours : 0,
                  }));
                });
                if (entries.length) {
                  await api.updateTimesheetEntryHours(selectedTimesheet.id, entries);
                }
                await api.updateTimesheet(selectedTimesheet.id, { officeNotes });
                const updated = await api.getTimesheet(selectedTimesheet.id);
                setSelectedTimesheet(updated);
                setAssignmentTimesheetOptions((current) =>
                  current.map((item) => (item.id === updated.id ? updated : item)),
                );
                await queryClient.invalidateQueries({ queryKey: ['timesheets'] });
              }
            : undefined
        }
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

      <AssignmentEmployeeEditModal
        employee={editEmployee}
        assignment={editEmployeeAssignment}
        onClose={() => {
          setEditEmployee(null);
          setEditEmployeeAssignment(null);
        }}
      />
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
            <div className="space-y-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">Mobile app tabs</p>
                <p className="mt-1 text-xs text-slate-500">
                  Choose which tabs this employee can see. Home is always available.
                </p>
              </div>
              {(
                [
                  ['Assignments', 'mobileAssignmentsEnabled'],
                  ['Manual Timesheet', 'manualTimesheetEnabled'],
                  ['Tasks', 'mobileTasksEnabled'],
                  ['Messages', 'mobileMessagesEnabled'],
                  ['Profile', 'mobileProfileEnabled'],
                ] as const
              ).map(([label, field]) => {
                const enabled = Boolean(profileEmployee[field]);
                return (
                  <div key={field} className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{label} mobile tab</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {enabled
                          ? `This employee can see the ${label} tab.`
                          : `The ${label} tab is hidden for this employee.`}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant={enabled ? 'secondary' : 'primary'}
                      loading={
                        mobileTabAccessMutation.isPending &&
                        mobileTabAccessMutation.variables?.field === field
                      }
                      onClick={() =>
                        mobileTabAccessMutation.mutate({ employee: profileEmployee, field })
                      }
                    >
                      {enabled ? `Disable ${label}` : `Enable ${label}`}
                    </Button>
                  </div>
                );
              })}
              <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Previous week assignments</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {profileEmployee.mobilePreviousWeekEnabled
                      ? 'This employee can view the previous work week.'
                      : 'This employee can only view the current work week.'}
                  </p>
                </div>
                <Button
                  type="button"
                  variant={profileEmployee.mobilePreviousWeekEnabled ? 'secondary' : 'primary'}
                  loading={
                    mobileTabAccessMutation.isPending &&
                    mobileTabAccessMutation.variables?.field === 'mobilePreviousWeekEnabled'
                  }
                  onClick={() =>
                    mobileTabAccessMutation.mutate({
                      employee: profileEmployee,
                      field: 'mobilePreviousWeekEnabled',
                    })
                  }
                >
                  {profileEmployee.mobilePreviousWeekEnabled
                    ? 'Disable Previous Week'
                    : 'Enable Previous Week'}
                </Button>
              </div>
              {mobileTabAccessError ? (
                <p className="text-sm font-medium text-red-600">{mobileTabAccessError}</p>
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

      <Modal
        open={deleteTimesheetsOpen}
        onClose={() => {
          if (!deleteSelectedTimesheetsMutation.isPending) {
            setDeleteTimesheetsOpen(false);
            setDeleteTimesheetTargets([]);
          }
        }}
        title="Delete Timesheets"
        subtitle="This action is permanent"
        icon="trash"
        tone="danger"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-700">
            Delete {deleteTimesheetTargets.length} selected unsent timesheet{deleteTimesheetTargets.length === 1 ? '' : 's'}? Sent or customer-approved timesheets are protected and cannot be deleted.
          </p>
          {selectionActionError ? (
            <p className="whitespace-pre-line rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{selectionActionError}</p>
          ) : null}
          <ModalFooter>
            <Button type="button" variant="secondary" disabled={deleteSelectedTimesheetsMutation.isPending} onClick={() => { setDeleteTimesheetsOpen(false); setDeleteTimesheetTargets([]); }}>Cancel</Button>
            <Button type="button" variant="softDanger" icon="trash" loading={deleteSelectedTimesheetsMutation.isPending} disabled={deleteTimesheetTargets.length === 0} onClick={() => deleteSelectedTimesheetsMutation.mutate(deleteTimesheetTargets.map((timesheet) => timesheet.id))}>Delete Permanently</Button>
          </ModalFooter>
        </div>
      </Modal>

      <Modal
        open={removeSelectedWeekOpen}
        onClose={() => { if (!removeSelectedWeekMutation.isPending) { setRemoveSelectedWeekOpen(false); setRemoveSelectedWeekError(''); } }}
        title="Remove Selected Employees from Week"
        subtitle={`${workingWeek.weekStart} – ${workingWeek.weekEnd}`}
        icon="trash"
        tone="danger"
        size="sm"
      >
        <div className="space-y-4 text-sm text-slate-700">
          <p>Remove the selected {selectedEmployeeIds.length} employee{selectedEmployeeIds.length === 1 ? '' : 's'} from every assignment visible in this work week?</p>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">Only this displayed week will be removed. Assignments before and after this week will remain.</div>
          {removeSelectedWeekError ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-semibold text-red-700">{removeSelectedWeekError}</p> : null}
          <ModalFooter>
            <Button type="button" variant="secondary" disabled={removeSelectedWeekMutation.isPending} onClick={() => { setRemoveSelectedWeekOpen(false); setRemoveSelectedWeekError(''); }}>Cancel</Button>
            <Button type="button" variant="softDanger" icon="trash" loading={removeSelectedWeekMutation.isPending} disabled={selectedEmployeeIds.length === 0} onClick={() => removeSelectedWeekMutation.mutate()}>Yes, Remove from This Week</Button>
          </ModalFooter>
        </div>
      </Modal>

      <PassCodeDialog
        open={deleteEmployeePassCodeOpen}
        value={deleteEmployeePassCode}
        error={deleteEmployeePassCodeError}
        pending={deleteEmployeesMutation.isPending}
        onChange={(value) => {
          setDeleteEmployeePassCode(value);
          setDeleteEmployeePassCodeError('');
        }}
        onCancel={() => {
          if (deleteEmployeesMutation.isPending) return;
          setDeleteEmployeePassCodeOpen(false);
          setDeleteEmployeePassCode('');
          setDeleteEmployeePassCodeError('');
        }}
        onSubmit={confirmDeleteEmployees}
      />
    </DashboardLayout>
  );
}
