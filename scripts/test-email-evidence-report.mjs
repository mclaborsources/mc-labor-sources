import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = readFileSync(resolve('apps/admin-web/src/lib/email-evidence-report.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const module = { exports: {} };
new Function('module', 'exports', compiled)(module, module.exports);
const { buildEmailBatchReport } = module.exports;

const report = buildEmailBatchReport({
  customer: 'Test & Customer',
  batch: {
    id: 'email-1',
    recipient_email: 'customer@example.com',
    sender_email: null,
    subject: 'Verify hours',
    sent_at: '2026-09-22T10:00:00Z',
    sent_text: 'Please verify both timesheets.',
    smtp_message_id: null,
  },
  items: [
    { timesheet_id: 'sheet-1', timesheet: { week_end_date: '2026-09-18', total_hours: 8, employee: { first_name: 'Alex', last_name: 'One' } } },
    { timesheet_id: 'sheet-2', timesheet: { week_end_date: '2026-09-18', total_hours: 12, employee: { first_name: 'Blair', last_name: 'Two' } } },
    { timesheet_id: 'sheet-3', timesheet: { week_end_date: '2026-09-18', total_hours: 6, employee: { first_name: 'Casey', last_name: 'Three' } } },
    { timesheet_id: 'sheet-4', timesheet: { week_end_date: '2026-09-18', total_hours: 7, employee: { first_name: 'Drew', last_name: 'Four' } } },
  ],
  decisions: [
    { timesheet_id: 'sheet-1', source_batch_id: 'email-1', recipient_email: 'customer@example.com', decision: 'APPROVED', comment: null, decided_at: '2026-09-22T11:00:00Z' },
    { timesheet_id: 'sheet-2', source_batch_id: 'email-1', recipient_email: 'customer@example.com', decision: 'CHANGES_REQUESTED', comment: 'Check Tuesday', decided_at: '2026-09-22T11:05:00Z' },
    { timesheet_id: 'sheet-3', source_batch_id: null, recipient_email: 'customer@example.com', decision: 'APPROVED', comment: null, decided_at: '2026-09-22T11:10:00Z' },
    { timesheet_id: 'sheet-4', source_batch_id: 'email-reminder', recipient_email: 'customer@example.com', decision: 'APPROVED', comment: 'Reminder response', decided_at: '2026-09-22T11:15:00Z' },
    { timesheet_id: 'sheet-1', source_batch_id: 'email-2', recipient_email: 'customer@example.com', decision: 'CHANGES_REQUESTED', comment: 'Different email', decided_at: '2026-09-23T11:00:00Z' },
  ],
  imports: [],
  sourceBatchIds: ['email-1', 'email-reminder'],
  exportedAt: '2026-09-23T12:00:00Z',
});

for (const expected of ['Alex One', 'Blair Two', 'Casey Three', 'Drew Four', '8 hours', '12 hours', '6 hours', '7 hours', 'Approval status', 'APPROVED', 'CHANGES REQUESTED', 'Action linked to this email chain', 'Historical action; source email was not recorded', 'Reminder response', 'Check Tuesday', 'Test &amp; Customer']) {
  assert.ok(report.includes(expected), `Missing ${expected}`);
}
assert.ok(!report.includes('Different email'), 'A decision from another sent email must not appear');
assert.equal((report.match(/class="timesheet"/g) ?? []).length, 4);
assert.equal((report.match(/<strong class="status approved">APPROVED<\/strong>/g) ?? []).length, 3);
console.log('Email batch report shows approval status independently from email-link provenance.');
