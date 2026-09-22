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
  ],
  decisions: [
    { timesheet_id: 'sheet-1', source_batch_id: 'email-1', recipient_email: 'customer@example.com', decision: 'APPROVED', comment: null, decided_at: '2026-09-22T11:00:00Z' },
    { timesheet_id: 'sheet-2', source_batch_id: 'email-1', recipient_email: 'customer@example.com', decision: 'CHANGES_REQUESTED', comment: 'Check Tuesday', decided_at: '2026-09-22T11:05:00Z' },
    { timesheet_id: 'sheet-1', source_batch_id: 'email-2', recipient_email: 'customer@example.com', decision: 'CHANGES_REQUESTED', comment: 'Different email', decided_at: '2026-09-23T11:00:00Z' },
  ],
  imports: [],
  exportedAt: '2026-09-23T12:00:00Z',
});

for (const expected of ['Alex One', 'Blair Two', '8 hours', '12 hours', 'Approved from this email', 'Changes requested from this email', 'Check Tuesday', 'Test &amp; Customer']) {
  assert.ok(report.includes(expected), `Missing ${expected}`);
}
assert.ok(!report.includes('Different email'), 'A decision from another sent email must not appear');
assert.equal((report.match(/class="timesheet"/g) ?? []).length, 2);
console.log('Email batch report includes both timesheets and only the linked decisions.');
