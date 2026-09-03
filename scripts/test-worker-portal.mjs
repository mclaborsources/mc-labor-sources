import assert from 'node:assert/strict';
import { test } from 'node:test';
import { provisionWorkerPortal, workerLoginPrefix, workerInitialPassword } from '../supabase/functions/_shared/worker-portal.ts';
import { workerCredentialEmail } from '../supabase/functions/_shared/worker-credentials.ts';

const secret = 'test-only-worker-credential-key-not-for-production';

const employee = { id: 'employee-1', first_name: 'Marcus', last_name: 'Johnson', phone: '(617) 555-0123', status: 'ACTIVE' };

function mockAdmin({ existing = false, collisions = 0, settingsError = null, profileError = null } = {}) {
  const emails = new Set();
  const calls = { auth: [], profiles: [], settings: [], deletedAuth: [], deletedProfiles: [] };
  return {
    calls,
    auth: { admin: {
      async createUser(values) {
        calls.auth.push(values);
        if (calls.auth.length <= collisions || emails.has(values.email)) return { data: {}, error: { code: 'email_exists' } };
        emails.add(values.email);
        return { data: { user: { id: `auth-${calls.auth.length}` } }, error: null };
      },
      async deleteUser(id) { calls.deletedAuth.push(id); return { error: null }; },
    } },
    from(table) {
      return {
        select() { return { eq() { return { eq() { return { async limit() { return { data: existing ? [{ id: 'profile-1' }] : [], error: null }; } }; } }; } }; },
        async insert(values) { calls.profiles.push(values); return { error: profileError }; },
        update(values) { return { async eq() { calls.settings.push(values); return { error: settingsError }; } }; },
        delete() { return { async eq(field, value) { calls.deletedProfiles.push({ table, field, value }); return { error: null }; } }; },
      };
    },
  };
}

test('username prefix and phone normalization', () => {
  assert.equal(workerLoginPrefix('Marcus'), 'mar');
  assert.equal(workerLoginPrefix('Éamon'), 'eam');
  assert.equal(workerLoginPrefix('Li'), 'li');
  assert.equal(workerInitialPassword('(617) 555-0123'), '6175550123');
  assert.throws(() => workerInitialPassword(null), /valid cell/);
  assert.throws(() => workerInitialPassword('123'), /valid cell/);
});

test('creates a worker with the requested default tabs', async () => {
  const admin = mockAdmin();
  const result = await provisionWorkerPortal(admin, employee, secret);
  assert.equal(result.username, 'mar');
  assert.equal(admin.calls.auth[0].email, await workerCredentialEmail('mar', '6175550123', secret));
  assert.equal(admin.calls.auth[0].password, '6175550123');
  assert.deepEqual(admin.calls.auth[0].app_metadata, { role: 'WORKER' });
  assert.equal(admin.calls.settings[0].mobile_assignments_enabled, true);
  assert.equal(admin.calls.settings[0].mobile_messages_enabled, true);
  assert.equal(admin.calls.settings[0].mobile_tasks_enabled, false);
  assert.equal(admin.calls.settings[0].mobile_profile_enabled, false);
  assert.equal(admin.calls.settings[0].manual_timesheet_enabled, false);
});

test('duplicate credential pair is blocked without adding a suffix or replacing access', async () => {
  const admin = mockAdmin({ collisions: 1 });
  await assert.rejects(provisionWorkerPortal(admin, employee, secret), /combination is already assigned/);
  assert.equal(admin.calls.auth.length, 1);
  assert.equal(admin.calls.profiles.length, 0);
  assert.equal(admin.calls.deletedAuth.length, 0);
});

test('existing access is preserved without password or settings updates', async () => {
  const admin = mockAdmin({ existing: true });
  assert.equal((await provisionWorkerPortal(admin, employee, secret)).status, 'existing');
  assert.equal(admin.calls.auth.length, 0);
  assert.equal(admin.calls.settings.length, 0);
});

test('invalid cell numbers and inactive employees do not create accounts', async () => {
  const admin = mockAdmin();
  await assert.rejects(provisionWorkerPortal(admin, { ...employee, phone: null }, secret), /valid cell/);
  await assert.rejects(provisionWorkerPortal(admin, { ...employee, status: 'INACTIVE' }, secret), /Inactive/);
  assert.equal(admin.calls.auth.length, 0);
});

test('profile failure removes the just-created auth account', async () => {
  const admin = mockAdmin({ profileError: new Error('profile failed') });
  await assert.rejects(provisionWorkerPortal(admin, employee, secret), /profile failed/);
  assert.deepEqual(admin.calls.deletedAuth, ['auth-1']);
});

test('settings failure rolls back the just-created portal account', async () => {
  const admin = mockAdmin({ settingsError: new Error('settings failed') });
  await assert.rejects(provisionWorkerPortal(admin, employee, secret), /settings failed/);
  assert.equal(admin.calls.deletedProfiles.length, 1);
  assert.deepEqual(admin.calls.deletedAuth, ['auth-1']);
});

test('same username with different passwords and different usernames with same password are distinct', async () => {
  const first = await workerCredentialEmail('mar', '6175550123', secret);
  assert.notEqual(first, await workerCredentialEmail('mar', '5085550199', secret));
  assert.notEqual(first, await workerCredentialEmail('bob', '6175550123', secret));
  assert.equal(first, await workerCredentialEmail(' MAR ', '6175550123', secret));
  assert.ok(!first.includes('6175550123'));
  assert.ok(first.split('@')[0].length <= 64);
});

test('missing secret fails closed before creating an account', async () => {
  const admin = mockAdmin();
  await assert.rejects(provisionWorkerPortal(admin, employee, ''), /not configured/);
  assert.equal(admin.calls.auth.length, 0);
});

test('three allowed combinations create distinct employee accounts; exact duplicate is rejected', async () => {
  const admin = mockAdmin();
  const first = await provisionWorkerPortal(admin, employee, secret);
  const second = await provisionWorkerPortal(admin, { ...employee, id: 'employee-2', first_name: 'Mark', phone: '5085550199' }, secret);
  const third = await provisionWorkerPortal(admin, { ...employee, id: 'employee-3', first_name: 'Bob' }, secret);
  assert.deepEqual([first.username, second.username, third.username], ['mar', 'mar', 'bob']);
  assert.equal(new Set(admin.calls.profiles.map((profile) => profile.auth_user_id)).size, 3);
  await assert.rejects(provisionWorkerPortal(admin, { ...employee, id: 'employee-4' }, secret), /combination is already assigned/);
  assert.equal(admin.calls.profiles.length, 3);
});

test('simultaneous imports of an identical pair only create one account', async () => {
  const admin = mockAdmin();
  const outcomes = await Promise.allSettled([
    provisionWorkerPortal(admin, employee, secret),
    provisionWorkerPortal(admin, { ...employee, id: 'employee-2' }, secret),
  ]);
  assert.equal(outcomes.filter((outcome) => outcome.status === 'fulfilled').length, 1);
  assert.equal(admin.calls.profiles.length, 1);
});
