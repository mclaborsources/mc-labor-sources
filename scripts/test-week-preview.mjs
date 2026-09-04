// Install isolated test runtime: npm install --prefix .tmp/preview-sql-tests --no-save --package-lock=false @electric-sql/pglite@0.5.8
import { PGlite } from '../.tmp/preview-sql-tests/node_modules/@electric-sql/pglite/dist/index.js';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { officeWeekStart, permittedSelectedWeek } from '../apps/mobile/src/lib/workweek-preview.ts';

test('office rollover ignores device timezone, including daylight/standard time', () => {
  assert.equal(officeWeekStart(new Date('2026-09-05T03:59:59Z')), '2026-08-29');
  assert.equal(officeWeekStart(new Date('2026-09-05T04:00:00Z')), '2026-09-05');
  assert.equal(officeWeekStart(new Date('2026-11-07T04:59:59Z')), '2026-10-31');
  assert.equal(officeWeekStart(new Date('2026-11-07T05:00:00Z')), '2026-11-07');
});
test('expired or revoked views return to current week', () => {
  assert.equal(permittedSelectedWeek('2026-09-05', '2026-08-29', true, false), '2026-08-29');
  assert.equal(permittedSelectedWeek('2026-09-05', '2026-09-05', false, false), '2026-09-05');
  assert.equal(permittedSelectedWeek('2026-09-12', '2026-09-05', false, true), '2026-09-12');
  assert.equal(permittedSelectedWeek('2026-09-19', '2026-09-05', true, true), '2026-09-05');
  assert.equal(permittedSelectedWeek('2026-08-29', '2026-09-05', true, true, '2026-08-29'), '2026-09-05');
});

