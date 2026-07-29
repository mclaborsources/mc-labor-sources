'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type Customer, type Employee, type JobSite, type Timesheet } from '@/lib/api-client';
import { assignmentOverlapsWeek, getCurrentWorkingWeek, getWeekEndingFriday, getWorkingWeekForFriday } from '@/lib/working-week';
import { assignmentCustomerLabel } from '@/lib/assignment-filter-utils';
import { downloadCsv } from '@/lib/export-csv';
import { PortalFilterField, PortalFilterPanel, PortalRecordsPanel, portalFieldClassName, PersonCell } from '@/components/portal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { Table, Td, Th } from '@/components/ui/Table';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import {
  AssignmentColumnHeader,
  type AssignmentSortDirection,
} from '@/components/assignments/AssignmentColumnHeader';
import {
  CustomerProfileViewModal,
  EmployeeProfileViewModal,
  JobSiteProfileViewModal,
} from '@/components/assignments/AssignmentProfileViewModals';

const DAY_LABELS = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const STATUS_PRIORITY: Record<string, number> = {
  SIGNED: 4,
  SUBMITTED: 3,
  COMPLETED: 2,
  DRAFT: 1,
};

type WeeklyHoursRow = {
  key: string;
  employeeId: string;
  employeeName: string;
  customerId: string;
  customerName: string;
  jobSiteId: string;
  jobSiteName: string;
  assignmentIds: Set<string>;
  dailyHours: number[];
  totalHours: number;
};

