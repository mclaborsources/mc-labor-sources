import { PGlite } from '../.tmp/preview-sql-tests/node_modules/@electric-sql/pglite/dist/index.js';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const db = new PGlite();
try {
 await db.exec("create role authenticated; create function public.is_admin() returns boolean language sql as $$select coalesce(current_setting('test.admin',true),'false')='true'$$");
 await db.exec(readFileSync('supabase/migrations/20260908145727_add_notification_scripts.sql','utf8'));
 await db.exec("set role authenticated; select set_config('test.admin','true',false)");
 await db.query('insert into notification_scripts(name,title,message) values ($1,$2,$3)', ['Interview','Office address','Please visit the office.']);
 assert.equal((await db.query('select * from notification_scripts')).rows.length,1);
 await assert.rejects(db.query('insert into notification_scripts(name,title,message) values ($1,$2,$3)', ['Blank','Title','  ']));
 await db.exec("select set_config('test.admin','false',false)");
 assert.equal((await db.query('select * from notification_scripts')).rows.length,0);
 await assert.rejects(db.query("insert into notification_scripts(name,title,message) values ('No','Access','Denied')"));
 console.log('PASS: script persistence, blank validation, admin-only read and insert');
} finally {await db.close();}