test('migration, eligibility, ownership, future RLS, and rollover in isolated Postgres', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
      create table public.users(id uuid primary key, auth_user_id uuid, employee_id uuid, role text, status text);
      create table public.employees(id uuid primary key, status text, mobile_assignments_enabled boolean, updated_at timestamptz);
      create table public.job_assignments(id uuid primary key, employee_id uuid, customer_id uuid, job_site_id uuid, assigned_date date, end_date date);
      create table public.job_orders(id uuid primary key, employee_id uuid, assignment_id uuid, start_date date);
      create function public.get_my_role() returns text language sql stable security definer as $$ select role from public.users where auth_user_id=auth.uid() $$;
      create function public.get_my_employee_id() returns uuid language sql stable security definer as $$ select employee_id from public.users where auth_user_id=auth.uid() $$;
      grant usage on schema public,auth to authenticated;
      grant select on all tables in schema public to authenticated;
      grant update on public.employees to authenticated;
      alter table job_assignments enable row level security;
      alter table job_orders enable row level security;
      create policy baseline on job_assignments for select to authenticated using (employee_id=public.get_my_employee_id() or public.get_my_role()='ADMIN');
      create policy baseline on job_orders for select to authenticated using (employee_id=public.get_my_employee_id() or public.get_my_role()='ADMIN');
    `);
    await db.exec(readFileSync(new URL('../supabase/migrations/20260904152251_highlighted_employee_week_preview.sql', import.meta.url), 'utf8'));
    await db.exec(readFileSync(new URL('../supabase/migrations/20260904194054_employee_next_week_manual_override.sql', import.meta.url), 'utf8'));
    const boundary = await db.query(`select private.preview_week_start('2026-09-05 03:59:59+00')::text before, private.preview_week_start('2026-09-05 04:00:00+00')::text after`);
    assert.deepEqual(boundary.rows[0], { before: '2026-08-29', after: '2026-09-05' });
    const employee = '00000000-0000-0000-0000-000000000001';
    const auth = '00000000-0000-0000-0000-000000000011';
    const customer = '00000000-0000-0000-0000-000000000021';
    const site = '00000000-0000-0000-0000-000000000031';
    await db.exec(`insert into employees(id,status,mobile_assignments_enabled) values ('${employee}','ACTIVE',true);
      insert into users values ('${auth}','${auth}','${employee}','WORKER','ACTIVE');
      select set_config('request.jwt.claim.sub','${auth}',false);
      insert into job_assignments values
      ('00000000-0000-0000-0000-000000000041','${employee}','${customer}','${site}','2026-08-29','2026-09-04'),
      ('00000000-0000-0000-0000-000000000042','${employee}','${customer}','${site}','2026-09-05','2026-09-11'),
      ('00000000-0000-0000-0000-000000000043','${employee}','${customer}','${site}','2026-09-12','2026-09-18');
      insert into job_orders select id,employee_id,id,assigned_date from job_assignments;
    `);
    const highlighted = async week => (await db.query(`select private.highlighted_for_week('${employee}','${week}') as allowed`)).rows[0].allowed;
    assert.equal(await highlighted('2026-08-29'), true, 'no prior assignment is highlighted');
    assert.equal(await highlighted('2026-09-05'), false, 'same job/customer is not highlighted');
    await db.exec(`update job_assignments set customer_id='00000000-0000-0000-0000-000000000022' where assigned_date='2026-09-05'`);
    assert.equal(await highlighted('2026-09-05'), true, 'customer change is highlighted');
    await db.exec(`update job_assignments set customer_id='${customer}' where assigned_date='2026-09-05'`);
    // Freeze only the test database's clock helper. Production always uses now().
    const freeze = async week => db.exec(`reset role; create or replace function private.preview_week_start(p_at timestamptz) returns date language sql immutable set search_path='' as $$ select date '${week}' $$; set role authenticated;`);
    await freeze('2026-08-29');
    assert.equal((await db.query('select * from job_assignments')).rows.length, 2, 'only current and next, never week+2');
    assert.equal((await db.query('select * from job_orders')).rows.length, 2, 'job order cannot bypass future gate');
    assert.equal((await db.query('select get_employee_week_preview() as access')).rows[0].access.nextWeekEnabled, true);
    await assert.rejects(db.query("select get_employee_week_preview('00000000-0000-0000-0000-000000000099')"), /Not authorized/);
    await db.exec(`reset role; update users set role='ADMIN'; set role authenticated; select set_employee_next_week_override('${employee}',false);`);
    assert.equal((await db.query('select get_employee_week_preview() as access')).rows[0].access.nextWeekEnabled, false, 'manual disable overrides automatic access');
    await db.query(`select set_employee_next_week_override('${employee}',true)`);
    assert.equal((await db.query('select get_employee_week_preview() as access')).rows[0].access.nextWeekEnabled, true, 'manual enable grants access');
    await db.exec(`reset role; update users set role='WORKER'; set role authenticated;`);
    await freeze('2026-09-05');
    assert.equal((await db.query('select get_employee_week_preview() as access')).rows[0].access.nextWeekEnabled, false, 'old grant is not carried forward');
    assert.equal((await db.query("select * from job_assignments where assigned_date='2026-09-05'")).rows.length, 1, 'previewed week remains current');
    assert.equal((await db.query("select * from job_assignments where assigned_date='2026-09-12'")).rows.length, 0, 'new next week is denied');
    await db.exec(`reset role; update job_assignments set job_site_id='00000000-0000-0000-0000-000000000032' where assigned_date='2026-09-05'; set role authenticated;`);
    assert.equal((await db.query('select get_employee_week_preview() as access')).rows[0].access.nextWeekEnabled, true, 'new week highlight grants fresh preview');
    await db.exec(`reset role; update employees set mobile_assignments_enabled=false; set role authenticated;`);
    assert.equal((await db.query('select get_employee_week_preview() as access')).rows[0].access.nextWeekEnabled, false, 'disabled assignments cannot gain preview');
    await db.exec(`reset role; update users set status='DISABLED'; set role authenticated;`);
    await assert.rejects(db.query('select get_employee_week_preview()'), /Active account required/);
  } finally { await db.close(); }
});
