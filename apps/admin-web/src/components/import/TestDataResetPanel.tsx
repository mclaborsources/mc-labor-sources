'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { ImportAlert } from '@/components/import/ImportAlert';
import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { formatWeekEndingFridayLabel, formatWorkingWeekLabel, getWorkingWeekForFriday, listWeekEndingFridays } from '@/lib/working-week';
import type { WorkingWeekSelection } from '@/components/import/WorkingWeekSelector';

const RESET_PASS_CODE = '3360';
const ALL_DATA_RPC_CONFIRMATION = 'RESET-IMPORT-DATA';

interface TestDataResetPanelProps {
  workingWeek: WorkingWeekSelection;
}

export function TestDataResetPanel({ workingWeek }: TestDataResetPanelProps) {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [passCodeOpen, setPassCodeOpen] = useState(false);
  const [resetScope, setResetScope] = useState<'week' | 'all'>('week');
  const [confirmation, setConfirmation] = useState('');
  const [result, setResult] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState('');
  const [selectedWeekEnd, setSelectedWeekEnd] = useState(workingWeek.weekEnd);

  const selectedWeek = useMemo(() => {
    const week = getWorkingWeekForFriday(new Date(`${selectedWeekEnd}T12:00:00`));
    return { weekStart: week.weekStart, weekEnd: week.weekEnd };
  }, [selectedWeekEnd]);
  const weekOptions = useMemo(() => listWeekEndingFridays({ pastWeeks: 104, futureWeeks: 8 }), []);
  const resetMutation = useMutation({
    mutationFn: () =>
      resetScope === 'week'
        ? api.clearImportWeek(selectedWeek.weekEnd, confirmation)
        : api.clearImportTestData(ALL_DATA_RPC_CONFIRMATION),
    onSuccess: (data) => {
      setResult(data.counts);
      setError('');
      setModalOpen(false);
      setPassCodeOpen(false);
      setConfirmation('');
      void queryClient.invalidateQueries();
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Reset failed');
    },
  });

  const closeReset = () => {
    if (resetMutation.isPending) return;
    setModalOpen(false);
    setPassCodeOpen(false);
    setConfirmation('');
    setError('');
  };

  const confirmReset = (event: FormEvent) => {
    event.preventDefault();
    if (confirmation.trim() !== RESET_PASS_CODE) {
      setError('Incorrect pass code.');
      return;
    }
    resetMutation.mutate();
  };

  const openReset = (scope: 'week' | 'all') => {
    setResetScope(scope);
    setResult(null);
    setError('');
    setConfirmation('');
    setModalOpen(true);
  };

  return (
    <>
      <article
        className={cn(
          'overflow-hidden rounded-2xl border border-red-200/80 bg-gradient-to-br from-red-50/80 to-white',
          'p-5 shadow-sm ring-1 ring-red-100/80 sm:p-6',
        )}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-red-900">
              Test data reset
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-red-950/80">
              Remove all employees, customers, job sites, assignments, timesheets, attendance,
              import history, and worker/customer portal accounts. Admin and supervisor accounts
              are kept. Use this between test imports on staging only.
            </p>
          </div>
          <div className="grid shrink-0 gap-2 sm:grid-cols-[13rem_auto] sm:items-end">
            <label className="text-xs font-medium text-red-950/80">
              Week ending Friday
              <Select
                value={selectedWeekEnd}
                onChange={(event) => setSelectedWeekEnd(event.target.value)}
                className="mt-1 min-w-52 bg-white"
              >
                {weekOptions.map((option) => (
                  <option key={option.weekEnd} value={option.weekEnd}>{option.label}</option>
                ))}
              </Select>
            </label>
            <div className="flex flex-col gap-2">
            <Button type="button" variant="softDanger" onClick={() => openReset('week')}>
              Delete selected week
            </Button>
            <Button type="button" variant="danger" onClick={() => openReset('all')}>
              Clear all import data
            </Button>
            </div>
          </div>
        </div>

        {result ? (
          <div className="mt-4">
            <ImportAlert
              variant="success"
              title={resetScope === 'week' ? 'Selected week cleared' : 'Test data cleared'}
              message={
                <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                  {Object.entries(result).map(([key, count]) => (
                    <li key={key}>
                      {formatCountLabel(key)}: {count}
                    </li>
                  ))}
                </ul>
              }
            />
          </div>
        ) : null}

        {error && !modalOpen ? (
          <div className="mt-4">
            <ImportAlert variant="error" title="Reset failed" message={error} />
          </div>
        ) : null}
      </article>

      <Modal
        open={modalOpen}
        onClose={closeReset}
        title={resetScope === 'week' ? 'Clear selected week?' : 'Clear all import test data?'}
        subtitle={
          resetScope === 'week'
            ? `This permanently removes assignments and operational records for ${formatWorkingWeekLabel(selectedWeek.weekStart, selectedWeek.weekEnd)}.`
            : 'This cannot be undone. All imported business records will be permanently deleted.'
        }
        tone="danger"
      >
        <ImportAlert
          variant="warning"
          title={resetScope === 'week' ? `Week ending ${formatWeekEndingFridayLabel(selectedWeek.weekEnd)}` : 'Staging / testing only'}
          message={
            resetScope === 'week'
              ? 'Employees, customers, job sites, portal accounts, and data from other weeks will be kept.'
              : 'You will need to re-import employees, customers, jobs, and assignments before the portal has operational data again.'
          }
        />

        <ModalFooter>
          <Button type="button" variant="ghost" onClick={closeReset}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={() => {
              setConfirmation('');
              setError('');
              setPassCodeOpen(true);
            }}
          >
            {resetScope === 'week' ? 'Delete selected week' : 'Delete all test data'}
          </Button>
        </ModalFooter>
      </Modal>

      <PassCodeDialog
        open={passCodeOpen}
        value={confirmation}
        error={error}
        pending={resetMutation.isPending}
        onChange={(value) => {
          setConfirmation(value);
          if (error) setError('');
        }}
        onCancel={() => {
          if (resetMutation.isPending) return;
          setPassCodeOpen(false);
          setConfirmation('');
          setError('');
        }}
        onSubmit={confirmReset}
      />
    </>
  );
}

