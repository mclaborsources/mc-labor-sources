'use client';

import { useCallback, useEffect, useState } from 'react';

type ApprovalTimesheet = { id: string; employeeName: string; jobSiteName: string; workDate?: string | null; weekStartDate?: string | null; weekEndDate?: string | null; totalHours: number; approvedAt?: string | null; reviewRequestedAt?: string | null; reviewComment?: string | null; entries: Array<{ workDate: string; hours: number }> };
type ApprovalBatch = { customerName: string; recipientEmail: string; sentAt: string; expiresAt: string; timesheets: ApprovalTimesheet[] };

async function requestPage(token: string, action: 'load' | 'approve' | 'request_review', timesheetId?: string, comment?: string): Promise<ApprovalBatch> {
  const endpoint = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/customer-timesheet-approval`;
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(publicKey ? { apikey: publicKey, Authorization: `Bearer ${publicKey}` } : {}) }, body: JSON.stringify({ token, action, timesheetId, comment }), cache: 'no-store', referrerPolicy: 'no-referrer' });
  const result = await response.json() as ApprovalBatch & { error?: string };
  if (!response.ok) throw new Error(result.error || 'Could not load this approval request.');
  return result;
}

function period(item: ApprovalTimesheet) { return item.weekStartDate && item.weekEndDate ? `${item.weekStartDate} – ${item.weekEndDate}` : item.workDate ?? '—'; }

export function CustomerTimesheetApproval({ token }: { token: string }) {
  const [batch, setBatch] = useState<ApprovalBatch | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [reviewingId, setReviewingId] = useState('');
  const [comments, setComments] = useState<Record<string, string>>({});
  const load = useCallback(async () => { if (!token) { setError('This approval link is missing its secure token.'); setLoading(false); return; } try { setBatch(await requestPage(token, 'load')); } catch (e) { setError(e instanceof Error ? e.message : 'Could not load this approval request.'); } finally { setLoading(false); } }, [token]);
  useEffect(() => { void load(); }, [load]);

  async function decide(id: string, action: 'approve' | 'request_review') {
    setBusyId(id); setError('');
    try { setBatch(await requestPage(token, action, id, comments[id])); setReviewingId(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not record this decision.'); }
    finally { setBusyId(''); }
  }

  return <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-900 sm:px-6 lg:px-8"><div className="mx-auto max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
    <header className="border-b border-slate-200 bg-slate-950 px-6 py-6 text-white sm:px-8"><p className="text-sm font-bold uppercase tracking-[0.2em] text-blue-300">MC Labor Sources</p><h1 className="mt-2 text-2xl font-black sm:text-3xl">Review Timesheets</h1>{batch ? <p className="mt-2 text-slate-300">{batch.customerName}</p> : null}</header>
    <div className="p-6 sm:p-8">{loading ? <p className="py-16 text-center text-slate-500">Loading timesheets…</p> : null}{error ? <p className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}
      {batch ? <><div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950"><span><strong>{batch.timesheets.length}</strong> timesheet{batch.timesheets.length === 1 ? '' : 's'} to review</span><span>{batch.timesheets.filter((i) => i.approvedAt).length} approved · {batch.timesheets.filter((i) => i.reviewRequestedAt).length} sent for review</span></div>
      <div className="space-y-4">{batch.timesheets.map((item) => <article key={item.id} className="overflow-hidden rounded-xl border border-slate-200"><div className="grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"><div><h2 className="text-lg font-black text-slate-950">{item.employeeName || 'Employee'}</h2><p className="mt-1 text-sm font-semibold text-slate-600">{item.jobSiteName}</p><p className="mt-1 text-xs text-slate-500">{period(item)}</p></div>{item.approvedAt ? <span className="rounded-lg border border-emerald-300 bg-emerald-100 px-5 py-3 text-sm font-black text-emerald-700">✓ Approved</span> : item.reviewRequestedAt ? <span className="rounded-lg border border-amber-300 bg-amber-100 px-5 py-3 text-sm font-black text-amber-800">Sent for Review</span> : <div className="flex flex-wrap gap-2"><button disabled={Boolean(busyId)} onClick={() => void decide(item.id, 'approve')} className="min-h-11 rounded-lg bg-emerald-600 px-5 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-60">Approve</button><button disabled={Boolean(busyId)} onClick={() => setReviewingId(item.id)} className="min-h-11 rounded-lg border border-amber-400 bg-amber-50 px-5 text-sm font-black text-amber-800 hover:bg-amber-100 disabled:opacity-60">Send for Review</button></div>}</div>
      <div className="overflow-x-auto border-t border-slate-200 bg-slate-50"><table className="w-full min-w-[32rem] text-sm"><thead><tr className="text-left text-xs uppercase tracking-wide text-slate-500"><th className="px-5 py-2">Date</th><th className="px-5 py-2 text-right">Hours</th></tr></thead><tbody>{item.entries.length ? item.entries.map((entry, index) => <tr key={`${entry.workDate}-${index}`} className="border-t border-slate-200"><td className="px-5 py-2">{entry.workDate}</td><td className="px-5 py-2 text-right font-bold">{entry.hours.toFixed(2)}</td></tr>) : <tr><td className="px-5 py-2 text-slate-500">No daily entries</td><td className="px-5 py-2 text-right font-bold">0.00</td></tr>}</tbody><tfoot><tr className="border-t-2 border-slate-300 bg-white"><th className="px-5 py-3 text-left">Total</th><th className="px-5 py-3 text-right text-blue-700">{item.totalHours.toFixed(2)}</th></tr></tfoot></table></div>
      {reviewingId === item.id && !item.approvedAt && !item.reviewRequestedAt ? <div className="border-t border-amber-200 bg-amber-50 p-5"><label className="text-sm font-bold text-amber-950">Review comment <span className="font-normal text-amber-700">(optional)</span></label><textarea rows={3} maxLength={2000} value={comments[item.id] ?? ''} onChange={(e) => setComments((c) => ({ ...c, [item.id]: e.target.value }))} placeholder="Describe what should be checked or corrected" className="mt-2 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-400"/><div className="mt-3 flex justify-end gap-2"><button onClick={() => setReviewingId('')} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold">Cancel</button><button disabled={Boolean(busyId)} onClick={() => void decide(item.id, 'request_review')} className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-60">Confirm Send for Review</button></div></div> : null}</article>)}</div></> : null}
    </div></div></main>;
}
