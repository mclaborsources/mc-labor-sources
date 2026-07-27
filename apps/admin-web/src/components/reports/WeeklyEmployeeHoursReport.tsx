'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type Timesheet } from '@/lib/api-client';
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
    const weeklyAssignments = (assignments ?? []).filter((assignment) =>
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

    for (const timesheet of bestTimesheets(timesheets ?? [])) {
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

  function changeWeek(value: string) {
    if (!value) return;
    const selected = new Date(`${value}T12:00:00`);
    setWeek(getWorkingWeekForFriday(getWeekEndingFriday(selected)));
  }

  function exportReport() {
    if (!filteredRows.length) return;
    downloadCsv(
      `weekly-employee-hours-${week.weekEnd}.csv`,
      ['Customer', 'Job', 'Employee', 'Week Ending', ...DAY_LABELS, 'Total Hours'],
      filteredRows.map((row) => [
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
          <div className="flex items-end">
            <Button variant="secondary" icon="download" disabled={!filteredRows.length} onClick={exportReport}>
              Export CSV
            </Button>
          </div>
        </div>
      </PortalFilterPanel>

      {loading ? <LoadingState /> : null}
      {!loading && filteredRows.length ? (
        <PortalRecordsPanel
          title="Weekly employee hours"
          count={filteredRows.length}
          countLabel="employees"
        >
          <Table
            compact
            className="min-w-[1180px]"
            containerClassName="max-h-[32rem] overflow-auto overscroll-contain"
          >
            <thead>
              <tr>
                <Th className="sticky top-0 z-10 bg-slate-50">Customer</Th>
                <Th className="sticky top-0 z-10 bg-slate-50">Job</Th>
                <Th className="sticky top-0 z-10 bg-slate-50">Employee</Th>
                <Th className="sticky top-0 z-10 bg-slate-50">Week Ending</Th>
                {DAY_LABELS.map((day) => (
                  <Th key={day} className="sticky top-0 z-10 bg-slate-50 text-right">
                    {day}
                  </Th>
                ))}
                <Th className="sticky top-0 z-10 bg-slate-50 text-right">Total Hours</Th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.key}>
                  <Td>{row.customerName}</Td>
                  <Td>{row.jobSiteName}</Td>
                  <Td><PersonCell name={row.employeeName} /></Td>
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
      {!loading && !filteredRows.length ? (
        <EmptyState
          title="No assigned employees"
          description="No assignments match the selected week and filters."
        />
      ) : null}
    </div>
  );
}
