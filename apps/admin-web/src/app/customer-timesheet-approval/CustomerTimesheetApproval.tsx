'use client';

import { useCallback, useEffect, useState } from 'react';

type ApprovalTimesheet = { id: string; employeeName: string; employeeFirstName: string; employeeLastName: string; jobSiteName: string; workDate?: string | null; weekStartDate?: string | null; weekEndDate?: string | null; totalHours: number; hasSignedTimesheet: boolean; approvedAt?: string | null; reviewRequestedAt?: string | null; reviewComment?: string | null; entries: Array<{ workDate: string; hours: number }> };
type ApprovalBatch = { customerName: string; recipientEmail: string; sentAt: string; expiresAt: string; timesheets: ApprovalTimesheet[] };

async function requestPage(token: string, action: 'load' | 'approve' | 'approve_all' | 'request_review', timesheetId?: string, comment?: string): Promise<ApprovalBatch> {
  const endpoint = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/customer-timesheet-approval`;
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(publicKey ? { apikey: publicKey, Authorization: `Bearer ${publicKey}` } : {}) }, body: JSON.stringify({ token, action, timesheetId, comment }), cache: 'no-store', referrerPolicy: 'no-referrer' });
  const result = await response.json() as ApprovalBatch & { error?: string };
  if (!response.ok) throw new Error(result.error || 'Could not load this approval request.');
  return result;
}

const WEEK_DAYS = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
function dateAt(start: string | null | undefined, offset: number) {
  if (!start) return '';
  const date = new Date(`${start}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}
function shortDate(value: string) {
  if (!value) return '';
  const [year, month, day] = value.split('-').map(Number);
  return `${month}/${day}/${year}`;
}
function hoursForDate(item: ApprovalTimesheet, date: string) {
  return item.entries.filter((entry) => entry.workDate === date).reduce((sum, entry) => sum + entry.hours, 0);
}

