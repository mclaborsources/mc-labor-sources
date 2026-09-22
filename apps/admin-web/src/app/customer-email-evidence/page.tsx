'use client';

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { BrandPageTitle } from '@/components/brand';
import { BRAND_HERO_IMAGES } from '@/lib/navigation';
import { createClient } from '@/lib/supabase/client';
import { api } from '@/lib/api-client';
import { buildEmailBatchReport } from '@/lib/email-evidence-report';
import { downloadEmailEvidencePdf } from '@/lib/email-evidence-pdf';

type Batch = { id: string; customer_id: string; recipient_email: string; sender_email: string | null;
  subject: string; sent_at: string; sent_text: string | null; sent_html: string | null;
  sent_raw_base64: string | null;
  smtp_message_id: string | null; request_number: number | null };
type Item = { batch_id: string; timesheet_id: string; timesheet: {
  week_start_date: string | null; week_end_date: string | null; total_hours: number;
  employee: { first_name: string; last_name: string } | null } | null };
type Decision = { id: string; timesheet_id: string; source_batch_id: string | null;
  recipient_email: string | null; decision: string; comment: string | null; decided_at: string };
type ImportedEmail = { id: string; batch_id: string; filename: string; raw_eml_base64: string; imported_at: string };

function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
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
  const [timesheetId, setTimesheetId] = useState('');
  const [batchId, setBatchId] = useState('');
  const [uploadBatchId, setUploadBatchId] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [pdfExporting, setPdfExporting] = useState(false);
  const [pdfExportError, setPdfExportError] = useState('');

  const customers = useQuery({ queryKey: ['evidence-customers'], queryFn: async () => {
    const { data, error } = await client.from('customers').select('id,company_name').order('company_name');
    if (error) throw error;
    return data ?? [];
  } });
  const evidence = useQuery({ queryKey: ['customer-email-evidence', customerId], enabled: Boolean(customerId), queryFn: async () => {
    const typedBatches: Batch[] = [];
    for (let from = 0; ; from += 500) {
      const { data, error } = await client.from('timesheet_delivery_batches')
        .select('id,customer_id,recipient_email,sender_email,subject,sent_at,sent_text,sent_html,sent_raw_base64,smtp_message_id,request_number')
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

  const timesheets = useMemo(() => {
    const byId = new Map<string, Item>();
    for (const item of evidence.data?.items ?? []) byId.set(item.timesheet_id, item);
    return [...byId.values()].sort((a, b) => {
      const left = a.timesheet?.employee;
      const right = b.timesheet?.employee;
      return `${left?.last_name ?? ''} ${left?.first_name ?? ''}`.localeCompare(`${right?.last_name ?? ''} ${right?.first_name ?? ''}`);
    });
  }, [evidence.data?.items]);
  const selectedTimesheetId = timesheetId && timesheets.some((item) => item.timesheet_id === timesheetId)
    ? timesheetId : timesheets[0]?.timesheet_id ?? '';
  const relatedBatchIds = new Set((evidence.data?.items ?? []).filter((item) => item.timesheet_id === selectedTimesheetId).map((item) => item.batch_id));
  const relatedBatches = (evidence.data?.batches ?? []).filter((batch) => relatedBatchIds.has(batch.id));
  const selectedBatchId = relatedBatches.some((batch) => batch.id === batchId) ? batchId : relatedBatches[0]?.id ?? '';
  const selectedBatch = relatedBatches.find((batch) => batch.id === selectedBatchId);
  const batchItems = (evidence.data?.items ?? []).filter((item) => item.batch_id === selectedBatchId);
  const batchEvidence = useQuery({
    queryKey: ['sent-email-batch-evidence', selectedBatchId],
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
      for (let from = 0; ; from += 500) {
        const { data, error } = await client.from('timesheet_email_imports')
          .select('id,batch_id,filename,raw_eml_base64,imported_at')
          .eq('batch_id', selectedBatchId).order('imported_at').order('id').range(from, from + 499);
        if (error) throw error;
        imports.push(...((data ?? []) as ImportedEmail[]));
        if ((data?.length ?? 0) < 500) break;
      }
      return { decisions, imports };
    },
  });
  const selectedEvidence = useQuery({ queryKey: ['selected-email-evidence', selectedTimesheetId], enabled: Boolean(selectedTimesheetId), queryFn: async () => {
    const decisions: Decision[] = [];
    for (let from = 0; ; from += 500) {
      const { data, error } = await client.from('timesheet_customer_decision_events')
        .select('id,timesheet_id,source_batch_id,recipient_email,decision,comment,decided_at')
        .eq('timesheet_id', selectedTimesheetId).order('decided_at').order('id').range(from, from + 499);
      if (error) throw error;
      decisions.push(...((data ?? []) as Decision[]));
      if ((data?.length ?? 0) < 500) break;
    }
    const imports: ImportedEmail[] = [];
    const batchIds = [...relatedBatchIds];
    for (let index = 0; index < batchIds.length; index += 50) {
      const group = batchIds.slice(index, index + 50);
      for (let from = 0; ; from += 500) {
        const { data, error } = await client.from('timesheet_email_imports')
          .select('id,batch_id,filename,raw_eml_base64,imported_at')
          .in('batch_id', group).order('imported_at').order('id').range(from, from + 499);
        if (error) throw error;
        imports.push(...((data ?? []) as ImportedEmail[]));
        if ((data?.length ?? 0) < 500) break;
      }
    }
    return { decisions, imports };
  } });
  const relatedDecisions = selectedEvidence.data?.decisions ?? [];
  const relatedImports = selectedEvidence.data?.imports ?? [];
  const timeline = [
    ...relatedBatches.map((batch) => ({ kind: 'sent' as const, at: batch.sent_at, id: batch.id, batch })),
    ...relatedDecisions.map((decision) => ({ kind: 'decision' as const, at: decision.decided_at, id: decision.id, decision })),
    ...relatedImports.map((imported) => ({ kind: 'import' as const, at: imported.imported_at, id: imported.id, imported })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  async function importReply() {
    if (!uploadBatchId || !uploadFile) return;
    setUploadError('');
    if (!/\.eml$/i.test(uploadFile.name) || uploadFile.size > 10 * 1024 * 1024) {
      setUploadError('Choose an .eml email file no larger than 10 MB.');
      return;
    }
    setUploading(true);
    try {
      const me = await api.getMe();
      const bytes = new Uint8Array(await uploadFile.arrayBuffer());
      let binary = '';
      for (let index = 0; index < bytes.length; index += 8192) {
        binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
      }
      const { error } = await client.from('timesheet_email_imports').insert({
        batch_id: uploadBatchId, filename: uploadFile.name, raw_eml_base64: btoa(binary), imported_by_user_id: me.id,
      });
      if (error) throw error;
      setUploadFile(null);
      await queryClient.invalidateQueries({ queryKey: ['selected-email-evidence', selectedTimesheetId] });
      await queryClient.invalidateQueries({ queryKey: ['sent-email-batch-evidence', uploadBatchId] });
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Could not import the email.');
    } finally { setUploading(false); }
  }

  async function exportEvidence() {
    if (!selectedBatch || !batchEvidence.data) return;
    setPdfExporting(true);
    setPdfExportError('');
    try {
      const customer = customers.data?.find((item) => item.id === customerId)?.company_name ?? 'Customer';
      const html = buildEmailBatchReport({
        customer,
        batch: selectedBatch,
        items: batchItems,
        decisions: batchEvidence.data.decisions,
        imports: batchEvidence.data.imports,
        exportedAt: new Date().toISOString(),
      });
      await downloadEmailEvidencePdf(html, `timesheet-email-record-${selectedBatch.id}.pdf`);
    } catch (error) {
      setPdfExportError(error instanceof Error ? error.message : 'Could not create the PDF.');
    } finally {
      setPdfExporting(false);
    }
  }

  function exportRecordJson() {
    if (!selectedBatch || !batchEvidence.data) return;
    const customer = customers.data?.find((item) => item.id === customerId);
    download(`timesheet-email-record-${selectedBatch.id}.json`, JSON.stringify({
      exportedAt: new Date().toISOString(),
      customer: customer?.company_name ?? null,
      sentEmail: selectedBatch,
      timesheets: batchItems,
      portalDecisions: batchEvidence.data.decisions.filter((decision) =>
        decision.source_batch_id === selectedBatch.id || decision.source_batch_id === null),
      importedEmailCopies: batchEvidence.data.imports,
      note: 'Actions without source_batch_id are historical and cannot be attributed to this sent email. Imported copies are user supplied.',
    }, null, 2), 'application/json');
  }
  return <DashboardLayout heroTitle="Customer Email Evidence" heroImage={BRAND_HERO_IMAGES.inner}>
    <BrandPageTitle title="Customer Email Evidence" description="Review each sent email, every timesheet it contained, and the customer's actions." />
    <div className="space-y-5 rounded-xl border border-slate-200 bg-white p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="font-semibold">Customer<select className="mt-2 w-full rounded-lg border p-2" value={customerId} onChange={(event) => { setCustomerId(event.target.value); setTimesheetId(''); setBatchId(''); }}><option value="">Choose a customer</option>{customers.data?.map((item) => <option key={item.id} value={item.id}>{item.company_name}</option>)}</select></label>
        <label className="font-semibold">Find email by timesheet<select className="mt-2 w-full rounded-lg border p-2" value={selectedTimesheetId} onChange={(event) => { setTimesheetId(event.target.value); setBatchId(''); }} disabled={!timesheets.length}>{timesheets.map((item) => { const employee = item.timesheet?.employee; return <option key={item.timesheet_id} value={item.timesheet_id}>{employee?.first_name} {employee?.last_name} · {item.timesheet?.week_end_date ?? 'Work date'} · {item.timesheet?.total_hours ?? 0} hours</option>; })}</select></label>
      </div>
      {evidence.isPending && customerId ? <p>Loading email record…</p> : null}
      {evidence.error ? <p role="alert" className="text-red-700">Could not load email record: {evidence.error.message}</p> : null}
      {customerId && !evidence.isPending && !timesheets.length ? <p>No timesheet verification emails found for this customer.</p> : null}
      {selectedTimesheetId ? <>
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <label className="block font-semibold" htmlFor="evidence-sent-email">Sent email</label>
          <select id="evidence-sent-email" className="mt-2 w-full rounded-lg border border-blue-200 bg-white p-2" value={selectedBatchId} onChange={(event) => setBatchId(event.target.value)}>
            {relatedBatches.map((batch) => <option key={batch.id} value={batch.id}>{new Date(batch.sent_at).toLocaleString()} · {batch.subject} · {batch.recipient_email}</option>)}
          </select>
          <p className="mt-2 text-sm text-slate-700">This email included <strong>{batchItems.length} timesheet{batchItems.length === 1 ? '' : 's'}</strong>. Both downloads below include all of them and their recorded customer actions.</p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">Record for this sent email</h2><div className="flex flex-wrap gap-2"><button type="button" onClick={() => void exportEvidence()} disabled={!selectedBatch || batchEvidence.isPending || Boolean(batchEvidence.error) || pdfExporting} className="rounded-lg bg-blue-700 px-4 py-2 font-bold text-white disabled:opacity-50">{pdfExporting ? 'Preparing PDF…' : 'Download full email record (PDF)'}</button><button type="button" onClick={exportRecordJson} disabled={!selectedBatch || batchEvidence.isPending || Boolean(batchEvidence.error)} className="rounded-lg border border-blue-700 px-4 py-2 font-bold text-blue-700 disabled:opacity-50">Download complete data</button></div></div>
        {pdfExportError ? <p role="alert" className="text-red-700">{pdfExportError}</p> : null}
        {batchEvidence.isPending ? <p>Loading all timesheets and actions for this email…</p> : null}
        {batchEvidence.error ? <p role="alert" className="text-red-700">Could not load the complete email record: {batchEvidence.error.message}</p> : null}
        <h2 className="text-lg font-bold">Selected timesheet timeline</h2>
        {selectedEvidence.isPending ? <p>Loading approvals and imported emails…</p> : null}
        {selectedEvidence.error ? <p role="alert" className="text-red-700">Could not load the full record: {selectedEvidence.error.message}</p> : null}
        <p className="text-sm text-slate-600">New deliveries archive the original sent email. Earlier deliveries may have only metadata and the latest stored decision. Import original .eml files for earlier sent messages and customer replies to complete their record.</p>
        {relatedBatches.some((batch) => batch.sent_raw_base64) ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4"><h2 className="font-bold">Original sent emails with PDF attachments</h2><div className="mt-2 flex flex-wrap gap-2">{relatedBatches.filter((batch) => batch.sent_raw_base64).map((batch) => <button key={batch.id} type="button" className="rounded-lg border border-emerald-500 bg-white px-3 py-2 text-sm font-semibold text-emerald-800" onClick={() => downloadEmail(`sent-timesheets-${batch.id}.eml`, batch.sent_raw_base64!)}>Download sent .eml · {new Date(batch.sent_at).toLocaleString()}</button>)}</div></div> : null}
        <div className="space-y-3">{timeline.map((event) => <article key={`${event.kind}-${event.id}`} className="rounded-lg border border-slate-200 p-4"><p className="text-sm text-slate-500">{new Date(event.at).toLocaleString()}</p>{event.kind === 'sent' ? <><h3 className="font-bold">Sent verification email</h3><p>From: {event.batch.sender_email ?? 'Not archived'}<br />To: {event.batch.recipient_email}<br />Subject: {event.batch.subject}<br />Message ID: {event.batch.smtp_message_id ?? 'Not archived'}</p><pre className="mt-3 whitespace-pre-wrap break-words rounded bg-slate-50 p-3 text-sm">{event.batch.sent_text ?? 'Email body was not archived for this earlier delivery.'}</pre></> : event.kind === 'decision' ? <><h3 className="font-bold">Customer portal: {event.decision.decision === 'APPROVED' ? 'Approved hours' : 'Changes requested'}</h3><p className="text-sm text-slate-600">Email link recipient: {event.decision.recipient_email ?? 'Not recorded for earlier decisions'}</p>{event.decision.comment ? <p className="mt-2 whitespace-pre-wrap">{event.decision.comment}</p> : null}</> : <><h3 className="font-bold">Imported email copy: {event.imported.filename}</h3><pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-slate-50 p-3 text-sm">{emailPreview(event.imported.raw_eml_base64)}</pre><button type="button" className="mt-2 text-sm font-semibold text-blue-700 underline" onClick={() => downloadEmail(event.imported.filename, event.imported.raw_eml_base64)}>Download original .eml</button></>}</article>)}</div>
        <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50 p-4"><h2 className="font-bold">Add an original email copy</h2><p className="text-sm">Export a sent message or customer reply as an .eml file from your mailbox, then attach it to the related delivery below. Imported copies are labeled in the timeline.</p><select aria-label="Related sent email" className="w-full rounded-lg border p-2" value={uploadBatchId} onChange={(event) => setUploadBatchId(event.target.value)}><option value="">Choose the related sent email</option>{relatedBatches.map((batch) => <option key={batch.id} value={batch.id}>{new Date(batch.sent_at).toLocaleString()} · {batch.subject}</option>)}</select><input type="file" accept=".eml,message/rfc822" aria-label="Original .eml file" onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)} /><button type="button" disabled={!uploadBatchId || !uploadFile || uploading} onClick={() => void importReply()} className="rounded-lg bg-blue-700 px-4 py-2 font-bold text-white disabled:opacity-50">{uploading ? 'Importing…' : 'Import email copy'}</button>{uploadError ? <p role="alert" className="text-red-700">{uploadError}</p> : null}</div>
      </> : null}
    </div>
  </DashboardLayout>;
}