function addDays(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T12:00:00`);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

function displayWeekEnd(isoDate: string) {
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString('en-US');
}

function bestTimesheets(timesheets: Timesheet[]) {
  const selected = new Map<string, Timesheet>();
  for (const timesheet of timesheets) {
    const key =
      timesheet.assignmentId ??
      `${timesheet.employeeId}:${timesheet.customerId}:${timesheet.jobSiteId}`;
    const current = selected.get(key);
    const priority = STATUS_PRIORITY[timesheet.status] ?? 0;
    const currentPriority = current ? STATUS_PRIORITY[current.status] ?? 0 : -1;
    if (
      !current ||
      priority > currentPriority ||
      (priority === currentPriority && (timesheet.createdAt ?? '') > (current.createdAt ?? ''))
    ) {
      selected.set(key, timesheet);
    }
  }
  return [...selected.values()];
}

export function WeeklyEmployeeHoursReport() {
  const [week, setWeek] = useState(() => getCurrentWorkingWeek());
  const [customerId, setCustomerId] = useState('');
  const [jobSiteId, setJobSiteId] = useState('');
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({});
  const [sort, setSort] = useState<{ column: string; direction: AssignmentSortDirection }>({
    column: 'customer',
    direction: 'asc',
  });
  const [selectedRow, setSelectedRow] = useState<WeeklyHoursRow | null>(null);
  const [profileEmployee, setProfileEmployee] = useState<Employee | null>(null);
  const [profileCustomer, setProfileCustomer] = useState<Customer | null>(null);
  const [profileJobSite, setProfileJobSite] = useState<JobSite | null>(null);

  const { data: assignments, isLoading: assignmentsLoading } = useQuery({
    queryKey: ['assignments', 'weekly-hours-report'],
    queryFn: () => api.getAssignments(),
  });

  const { data: timesheets, isLoading: timesheetsLoading } = useQuery({
    queryKey: ['timesheets', 'weekly-hours-report', week.weekStart, week.weekEnd],
    queryFn: () =>
      api.getTimesheets({
        weekStart: week.weekStart,
        weekEnd: week.weekEnd,
        includeEntries: 'true',
      }),
  });

  const rows = useMemo(() => {
    const grouped = new Map<string, WeeklyHoursRow>();
    const weeklyAssignments = (assignments ?? []).filter(
      (assignment) =>
        !assignment.isTraining &&
        assignmentOverlapsWeek(
          assignment.assignedDate,
          assignment.endDate,
          week.weekStart,
          week.weekEnd,
        ),
    );

    for (const assignment of weeklyAssignments) {
      const key = `${assignment.employeeId}:${assignment.customerId}:${assignment.jobSiteId}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.assignmentIds.add(assignment.id);
        continue;
      }
      grouped.set(key, {
        key,
        employeeId: assignment.employeeId,
        employeeName: assignment.employee
          ? `${assignment.employee.firstName} ${assignment.employee.lastName}`
          : 'Unknown employee',
        customerId: assignment.customerId,
        customerName: assignmentCustomerLabel(assignment) ?? 'Unknown customer',
        jobSiteId: assignment.jobSiteId,
        jobSiteName: assignment.jobSite?.name ?? 'Unknown job',
        assignmentIds: new Set([assignment.id]),
        dailyHours: Array(7).fill(0) as number[],
        totalHours: 0,
      });
    }

    const weekDates = Array.from({ length: 7 }, (_, index) => addDays(week.weekStart, index));
    const dateIndexes = new Map(weekDates.map((date, index) => [date, index]));

    for (const timesheet of bestTimesheets((timesheets ?? []).filter((item) => !item.isTraining))) {
      const row = [...grouped.values()].find(
        (candidate) =>
          (timesheet.assignmentId && candidate.assignmentIds.has(timesheet.assignmentId)) ||
          (!timesheet.assignmentId &&
            candidate.employeeId === timesheet.employeeId &&
            candidate.customerId === timesheet.customerId &&
            candidate.jobSiteId === timesheet.jobSiteId),
      );
      if (!row) continue;

      if (timesheet.entries?.length) {
        for (const entry of timesheet.entries) {
          const dayIndex = dateIndexes.get(entry.workDate);
          if (dayIndex !== undefined) row.dailyHours[dayIndex] += Number(entry.hours ?? 0);
        }
      } else if (timesheet.workDate) {
        const dayIndex = dateIndexes.get(timesheet.workDate);
        if (dayIndex !== undefined) row.dailyHours[dayIndex] += Number(timesheet.totalHours ?? 0);
      }
    }

    return [...grouped.values()]
      .map((row) => ({
        ...row,
        totalHours: row.dailyHours.reduce((sum, hours) => sum + hours, 0),
      }))
      .sort(
        (a, b) =>
          a.customerName.localeCompare(b.customerName) ||
          a.jobSiteName.localeCompare(b.jobSiteName) ||
          a.employeeName.localeCompare(b.employeeName),
      );
  }, [assignments, timesheets, week.weekEnd, week.weekStart]);

  const customerOptions = useMemo(
    () =>
      [...new Map(rows.map((row) => [row.customerId, row.customerName])).entries()].sort((a, b) =>
        a[1].localeCompare(b[1]),
      ),
    [rows],
  );
  const jobSiteOptions = useMemo(
    () =>
      [
        ...new Map(
          rows
            .filter((row) => !customerId || row.customerId === customerId)
            .map((row) => [row.jobSiteId, row.jobSiteName]),
        ).entries(),
      ].sort((a, b) => a[1].localeCompare(b[1])),
    [customerId, rows],
  );
  const filteredRows = useMemo(() => {
    const employeeNeedle = employeeSearch.trim().toLocaleLowerCase();
    return rows.filter(
      (row) =>
        (!customerId || row.customerId === customerId) &&
        (!jobSiteId || row.jobSiteId === jobSiteId) &&
        (!employeeNeedle || row.employeeName.toLocaleLowerCase().includes(employeeNeedle)),
    );
  }, [customerId, employeeSearch, jobSiteId, rows]);

  const displayedRows = useMemo(() => {
    const matches = filteredRows.filter((row) => {
      const values: Record<string, string> = {
        customer: row.customerName,
        jobSite: row.jobSiteName,
        employee: row.employeeName,
        weekEnding: displayWeekEnd(week.weekEnd),
        total: row.totalHours.toFixed(2),
      };
      DAY_LABELS.forEach((_, index) => {
        values[`day-${index}`] = row.dailyHours[index].toFixed(2);
      });
      return Object.entries(columnFilters).every(
        ([column, selected]) => selected.length === 0 || selected.includes(values[column] ?? ''),
      );
    });

    const direction = sort.direction === 'asc' ? 1 : -1;
    const valueFor = (row: WeeklyHoursRow) => {
      if (sort.column === 'customer') return row.customerName;
      if (sort.column === 'jobSite') return row.jobSiteName;
      if (sort.column === 'employee') return row.employeeName;
      if (sort.column === 'weekEnding') return week.weekEnd;
      if (sort.column === 'total') return row.totalHours;
      if (sort.column.startsWith('day-')) return row.dailyHours[Number(sort.column.slice(4))] ?? 0;
      return '';
    };
    return [...matches].sort((a, b) => {
      const aValue = valueFor(a);
      const bValue = valueFor(b);
      return (
        (typeof aValue === 'number' && typeof bValue === 'number'
          ? aValue - bValue
          : String(aValue).localeCompare(String(bValue), undefined, { numeric: true })) * direction
      );
    });
  }, [columnFilters, filteredRows, sort, week.weekEnd]);

  const headerOptions = useMemo(() => {
    const unique = (values: string[]) =>
      [...new Set(values)].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map((value) => ({ value, label: value }));
    return {
      customer: unique(filteredRows.map((row) => row.customerName)),
      jobSite: unique(filteredRows.map((row) => row.jobSiteName)),
      employee: unique(filteredRows.map((row) => row.employeeName)),
      weekEnding: [{ value: displayWeekEnd(week.weekEnd), label: displayWeekEnd(week.weekEnd) }],
      days: DAY_LABELS.map((_, index) => unique(filteredRows.map((row) => row.dailyHours[index].toFixed(2)))),
      total: unique(filteredRows.map((row) => row.totalHours.toFixed(2))),
    };
  }, [filteredRows, week.weekEnd]);

  function setColumnFilter(column: string, values: string[]) {
    setColumnFilters((current) => ({ ...current, [column]: values }));
  }

  async function openEmployeeProfile(employeeId: string) {
    setProfileEmployee(await api.getEmployee(employeeId));
  }

  async function openCustomerProfile(customerId: string) {
    setProfileCustomer(await api.getCustomer(customerId));
  }

  async function openJobSiteProfile(jobSiteId: string) {
    setProfileJobSite(await api.getJobSite(jobSiteId));
  }

  function changeWeek(value: string) {
    if (!value) return;
    const selected = new Date(`${value}T12:00:00`);
    setWeek(getWorkingWeekForFriday(getWeekEndingFriday(selected)));
    setColumnFilters({});
  }

  function exportReport() {
    if (!displayedRows.length) return;
    downloadCsv(
      `weekly-employee-hours-${week.weekEnd}.csv`,
      ['Customer', 'Job', 'Employee', 'Week Ending', ...DAY_LABELS, 'Total Hours'],
      displayedRows.map((row) => [
        row.customerName,
        row.jobSiteName,
        row.employeeName,
        displayWeekEnd(week.weekEnd),
        ...row.dailyHours.map((hours) => hours.toFixed(2)),
        row.totalHours.toFixed(2),
      ]),
    );
  }

  const loading = assignmentsLoading || timesheetsLoading;

  return (
    <div>
      <p className="mb-4 text-sm text-slate-600">
        Every employee assigned during the selected Saturday–Friday week is included, even when
        all daily hours are zero.
      </p>
      <PortalFilterPanel>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <PortalFilterField label="Week Ending Friday">
            <Input
              type="date"
              value={week.weekEnd}
              onChange={(event) => changeWeek(event.target.value)}
              className={portalFieldClassName}
            />
          </PortalFilterField>
          <PortalFilterField label="Customer">
            <Select
              value={customerId}
              onChange={(event) => {
                setCustomerId(event.target.value);
                setJobSiteId('');
              }}
              className={portalFieldClassName}
            >
              <option value="">All customers</option>
              {customerOptions.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </Select>
          </PortalFilterField>
          <PortalFilterField label="Job">
            <Select
              value={jobSiteId}
              onChange={(event) => setJobSiteId(event.target.value)}
              className={portalFieldClassName}
            >
              <option value="">All jobs</option>
              {jobSiteOptions.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </Select>
          </PortalFilterField>
          <PortalFilterField label="Employee">
            <Input
              type="search"
              value={employeeSearch}
              onChange={(event) => setEmployeeSearch(event.target.value)}
              placeholder="Search employee"
              className={portalFieldClassName}
            />
          </PortalFilterField>
          <div className="flex items-end gap-2">
            <Button
              variant="secondary"
              disabled={
                !customerId &&
                !jobSiteId &&
                !employeeSearch.trim() &&
                !Object.values(columnFilters).some((values) => values.length > 0)
              }
              onClick={() => {
                setCustomerId('');
                setJobSiteId('');
                setEmployeeSearch('');
                setColumnFilters({});
              }}
            >
              Clear Filters
            </Button>
            <Button variant="secondary" icon="download" disabled={!displayedRows.length} onClick={exportReport}>
              Export CSV
            </Button>
          </div>
        </div>
      </PortalFilterPanel>

      {loading ? <LoadingState /> : null}
      {!loading && displayedRows.length ? (
        <PortalRecordsPanel
          title="Weekly employee hours"
          count={displayedRows.length}
          countLabel="employees"
        >
          <Table
            compact
            layoutFixed
            noHorizontalScroll
            className="w-full [&_th]:!border-r [&_th]:!border-slate-500 [&_th]:!bg-slate-300 [&_th]:!font-extrabold [&_th]:!text-black [&_td]:border-r [&_td]:border-slate-200 [&_tr>*:last-child]:!border-r-0"
            containerClassName="h-[32rem] overflow-auto overscroll-contain"
          >
            <colgroup>
              <col className="w-[11%]" />
              <col className="w-[10%]" />
              <col className="w-[14%]" />
              <col className="w-[10%]" />
              {DAY_LABELS.map((day) => <col key={day} className="w-[6.5%]" />)}
              <col className="w-[9.5%]" />
            </colgroup>
            <thead>
              <tr>
                <Th className="sticky top-0 z-10"><AssignmentColumnHeader label="Customers" options={headerOptions.customer} selected={columnFilters.customer ?? []} onSelectedChange={(values) => setColumnFilter('customer', values)} sortDirection={sort.column === 'customer' ? sort.direction : undefined} onSort={(direction) => setSort({ column: 'customer', direction })} /></Th>
                <Th className="sticky top-0 z-10"><AssignmentColumnHeader label="Job Sites" options={headerOptions.jobSite} selected={columnFilters.jobSite ?? []} onSelectedChange={(values) => setColumnFilter('jobSite', values)} sortDirection={sort.column === 'jobSite' ? sort.direction : undefined} onSort={(direction) => setSort({ column: 'jobSite', direction })} /></Th>
                <Th className="sticky top-0 z-10"><AssignmentColumnHeader label="Employees" options={headerOptions.employee} selected={columnFilters.employee ?? []} onSelectedChange={(values) => setColumnFilter('employee', values)} sortDirection={sort.column === 'employee' ? sort.direction : undefined} onSort={(direction) => setSort({ column: 'employee', direction })} /></Th>
                <Th className="sticky top-0 z-10"><AssignmentColumnHeader label="Week Ending" options={headerOptions.weekEnding} selected={columnFilters.weekEnding ?? []} onSelectedChange={(values) => setColumnFilter('weekEnding', values)} sortDirection={sort.column === 'weekEnding' ? sort.direction : undefined} onSort={(direction) => setSort({ column: 'weekEnding', direction })} /></Th>
                {DAY_LABELS.map((day, index) => (
                  <Th key={day} className="sticky top-0 z-10">
                    <AssignmentColumnHeader label={day.slice(0, 3)} options={headerOptions.days[index]} selected={columnFilters[`day-${index}`] ?? []} onSelectedChange={(values) => setColumnFilter(`day-${index}`, values)} sortDirection={sort.column === `day-${index}` ? sort.direction : undefined} onSort={(direction) => setSort({ column: `day-${index}`, direction })} />
                  </Th>
                ))}
                <Th className="sticky top-0 z-10"><AssignmentColumnHeader label="Total Hours" options={headerOptions.total} selected={columnFilters.total ?? []} onSelectedChange={(values) => setColumnFilter('total', values)} sortDirection={sort.column === 'total' ? sort.direction : undefined} onSort={(direction) => setSort({ column: 'total', direction })} /></Th>
              </tr>
            </thead>
            <tbody>
              {displayedRows.map((row) => (
                <tr
                  key={row.key}
                  tabIndex={0}
                  onDoubleClick={() => setSelectedRow(row)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && event.target === event.currentTarget) {
                      setSelectedRow(row);
                    }
                  }}
                  className="cursor-pointer outline-none ring-inset ring-primary/30 hover:bg-primary/[0.04] focus:ring-2"
                  title="Double-click to view weekly hours details"
                >
                  <Td>
                    <button
                      type="button"
                      onClick={(event) => event.stopPropagation()}
                      onDoubleClick={(event) => {
                        event.stopPropagation();
                        void openCustomerProfile(row.customerId);
                      }}
                      className="rounded-md text-left outline-none ring-primary/30 hover:text-primary focus:ring-2"
                      title="Double-click to view customer profile"
                    >
                      {row.customerName}
                    </button>
                  </Td>
                  <Td>
                    <button
                      type="button"
                      onClick={(event) => event.stopPropagation()}
                      onDoubleClick={(event) => {
                        event.stopPropagation();
                        void openJobSiteProfile(row.jobSiteId);
                      }}
                      className="rounded-md text-left outline-none ring-primary/30 hover:text-primary focus:ring-2"
                      title="Double-click to view job site profile"
                    >
                      {row.jobSiteName}
                    </button>
                  </Td>
                  <Td>
                    <button
                      type="button"
                      onClick={(event) => event.stopPropagation()}
                      onDoubleClick={(event) => {
                        event.stopPropagation();
                        void openEmployeeProfile(row.employeeId);
                      }}
                      className="rounded-lg text-left outline-none ring-primary/30 hover:bg-primary/[0.04] focus:ring-2"
                      title="Double-click to view employee profile"
                    >
                      <PersonCell name={row.employeeName} />
                    </button>
                  </Td>
                  <Td className="whitespace-nowrap">{displayWeekEnd(week.weekEnd)}</Td>
                  {row.dailyHours.map((hours, index) => (
                    <Td key={DAY_LABELS[index]} className="text-right tabular-nums">
                      {hours.toFixed(2)}
                    </Td>
                  ))}
                  <Td className="text-right font-bold tabular-nums text-primary">
                    {row.totalHours.toFixed(2)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </PortalRecordsPanel>
      ) : null}
      {!loading && !displayedRows.length ? (
        <EmptyState
          title="No assigned employees"
          description="No assignments match the selected week and filters."
        />
      ) : null}

      <Modal
        open={!!selectedRow}
        onClose={() => setSelectedRow(null)}
        title={selectedRow?.employeeName ?? 'Weekly Hours Details'}
        subtitle={selectedRow ? `${selectedRow.customerName} · ${selectedRow.jobSiteName}` : undefined}
        icon="clock"
        tone="primary"
        size="lg"
      >
        {selectedRow ? (
          <div className="space-y-4">
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-slate-50 p-4">
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Customer</dt>
                <dd className="mt-1 font-medium text-slate-900">{selectedRow.customerName}</dd>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Job Site</dt>
                <dd className="mt-1 font-medium text-slate-900">{selectedRow.jobSiteName}</dd>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Week Ending</dt>
                <dd className="mt-1 font-medium text-slate-900">{displayWeekEnd(week.weekEnd)}</dd>
              </div>
            </dl>
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full table-fixed border-collapse text-sm">
                <thead className="bg-slate-100">
                  <tr>
                    {DAY_LABELS.map((day) => (
                      <th key={day} className="border-r border-slate-200 px-2 py-2 text-center text-xs font-bold text-slate-600 last:border-r-0">
                        {day.slice(0, 3)}
                      </th>
                    ))}
                    <th className="border-l border-slate-300 px-2 py-2 text-center text-xs font-bold text-slate-900">Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {selectedRow.dailyHours.map((hours, index) => (
                      <td key={DAY_LABELS[index]} className="border-r border-t border-slate-200 px-2 py-3 text-center tabular-nums text-slate-700 last:border-r-0">
                        {hours.toFixed(2)}
                      </td>
                    ))}
                    <td className="border-l border-t border-slate-300 px-2 py-3 text-center font-bold tabular-nums text-primary">
                      {selectedRow.totalHours.toFixed(2)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <ModalFooter>
              <Button type="button" variant="secondary" onClick={() => setSelectedRow(null)}>Close</Button>
            </ModalFooter>
          </div>
        ) : null}
      </Modal>
      <EmployeeProfileViewModal employee={profileEmployee} onClose={() => setProfileEmployee(null)} />
      <CustomerProfileViewModal customer={profileCustomer} onClose={() => setProfileCustomer(null)} />
      <JobSiteProfileViewModal jobSite={profileJobSite} onClose={() => setProfileJobSite(null)} />
    </div>
  );
}
