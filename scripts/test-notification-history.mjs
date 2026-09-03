import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const uid = '11111111-1111-4111-8111-111111111111';
const employee = '22222222-2222-4222-8222-222222222222';
const notice = '33333333-3333-4333-8333-333333333333';

function harness(functionName, { push = false, caller = { id: uid, employee_id: employee, role: 'ADMIN' }, notifications = [], authenticated = true, status = 'ACTIVE' } = {}) {
  const tables = {
    users: [{ id: uid, employee_id: employee, role: 'WORKER', status }],
    notifications: [...notifications], company_settings: [{ push_enabled: push }],
    push_device_tokens: [{ user_id: uid, expo_push_token: 'ExponentPushToken[test]' }],
  };
  const pushes = [];
  const adminClient = { from(table) {
    let mode = 'select', payload, single = false;
    const filters = [];
    const query = {
      select() { return query; }, limit() { return query; },
      eq(key, value) { filters.push((row) => row[key] === value); return query; },
      in(key, values) { filters.push((row) => values.includes(row[key])); return query; },
      or(value) { const parts = value.split(',').map((part) => part.split('.eq.')); filters.push((row) => parts.some(([key, value]) => row[key] === value)); return query; },
      insert(value) { mode = 'insert'; payload = Array.isArray(value) ? value : [value]; return query; },
      delete() { mode = 'delete'; return query; },
      single() { single = true; return query; }, maybeSingle() { single = true; return query; },
      then(resolve, reject) {
        try {
          let rows;
          if (mode === 'insert') {
            rows = payload.map((row, i) => ({ id: `saved-${tables[table].length + i}`, read_at: null, ...row }));
            tables[table].push(...rows);
          } else {
            rows = tables[table].filter((row) => filters.every((filter) => filter(row)));
            if (mode === 'delete') tables[table] = tables[table].filter((row) => !rows.includes(row));
          }
          return Promise.resolve({ data: single ? rows[0] ?? null : rows, error: null }).then(resolve, reject);
        } catch (error) { return Promise.reject(error).then(resolve, reject); }
      },
    };
    return query;
  } };
  let handler;
  const messaging = {
    corsHeaders: {},
    jsonResponse: (body, status = 200) => new Response(JSON.stringify(body), { status }),
    getAuthedClient: async () => authenticated ? { adminClient, caller } : { error: new Response('Unauthorized', { status: 401 }) },
  };
  const code = ts.transpileModule(readFileSync(`supabase/functions/${functionName}/index.ts`, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, {
    exports: {}, Deno: { serve(value) { handler = value; } }, Response, Request,
    require(name) { if (name.includes('messaging')) return messaging; if (name.includes('edge-runtime')) return {}; throw new Error(name); },
    fetch: async (_url, options) => { pushes.push(...JSON.parse(options.body)); return new Response(JSON.stringify({ data: [] })); },
  });
  return { tables, pushes, call: (payload) => handler(new Request('https://example.test', { method: 'POST', body: JSON.stringify(payload) })) };
}

test('push-only worker notices are saved even when device push is disabled', async () => {
  const h = harness('send-push-notification');
  const response = await h.call({ userId: uid, title: 'Office update', body: 'Full message' });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).inApp, 1);
  assert.equal(h.tables.notifications[0].message, 'Full message');
  assert.equal(h.tables.notifications[0].read_at, null);
});

test('long content remains complete in history while the device preview is shortened', async () => {
  const h = harness('send-push-notification', { push: true });
  const body = 'Message '.repeat(250);
  assert.equal((await h.call({ userId: uid, title: 'Long notice', body })).status, 200);
  assert.equal(h.tables.notifications[0].message, body.trim());
  assert.ok(h.pushes[0].body.length <= 500);
  assert.equal(h.pushes[0].data.notificationId, h.tables.notifications[0].id);
});

test('linked existing in-app notice is not duplicated', async () => {
  const h = harness('send-push-notification', { notifications: [{ id: notice, user_id: uid, title: 'Update', message: 'Hello' }] });
  await h.call({ userId: uid, title: 'Update', body: 'Hello', data: { notificationId: notice } });
  assert.equal(h.tables.notifications.length, 1);
});

test('unlinked repeated messages remain separate notifications', async () => {
  const h = harness('send-push-notification');
  await h.call({ userId: uid, title: 'Update', body: 'Hello' });
  await h.call({ userId: uid, title: 'Update', body: 'Hello' });
  assert.equal(h.tables.notifications.length, 2);
});

test('whitespace in a linked saved notice does not produce duplicate history', async () => {
  const h = harness('send-push-notification', { notifications: [{ id: notice, user_id: uid, title: 'Update', message: 'Hello\n' }] });
  await h.call({ userId: uid, title: 'Update', body: 'Hello\n', data: { notificationId: notice } });
  assert.equal(h.tables.notifications.length, 1);
});

test('a foreign linked notice cannot substitute for the recipients history', async () => {
  const h = harness('send-push-notification', { notifications: [{ id: notice, user_id: 'other-user', title: 'Update', message: 'Hello' }] });
  await h.call({ userId: uid, title: 'Update', body: 'Hello', data: { notificationId: notice } });
  assert.equal(h.tables.notifications.length, 2);
  assert.equal(h.tables.notifications[1].user_id, uid);
});

test('assignment notice persists once', async () => {
  const h = harness('send-push-notification');
  assert.equal((await h.call({ employeeIds: [employee], title: 'Assignments', body: 'Updated', data: { type: 'ASSIGNMENT_NOTICE' } })).status, 200);
  assert.equal(h.tables.notifications.length, 1);
});

test('employee can delete their own notification', async () => {
  const h = harness('delete-notification', { notifications: [{ id: notice, user_id: uid }] });
  assert.equal((await h.call({ id: notice })).status, 200);
  assert.equal(h.tables.notifications.length, 0);
});

test('employee-targeted notifications without a user ID can be deleted by that employee', async () => {
  const h = harness('delete-notification', { notifications: [{ id: notice, employee_id: employee }] });
  assert.equal((await h.call({ id: notice })).status, 200);
});

test('another employee notification cannot be deleted', async () => {
  const h = harness('delete-notification', { notifications: [{ id: notice, user_id: 'another-user', employee_id: 'another-employee' }] });
  assert.equal((await h.call({ id: notice })).status, 404);
  assert.equal(h.tables.notifications.length, 1);
});

test('unauthenticated and inactive callers cannot delete history', async () => {
  assert.equal((await harness('delete-notification', { authenticated: false }).call({ id: notice })).status, 401);
  assert.equal((await harness('delete-notification', { status: 'INACTIVE' }).call({ id: notice })).status, 403);
});

test('empty messages are rejected without adding history', async () => {
  const h = harness('send-push-notification');
  assert.equal((await h.call({ userId: uid, title: ' ', body: ' ' })).status, 400);
  assert.equal(h.tables.notifications.length, 0);
});

test('a worker cannot send arbitrary system notifications', async () => {
  const h = harness('send-push-notification', { caller: { id: uid, role: 'WORKER', employee_id: employee } });
  assert.equal((await h.call({ userId: uid, title: 'Update', body: 'Hello' })).status, 403);
  assert.equal(h.tables.notifications.length, 0);
});
