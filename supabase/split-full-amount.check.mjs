// Local check for split-full-amount.sql (no live DB). Needs PGlite:
//   PGLITE=/path/to/node_modules/@electric-sql/pglite/dist/index.js node supabase/split-full-amount.check.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
const { PGlite } = await import(process.env.PGLITE ?? '@electric-sql/pglite');
const read = f => fs.readFileSync(new URL(f, import.meta.url), 'utf8');
const db = new PGlite();
await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
await db.exec(read('./schema.sql'));
await db.exec(read('./functions.sql'));
await db.exec(`
insert into split_users values ('u2', 'Ben', now(), now());
insert into transactions (id,type,date,amount,description,my_share,is_split,created_at,updated_at) values ('t1','expense','2026-11-01',300,'Dinner',100,true,now(),now());
insert into transactions (id,type,date,amount,description,my_share,paid_by_id,is_split,created_at,updated_at) values ('t2','expense','2026-11-02',500,'Cab',200,'u2',true,now(),now());
insert into transactions (id,type,date,amount,description,created_at,updated_at) values ('t3','expense','2026-11-03',80,'Tea',now(),now());`);
const migration = read('./split-full-amount.sql');
await db.exec(migration);
await db.exec(migration); // safe to rerun
const net = async () => (await db.query(`select id, net_amount::float n from transactions order by id`)).rows.map(r => r.n);
assert.deepEqual(await net(), [300, 200, 80], 'seeded on: I paid → full; friend paid → my share');
await db.query('select set_split_full_amount(false)');
assert.deepEqual(await net(), [100, 200, 80], 'off: today’s numbers');
await db.exec(`update transactions set amount = 600, my_share = 200 where id = 't1'`);
assert.deepEqual(await net(), [200, 200, 80], 'edits recompute (off)');
await db.query('select set_split_full_amount(true)');
assert.deepEqual(await net(), [600, 200, 80], 'edits recompute (on)');
await db.exec(`insert into transactions (id,type,date,amount,description,my_share,is_split,created_at,updated_at) values ('t4','expense','2026-11-04',90,'Pizza',30,true,now(),now())`);
assert.equal((await db.query(`select net_amount::float n from transactions where id='t4'`)).rows[0].n, 90, 'new rows follow the setting');
assert.equal((await db.query(`select count(*)::int c from transactions_expanded where net_amount is not null`)).rows[0].c, 4, 'view still works');
console.log('ok');
