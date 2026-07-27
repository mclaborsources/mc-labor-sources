'use client';

import { useQuery } from '@tanstack/react-query';
import { api, type Assignment } from '@/lib/api-client';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { Table, Td, Th } from '@/components/ui/Table';
import {
  DateTimeCell,
  GpsLocationCell,
  HoursCell,
  PersonCell,
} from '@/components/portal';

interface AssignmentDetailsModalProps {
  assignment: Assignment | null;
  onClose: () => void;
}

export function AssignmentDetailsModal({
  assignment,
  onClose,
}: AssignmentDetailsModalProps) {
  const { data: attendance, isLoading, error } = useQuery({
    queryKey: ['attendance', 'assignment', assignment?.id],
    queryFn: () => api.getAttendance({ assignmentId: assignment!.id }),
    enabled: Boolean(assignment),
  });

  const employeeName = assignment?.employee
    ? `${assignment.employee.firstName} ${assignment.employee.lastName}`
    : 'Employee';
  const totalHours = (attendance ?? []).reduce(
    (sum, log) => sum + Number(log.totalHours ?? 0),
    0,
  );

  return (
    <Modal
      open={Boolean(assignment)}
      onClose={onClose}
      title={`${employeeName} · Assignment Details`}
      subtitle="Attendance, hours, GPS locations, and current assignment status"
      icon="briefcase"
      size="xl"
    >
      {assignment ? (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Employee</p>
              <p className="mt-1 font-semibold text-slate-900">{employeeName}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Job Site</p>
              <p className="mt-1 font-semibold text-slate-900">{assignment.jobSite?.name ?? '—'}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</p>
              <div className="mt-1"><Badge status={assignment.status} /></div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recorded Hours</p>
              <p className="mt-1 font-semibold text-primary">{totalHours.toFixed(2)}h</p>
            </div>
          </div>

          <dl className="grid gap-x-6 gap-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Customer</dt>
              <dd className="mt-1 font-medium text-slate-900">{assignment.customer?.companyName ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Assignment Dates</dt>
              <dd className="mt-1 font-medium text-slate-900">
                {assignment.assignedDate}{assignment.endDate ? ` – ${assignment.endDate}` : ''}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Scheduled Time</dt>
              <dd className="mt-1 font-medium text-slate-900">
                {assignment.startTime || '—'}{assignment.endTime ? ` – ${assignment.endTime}` : ''}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Foreman</dt>
              <dd className="mt-1 font-medium text-slate-900">{assignment.jobSite?.foremanName ?? '—'}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Job Address</dt>
              <dd className="mt-1 font-medium text-slate-900">{assignment.jobSite?.address ?? '—'}</dd>
            </div>
            {assignment.notes ? (
              <div className="sm:col-span-2 lg:col-span-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Notes</dt>
                <dd className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{assignment.notes}</dd>
              </div>
            ) : null}
          </dl>

          {isLoading ? <LoadingState /> : null}
          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              Attendance details could not be loaded.
            </div>
          ) : null}
          {!isLoading && !error && attendance?.length === 0 ? (
            <EmptyState
              title="No attendance records"
              description="Clock-in and clock-out activity for this assignment will appear here."
            />
          ) : null}
          {attendance && attendance.length > 0 ? (
            <Table compact containerClassName="max-h-[28rem] overflow-auto">
              <thead>
                <tr>
                  <Th>Employee</Th>
                  <Th>Clock In</Th>
                  <Th>Clock Out</Th>
                  <Th>Hours</Th>
                  <Th>GPS In</Th>
                  <Th>GPS Out</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {attendance.map((log) => (
                  <tr key={log.id}>
                    <Td><PersonCell name={employeeName} /></Td>
                    <Td><DateTimeCell value={log.clockInTime} /></Td>
                    <Td><DateTimeCell value={log.clockOutTime} /></Td>
                    <Td><HoursCell value={log.totalHours} /></Td>
                    <Td>
                      <GpsLocationCell
                        lat={log.clockInLatitude}
                        lng={log.clockInLongitude}
                        label={log.clockInLocationLabel}
                      />
                    </Td>
                    <Td>
                      <GpsLocationCell
                        lat={log.clockOutLatitude}
                        lng={log.clockOutLongitude}
                        label={log.clockOutLocationLabel}
                      />
                    </Td>
                    <Td><Badge status={log.status} className="normal-case" /></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : null}

          <ModalFooter>
            <Button type="button" variant="secondary" onClick={onClose}>Close</Button>
          </ModalFooter>
        </div>
      ) : null}
    </Modal>
  );
}
