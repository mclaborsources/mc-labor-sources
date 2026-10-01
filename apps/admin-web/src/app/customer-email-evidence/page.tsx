'use client';

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { BrandPageTitle } from '@/components/brand';
import { BRAND_HERO_IMAGES } from '@/lib/navigation';
import { createClient } from '@/lib/supabase/client';
import { buildEmailBatchReport } from '@/lib/email-evidence-report';
import { downloadEmailEvidencePdf } from '@/lib/email-evidence-pdf';
import { EmailReplySyncPanel } from '@/components/email/EmailReplySyncPanel';

type Batch = { id: string; customer_id: string; recipient_email: string; sender_email: string | null;
  subject: string; sent_at: string; sent_text: string | null; sent_html: string | null;
  sent_raw_base64: string | null;
  smtp_message_id: string | null; request_number: number | null; original_batch_id: string | null };
type Item = { batch_id: string; timesheet_id: string; timesheet: {
  week_start_date: string | null; week_end_date: string | null; total_hours: number;
  employee: { first_name: string; last_name: string } | null } | null };
type Decision = { id: string; timesheet_id: string; source_batch_id: string | null;
  recipient_email: string | null; decision: string; comment: string | null; decided_at: string };
type ImportedEmail = { id: string; batch_id: string; filename: string; raw_eml_base64: string; imported_at: string };
type SyncedReply = { id: string; matched_batch_id: string | null; provider: string; from_email: string;
  to_emails: string[]; subject: string; received_at: string; body_text: string | null; body_html: string | null;
  is_test: boolean };

