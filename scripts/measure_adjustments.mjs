// Local PostgreSQL sample measurement, with no network or production writes.
import fs from 'node:fs/promises'
import {createReadStream} from 'node:fs'
import readline from 'node:readline'
import path from 'node:path'
import {PGlite} from '@electric-sql/pglite'

const folder=path.resolve(process.argv[2]||'.local-analysis/adjustments')
const manifest=JSON.parse(await fs.readFile(path.join(folder,'prepared.json'),'utf8'))
const sample=[]
for await(const line of readline.createInterface({input:createReadStream(path.join(folder,'records.ndjson')),crlfDelay:Infinity})){
 if(line.trim())sample.push(JSON.parse(line))
 if(sample.length===2000)break
}
const db=new PGlite()
try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select null::uuid$$;create function public.current_app_role() returns text language sql as $$select 'admin'::text$$;`)
 await db.exec(await fs.readFile('supabase/recovery-adjustments.sql','utf8'))
 const actor='00000000-0000-0000-0000-000000000001'
 await db.query('insert into auth.users values($1)',[actor])
 await db.query('insert into recovery_adjustments.imports(sha256,rule_version,manifest,expected_rows,imported_by) values($1,$2,$3,$4,$5)',[manifest.sha256,manifest.ruleVersion,JSON.stringify(manifest),manifest.expectedRows,actor])
 for(let i=0;i<sample.length;i+=250)await db.query('insert into recovery_adjustments.records(import_id,source_row,data) select 1,(r->>\'sourceRow\')::integer,r from jsonb_array_elements($1::jsonb) r',[JSON.stringify(sample.slice(i,i+250))])
 const bytes=Number((await db.query("select pg_total_relation_size('recovery_adjustments.records') bytes")).rows[0].bytes)
 const result={sampleRows:sample.length,sampleBytes:bytes,projectedRecordBytes:Math.ceil(bytes/sample.length*manifest.expectedRows),expectedRows:manifest.expectedRows,note:'Estimasi sampel lokal termasuk indeks/TOAST; belum mengukur database Supabase yang sedang dipakai. Setiap versi lengkap menambah penyimpanan.'}
 await fs.writeFile(path.join(folder,'capacity-estimate.json'),JSON.stringify(result,null,2))
 console.log(JSON.stringify(result,null,2))
}finally{await db.close()}