interface PassCodeDialogProps {
  open: boolean;
  value: string;
  error: string;
  pending: boolean;
  onChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: (event: FormEvent) => void;
}

function PassCodeDialog({
  open,
  value,
  error,
  pending,
  onChange,
  onCancel,
  onSubmit,
}: PassCodeDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    inputRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pending) onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, pending, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 p-4">
      <form
        className="w-full max-w-[410px] border border-[#8f8f8f] bg-[#f4f4f4] font-[Arial,sans-serif] text-[14px] text-black shadow-[3px_4px_0_rgba(0,0,0,0.22)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pass-code-title"
        onSubmit={onSubmit}
      >
        <div className="flex h-[40px] items-center justify-between bg-[#ededed] px-3 text-[#6f6f6f]">
          <span id="pass-code-title">Requires Pass Code</span>
          <button
            type="button"
            aria-label="Close"
            className="flex h-7 w-7 items-center justify-center text-[25px] font-light leading-none text-[#777] hover:bg-[#d8d8d8]"
            onClick={onCancel}
            disabled={pending}
          >
            &times;
          </button>
        </div>

        <div className="grid min-h-[138px] grid-cols-[1fr_74px] grid-rows-[auto_1fr_auto] gap-x-4 px-3 pb-3 pt-3">
          <label htmlFor="reset-pass-code" className="self-start pt-1.5">
            Enter the pass code:
          </label>
          <div className="row-span-2 flex flex-col gap-2">
            <button
              type="submit"
              className="h-[30px] border border-[#9d9d9d] bg-[#e9e9e9] px-3 text-[14px] shadow-[inset_1px_1px_0_white] hover:bg-[#dedede] disabled:text-[#888]"
              disabled={pending || !value.trim()}
            >
              {pending ? 'Wait...' : 'OK'}
            </button>
            <button
              type="button"
              className="h-[30px] border border-[#9d9d9d] bg-[#e9e9e9] px-3 text-[14px] shadow-[inset_1px_1px_0_white] hover:bg-[#dedede] disabled:text-[#888]"
              onClick={onCancel}
              disabled={pending}
            >
              Cancel
            </button>
          </div>
          {error ? <p className="col-start-1 self-end pb-1 text-[13px] text-red-700">{error}</p> : null}
          <input
            ref={inputRef}
            id="reset-pass-code"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            disabled={pending}
            className="col-span-2 h-[30px] w-full border border-[#8b8b8b] bg-white px-2 font-mono text-[15px] outline-none focus:border-[#3b6ea5]"
          />
        </div>
      </form>
    </div>
  );
}

function formatCountLabel(key: string): string {
  const labels: Record<string, string> = {
    notifications: 'Notifications',
    attendanceLogs: 'Attendance logs',
    timesheets: 'Timesheets',
    jobOrders: 'Job orders',
    assignments: 'Assignments',
    supervisorJobSites: 'Supervisor site links',
    jobSites: 'Job sites',
    portalUsers: 'Worker/customer users',
    customers: 'Customers',
    employees: 'Employees',
    importRuns: 'Import history runs',
    safetyBulletins: 'Safety bulletins',
    emailDeliveryLog: 'Email log entries',
  };
  return labels[key] ?? key;
}
