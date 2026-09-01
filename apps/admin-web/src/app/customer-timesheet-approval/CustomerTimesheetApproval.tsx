'use client';

import { useCallback, useEffect, useState } from 'react';

type ApprovalTimesheet = { id: string; employeeName: string; employeeFirstName: string; employeeLastName: string; jobSiteName: string; workDate?: string | null; weekStartDate?: string | null; weekEndDate?: string | null; totalHours: number; hasSignedTimesheet: boolean; approvedAt?: string | null; reviewRequestedAt?: string | null; reviewComment?: string | null; entries: Array<{ workDate: string; hours: number }> };
type ApprovalBatch = { customerName: string; recipientEmail: string; sentAt: string; expiresAt: string; customerNote?: string | null; timesheets: ApprovalTimesheet[] };

const DEMO_BATCH: ApprovalBatch = {
  customerName: 'Ray Mc Veigh', recipientEmail: 'client@example.com', sentAt: '2026-08-21T09:00:00Z', expiresAt: '2026-09-20T09:00:00Z',
  timesheets: [
    ['Kevin Hy', 'Office', [8, 8, 8, 8, 8, 0, 0], true],
    ["Ryan O'Neill", 'Office', [8, 8, 8, 8, 6, 0, 0], true],
    ['Raymond Mc Veigh', 'Warehouse', [8, 8, 10, 8, 8, 0, 0], true],
    ["Eamon O'Hara", 'Office', [7.5, 8, 8, 8, 7.5, 0, 0], false],
    ['Siobhan Loftus', 'North Yard', [8, 8, 8, 8, 8, 0, 0], true],
    ['Brian Mc Veigh', 'Warehouse', [8, 9, 8, 9, 8, 0, 0], true],
    ['James Johnston', 'Office', [8, 8, 8, 8, 8, 0, 0], true],
  ].map(([name, job, hours, signed], row) => {
    const [employeeFirstName, ...last] = (name as string).split(' ');
    const values = hours as number[];
    return { id: `demo-${row}`, employeeName: name as string, employeeFirstName, employeeLastName: last.join(' '), jobSiteName: job as string, weekStartDate: '2026-08-15', weekEndDate: '2026-08-21', totalHours: values.reduce((sum, value) => sum + value, 0), hasSignedTimesheet: signed as boolean, entries: values.map((value, index) => ({ workDate: dateAt('2026-08-15', index), hours: value })) };
  }),
};

