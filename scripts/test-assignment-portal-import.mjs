import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../apps/admin-web/src/lib/supabase/data.ts', import.meta.url), 'utf8');
const method = source.slice(source.indexOf('  async provisionAssignmentImportPortals('), source.indexOf('  async importCustomersBatch('));
function setup(fail = false) {
  const calls = [];
  const data = { async provisionImportPortalRows(rows) { calls.push(...rows.map(row => row.data.id)); } };
  const code = ts.transpile(`({${method}})`, { target: ts.ScriptTarget.ES2022 });
  const helper = vm.runInNewContext(code, { data, sb: () => ({ from: () => ({ select: () => ({ in: async (_, ids) => ({ data: ids.map(id => ({ id: `uuid-${id}`, master_employee_id: id })), error: fail ? new Error('Lookup failed') : null }) }) }) }), throwIf: error => { if (error) throw error; } });
  return { helper, calls };
}
const batch = () => ({ dryRun: false, results: [{ row: 1, status: 'ready', action: 'create', message: 'Created', data: { id: 'assignment-1' } }, { row: 2, status: 'ready', action: 'skip', message: 'Already assigned' }, { row: 3, status: 'error', action: 'error', message: 'Invalid' }] });
const rows = [{ master_employee_id: 'old-employee' }, { master_employee_id: 'existing-assignment' }, { master_employee_id: 'invalid' }];
test('assignment imports provision existing employees and unchanged assignments, not failed rows', async () => {
  const { helper, calls } = setup(); const result = batch();
  await helper.provisionAssignmentImportPortals(result, rows);
  assert.deepEqual(calls, ['uuid-old-employee', 'uuid-existing-assignment']);
  assert.equal(result.results[0].data.id, 'assignment-1');
});
test('previews never provision accounts', async () => {
  const { helper, calls } = setup();
  await helper.provisionAssignmentImportPortals({ ...batch(), dryRun: true }, rows);
  assert.equal(calls.length, 0);
});
test('lookup failures keep successful imports and report portal warnings', async () => {
  const { helper, calls } = setup(true); const result = batch();
  await helper.provisionAssignmentImportPortals(result, rows);
  assert.equal(calls.length, 0);
  assert.equal(result.results[0].status, 'warning');
  assert.match(result.results[0].message, /Portal access needs attention/);
});
test('both assignment import entry points invoke portal provisioning', () => {
  for (const [start, end] of [['  async importAssignmentsBatch(', '  async getWorkerPortalAccounts('], ['  async importWeeklyAssignmentsBatch(', '  async syncImportedJobOrders(']]) {
    assert.match(source.slice(source.indexOf(start), source.indexOf(end)), /return data\.provisionAssignmentImportPortals/);
  }
});

test('workbook commit retains assignment warnings for display', () => {
  const workflow = readFileSync(new URL('../apps/admin-web/src/components/import/WorkbookImportWorkflow.tsx', import.meta.url), 'utf8');
  const commit = workflow.slice(workflow.indexOf('  const handleCommit = async'));
  assert.match(commit, /const assignmentResult = await api\.importWeeklyAssignmentsBatch/);
  assert.match(commit, /section\.key === 'assignments'[\s\S]*?result: assignmentResult/);
});

test('manual employee creation invokes the same portal provisioning flow', () => {
  const employeePage = readFileSync(new URL('../apps/admin-web/src/app/employees/page.tsx', import.meta.url), 'utf8');
  const createStart = employeePage.indexOf('const employee = await api.createEmployee(payload)');
  const provisionStart = employeePage.indexOf('await api.provisionImportPortalRows([portalResult])');
  assert.ok(createStart >= 0, 'manual employee should be saved');
  assert.ok(provisionStart > createStart, 'portal access should be provisioned after the employee is saved');
  assert.match(employeePage, /Employee and portal access created/);
});