function replyText(reply: SyncedReply) {
  if (reply.body_text?.trim()) return reply.body_text.trim();
  if (!reply.body_html) return '';
  const document = new DOMParser().parseFromString(reply.body_html, 'text/html');
  document.querySelectorAll('script,style,head').forEach((node) => node.remove());
  return document.body.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

function emailBytes(encoded: string) {
  return Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
}

function emailPreview(encoded: string) {
  return new TextDecoder('utf-8', { fatal: false }).decode(emailBytes(encoded));
}

function downloadEmail(filename: string, encoded: string) {
  const bytes = emailBytes(encoded);
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'message/rfc822' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function CustomerEmailEvidencePage() {
  const client = createClient();
  const queryClient = useQueryClient();
  const [customerId, setCustomerId] = useState('');
  const [workWeekFilter, setWorkWeekFilter] = useState('all');
  const [batchId, setBatchId] = useState('');
  const [pdfExporting, setPdfExporting] = useState(false);
  const [pdfExportError, setPdfExportError] = useState('');
  const [activeTab, setActiveTab] = useState<'evidence' | 'replies'>(() =>
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('tab') === 'replies' ? 'replies' : 'evidence');

  const customers = useQuery({ queryKey: ['evidence-customers'], queryFn: async () => {
    const { data, error } = await client.from('customers').select('id,company_name').order('company_name');
    if (error) throw error;
    return data ?? [];
  } });
  const evidence = useQuery({ queryKey: ['customer-email-evidence', customerId], enabled: Boolean(customerId), queryFn: async () => {
    const typedBatches: Batch[] = [];
    for (let from = 0; ; from += 500) {
      const { data, error } = await client.from('timesheet_delivery_batches')
        .select('id,customer_id,recipient_email,sender_email,subject,sent_at,sent_text,sent_html,sent_raw_base64,smtp_message_id,request_number,original_batch_id')
        .eq('customer_id', customerId).order('sent_at', { ascending: false }).order('id')
        .range(from, from + 499);
      if (error) throw error;
      typedBatches.push(...((data ?? []) as Batch[]));
      if ((data?.length ?? 0) < 500) break;
    }
    if (!typedBatches.length) return { batches: typedBatches, items: [] as Item[] };
    const batchIds = typedBatches.map((batch) => batch.id);
    const typedItems: Item[] = [];
    for (let index = 0; index < batchIds.length; index += 50) {
      const group = batchIds.slice(index, index + 50);
      for (let from = 0; ; from += 500) {
        const { data, error } = await client.from('timesheet_delivery_items')
          .select('batch_id,timesheet_id,timesheet:timesheets(week_start_date,week_end_date,total_hours,employee:employees(first_name,last_name))')
          .in('batch_id', group).order('batch_id').order('timesheet_id').range(from, from + 499);
        if (error) throw error;
        typedItems.push(...((data ?? []) as unknown as Item[]));
        if ((data?.length ?? 0) < 500) break;
      }
    }
    return { batches: typedBatches, items: typedItems };
  } });

  const originalBatches = useMemo(() => (evidence.data?.batches ?? [])
    .filter((batch) => !batch.original_batch_id && Number(batch.request_number ?? 1) === 1), [evidence.data?.batches]);
  const workWeeks = useMemo(() => {
    const originalBatchIds = new Set(originalBatches.map((batch) => batch.id));
    const options = new Map<string, { key: string; label: string; sort: string }>();
    for (const item of evidence.data?.items ?? []) {
      if (!originalBatchIds.has(item.batch_id)) continue;
      const start = item.timesheet?.week_start_date ?? '';
      const end = item.timesheet?.week_end_date ?? '';
      const key = start || end ? `${start}|${end}` : 'unknown';
      options.set(key, {
        key,
        label: start && end ? `${start} to ${end}` : end ? `Week ending ${end}` : start ? `Week starting ${start}` : 'Unknown work week',
        sort: end || start,
      });
    }
    return [...options.values()].sort((left, right) => right.sort.localeCompare(left.sort));
  }, [evidence.data?.items, originalBatches]);
  const filteredOriginalBatches = useMemo(() => workWeekFilter === 'all'
    ? originalBatches
    : originalBatches.filter((batch) => (evidence.data?.items ?? []).some((item) => {
      if (item.batch_id !== batch.id) return false;
      const start = item.timesheet?.week_start_date ?? '';
      const end = item.timesheet?.week_end_date ?? '';
      return (start || end ? `${start}|${end}` : 'unknown') === workWeekFilter;
    })), [evidence.data?.items, originalBatches, workWeekFilter]);
  const selectedBatchId = filteredOriginalBatches.some((batch) => batch.id === batchId)
    ? batchId : filteredOriginalBatches[0]?.id ?? '';
  const selectedBatch = filteredOriginalBatches.find((batch) => batch.id === selectedBatchId);
  const chainBatches = (evidence.data?.batches ?? [])
    .filter((batch) => batch.id === selectedBatchId || batch.original_batch_id === selectedBatchId)
    .sort((left, right) => left.sent_at.localeCompare(right.sent_at));
  const batchItems = [...new Map((evidence.data?.items ?? [])
    .filter((item) => item.batch_id === selectedBatchId)
    .filter((item) => workWeekFilter === 'all' || (() => {
      const start = item.timesheet?.week_start_date ?? '';
      const end = item.timesheet?.week_end_date ?? '';
      return (start || end ? `${start}|${end}` : 'unknown') === workWeekFilter;
    })())
    .map((item) => [item.timesheet_id, item])).values()];
  const itemById = new Map(batchItems.map((item) => [item.timesheet_id, item]));
  const batchEvidence = useQuery({
    queryKey: ['sent-email-batch-evidence', selectedBatchId, workWeekFilter],
    enabled: Boolean(selectedBatchId),
    queryFn: async () => {
      const itemIds = [...new Set(batchItems.map((item) => item.timesheet_id))];
      const decisions: Decision[] = [];
      for (let index = 0; index < itemIds.length; index += 50) {
        for (let from = 0; ; from += 500) {
          const { data, error } = await client.from('timesheet_customer_decision_events')
            .select('id,timesheet_id,source_batch_id,recipient_email,decision,comment,decided_at')
            .in('timesheet_id', itemIds.slice(index, index + 50))
            .order('decided_at').order('id').range(from, from + 499);
          if (error) throw error;
          decisions.push(...((data ?? []) as Decision[]));
          if ((data?.length ?? 0) < 500) break;
        }
      }
      const imports: ImportedEmail[] = [];
      const relatedIds = chainBatches.map((batch) => batch.id);
      for (let index = 0; index < relatedIds.length; index += 50) {
        for (let from = 0; ; from += 500) {
          const { data, error } = await client.from('timesheet_email_imports')
            .select('id,batch_id,filename,raw_eml_base64,imported_at')
            .in('batch_id', relatedIds.slice(index, index + 50)).order('imported_at').order('id').range(from, from + 499);
          if (error) throw error;
          imports.push(...((data ?? []) as ImportedEmail[]));
          if ((data?.length ?? 0) < 500) break;
        }
      }
      const replies: SyncedReply[] = [];
      for (let index = 0; index < relatedIds.length; index += 50) {
        for (let from = 0; ; from += 500) {
          const { data, error } = await client.from('email_replies_v2')
            .select('id,matched_batch_id,provider,from_email,to_emails,subject,received_at,body_text,body_html,is_test')
            .in('matched_batch_id', relatedIds.slice(index, index + 50))
            .eq('match_status', 'MATCHED').eq('is_test', false)
            .order('received_at').order('id').range(from, from + 499);
          if (error) throw error;
          replies.push(...((data ?? []) as SyncedReply[]));
          if ((data?.length ?? 0) < 500) break;
        }
      }
      return { decisions, imports, replies };
    },
  });
  const relatedDecisions = (batchEvidence.data?.decisions ?? [])
    .filter((decision) => !selectedBatch || decision.decided_at >= selectedBatch.sent_at);
  const relatedImports = batchEvidence.data?.imports ?? [];
  const relatedReplies = batchEvidence.data?.replies ?? [];
  const timeline = [
    ...chainBatches.map((batch) => ({ kind: 'sent' as const, at: batch.sent_at, id: batch.id, batch })),
    ...relatedDecisions.map((decision) => ({ kind: 'decision' as const, at: decision.decided_at, id: decision.id, decision })),
    ...relatedImports.map((imported) => ({ kind: 'import' as const, at: imported.imported_at, id: imported.id, imported })),
    ...relatedReplies.map((reply) => ({ kind: 'reply' as const, at: reply.received_at, id: reply.id, reply })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  const itemName = (item?: Item) => {
    const employee = item?.timesheet?.employee;
    return `${employee?.first_name ?? ''} ${employee?.last_name ?? ''}`.trim() || 'Unknown employee';
  };
  const latestDecision = (timesheetId: string) => relatedDecisions
    .filter((decision) => decision.timesheet_id === timesheetId)
    .at(-1);
  const batchItemCount = (id: string) => new Set((evidence.data?.items ?? [])
    .filter((item) => item.batch_id === id).map((item) => item.timesheet_id)).size;
  const batchItemCountForWeek = (id: string) => new Set((evidence.data?.items ?? [])
    .filter((item) => item.batch_id === id)
    .filter((item) => {
      if (workWeekFilter === 'all') return true;
      const start = item.timesheet?.week_start_date ?? '';
      const end = item.timesheet?.week_end_date ?? '';
      return (start || end ? `${start}|${end}` : 'unknown') === workWeekFilter;
    }).map((item) => item.timesheet_id)).size;

  async function exportEvidence() {
    if (!selectedBatch || !batchEvidence.data) return;
    setPdfExporting(true);
    setPdfExportError('');
    try {
      const sender = selectedBatch.sender_email?.trim().toLowerCase();
      if (!sender) throw new Error('This sent email has no archived From address, so the matching reply mailbox cannot be identified.');

      const { data: connections, error: connectionsError } = await client.from('email_reply_connections_v2')
        .select('id,mailbox_email,provider,status').eq('status', 'CONNECTED');
      if (connectionsError) throw connectionsError;
      let matchingConnections = (connections ?? []).filter((connection) =>
        connection.mailbox_email?.trim().toLowerCase() === sender);
      if (!matchingConnections.length) {
        const outlookConnections = (connections ?? []).filter((connection) => connection.provider === 'OUTLOOK');
        if (outlookConnections.length === 1) matchingConnections = outlookConnections;
      }
      if (!matchingConnections.length) {
        throw new Error(`No connected mailbox can read ${selectedBatch.sender_email}. Connect that mailbox, or leave only one Outlook connection and grant it access to the shared mailbox, then try again.`);
      }

      for (const connection of matchingConnections) {
        const { data, error } = await client.functions.invoke('email-reply-sync-v2', {
          body: {
            action: 'sync', connectionId: connection.id,
            ...(connection.provider === 'OUTLOOK' ? { mailboxEmail: selectedBatch.sender_email } : {}),
          },
        });
        if (error) {
          const response = (error as { context?: Response }).context;
          if (response) {
            try {
              const details = await response.clone().json() as { error?: string };
              if (details.error) throw new Error(details.error);
            } catch (detailsError) {
              if (detailsError instanceof Error && detailsError.message !== 'Unexpected end of JSON input') throw detailsError;
            }
          }
          throw error;
        }
        if (data?.error) throw new Error(data.error);
      }

      await queryClient.invalidateQueries({ queryKey: ['sent-email-batch-evidence', selectedBatchId] });
      const refreshedEvidence = await batchEvidence.refetch();
      if (refreshedEvidence.error) throw refreshedEvidence.error;
      if (!refreshedEvidence.data) throw new Error('Mailbox sync completed, but the email evidence could not be reloaded.');

      const customer = customers.data?.find((item) => item.id === customerId)?.company_name ?? 'Customer';
      const html = buildEmailBatchReport({
        customer,
        batch: selectedBatch,
        items: batchItems,
        decisions: refreshedEvidence.data.decisions,
        imports: refreshedEvidence.data.imports,
        replies: refreshedEvidence.data.replies,
        chainBatches,
        sourceBatchIds: chainBatches.map((batch) => batch.id),
        exportedAt: new Date().toISOString(),
      });
      await downloadEmailEvidencePdf(html, `timesheet-email-record-${selectedBatch.id}.pdf`);
    } catch (error) {
      setPdfExportError(error instanceof Error ? error.message : 'Could not create the PDF.');
    } finally {
      setPdfExporting(false);
    }
  }

  return <DashboardLayout heroTitle="Customer Email Evidence" heroImage={BRAND_HERO_IMAGES.inner}>
    <BrandPageTitle title="Customer Email Evidence" description="Choose the first sent email, then review every included timesheet and everything that happened afterward." />
    <div className="mb-5 flex flex-wrap gap-2 border-b border-slate-200" role="tablist" aria-label="Email tools">
      <button type="button" role="tab" aria-selected={activeTab === 'evidence'} onClick={() => setActiveTab('evidence')} className={`border-b-2 px-4 py-3 text-sm font-semibold ${activeTab === 'evidence' ? 'border-blue-700 text-blue-800' : 'border-transparent text-slate-600 hover:text-slate-900'}`}>Customer Email Evidence</button>
      <button type="button" role="tab" aria-selected={activeTab === 'replies'} onClick={() => setActiveTab('replies')} className={`border-b-2 px-4 py-3 text-sm font-semibold ${activeTab === 'replies' ? 'border-blue-700 text-blue-800' : 'border-transparent text-slate-600 hover:text-slate-900'}`}>Reply Mailboxes &amp; Sync</button>
    </div>
    {activeTab === 'replies' ? <EmailReplySyncPanel /> : <>
    <div className="space-y-5 rounded-xl border border-slate-200 bg-white p-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="font-semibold">Customer<select className="mt-2 w-full rounded-lg border p-2" value={customerId} onChange={(event) => { setCustomerId(event.target.value); setWorkWeekFilter('all'); setBatchId(''); }}><option value="">Choose a customer</option>{customers.data?.map((item) => <option key={item.id} value={item.id}>{item.company_name}</option>)}</select></label>
        <label className="font-semibold">Work week<select className="mt-2 w-full rounded-lg border p-2" value={workWeekFilter} onChange={(event) => { setWorkWeekFilter(event.target.value); setBatchId(''); }} disabled={!workWeeks.length}><option value="all">All work weeks</option>{workWeeks.map((week) => <option key={week.key} value={week.key}>{week.label}</option>)}</select></label>
        <label className="font-semibold">First sent email<select className="mt-2 w-full rounded-lg border p-2" value={selectedBatchId} onChange={(event) => setBatchId(event.target.value)} disabled={!filteredOriginalBatches.length}><option value="">Choose the first email</option>{filteredOriginalBatches.map((batch) => { const count = batchItemCountForWeek(batch.id); return <option key={batch.id} value={batch.id}>{new Date(batch.sent_at).toLocaleString()} · {count} timesheet{count === 1 ? '' : 's'} · {batch.subject}</option>; })}</select></label>
      </div>
      {evidence.isPending && customerId ? <p>Loading email record…</p> : null}
      {evidence.error ? <p role="alert" className="text-red-700">Could not load email record: {evidence.error.message}</p> : null}
      {customerId && !evidence.isPending && !originalBatches.length ? <p>No first timesheet verification emails found for this customer.</p> : null}
      {customerId && workWeekFilter !== 'all' && !filteredOriginalBatches.length ? <p>No first emails contain timesheets for the selected work week.</p> : null}
      {selectedBatch ? <>
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <h2 className="font-bold">First email sent {new Date(selectedBatch.sent_at).toLocaleString()}</h2>
          <p className="mt-1">{selectedBatch.subject} · To {selectedBatch.recipient_email}</p>
          <p className="mt-2 text-sm text-slate-700">{workWeekFilter === 'all' ? <>This email included <strong>{batchItems.length} timesheet{batchItems.length === 1 ? '' : 's'}</strong>.</> : <>Showing <strong>{batchItems.length} timesheet{batchItems.length === 1 ? '' : 's'}</strong> from the selected work week. This email may also include timesheets from other weeks.</>} The record below follows those timesheets through {chainBatches.length - 1} follow-up email{chainBatches.length - 1 === 1 ? '' : 's'} and all recorded customer actions.</p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">Complete record from this first email</h2><button type="button" onClick={() => void exportEvidence()} disabled={batchEvidence.isPending || Boolean(batchEvidence.error) || pdfExporting} className="rounded-lg bg-blue-700 px-4 py-2 font-bold text-white disabled:opacity-50">{pdfExporting ? 'Syncing mailbox and preparing PDF…' : 'Sync mailbox & download PDF'}</button></div>
        {pdfExportError ? <p role="alert" className="text-red-700">{pdfExportError}</p> : null}
        {batchEvidence.isPending ? <p>Loading all timesheets and actions for this email…</p> : null}
        {batchEvidence.error ? <p role="alert" className="text-red-700">Could not load the complete email record: {batchEvidence.error.message}</p> : null}
        <section className="space-y-3"><h2 className="text-lg font-bold">Timesheets included in the first email</h2><div className="grid gap-3 lg:grid-cols-2">{batchItems.map((item) => { const decision = latestDecision(item.timesheet_id); const status = decision?.decision === 'APPROVED' ? 'Approved' : decision?.decision === 'CHANGES_REQUESTED' ? 'Changes requested' : 'Awaiting approval'; const tone = decision?.decision === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' : decision?.decision === 'CHANGES_REQUESTED' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'; return <article key={item.timesheet_id} className="rounded-lg border border-slate-200 p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-bold">{itemName(item)}</h3><p className="text-sm text-slate-600">Week ending {item.timesheet?.week_end_date ?? 'date unavailable'} · {item.timesheet?.total_hours ?? 0} hours</p></div><span className={`rounded px-2 py-1 text-xs font-bold ${tone}`}>{status}</span></div></article>; })}</div></section>
        <h2 className="text-lg font-bold">Email chain and timesheet activity</h2>
        <p className="text-sm text-slate-600">The timeline begins with the selected first email and includes follow-up requests, matched customer replies, approvals, requested changes, and imported email copies for all timesheets that were in that first email.</p>
        <div className="space-y-3">{timeline.map((event) => <article key={`${event.kind}-${event.id}`} className="rounded-lg border border-slate-200 p-4"><p className="text-sm text-slate-500">{new Date(event.at).toLocaleString()}</p>{event.kind === 'sent' ? <><h3 className="font-bold">{Number(event.batch.request_number ?? 1) === 1 ? `First verification email sent with ${batchItemCount(event.batch.id)} timesheets` : `Follow-up verification email sent (request ${event.batch.request_number})`}</h3><p>From: {event.batch.sender_email ?? 'Not archived'}<br />To: {event.batch.recipient_email}<br />Subject: {event.batch.subject}<br />Message ID: {event.batch.smtp_message_id ?? 'Not archived'}</p><pre className="mt-3 whitespace-pre-wrap break-words rounded bg-slate-50 p-3 text-sm">{event.batch.sent_text ?? 'Email body was not archived for this earlier delivery.'}</pre></> : event.kind === 'decision' ? <><h3 className="font-bold">{itemName(itemById.get(event.decision.timesheet_id))}: {event.decision.decision === 'APPROVED' ? 'Approved hours' : 'Changes requested'}</h3><p className="text-sm text-slate-600">Email link recipient: {event.decision.recipient_email ?? 'Not recorded for earlier decisions'}</p>{event.decision.comment ? <p className="mt-2 whitespace-pre-wrap">{event.decision.comment}</p> : null}</> : event.kind === 'reply' ? <><h3 className="font-bold">Customer reply · {event.reply.provider}</h3><p>From: {event.reply.from_email}<br />To: {event.reply.to_emails.join(', ') || 'Not recorded'}<br />Subject: {event.reply.subject}<br />Matched to sent email: {chainBatches.find((batch) => batch.id === event.reply.matched_batch_id)?.subject ?? 'This email chain'}</p><pre className="mt-3 whitespace-pre-wrap break-words rounded bg-slate-50 p-3 text-sm">{replyText(event.reply) || 'No message body was archived.'}</pre></> : <><h3 className="font-bold">Imported email copy: {event.imported.filename}</h3><pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-slate-50 p-3 text-sm">{emailPreview(event.imported.raw_eml_base64)}</pre><button type="button" className="mt-2 text-sm font-semibold text-blue-700 underline" onClick={() => downloadEmail(event.imported.filename, event.imported.raw_eml_base64)}>Download original .eml</button></>}</article>)}</div>
      </> : null}
    </div>
    </>}
  </DashboardLayout>;
}