async function requestPage(token: string, action: 'load' | 'approve' | 'approve_all' | 'request_review' | 'save_note', timesheetId?: string, comment?: string): Promise<ApprovalBatch> {
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
function displayHours(value: number) {
  return value ? value.toFixed(2) : '';
}

export function CustomerTimesheetApproval({ token, approveAll = false, demo = false }: { token: string; approveAll?: boolean; demo?: boolean }) {
  const [batch, setBatch] = useState<ApprovalBatch | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [reviewingId, setReviewingId] = useState('');
  const [comments, setComments] = useState<Record<string, string>>({});
  const [approvedAll, setApprovedAll] = useState(false);
  const [customerNote, setCustomerNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);
  const load = useCallback(async () => { if (demo) { setBatch(DEMO_BATCH); setCustomerNote(DEMO_BATCH.customerNote ?? ''); setLoading(false); return; } if (!token) { setError('This approval link is missing its secure token.'); setLoading(false); return; } try { const loaded = await requestPage(token, approveAll ? 'approve_all' : 'load'); setBatch(loaded); setCustomerNote(loaded.customerNote ?? ''); setApprovedAll(approveAll); } catch (e) { setError(e instanceof Error ? e.message : 'Could not load this approval request.'); } finally { setLoading(false); } }, [approveAll, demo, token]);
  useEffect(() => { void load(); }, [load]);

  async function decide(id: string, action: 'approve' | 'request_review') {
    setBusyId(id); setError('');
    if (demo) {
      setBatch((current) => current ? { ...current, timesheets: current.timesheets.map((item) => item.id === id ? { ...item, approvedAt: action === 'approve' ? new Date().toISOString() : null, reviewRequestedAt: action === 'request_review' ? new Date().toISOString() : null } : item) } : current);
      setReviewingId(''); setBusyId(''); return;
    }
    try { setBatch(await requestPage(token, action, id, comments[id])); setReviewingId(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not record this decision.'); }
    finally { setBusyId(''); }
  }

  async function sendNote() {
    setSavingNote(true); setError(''); setNoteSaved(false);
    if (demo) {
      setBatch((current) => current ? { ...current, customerNote: customerNote.trim() || null } : current);
      setSavingNote(false); setNoteSaved(true); return;
    }
    try { const updated = await requestPage(token, 'save_note', undefined, customerNote); setBatch(updated); setCustomerNote(updated.customerNote ?? ''); setNoteSaved(true); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not send the note.'); }
    finally { setSavingNote(false); }
  }

  const displayedTimesheets = batch
    ? [...batch.timesheets].sort(
        (a, b) => Number(Boolean(a.approvedAt)) - Number(Boolean(b.approvedAt)),
      )
    : [];

  return <main className="min-h-screen bg-slate-100 text-slate-900 sm:px-6 sm:py-8 lg:px-8"><div className="mx-auto max-w-[1600px] overflow-hidden bg-white shadow-xl sm:rounded-2xl sm:border sm:border-slate-200">
    <header className="border-b border-slate-200 bg-slate-950 px-4 py-4 text-white sm:px-8 sm:py-6"><p className="text-[11px] font-bold uppercase tracking-[0.2em] text-blue-300 sm:text-sm">MC Labor Sources</p><div className="mt-1 flex items-end justify-between gap-3 sm:block"><div><h1 className="text-xl font-black sm:mt-2 sm:text-3xl">Review Timesheets</h1>{batch ? <p className="mt-1 text-sm text-slate-300 sm:mt-2 sm:text-base">{batch.customerName}</p> : null}</div>{demo ? <span className="mb-1 rounded-full bg-blue-400/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-blue-200">Demo</span> : null}</div></header>
    <div className="p-3 sm:p-8">{loading ? <p className="py-16 text-center text-slate-500">{approveAll ? 'Approving all timesheets…' : 'Loading timesheets…'}</p> : null}{error ? <p className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}
      {approvedAll && batch ? <p className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm font-bold text-emerald-800">All eligible timesheets attached to this email have been approved. Thank you.</p> : null}
      {batch ? <><div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs text-blue-950 sm:mb-6 sm:rounded-xl sm:px-4 sm:py-3 sm:text-sm"><span><strong>{batch.timesheets.length}</strong> to review</span><span>{batch.timesheets.filter((i) => i.approvedAt).length} approved · {batch.timesheets.filter((i) => i.reviewRequestedAt).length} changes</span></div>
      <div className="space-y-2 sm:hidden">{displayedTimesheets.map((item) => { const start = item.weekStartDate ?? item.workDate; const regular = Math.min(item.totalHours, 40); const overtime = Math.max(item.totalHours - 40, 0); return <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="truncate text-sm font-black text-slate-950">{item.employeeName}</h2><p className="mt-0.5 truncate text-xs text-slate-500">{item.jobSiteName}</p></div><div className="shrink-0 text-center"><p className="min-h-5 text-xl font-black leading-none text-slate-950">{item.totalHours ? item.totalHours.toFixed(1) : ''}</p><p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Total hrs</p></div></div><div className="mt-3 grid grid-cols-7 gap-1">{WEEK_DAYS.map((day, index) => { const value = hoursForDate(item, dateAt(start, index)); return <div key={day} className="rounded-md bg-slate-100 px-0.5 py-1.5 text-center"><span className="block text-[9px] font-bold uppercase text-slate-500">{day.slice(0, 2)}</span><span className="mt-0.5 block min-h-4 text-sm font-black text-slate-900">{value ? value.toFixed(value % 1 ? 1 : 0) : ''}</span></div>; })}</div><div className="mt-2 flex items-center justify-between text-[11px]"><span className={item.hasSignedTimesheet ? 'font-bold text-slate-500' : 'font-bold text-red-600'}>{item.hasSignedTimesheet ? '✓ Signed copy attached' : '⚠ No signed copy'}</span><span className="text-slate-500">Regular {regular.toFixed(1)}{overtime ? ` · OT ${overtime.toFixed(1)}` : ''}</span></div><div className="mt-3">{item.approvedAt ? <div className="rounded-lg bg-emerald-50 py-2 text-center text-xs font-black text-emerald-700">✓ Approved</div> : item.reviewRequestedAt ? <div className="rounded-lg bg-amber-50 py-2 text-center text-xs font-black text-amber-800">Changes requested</div> : <div className="grid grid-cols-2 gap-2"><button disabled={Boolean(busyId)} onClick={() => void decide(item.id, 'approve')} className="min-h-10 rounded-lg bg-emerald-600 px-3 text-xs font-black text-white disabled:opacity-60">Approve</button><button disabled={Boolean(busyId)} onClick={() => setReviewingId(item.id)} className="min-h-10 rounded-lg border border-amber-300 bg-amber-50 px-3 text-xs font-black text-amber-800 disabled:opacity-60">Request changes</button></div>}</div></article>; })}</div>
      <div className="hidden overflow-x-auto rounded-xl border border-slate-300 [touch-action:pan-x] sm:block">
        <table className="w-full min-w-[1320px] border-collapse text-xs">
          <thead className="bg-black text-white"><tr><th colSpan={14} className="px-3 py-3 text-center text-xl font-black">Mc Labor Sources, Inc. Timesheets</th></tr><tr>
            <th className="w-28 border border-white/50 px-2 py-2 text-left">Job Name</th><th className="w-28 border border-white/50 px-2 py-2 text-left">First Name</th><th className="w-36 border border-white/50 px-2 py-2 text-left">Last Name</th>
            {WEEK_DAYS.map((day, index) => { const date = dateAt(displayedTimesheets[0]?.weekStartDate ?? displayedTimesheets[0]?.workDate, index); return <th key={day} className="border border-white/50 px-2 py-2 text-center"><span className="block">{day}</span><span className="block">{shortDate(date)}</span></th>; })}
            <th className="border border-white/50 px-2 py-2 text-center">TH</th><th className="border border-white/50 px-2 py-2 text-center">RH</th><th className="border border-white/50 px-2 py-2 text-center">OT</th><th className="border border-white/50 px-2 py-2 text-left">Signed Timesheet / Action</th>
          </tr></thead><tbody>{displayedTimesheets.map((item) => { const start = item.weekStartDate ?? item.workDate; const regular = Math.min(item.totalHours, 40); const overtime = Math.max(item.totalHours - 40, 0); return <tr key={item.id} className={item.approvedAt ? 'bg-emerald-50/50' : 'bg-white even:bg-slate-50'}>
            <td className="whitespace-nowrap border border-slate-300 px-2 py-2 font-bold">{item.jobSiteName}</td><td className="whitespace-nowrap border border-slate-300 px-2 py-2">{item.employeeFirstName}</td><td className="whitespace-nowrap border border-slate-300 px-2 py-2">{item.employeeLastName}</td>
            {WEEK_DAYS.map((day, index) => <td key={day} className="border border-slate-300 px-2 py-2 text-center text-sm font-semibold tabular-nums">{displayHours(hoursForDate(item, dateAt(start, index)))}</td>)}
            <td className="border border-slate-300 px-2 py-2 text-center text-sm font-black tabular-nums">{displayHours(item.totalHours)}</td><td className="border border-slate-300 px-2 py-2 text-center text-sm font-semibold tabular-nums">{displayHours(regular)}</td><td className="border border-slate-300 px-2 py-2 text-center text-sm font-semibold tabular-nums">{displayHours(overtime)}</td>
            <td className="border border-slate-300 px-2 py-2"><p className={item.hasSignedTimesheet ? 'font-bold text-slate-700' : 'font-bold text-red-600'}>{item.hasSignedTimesheet ? 'Signed Timesheet attached' : 'No Timesheet'}</p><div className="mt-2 flex gap-2">{item.approvedAt ? <span className="font-black text-emerald-700">✓ Approved</span> : item.reviewRequestedAt ? <span className="font-black text-amber-800">Changes Requested</span> : <><button disabled={Boolean(busyId)} onClick={() => void decide(item.id, 'approve')} className="min-h-10 rounded bg-emerald-600 px-3 font-black text-white disabled:opacity-60">Approve</button><button disabled={Boolean(busyId)} onClick={() => setReviewingId(item.id)} className="min-h-10 rounded border border-amber-400 bg-amber-50 px-3 font-black text-amber-800 disabled:opacity-60">Request Changes</button></>}</div></td>
          </tr>; })}</tbody>
        </table>
      </div>
      <section className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4"><label className="text-sm font-black text-slate-900">Optional note <span className="font-normal text-slate-500">(sent to MC Labor Sources)</span><textarea rows={3} maxLength={2000} value={customerNote} onChange={(event) => { setCustomerNote(event.target.value); setNoteSaved(false); }} placeholder="Add an optional message about this timesheet review" className="mt-2 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200" /></label><div className="mt-3 flex items-center justify-end gap-3">{noteSaved ? <span className="text-sm font-bold text-emerald-700">✓ Note sent</span> : null}<button type="button" disabled={savingNote || !customerNote.trim()} onClick={() => void sendNote()} className="rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-black text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50">{savingNote ? 'Sending…' : 'Send Note'}</button></div>{batch.customerNote ? <div className="mt-3 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm text-slate-700"><span className="font-bold text-emerald-800">Customer note:</span> {batch.customerNote}</div> : null}</section></> : null}
    </div></div>
    {reviewingId ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" role="dialog" aria-modal="true" aria-labelledby="review-modal-title" onMouseDown={(event) => { if (event.target === event.currentTarget && !busyId) setReviewingId(''); }}><div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"><div className="border-b border-slate-200 px-6 py-5"><h2 id="review-modal-title" className="text-xl font-black text-slate-950">Request Timesheet Changes</h2><p className="mt-1 text-sm text-slate-500">Tell MC Labor Sources what should be checked or corrected.</p></div><div className="p-6"><label className="text-sm font-bold text-slate-900">Change request <span className="font-normal text-slate-500">(optional)</span></label><textarea autoFocus rows={4} maxLength={2000} value={comments[reviewingId] ?? ''} onChange={(event) => setComments((current) => ({ ...current, [reviewingId]: event.target.value }))} placeholder="Describe what should be checked or corrected" className="mt-2 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-300"/><div className="mt-5 flex flex-wrap justify-end gap-3"><button type="button" disabled={Boolean(busyId)} onClick={() => setReviewingId('')} className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60">Cancel</button><button type="button" disabled={Boolean(busyId)} onClick={() => void decide(reviewingId, 'request_review')} className="rounded-lg bg-amber-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-amber-700 disabled:opacity-60">{busyId ? 'Submitting…' : 'Confirm Request Changes'}</button></div></div></div></div> : null}
  </main>;
}
