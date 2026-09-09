const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('../node_modules/typescript');
const React = require('../apps/admin-web/node_modules/react');
const jsx = require('../apps/admin-web/node_modules/react/jsx-runtime');

// Exercise the component's real handlers with an in-memory hook state and no API calls.
function harness() {
  let cursor = 0;
  const state = [];
  const calls = [];
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = initial;
      return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
    },
    useMemo: fn => fn(),
    useEffect() {},
  };
  const source = fs.readFileSync('apps/admin-web/src/components/portal/TimesheetDetailModal.tsx', 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    require(name) {
      if (name === 'react') return hooks;
      if (name === 'react/jsx-runtime') return jsx;
      if (name.endsWith('/Button')) return { Button: props => React.createElement('button', props) };
      if (name.endsWith('/Modal')) return { Modal: props => props.open ? props.children : null, ModalFooter: props => props.children };
      if (name.endsWith('/PassCodeDialog')) return { PassCodeDialog: () => null };
      if (name.endsWith('/portal-stats')) return { formatEmployeeName: employee => employee.firstName };
      if (name.endsWith('/GpsLocationCell')) return { GpsLocationCell: () => null };
      throw new Error(name);
    },
    Intl, Date, console,
  });
  const first = { id: 'first', employeeId: 'ee1', customerId: 'cu1', employee: { firstName: 'Siobhan' }, status: 'SUBMITTED', weekStartDate: '2026-08-29', weekEndDate: '2026-09-04', totalHours: 12, officeNotes: 'Existing note', entries: [{ workDate: '2026-09-03', hours: 12 }] };
  const second = { ...first, id: 'second', employeeId: 'ee2', employee: { firstName: 'Mark' } };
  const props = {
    open: true, onClose() {}, timesheet: first, relatedTimesheets: [first, second], startBlank: true, selectOnOpen: true,
    onSaveEdits: async value => calls.push(['save', JSON.parse(JSON.stringify(value))]),
    onSelectTimesheet: async id => calls.push(['select', id]),
    onPreviewRelatedPdf: async id => calls.push(['pdf', id]),
    onApproveRelated: async id => calls.push(['approve', id]),
    onRefresh: async () => {}, onSendAllToCustomer: async () => {},
  };
  function flatten(node) {
    if (node == null || typeof node === 'boolean') return [];
    if (Array.isArray(node)) return node.flatMap(flatten);
    if (typeof node !== 'object') return [node];
    if (typeof node.type === 'function') return flatten(node.type(node.props));
    return [node, ...flatten(node.props?.children)];
  }
  function render() { cursor = 0; return flatten(exports.TimesheetDetailModal(props)); }
  function label(node) { return flatten(node.props.children).filter(item => typeof item === 'string').join(''); }
  function button(text, index = 0) { return render().filter(node => node.type === 'button' && label(node) === text)[index]; }
  return { calls, render, button };
}

test('hours save only changed dates and preserve office notes', async () => {
  const ui = harness();
  ui.button('Edit Hours').props.onClick();
  const input = ui.render().find(node => node.props?.['aria-label'] === 'Hours for 2026-09-03');
  input.props.onChange({ target: { value: '10' } });
  await ui.button('Save').props.onClick();
  assert.deepEqual(ui.calls[0], ['save', { dailyHours: { '2026-09-03': 10 }, officeNotes: 'Existing note' }]);
});

test('note save never submits hour changes', async () => {
  const ui = harness();
  ui.button('Edit Note').props.onClick();
  ui.render().find(node => node.type === 'textarea').props.onChange({ target: { value: 'New note' } });
  await ui.button('Save', 1).props.onClick();
  assert.deepEqual(ui.calls[0], ['save', { dailyHours: {}, officeNotes: 'New note' }]);
});

test('roster actions target the clicked employee rather than the open employee', async () => {
  const ui = harness();
  await ui.button('View PDF', 1).props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  await ui.button('Approve to send', 1).props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  await ui.button('Details', 1).props.onClick();
  assert.deepEqual(ui.calls, [['pdf', 'second'], ['approve', 'second'], ['select', 'second']]);
});

test('editing blocks row actions and invalid hours are not saved', async () => {
  const ui = harness();
  ui.button('Edit Hours').props.onClick();
  assert.equal(ui.button('View PDF', 1).props.disabled, true);
  assert.equal(ui.button('Approve to send', 1).props.disabled, true);
  ui.render().find(node => node.props?.['aria-label'] === 'Hours for 2026-09-03').props.onChange({ target: { value: '25' } });
  await ui.button('Save').props.onClick();
  assert.equal(ui.calls.length, 0);
  assert.ok(ui.render().includes('Hours must be a number between 0 and 24.'));
});
