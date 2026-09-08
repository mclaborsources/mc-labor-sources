// Uses the same isolated PostgreSQL runtime as test-week-preview.mjs.
import { PGlite } from '../.tmp/preview-sql-tests/node_modules/@electric-sql/pglite/dist/index.js';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';

test('full reset clears deliveries first and preserves confirmation/admin/demo safeguards', async () => {
  const db = new PGlite();
  const migration = name => readFileSync(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), 'utf8');
  try {
    await db.exec(`
      create role authenticated;
      create function public.is_admin() returns boolean language sql as $$
        select coalesce(current_setting('test.is_admin', true), 'false') = 'true'
      $$;
      create table customers(id uuid primary key);
      create table employees(id uuid primary key);
      create table users(id uuid primary key, role text);
      create table timesheets(id uuid primary key);
      create table notifications(employee_id uuid);
    `);
    for (const table of ['attendance_logs', 'job_orders', 'job_assignments', 'supervisor_job_sites',
      'safety_bulletin_recipients', 'safety_bulletins', 'job_sites', 'data_import_runs', 'email_delivery_log']) {
      await db.exec(`create table ${table}(id int); insert into ${table} values (1)`);
    }
    await db.exec(migration('20260725000004_timesheet_customer_delivery_audit'));
    await db.exec(`
      insert into customers values ('a0000002-0000-0000-0000-000000000001'), ('b0000002-0000-0000-0000-000000000001');
      insert into employees values ('a0000003-0000-0000-0000-000000000001'), ('b0000003-0000-0000-0000-000000000001');
      insert into users values ('a0000004-0000-0000-0000-000000000001', 'WORKER'), ('b0000004-0000-0000-0000-000000000001', 'CUSTOMER');
      insert into timesheets values ('b0000005-0000-0000-0000-000000000001');
      insert into timesheet_delivery_batches(id,customer_id,recipient_email,subject,sent_by_user_id,timesheet_count)
        values ('b0000006-0000-0000-0000-000000000001','b0000002-0000-0000-0000-000000000001','test@example.com','test','b0000004-0000-0000-0000-000000000001',1);
      insert into timesheet_delivery_items values ('b0000006-0000-0000-0000-000000000001','b0000005-0000-0000-0000-000000000001');
      select set_config('test.is_admin','true',false);
    `);
    await db.exec(migration('20250630000004_protect_demo_from_reset'));
    const reset = code => db.query('select clear_import_test_data($1) as result', [code]);
    await assert.rejects(reset('RESET-IMPORT-DATA'), /timesheet_delivery_items_timesheet_id_fkey/);
    await db.exec(migration('20260908130552_fix_all_test_data_delivery_cleanup'));
    await assert.rejects(reset('wrong'), /Invalid confirmation phrase/);
    await db.exec("select set_config('test.is_admin','false',false)");
    await assert.rejects(reset('RESET-IMPORT-DATA'), /Not authorized/);
    await db.exec("select set_config('test.is_admin','true',false)");
    const { result } = (await reset('RESET-IMPORT-DATA')).rows[0];
    assert.equal(result.cleared, true);
    for (const key of ['deliveryItems','deliveryBatches','timesheets','customers','employees','portalUsers']) {
      assert.equal(result.counts[key], 1, key);
    }
    for (const table of ['timesheet_delivery_items','timesheet_delivery_batches','timesheets']) {
      assert.equal((await db.query(`select count(*)::int as n from ${table}`)).rows[0].n, 0);
    }
    for (const table of ['customers','employees','users']) {
      const rows = (await db.query(`select id from ${table}`)).rows;
      assert.equal(rows.length, 1);
      assert.match(rows[0].id, /^a000000/);
    }
    const repeated = (await reset('RESET-IMPORT-DATA')).rows[0].result;
    assert.ok(Object.values(repeated.counts).every(count => count === 0));
  } finally {
    await db.close();
  }
});
