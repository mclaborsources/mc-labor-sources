import { PGlite } from '../.tmp/preview-sql-tests/node_modules/@electric-sql/pglite/dist/index.js';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';

test('clock-in acknowledges matching job order atomically under worker RLS', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      set timezone = 'UTC';
      create role authenticated;
      create table job_orders(id text primary key, assignment_id text, employee_id text, customer_id text, job_site_id text, status text, acknowledged_at timestamptz, updated_at timestamptz);
      create table attendance_logs(id text primary key, assignment_id text, employee_id text, customer_id text, job_site_id text, status text, clock_in_time timestamptz);
      alter table job_orders enable row level security;
      create policy worker_read on job_orders for select to authenticated using (employee_id = 'worker');
      create policy worker_ack on job_orders for update to authenticated using (employee_id = 'worker') with check (status = 'ACKNOWLEDGED');
      grant usage on schema public to authenticated;
      grant select, update on job_orders to authenticated;
      grant insert on attendance_logs to authenticated;
      insert into job_orders values
        ('matching','a','worker','c','s','SENT',null,null),
        ('other-week','b','worker','c','s','SENT',null,null),
        ('other-worker','a','other','c','s','SENT',null,null),
        ('wrong-site','a','worker','c','other','SENT',null,null),
        ('cancelled','a','worker','c','s','CANCELLED',null,null),
        ('completed','a','worker','c','s','COMPLETED',null,null),
        ('previous','a','worker','c','s','ACKNOWLEDGED','2026-09-01',null);
    `);
    await db.exec(readFileSync(new URL('../supabase/migrations/20260910182026_acknowledge_job_order_on_clock_in.sql', import.meta.url), 'utf8'));
    await db.exec(`set role authenticated; insert into attendance_logs values ('one','a','worker','c','s','CLOCKED_IN','2026-09-11T12:00:00Z'); reset role;`);
    const rows = (await db.query('select id,status,acknowledged_at::text from job_orders order by id')).rows;
    assert.equal(rows.find(r => r.id === 'matching').status, 'ACKNOWLEDGED');
    assert.match(rows.find(r => r.id === 'matching').acknowledged_at, /^2026-09-11 12:00:00/);
    for (const id of ['other-week', 'other-worker', 'wrong-site']) assert.equal(rows.find(r => r.id === id).status, 'SENT');
    assert.equal(rows.find(r => r.id === 'cancelled').status, 'CANCELLED');
    assert.equal(rows.find(r => r.id === 'completed').status, 'COMPLETED');
    assert.match(rows.find(r => r.id === 'previous').acknowledged_at, /^2026-09-01/);
    await db.exec(`set role authenticated;
      insert into attendance_logs values ('two','a','worker','c','s','CLOCKED_IN','2026-09-12');
      insert into attendance_logs values ('no-assignment',null,'worker','c','s','CLOCKED_IN','2026-09-12');
      insert into attendance_logs values ('closed','b','worker','c','s','CLOCKED_OUT','2026-09-12');
      reset role;`);
    assert.match((await db.query("select acknowledged_at::text from job_orders where id='matching'")).rows[0].acknowledged_at, /^2026-09-11/);
    await db.exec(`begin; set local role authenticated; insert into attendance_logs values ('rollback','b','worker','c','s','CLOCKED_IN','2026-09-12'); rollback;`);
    assert.equal((await db.query("select status from job_orders where id='other-week'")).rows[0].status, 'SENT');
  } finally { await db.close(); }
});