export function CustomerTimesheetApproval({ token, approveAll = false }: { token: string; approveAll?: boolean }) {
  const [batch, setBatch] = useState<ApprovalBatch | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [reviewingId, setReviewingId] = useState('');
  const [comments, setComments] = useState<Record<string, string>>({});
  const [approvedAll, setApprovedAll] = useState(false);
  const load = useCallback(async () => { if (!token) { setError('This approval link is missing its secure token.'); setLoading(false); return; } try { setBatch(await requestPage(token, approveAll ? 'approve_all' : 'load')); setApprovedAll(approveAll); } catch (e) { setError(e instanceof Error ? e.message : 'Could not load this approval request.'); } finally { setLoading(false); } }, [approveAll, token]);
  useEffect(() => { void load(); }, [load]);

  async function decide(id: string, action: 'approve' | 'request_review') {
    setBusyId(id); setError('');
    try { setBatch(await requestPage(token, action, id, comments[id])); setReviewingId(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not record this decision.'); }
    finally { setBusyId(''); }
  }

  return <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-900 sm:px-6 lg:px-8"><div className="mx-auto max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
    <header className="border-b border-slate-200 bg-slate-950 px-6 py-6 text-white sm:px-8"><p className="text-sm font-bold uppercase tracking-[0.2em] text-blue-300">MC Labor Sources</p><h1 className="mt-2 text-2xl font-black sm:text-3xl">Review Timesheets</h1>{batch ? <p className="mt-2 text-slate-300">{batch.customerName}</p> : null}</header>
    <div className="p-6 sm:p-8">{loading ? <p className="py-16 text-center text-slate-500">{approveAll ? 'Approving all timesheets…' : 'Loading timesheets…'}</p> : null}{error ? <p className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}
      {approvedAll && batch ? <p className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm font-bold text-emerald-800">All eligible timesheets attached to this email have been approved. Thank you.</p> : null}
      {batch ? <><div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950"><span><strong>{batch.timesheets.length}</strong> timesheet{batch.timesheets.length === 1 ? '' : 's'} to review</span><span>{batch.timesheets.filter((i) => i.approvedAt).length} approved · {batch.timesheets.filter((i) => i.reviewRequestedAt).length} changes requested</span></div>
      <div className="overflow-x-auto rounded-xl border border-slate-300 [touch-action:pan-x]">
        <table className="w-full min-w-[1100px] border-collapse text-xs">
          <thead className="bg-black text-white"><tr><th colSpan={14} className="px-3 py-3 text-center text-xl font-black">Mc Labor Sources, Inc. Timesheets</th></tr><tr>
            <th className="border border-white/50 px-2 py-2 text-left">Job Name</th><th className="border border-white/50 px-2 py-2 text-left">First Name</th><th className="border border-white/50 px-2 py-2 text-left">Last Name</th>
            {WEEK_DAYS.map((day, index) => { const date = dateAt(batch.timesheets[0]?.weekStartDate ?? batch.timesheets[0]?.workDate, index); return <th key={day} className="border border-white/50 px-2 py-2 text-right"><span className="block">{day}</span><span className="block">{shortDate(date)}</span></th>; })}
            <th className="border border-white/50 px-2 py-2 text-right">TH</th><th className="border border-white/50 px-2 py-2 text-right">RH</th><th className="border border-white/50 px-2 py-2 text-right">OT</th><th className="border border-white/50 px-2 py-2 text-left">Signed Timesheet / Action</th>
          </tr></thead><tbody>{batch.timesheets.map((item) => { const start = item.weekStartDate ?? item.workDate; const regular = Math.min(item.totalHours, 40); const overtime = Math.max(item.totalHours - 40, 0); return <tr key={item.id} className="bg-white even:bg-slate-50">
            <td className="border border-slate-300 px-2 py-2 font-bold">{item.jobSiteName}</td><td className="border border-slate-300 px-2 py-2">{item.employeeFirstName}</td><td className="border border-slate-300 px-2 py-2">{item.employeeLastName}</td>
            {WEEK_DAYS.map((day, index) => <td key={day} className="border border-slate-300 px-2 py-2 text-right">{hoursForDate(item, dateAt(start, index)).toFixed(2)}</td>)}
            <td className="border border-slate-300 px-2 py-2 text-right font-bold">{item.totalHours.toFixed(2)}</td><td className="border border-slate-300 px-2 py-2 text-right">{regular.toFixed(2)}</td><td className="border border-slate-300 px-2 py-2 text-right">{overtime.toFixed(2)}</td>
            <td className="border border-slate-300 px-2 py-2"><p className={item.hasSignedTimesheet ? 'font-bold text-slate-700' : 'font-bold text-red-600'}>{item.hasSignedTimesheet ? 'Signed Timesheet attached' : 'No Timesheet'}</p><div className="mt-2 flex gap-2">{item.approvedAt ? <span className="font-black text-emerald-700">✓ Approved</span> : item.reviewRequestedAt ? <span className="font-black text-amber-800">Changes Requested</span> : <><button disabled={Boolean(busyId)} onClick={() => void decide(item.id, 'approve')} className="min-h-10 rounded bg-emerald-600 px-3 font-black text-white disabled:opacity-60">Approve</button><button disabled={Boolean(busyId)} onClick={() => setReviewingId(item.id)} className="min-h-10 rounded border border-amber-400 bg-amber-50 px-3 font-black text-amber-800 disabled:opacity-60">Request Changes</button></>}</div></td>
          </tr>; })}</tbody>
        </table>
      </div><p className="mt-3 text-xs font-semibold text-slate-500 sm:hidden">Swipe the table left or right to view every column.</p></> : null}
    </div></div>
    {reviewingId ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" role="dialog" aria-modal="true" aria-labelledby="review-modal-title" onMouseDown={(event) => { if (event.target === event.currentTarget && !busyId) setReviewingId(''); }}><div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"><div className="border-b border-slate-200 px-6 py-5"><h2 id="review-modal-title" className="text-xl font-black text-slate-950">Request Timesheet Changes</h2><p className="mt-1 text-sm text-slate-500">Tell MC Labor Sources what should be checked or corrected.</p></div><div className="p-6"><label className="text-sm font-bold text-slate-900">Change request <span className="font-normal text-slate-500">(optional)</span></label><textarea autoFocus rows={4} maxLength={2000} value={comments[reviewingId] ?? ''} onChange={(event) => setComments((current) => ({ ...current, [reviewingId]: event.target.value }))} placeholder="Describe what should be checked or corrected" className="mt-2 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-300"/><div className="mt-5 flex flex-wrap justify-end gap-3"><button type="button" disabled={Boolean(busyId)} onClick={() => setReviewingId('')} className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60">Cancel</button><button type="button" disabled={Boolean(busyId)} onClick={() => void decide(reviewingId, 'request_review')} className="rounded-lg bg-amber-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-amber-700 disabled:opacity-60">{busyId ? 'Submitting…' : 'Confirm Request Changes'}</button></div></div></div></div> : null}
  </main>;
}
