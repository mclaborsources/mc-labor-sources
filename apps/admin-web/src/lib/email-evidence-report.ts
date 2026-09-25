export type EvidenceBatch = {
  id: string;
  recipient_email: string;
  sender_email: string | null;
  subject: string;
  sent_at: string;
  sent_text: string | null;
  smtp_message_id: string | null;
};

export type EvidenceItem = {
  timesheet_id: string;
  timesheet: {
    week_end_date: string | null;
    total_hours: number;
    employee: { first_name: string; last_name: string } | null;
  } | null;
};

export type EvidenceDecision = {
  timesheet_id: string;
  source_batch_id: string | null;
  recipient_email: string | null;
  decision: string;
  comment: string | null;
  decided_at: string;
};

export type EvidenceImport = {
  filename: string;
  raw_eml_base64: string;
  imported_at: string;
};

export function escapeEvidenceHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
}

export function buildEmailBatchReport(input: {
  customer: string;
  batch: EvidenceBatch;
  items: EvidenceItem[];
  decisions: EvidenceDecision[];
  imports: EvidenceImport[];
  sourceBatchIds?: string[];
  exportedAt: string;
}) {
  const { customer, batch, decisions, imports, exportedAt } = input;
  const items = [...new Map(input.items.map((item) => [item.timesheet_id, item])).values()];
  const html = escapeEvidenceHtml;
  const date = (value: string) => html(new Date(value).toLocaleString());
  const name = (item: EvidenceItem) => {
    const employee = item.timesheet?.employee;
    return `${employee?.first_name ?? ''} ${employee?.last_name ?? ''}`.trim() || 'Unknown employee';
  };
  const sourceBatchIds = new Set(input.sourceBatchIds ?? [batch.id]);
  const relevant = decisions
    .filter((decision) => items.some((item) => item.timesheet_id === decision.timesheet_id))
    .filter((decision) => decision.source_batch_id === null || sourceBatchIds.has(decision.source_batch_id))
    .sort((left, right) => left.decided_at.localeCompare(right.decided_at));
  const linkedCount = relevant.filter((decision) => decision.source_batch_id !== null).length;
  const legacyCount = relevant.length - linkedCount;
  const importedText = (encoded: string) => new TextDecoder('utf-8', { fatal: false })
    .decode(Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0)));
  const rows = items.map((item) => {
    const linked = relevant.filter((decision) =>
      decision.timesheet_id === item.timesheet_id && decision.source_batch_id !== null);
    const historical = relevant.filter((decision) =>
      decision.timesheet_id === item.timesheet_id && decision.source_batch_id === null);
    const actions = [...linked, ...historical]
      .sort((left, right) => left.decided_at.localeCompare(right.decided_at));
    const latest = actions.at(-1);
    const status = latest?.decision === 'APPROVED' ? 'APPROVED'
      : latest?.decision === 'CHANGES_REQUESTED' ? 'CHANGES REQUESTED'
        : 'AWAITING APPROVAL';
    const tone = latest?.decision === 'APPROVED' ? 'approved'
      : latest?.decision === 'CHANGES_REQUESTED' ? 'changes' : 'pending';
    const action = (decision: EvidenceDecision) => {
      const verifiedLink = decision.source_batch_id !== null;
      return `<li><strong>${decision.decision === 'APPROVED' ? 'Approved hours' : 'Requested changes'}</strong> · ${date(decision.decided_at)}<span class="source">${verifiedLink ? 'Action linked to this email chain' : 'Historical action; source email was not recorded'}</span>${decision.comment ? `<p class="comment">${html(decision.comment)}</p>` : ''}</li>`;
    };
    return `<article class="timesheet"><div class="timesheet-heading"><div><h3>${html(name(item))}</h3><p>Week ending ${html(item.timesheet?.week_end_date ?? 'date unavailable')} · ${html(String(item.timesheet?.total_hours ?? 0))} hours</p></div><div class="approval"><span>Approval status</span><strong class="status ${tone}">${status}</strong></div></div>${actions.length ? `<ol class="actions">${actions.map(action).join('')}</ol>` : '<p class="empty">No customer portal action recorded for this timesheet.</p>'}<p class="id">Timesheet ID: ${html(item.timesheet_id)}</p></article>`;
  }).join('');
  const imported = imports.map((copy) =>
    `<article class="import"><h3>${html(copy.filename)}</h3><p>Imported ${date(copy.imported_at)} · User supplied email copy; origin not independently verified.</p><pre class="message">${html(importedText(copy.raw_eml_base64))}</pre></article>`
  ).join('');
  const title = `Timesheet email record — ${customer}`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${html(title)}</title><style>
    *{box-sizing:border-box}body{margin:0;background:#edf3f9;color:#18263b;font:15px/1.5 Arial,sans-serif}.page{max-width:940px;margin:32px auto;padding:38px 46px;background:#fff;box-shadow:0 12px 40px #18263b16}.eyebrow{margin:0 0 8px;color:#1d5db4;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase}h1{margin:0;font-size:30px;line-height:1.2}h2{margin:32px 0 15px;font-size:20px}h3{margin:0;font-size:17px}.subhead,.muted{color:#52657d}.summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:25px 0}.summary-box{padding:14px 17px;border:1px solid #d7e3ef;border-radius:10px;background:#f7faff}.summary-box span{display:block;color:#59708c;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}.summary-box strong{display:block;margin-top:5px;font-size:17px}.notice{padding:14px 17px;border-left:4px solid #3b82f6;background:#eff6ff;color:#294661;font-size:13px}.email,.timesheet,.import{break-inside:avoid;page-break-inside:avoid;margin:0 0 14px;padding:19px 22px;border:1px solid #d7e3ef;border-radius:10px}.email dl{display:grid;grid-template-columns:130px 1fr;gap:7px 12px;margin:12px 0 0}.email dt{color:#59708c}.email dd{margin:0;overflow-wrap:anywhere}.message,.comment{white-space:pre-wrap;overflow-wrap:anywhere;background:#f6f8fb;padding:12px 14px;border-radius:6px}.message{margin:16px 0 0}.missing,.empty,.id,.source,.import p{color:#66758a;font-size:13px}.timesheet-heading{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.timesheet-heading p{margin:4px 0 0;color:#52657d}.approval{display:flex;flex:0 0 auto;flex-direction:column;align-items:flex-end;gap:6px;text-align:right}.approval>span{display:block;color:#66758a;font-size:10px;font-weight:700;letter-spacing:.08em;line-height:1.2;text-transform:uppercase}.status{display:block;padding:6px 10px;border:1px solid transparent;border-radius:5px;font-size:12px;font-weight:800;letter-spacing:.03em;line-height:1.2;text-align:center}.status.approved{border-color:#86d9a8;background:#dff7e9;color:#166534}.status.changes{border-color:#f1c56c;background:#fff0cf;color:#92400e}.status.pending{border-color:#cbd5e1;background:#edf2f8;color:#475569}.actions{padding-left:22px}.actions li{padding:5px 0}.source{display:block}.comment{margin:7px 0 0}.id{margin:12px 0 0}.footer{margin-top:28px;padding-top:16px;border-top:1px solid #d7e3ef;color:#66758a;font-size:12px}@media(max-width:650px){.page{margin:0;padding:24px}.summary{grid-template-columns:1fr}.timesheet-heading{display:block}.approval{align-items:flex-start;margin-top:10px;text-align:left}}@media print{body{background:#fff}.page{max-width:none;margin:0;padding:0;box-shadow:none}.email,.timesheet,.import{break-inside:avoid}.summary-box,.notice,.status{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  </style></head><body><main class="page"><p class="eyebrow">MC Labor Sources · Customer verification record</p><h1>One sent email and all included timesheets</h1><p class="subhead">Customer: ${html(customer)} · Exported ${date(exportedAt)}</p><div class="summary"><div class="summary-box"><span>Timesheets in this email</span><strong>${items.length}</strong></div><div class="summary-box"><span>Linked portal actions</span><strong>${linkedCount}</strong></div><div class="summary-box"><span>Historical actions with unknown email link</span><strong>${legacyCount}</strong></div></div><div class="notice">This report groups timesheets by the email in which they were sent. New portal actions identify their source email. Older actions may have no recorded source email and are labeled separately; their association with this email cannot be confirmed.</div><h2>Sent email</h2><article class="email"><h3>${html(batch.subject)}</h3><dl><dt>Sent</dt><dd>${date(batch.sent_at)}</dd><dt>To</dt><dd>${html(batch.recipient_email)}</dd>${batch.sender_email ? `<dt>From</dt><dd>${html(batch.sender_email)}</dd>` : ''}${batch.smtp_message_id ? `<dt>Message ID</dt><dd>${html(batch.smtp_message_id)}</dd>` : ''}</dl>${batch.sent_text ? `<div class="message">${html(batch.sent_text)}</div>` : '<p class="missing">The body of this earlier email was not archived.</p>'}</article><h2>Timesheets and customer actions</h2>${rows || '<p>No timesheets are linked to this email.</p>'}${imports.length ? `<h2>Imported email copies</h2>${imported}` : ''}<p class="footer">Sent email record ID: ${html(batch.id)} · Generated from records available in the app at export time. Imported email copies can be downloaded separately from the app.</p></main></body></html>`;
}
