import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../apps/admin-web/src/lib/employee-action-status.ts', import.meta.url), 'utf8');
const exports = {};
vm.runInNewContext(ts.transpile(source, { module: ts.ModuleKind.CommonJS }), { exports });
const flags = (employee = {}, account = { status: 'ACTIVE' }, known = true, next = true) =>
  exports.employeeActionFlags({ status: 'ACTIVE', mobilePreviousWeekEnabled: true, manualTimesheetEnabled: true, ...employee }, account, known, next);

test('all four indicators reflect enabled permissions independently', () => {
  assert.equal(flags().map(f => f.code).join(' '), 'PA PW NW MT');
  assert.ok(flags().every(f => f.enabled));
  assert.equal(flags({ mobilePreviousWeekEnabled: false })[1].enabled, false);
  assert.equal(flags({ manualTimesheetEnabled: false })[3].enabled, false);
  assert.equal(flags({}, { status: 'ACTIVE' }, true, false)[2].enabled, false);
});
test('portal requires an active employee and active account', () => {
  assert.equal(flags({ status: 'INACTIVE' })[0].enabled, false);
  assert.equal(flags({}, { status: 'INACTIVE' })[0].enabled, false);
  assert.equal(exports.employeeActionFlags({ status: 'ACTIVE' }, undefined, true, false)[0].enabled, false);
});
test('unknown access never appears enabled', () => {
  const values = exports.employeeActionFlags({ status: 'ACTIVE' }, undefined, false, undefined);
  assert.equal(values[0].enabled, undefined);
  assert.equal(values[2].enabled, undefined);
});
test('soft palette preserves existing database color values', () => {
  assert.equal(exports.EMPLOYEE_ACTION_COLORS.map(c => c.value).sort().join(','), 'BLUE,GREEN,ORANGE,RED');
  assert.equal(exports.EMPLOYEE_ACTION_COLORS.find(c => c.value === 'RED').label, 'Gold');
});
