'use client';

import { useCallback, useEffect, useState } from 'react';

type ApprovalTimesheet = {
  id: string;
  employeeName: string;
  jobSiteName: string;
  workDate?: string | null;
  weekStartDate?: string | null;
  weekEndDate?: string | null;
  totalHours: number;
  approvedAt?: string | null;
  entries: Array<{ workDate: string; hours: number }>;
};

type ApprovalBatch = {
  customerName: string;
  recipientEmail: string;
  sentAt: string;
  expiresAt: string;
  timesheets: ApprovalTimesheet[];
};

async function requestApprovalPage(
  token: string,
  action: 'load' | 'approve',
  timesheetId?: string,
): Promise<ApprovalBatch> {
  const endpoint = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/customer-timesheet-approval`;
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(publicKey ? { apikey: publicKey, Authorization: `Bearer ${publicKey}` } : {}),
    },
    body: JSON.stringify({ token, action, timesheetId }),
    cache: 'no-store',
    referrerPolicy: 'no-referrer',
  });
  const result = await response.json() as ApprovalBatch & { error?: string };
  if (!response.ok) throw new Error(result.error || 'Could not load this approval request.');
  return result;
}

function period(timesheet: ApprovalTimesheet) {
  if (timesheet.weekStartDate && timesheet.weekEndDate) {
    return `${timesheet.weekStartDate} – ${timesheet.weekEndDate}`;
  }
  return timesheet.workDate ?? '—';
}

export function CustomerTimesheetApproval({ token }: { token: string }) {
  const [batch, setBatch] = useState<ApprovalBatch | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [approvingId, setApprovingId] = useState('');

  const load = useCallback(async () => {
    if (!token) {
      setError('This approval link is missing its secure token.');
      setLoading(false);
      return;
    }
    try {
      setBatch(await requestApprovalPage(token, 'load'));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not load this approval request.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function approve(timesheetId: string) {
    setApprovingId(timesheetId);
    setError('');
    try {
      setBatch(await requestApprovalPage(token, 'approve', timesheetId));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not approve this timesheet.');
    } finally {
      setApprovingId('');
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        <header className="border-b border-slate-200 bg-slate-950 px-6 py-6 text-white sm:px-8">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-blue-300">MC Labor Sources</p>
          <h1 className="mt-2 text-2xl font-black sm:text-3xl">Approve Timesheets</h1>
          {batch ? <p className="mt-2 text-slate-300">{batch.customerName}</p> : null}
        </header>

        <div className="p-6 sm:p-8">
          {loading ? <p className="py-16 text-center text-slate-500">Loading timesheets…</p> : null}
          {error ? <p className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}

          {batch ? (
            <>
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950">
                <span><strong>{batch.timesheets.length}</strong> timesheet{batch.timesheets.length === 1 ? '' : 's'} sent for review</span>
                <span>{batch.timesheets.filter((item) => item.approvedAt).length}/{batch.timesheets.length} approved</span>
              </div>

              <div className="space-y-4">
                {batch.timesheets.map((timesheet) => (
                  <article key={timesheet.id} className="overflow-hidden rounded-xl border border-slate-200">
                    <div className="grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                      <div>
                        <h2 className="text-lg font-black text-slate-950">{timesheet.employeeName || 'Employee'}</h2>
                        <p className="mt-1 text-sm font-semibold text-slate-600">{timesheet.jobSiteName}</p>
                        <p className="mt-1 text-xs text-slate-500">{period(timesheet)}</p>
                      </div>
                      {timesheet.approvedAt ? (
                        <span className="inline-flex min-h-11 items-center justify-center rounded-lg border border-emerald-300 bg-emerald-100 px-5 text-sm font-black text-emerald-700">✓ Approved</span>
                      ) : (
                        <button
                          type="button"
                          disabled={Boolean(approvingId)}
                          onClick={() => void approve(timesheet.id)}
                          className="min-h-11 rounded-lg bg-blue-600 px-6 text-sm font-black text-white shadow-sm hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60"
                        >
                          {approvingId === timesheet.id ? 'Approving…' : 'Approve'}
                        </button>
                      )}
                    </div>
                    <div className="overflow-x-auto border-t border-slate-200 bg-slate-50">
                      <table className="w-full min-w-[32rem] text-sm">
                        <thead><tr className="text-left text-xs uppercase tracking-wide text-slate-500"><th className="px-5 py-2">Date</th><th className="px-5 py-2 text-right">Hours</th></tr></thead>
                        <tbody>
                          {timesheet.entries.length ? timesheet.entries.map((entry, index) => (
                            <tr key={`${entry.workDate}-${index}`} className="border-t border-slate-200"><td className="px-5 py-2">{entry.workDate}</td><td className="px-5 py-2 text-right font-bold">{entry.hours.toFixed(2)}</td></tr>
                          )) : <tr className="border-t border-slate-200"><td className="px-5 py-2 text-slate-500">No daily entries</td><td className="px-5 py-2 text-right font-bold">0.00</td></tr>}
                        </tbody>
                        <tfoot><tr className="border-t-2 border-slate-300 bg-white"><th className="px-5 py-3 text-left">Total</th><th className="px-5 py-3 text-right text-blue-700">{timesheet.totalHours.toFixed(2)}</th></tr></tfoot>
                      </table>
                    </div>
                  </article>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </main>
  );
}
