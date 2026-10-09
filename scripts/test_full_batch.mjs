// Local in-memory PostgreSQL only. The workbook is never uploaded.
import fs from 'node:fs'
import {PGlite} from '@electric-sql/pglite'
import {openSnapshot} from '../src/import/xlsxSnapshot.js'
import {BANK_SHEETS,parseBankSheet,reconcileBanks} from '../src/import/masterWorkbook.js'
import {readRecap} from '../src/import/snapshotPreview.js'
import {makeRecords} from '../src/import/batchTransport.js'
const start=Date.now(),db=new PGlite(),actor='00000000-0000-0000-0000-000000000001'
try{
 const book=openSnapshot(new Uint8Array(fs.readFileSync(process.argv[2])))
 const results=Object.entries(BANK_SHEETS).map(([sheet,bank])=>parseBankSheet(book.read(sheet),bank,{keepZeroPayments:false}))
 const recap=readRecap(book.read('REKAPITULASI'))
 if(results.some(r=>r.issues.length)||reconcileBanks(results,recap).length)throw Error('SOURCE_VALIDATION_FAILED')
 const records=makeRecords(results)
 console.log(JSON.stringify({step:'parsed',people:results.reduce((s,r)=>s+r.people.length,0),records:records.length,milliseconds:Date.now()-start}))
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);insert into auth.users values('${actor}');create function auth.uid() returns uuid language sql as $$select '${actor}'::uuid$$;create function public.current_app_role() returns text language sql as $$select 'editor'::text$$;`)
 await db.exec(fs.readFileSync('supabase/recovery-foundation.draft.sql','utf8'))
 await db.exec(fs.readFileSync('supabase/recovery-batches.draft.sql','utf8'))
 const id=(await db.query('select recovery_begin($1,$2,$3,$4) id',['uji-lokal.xlsx','c'.repeat(64),records.length,JSON.stringify(recap)])).rows[0].id
 for(let offset=0;offset<records.length;offset+=500){await db.query('select recovery_append($1,$2)',[id,JSON.stringify(records.slice(offset,offset+500))]);if(offset%20000===0)console.log(JSON.stringify({step:'staging',loaded:Math.min(offset+500,records.length),milliseconds:Date.now()-start}))}
 const validationStart=Date.now();await db.query('select recovery_validate($1)',[id]);console.log(JSON.stringify({step:'validated',milliseconds:Date.now()-validationStart}))
 const commitStart=Date.now();await db.query('select recovery_commit($1,$2)',[id,'Uji lokal workbook asli']);console.log(JSON.stringify({step:'committed',milliseconds:Date.now()-commitStart}))
 const totals=(await db.query(`select bank,sum(nominal)::text obligation,(select coalesce(sum(p.nominal),0)::text from recovery_payments p join recovery_obligations x on x.id=p.obligation_id where x.bank=o.bank) payment from recovery_obligations o group by bank order by bank`)).rows
 const report={localOnly:true,people:results.reduce((s,r)=>s+r.people.length,0),records:records.length,totals,milliseconds:Date.now()-start}
 console.log(JSON.stringify(report,null,2));fs.mkdirSync('.local-analysis',{recursive:true});fs.writeFileSync('.local-analysis/full-batch-result.json',JSON.stringify(report,null,2))
}finally{await db.close()}
