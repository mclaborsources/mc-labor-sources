'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { ImportAlert } from '@/components/import/ImportAlert';
import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';

const CONFIRMATION_PHRASE = 'RESET-IMPORT-DATA';

export function TestDataResetPanel() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [result, setResult] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState('');

  const resetMutation = useMutation({
    mutationFn: () => api.clearImportTestData(CONFIRMATION_PHRASE),
    onSuccess: (data) => {
      setResult(data.counts);
      setError('');
      setModalOpen(false);
      setConfirmation('');
      void queryClient.invalidateQueries();
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Reset failed');
    },
  });

  const canConfirm = confirmation.trim() === CONFIRMATION_PHRASE;

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
          <Button
            type="button"
            variant="danger"
            className="shrink-0"
            onClick={() => {
              setResult(null);
              setError('');
              setConfirmation('');
              setModalOpen(true);
            }}
          >
            Clear all import data
          </Button>
        </div>

        {result ? (
          <div className="mt-4">
            <ImportAlert
              variant="success"
              title="Test data cleared"
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
        onClose={() => {
          if (!resetMutation.isPending) {
            setModalOpen(false);
            setConfirmation('');
          }
        }}
        title="Clear all import test data?"
        subtitle="This cannot be undone. All imported business records will be permanently deleted."
        tone="danger"
      >
        <div className="space-y-4">
          <ImportAlert
            variant="warning"
            title="Staging / testing only"
            message="You will need to re-import employees, customers, jobs, and assignments before the portal has operational data again."
          />

          <label className="block text-sm font-medium text-slate-700">
            Type{' '}
            <span className="font-mono text-red-700">{CONFIRMATION_PHRASE}</span> to confirm
            <Input
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              className="mt-2 font-mono"
              placeholder={CONFIRMATION_PHRASE}
              autoComplete="off"
              disabled={resetMutation.isPending}
            />
          </label>

          {error ? <ImportAlert variant="error" title="Reset failed" message={error} /> : null}
        </div>

        <ModalFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setModalOpen(false)}
            disabled={resetMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            disabled={!canConfirm || resetMutation.isPending}
            onClick={() => resetMutation.mutate()}
          >
            {resetMutation.isPending ? 'Clearing…' : 'Delete all test data'}
          </Button>
        </ModalFooter>
      </Modal>
    </>
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
