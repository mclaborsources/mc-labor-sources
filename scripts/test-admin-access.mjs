import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import ts from 'typescript';

const source = ts.transpileModule(readFileSync(new URL('../supabase/functions/manage-admin-access/index.ts', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, ''), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
const helperSource = readFileSync(new URL('../supabase/functions/_shared/admin-login.ts', import.meta.url), 'utf8');
const helper = vm.runInNewContext(ts.transpileModule(helperSource.replace('export ', '') + '\nadminLoginEmail;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, { crypto, TextEncoder });

async function invoke(body, options = {}) {
  let handler;
  const writes = [];
  const admin = {
    from: () => ({
      select: () => ({
        eq: () => ({ in: (_column, roles) => ({ limit: async () => ({ data: options.duplicate && roles.includes(options.existingRole || 'ADMIN') ? [{ id: 'existing' }] : [] }) }), single: async () => ({ data: { role: options.role || 'ADMIN', status: options.status || 'ACTIVE' } }), maybeSingle: async () => ({ data: options.detached ? null : { id: 'profile', role: options.targetRole || 'ADMIN' } }) }),
        ilike: () => ({ limit: async () => ({ data: options.duplicate ? [{ id: 'existing' }] : [] }) }),
      }),
      insert: async values => { writes.push(values); return { error: options.profileError ? {} : null }; },
      update: values => ({ eq: () => ({ eq: async () => { writes.push(values); return { error: options.disconnectError ? {} : null }; } }) }),
    }),
    auth: { admin: {
      createUser: async values => { writes.push(values); return options.authDuplicate ? { error: { message: 'Email already registered' } } : { data: { user: { id: 'new' } } }; },
      deleteUser: async id => { writes.push({ deleted: id }); return { error: options.deleteError ? {} : null }; },
      getUserById: async id => ({ data: { user: { id, app_metadata: { role: 'ADMIN', created_via: options.unmanaged ? 'other' : 'admin-access' } } } }),
      listUsers: async () => ({ data: { users: [{ id: 'managed', email: 'admin@example.com', app_metadata: { created_via: 'admin-access' } }, { id: 'unmanaged', app_metadata: {} }] } }),
    } },
  };
  vm.runInNewContext(source, {
    Response, adminLoginEmail: helper, Deno: { env: { get: () => 'test' }, serve: fn => { handler = fn; } },
    createClient: (_url, _key, config) => config.global ? { auth: { getUser: async () => ({ data: { user: options.invalidSession ? null : { id: 'caller' } } }) } } : admin,
  });
  const response = await handler(new Request('https://test.local', { method: 'POST', headers: options.noAuth ? {} : { Authorization: 'Bearer test' }, body: JSON.stringify(body) }));
  return { status: response.status, body: await response.json(), writes };
}

const valid = { action: 'create', passCode: '3360', name: 'Office Admin', email: 'office@example.com', password: 'Test-password-123' };
test('only active authenticated admins with the passcode can create accounts', async () => {
  for (const options of [{ noAuth: true }, { invalidSession: true }, { role: 'WORKER' }, { status: 'INACTIVE' }]) {
    const result = await invoke(valid, options);
    assert.ok([401, 403].includes(result.status)); assert.equal(result.writes.length, 0);
  }
  const wrongCode = await invoke({ ...valid, passCode: 'wrong' });
  assert.equal(wrongCode.status, 403); assert.equal(wrongCode.writes.length, 0);
});

test('listing includes only managed accounts; removal protects caller and other accounts', async () => {
  const listed = await invoke({ action: 'list', passCode: '3360' });
  assert.equal(listed.body.accounts.length, 1);
  assert.equal(listed.body.accounts[0].id, 'managed');
  for (const [accountId, options] of [['caller', {}], ['target', { unmanaged: true }], ['target', { targetRole: 'SUPER_ADMIN' }]]) {
    const result = await invoke({ action: 'remove', passCode: '3360', accountId }, options);
    assert.ok([400, 403].includes(result.status)); assert.equal(result.writes.length, 0);
  }
});

test('removal revokes profile access before deleting login, and supports retry', async () => {
  const body = { action: 'remove', passCode: '3360', accountId: 'target' };
  const removed = await invoke(body);
  assert.equal(removed.status, 200);
  assert.equal(removed.writes[0].auth_user_id, null);
  assert.equal(removed.writes[0].status, 'INACTIVE');
  assert.equal(removed.writes[0].email, 'deleted+profile@invalid.mclabor.local');
  assert.equal(removed.writes[1].deleted, 'target');
  const failed = await invoke(body, { disconnectError: true });
  assert.equal(failed.status, 500); assert.equal(failed.writes.length, 1);
  const deleteFailed = await invoke(body, { deleteError: true });
  assert.equal(deleteFailed.status, 500);
  const retry = await invoke(body, { detached: true });
  assert.equal(retry.status, 200); assert.equal(retry.writes[0].deleted, 'target');
  const wrongCode = await invoke({ ...body, passCode: 'bad' });
  assert.equal(wrongCode.status, 403); assert.equal(wrongCode.writes.length, 0);
});
test('unlock does not create accounts and existing emails are not modified', async () => {
  const unlocked = await invoke({ action: 'unlock', passCode: '3360' });
  assert.equal(unlocked.status, 200); assert.equal(unlocked.writes.length, 0);
  const duplicate = await invoke(valid, { duplicate: true });
  assert.equal(duplicate.status, 409); assert.equal(duplicate.writes.length, 0);
  const authDuplicate = await invoke(valid, { authDuplicate: true });
  assert.equal(authDuplicate.status, 400); assert.equal(authDuplicate.writes.length, 1);
});
test('creates ADMIN only, validates input, and rolls back failed profile creation', async () => {
  const invalid = await invoke({ ...valid, password: 'short' });
  assert.equal(invalid.status, 400); assert.equal(invalid.writes.length, 0);
  const created = await invoke({ ...valid, role: 'SUPER_ADMIN' });
  assert.equal(created.status, 200); assert.equal(created.writes[0].app_metadata.role, 'ADMIN');
  assert.equal(created.writes[1].role, 'ADMIN'); assert.equal(created.body.password, undefined);
  const failed = await invoke(valid, { profileError: true });
  assert.equal(failed.status, 500); assert.equal(failed.writes[2].deleted, 'new');
});

test('employee email can create a separate admin without modifying the employee', async () => {
  const created = await invoke(valid, { duplicate: true, existingRole: 'WORKER' });
  assert.equal(created.status, 200);
  assert.equal(created.writes.length, 2);
  assert.equal(created.writes[0].email, await helper(valid.email));
  assert.notEqual(created.writes[0].email, valid.email);
  assert.equal(created.writes[0].app_metadata.contact_email, valid.email);
  assert.equal(created.writes[1].email, created.writes[0].email);
  assert.equal(created.body.email, valid.email);
});

test('browser and backend derive identical normalized admin login identifiers', async () => {
  const browserSource = readFileSync(new URL('../apps/admin-web/src/lib/admin-login.ts', import.meta.url), 'utf8');
  const browserHelper = vm.runInNewContext(ts.transpileModule(browserSource.replace('export ', '') + '\nadminLoginEmail;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, { crypto, TextEncoder });
  assert.equal(await browserHelper('  OFFICE@Example.com '), await helper('office@example.com'));
  assert.notEqual(await helper('other@example.com'), await helper('office@example.com'));
});

test('web login selects the separate admin identity and only falls back on invalid credentials', async () => {
  const authSource = ts.transpileModule(readFileSync(new URL('../apps/admin-web/src/lib/auth.ts', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/export /g, '') + '\nlogin;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  for (const code of [null, 'invalid_credentials', 'over_request_rate_limit']) {
    const calls = [];
    const login = vm.runInNewContext(authSource, { adminLoginEmail: helper, api: { getMe: async () => ({ role: 'ADMIN' }) }, createClient: () => ({ auth: { signInWithPassword: async credentials => {
      calls.push(credentials);
      return calls.length === 1 && code ? { data: {}, error: { code, message: code } } : { data: { session: { access_token: 'token' } }, error: null };
    } } }) });
    if (code === 'over_request_rate_limit') await assert.rejects(login(valid.email, valid.password), /over_request_rate_limit/);
    else assert.equal((await login(valid.email, valid.password)).role, 'ADMIN');
    assert.equal(calls[0].email, await helper(valid.email));
    assert.equal(calls.length, code === 'invalid_credentials' ? 2 : 1);
    if (calls.length === 2) assert.equal(calls[1].email, valid.email);
  }
});
