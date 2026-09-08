import { PGlite } from '../.tmp/preview-sql-tests/node_modules/@electric-sql/pglite/dist/index.js';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
test('shared colour descriptions preserve existing settings and independent edits', async () => {
 const db = new PGlite();
 try {
  await db.exec("create table company_settings(id int primary key, company_name text); insert into company_settings values(1,'Office')");
  await db.exec(readFileSync(new URL('../supabase/migrations/20260908140729_add_action_color_descriptions.sql', import.meta.url), 'utf8'));
  const initial = (await db.query('select * from company_settings')).rows[0];
  assert.equal(initial.action_color_blue_description, 'Normal');
  assert.equal(initial.action_color_red_description, 'Needs to be set up');
  await db.exec("update company_settings set action_color_green_description='Ready' where id=1; update company_settings set action_color_red_description='Follow up' where id=1");
  const saved = (await db.query('select * from company_settings')).rows[0];
  assert.equal(saved.action_color_green_description, 'Ready');
  assert.equal(saved.action_color_red_description, 'Follow up');
  assert.equal(saved.company_name, 'Office');
  await assert.rejects(db.query('update company_settings set action_color_blue_description=$1', ['x'.repeat(201)]), /too long/);
 } finally { await db.close(); }
});
