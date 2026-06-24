'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { ImportAlert } from '@/components/import/ImportAlert';
import { api } from '@/lib/api-client';
import { formatWeekEndingFridayLabel } from '@/lib/working-week';
import { cn } from '@/lib/utils';

const CONFIRMATION_PHRASE = 'END-OPEN-ASSIGNMENTS';

interface EndOpenAssignmentsPanelProps {
  weekEnd: string;
}

export function EndOpenAssignmentsPanel({ weekEnd }: EndOpenAssignmentsPanelProps) {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [resultCount, setResultCount] = useState<number | null>(null);
  const [error, setError] = useState('');

  const endMutation = useMutation({
    mutationFn: () => api.completeAllOpenAssignments(weekEnd, CONFIRMATION_PHRASE),
    onSuccess: (data) => {
      setResultCount(data.count);
      setError('');
      setModalOpen(false);
      setConfirmation('');
      void queryClient.invalidateQueries({ queryKey: ['assignments'] });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Could not end assignments');
    },
  });

  const canConfirm = confirmation.trim() === CONFIRMATION_PHRASE;

  return (
    <>
      <article
        className={cn(
          'overflow-hidden rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50/80 to-white',
          'p-5 shadow-sm ring-1 ring-amber-100/80 sm:p-6',
        )}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-950">
              Weekly import prep
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-amber-950/80">
              End all open assignments before importing a new week — typically after workers finish
              on Friday. Uses week ending{' '}
              <span className="font-medium">{formatWeekEndingFridayLabel(weekEnd)}</span> as the
              completion date.
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            className="shrink-0"
            onClick={() => {
              setResultCount(null);
              setError('');
              setConfirmation('');
              setModalOpen(true);
            }}
          >
            End all open assignments
          </Button>
        </div>

        {resultCount !== null ? (
          <div className="mt-4">
            <ImportAlert
              variant="success"
              title="Open assignments ended"
              message={`${resultCount} assignment${resultCount === 1 ? '' : 's'} marked completed. You can run the weekly import now.`}
            />
          </div>
        ) : null}

        {error && !modalOpen ? (
          <div className="mt-4">
            <ImportAlert variant="error" title="Could not end assignments" message={error} />
          </div>
        ) : null}
      </article>

      <Modal
        open={modalOpen}
        onClose={() => {
          if (!endMutation.isPending) {
            setModalOpen(false);
            setConfirmation('');
          }
        }}
        title="End all open assignments?"
        subtitle={`Active, pending, and accepted assignments will be completed with end date ${formatWeekEndingFridayLabel(weekEnd)}.`}
        tone="danger"
      >
        <div className="space-y-4">
          <ImportAlert
            variant="warning"
            title="Before weekly import"
            message="Do this after the prior week’s work is finished (typically Friday evening). Then import the new week’s workbook."
          />

          <label className="block text-sm font-medium text-slate-700">
            Type{' '}
            <span className="font-mono text-amber-800">{CONFIRMATION_PHRASE}</span> to confirm
            <Input
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              className="mt-2 font-mono"
              placeholder={CONFIRMATION_PHRASE}
              autoComplete="off"
              disabled={endMutation.isPending}
            />
          </label>

          {error ? <ImportAlert variant="error" title="Failed" message={error} /> : null}
        </div>

        <ModalFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setModalOpen(false)}
            disabled={endMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            disabled={!canConfirm || endMutation.isPending}
            onClick={() => endMutation.mutate()}
          >
            {endMutation.isPending ? 'Ending…' : 'End open assignments'}
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
}
