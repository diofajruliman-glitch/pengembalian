import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {PGlite} from '@electric-sql/pglite'
import {normalizeRow,regionalZone,buildDistrictZones,queryRows,aggregate,facets,RULE_VERSION,primaryReason,reasonRecap,sourcePriorityChanged} from '../src/adjustments/model.js'
import {localAccessAllowed} from '../scripts/adjustments_dev.mjs'

const headers=['Penilai','NIP','Nama','Jabatan','Tahap','Predikat Kinerja Periodik','Tahun','Bulan','Potongan SKP (%)','Potongan Absensi eSDM (%)','Potongan Absensi e-Absensi (%)','Tukin','Potongan SKP','Potongan Kehadiran eSDM','Potongan Kehadiran e-Absensi','Tukin Dibayar (eSDM)','Tukin Dibayar (e-Absensi)','FINAL KEHADIRAN','FINAL PENGEMBALIAN','POTONGAN KEHADIRAN AWAL','PENGEMBALIAN AWAL','STATUS SP2D UPDATE','KDASATKER UPDATE','STATUS SP2D','KDASATKER','STATUS SEND BPK','STATUS TENDIK','ZONA WAKTU','PROPINSI','KABUPATEN','CUTI','TANGGAL MULAI CUTI','TANGGAL SELESAI CUTI','TENDIK HITUNG ABSEN','PRESENTASE','ABSEN FINAL TENDIK','PENGEMBALIAN FINAL TENDIK','STATUS PENGEMBALIAN FINAL','STATUS PENGEMBALIAN AWAL','cek selisih','S','CEK BUP']
function raw(overrides={}){const obj={'NIP':'000000000000000001','Nama':'SDM Uji','Tahun':'2025','Bulan':'Oktober','PENGEMBALIAN AWAL':100,'FINAL PENGEMBALIAN':80,'STATUS SP2D':2025,'STATUS SP2D UPDATE':2026,'STATUS SEND BPK':'BELUM MASUK BPK','ZONA WAKTU':'WIB','PROPINSI':'GORONTALO','KABUPATEN':'KAB. BONE BOLANGO','STATUS TENDIK':'bukan tendik sr','STATUS PENGEMBALIAN AWAL':'PENGEMBALIAN','STATUS PENGEMBALIAN FINAL':'PENGEMBALIAN',...overrides};return headers.map(h=>obj[h]??null)}
const row=(overrides={},n=2)=>normalizeRow(raw(overrides),headers,n)
test('geography replaces source zone automatically and district fallback uses unambiguous province evidence',()=>{
 assert.deepEqual(regionalZone('KALIMANTAN UTARA','TARAKAN','WIB'),{zone:'WITA',basis:'PROPINSI'})
 assert.equal(regionalZone('PAPUA BARAT DAYA',null,'WITA').zone,'WIT')
 assert.equal(regionalZone('P A P U A',null,'WIB').zone,'WIT')
 assert.equal(regionalZone('KALIMANTAN TENGAH',null,'WITA').zone,'WIB')
 const r=row();assert.equal(r.originalZone,'WIB');assert.equal(r.zone,'WITA');assert.equal(r.zoneAdjusted,true);assert.deepEqual(r.reasons,['WITA'])
 const districts=buildDistrictZones([{values:raw()}],headers)
 assert.equal(regionalZone(null,'KAB. BONE BOLANGO','WIB',districts).zone,'WITA')
 assert.deepEqual(row({'PROPINSI':'JAWA BARAT'}).reasons,['ATTENDANCE'])
})
test('missing is not zero, errors are not synthesized into amounts, and reasons follow cuti/tendik/month rules',()=>{
 const missing=row({'PENGEMBALIAN AWAL':'#N/A'});assert.equal(missing.initial,null);assert.equal(missing.delta,null);assert.equal(missing.changed,false)
 assert.equal(row({'PENGEMBALIAN AWAL':0}).delta,80)
 assert.equal(row({'FINAL PENGEMBALIAN':100}).reasons.length,0)
 assert.deepEqual(row({'CUTI':'Melahirkan','TANGGAL MULAI CUTI':'1 Oktober 2025','TANGGAL SELESAI CUTI':'30 November 2025'}).reasons,['MATERNITY'])
 assert.deepEqual(row({'CUTI':'Sakit','TANGGAL MULAI CUTI':'1 Mei 2025','TANGGAL SELESAI CUTI':'2 Mei 2025'}).reasons,['WITA'])
 assert.deepEqual(row({'STATUS TENDIK':'tendik','cek selisih':'penyesuaian wita dan tendik'}).reasons,['WITA','TENDIK'])
 assert.deepEqual(row({'STATUS TENDIK':'TENDIK/CM'}).reasons,['TENDIK'])
 assert.deepEqual(row({'CUTI':'CUTI MELAHIRKAN OKTOBER','cek selisih':'PENYESUAIAN CUTI'}).reasons,['MATERNITY'])
 assert.ok(row({'FINAL PENGEMBALIAN':100,'STATUS PENGEMBALIAN FINAL':'TIDAK PENGEMBALIAN'}).reasons.includes('STATUS'))
 assert.throws(()=>normalizeRow(raw({'NIP':196712062025211004}),headers,2),/teks 18 digit/)
})
test('all combined filters drive whole-population totals, unique SDM, and old/update transition recaps, not page totals',()=>{
 const rows=[row(),row({'Bulan':'November'},3),row({'NIP':'000000000000000002','STATUS SP2D UPDATE':2025,'STATUS SEND BPK':'TAHAP 1 SEND BPK'},4)]
 const result=queryRows(rows,{sp2dOld:'2025',sp2dUpdated:'2026',bpk:'BELUM MASUK BPK',reason:'WITA'},0,1)
 assert.equal(result.rows.length,1);assert.equal(result.summary.rows,2);assert.equal(result.summary.people,1);assert.equal(result.summary.delta,-40)
 assert.deepEqual(result.recaps.transition[0].values,[2025,2026,'BELUM MASUK BPK'])
 assert.equal(queryRows(rows,{search:'tidak ada'}).summary.rows,0)
 assert.equal(queryRows([row({'STATUS SP2D':null})],{sp2dOld:'__EMPTY__'}).summary.rows,1)
})
test('local endpoint refuses cross-origin, spoofed hosts, and LAN access',()=>{
 const req={socket:{remoteAddress:'127.0.0.1'},headers:{host:'localhost:5173',origin:'http://localhost:5173','sec-fetch-site':'same-origin'}}
 assert.equal(localAccessAllowed(req),true)
 assert.equal(localAccessAllowed({...req,headers:{...req.headers,origin:'https://attacker.test'}}),false)
 assert.equal(localAccessAllowed({...req,socket:{remoteAddress:'192.168.1.7'}}),false)
 assert.equal(localAccessAllowed({...req,headers:{host:'attacker.test'}}),false)
})

test('primary attribution counts each row once and preserves positive, negative, missing and additional reasons',()=>{
 const overlap=row({'STATUS TENDIK':'tendik','cek selisih':'penyesuaian wita dan tendik'})
 assert.equal(primaryReason(overlap),'TENDIK') // explicit tendik and zone use the declared precedence
 assert.ok(overlap.reasons.includes('TENDIK'))
 const rows=[overlap,row({'FINAL PENGEMBALIAN':130},3),row({'FINAL PENGEMBALIAN':100},4),row({'FINAL PENGEMBALIAN':'#N/A'},5)]
 const groups=reasonRecap(rows)
 assert.equal(groups.reduce((n,g)=>n+g.rows,0),4)
 assert.equal(groups.reduce((n,g)=>n+g.delta,0),10)
 assert.equal(groups.reduce((n,g)=>n+g.reduction,0),20)
 assert.equal(groups.reduce((n,g)=>n+g.increase,0),30)
 assert.equal(queryRows(rows,{primaryReason:'WITA'}).summary.rows,1)
 assert.equal(queryRows(rows,{primaryReason:'MISSING'}).summary.missingDelta,1)
})

test('specific S timezone attribution resolves cuti overlap without losing additional reasons or changing amounts',()=>{
 const r=row({'Bulan':'Desember','cek selisih':'CUTI MELAHIRKAN/ZONA WAKTU','S':'Penyesuaian wita'})
 assert.equal(primaryReason(r),'WITA');assert.equal(sourcePriorityChanged(r),true)
 assert.ok(r.reasons.includes('MATERNITY'));assert.equal(r.initial,100);assert.equal(r.final,80)
 assert.equal(primaryReason({...r,source:undefined}),'WITA') // paged rows omit full source
 assert.equal(queryRows([r],{sourcePriority:'changed',month:'Desember'}).summary.rows,1)
 assert.equal(queryRows([r],{}).recaps.sourcePriority[0].delta,-20)
 const generic=row({'cek selisih':'CUTI MELAHIRKAN','S':'Penyesuaian absen'})
 assert.equal(primaryReason(generic),'MATERNITY') // generic absence is not more specific than cuti
 const conflicting=row({'PROPINSI':'JAWA BARAT','cek selisih':'CUTI MELAHIRKAN','S':'Penyesuaian wita'})
 assert.equal(primaryReason(conflicting),'MATERNITY') // no unsupported regional attribution
})

test('Supabase migration preserves existing tables, enforces roles, commits complete immutable versions, and matches local filters/history',async()=>{
 const db=new PGlite(),admin='00000000-0000-0000-0000-000000000001',viewer='00000000-0000-0000-0000-000000000002'
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,role text);insert into auth.users values('${admin}','admin'),('${viewer}','viewer');create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function public.current_app_role() returns text language sql security definer as $$select role from auth.users where id=auth.uid()$$;create table public.sentinel(value integer);insert into public.sentinel values(42);`)
  await db.exec(fs.readFileSync('supabase/recovery-adjustments.sql','utf8'))
  await db.exec(fs.readFileSync('supabase/recovery-adjustments-performance.sql','utf8'))
  const call=async(name,action,payload={})=>(await db.query(`select public.${name}($1,$2) result`,[action,JSON.stringify(payload)])).rows[0].result
  const write=(a,p)=>call('recovery_adjustment_import',a,p),read=(a,p)=>call('recovery_adjustment_read',a,p)
  await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${admin}',false)`)
  const rows=[row(),row({'Bulan':'November'},3),row({'NIP':'000000000000000002','STATUS SP2D UPDATE':2025},4)]
  const manifest={fileName:'Uji.xlsx',headers,sheet:'3 bulan',sha256:'a'.repeat(64),ruleVersion:RULE_VERSION,expectedRows:rows.length,summary:aggregate(rows),facets:facets(rows),warnings:[]}
  const batch=await write('begin',{manifest});assert.equal(batch.committed,false)
  await assert.rejects(write('commit',{id:batch.id}),/INCOMPLETE_IMPORT/)
  await assert.rejects(write('append',{id:batch.id,records:[{...rows[0],initial:999}]}),/SOURCE_AMOUNT_MISMATCH/)
  await assert.rejects(write('append',{id:batch.id,records:[{...rows[0],delta:999}]}),/INVALID_DELTA/)
  await write('append',{id:batch.id,records:rows});await write('append',{id:batch.id,records:rows})
  await assert.rejects(write('append',{id:batch.id,records:[{...rows[0],sourceRow:99}]}),/duplicate key/)
  await write('commit',{id:batch.id});assert.equal((await write('commit',{id:batch.id})).committed,true)
  await assert.rejects(write('append',{id:batch.id,records:rows}),/IMMUTABLE_IMPORT/)
  const filters={sp2dOld:'2025',sp2dUpdated:'2026',reason:'WITA',bpk:'BELUM MASUK BPK'}
  const online=await read('query',{filters,page:0}),local=queryRows(rows,filters)
  assert.deepEqual(online.summary,local.summary);assert.deepEqual(online.recaps,local.recaps)
  for(const extraFilter of [{},{sp2dOld:'',sp2dUpdated:'',search:''},{sp2dOld:'__EMPTY__'},{change:'amount'},{change:'any'},{change:'unchanged'},{change:'missing'},{month:'November'},{zone:'WITA'},{sourcePriority:'changed'},{primaryReason:'UNCHANGED'},{search:'SDM'}]){
   const actual=await read('query',{filters:extraFilter,page:999}),expected=queryRows(rows,extraFilter,999)
   assert.deepEqual(actual.summary,expected.summary);assert.deepEqual(actual.recaps,expected.recaps);assert.equal(actual.page,expected.page)
  }
  const overlap=row({'STATUS TENDIK':'tendik','cek selisih':'PENYESUAIAN TENDIK','S':'Penyesuaian absen tendik'})
  await db.exec('reset role')
  assert.equal((await db.query('select recovery_adjustments.primary_reason($1::jsonb) reason',[JSON.stringify(overlap)])).rows[0].reason,primaryReason(overlap))
  const specific=row({'cek selisih':'CUTI MELAHIRKAN/ZONA WAKTU','S':'Penyesuaian wita'})
  const sqlSpecific=(await db.query("select recovery_adjustments.primary_reason($1::jsonb) reason,recovery_adjustments.matches($1::jsonb,'{\"sourcePriority\":\"changed\",\"primaryReason\":\"WITA\"}'::jsonb) matches",[JSON.stringify(specific)])).rows[0]
  assert.equal(sqlSpecific.reason,primaryReason(specific));assert.equal(sqlSpecific.matches,true)
  await db.exec('set role authenticated')
  const primaryFilter={primaryReason:'WITA'}
  assert.deepEqual((await read('query',{filters:primaryFilter})).recaps,queryRows(rows,primaryFilter).recaps)
  const empty=await read('query',{filters:{search:'nothing'}});assert.equal(empty.summary.rows,0);assert.deepEqual(empty.rows,[])
  const second=[row({'FINAL PENGEMBALIAN':70}),...rows.slice(1)],secondManifest={...manifest,sha256:'b'.repeat(64),summary:aggregate(second)}
  const next=await write('begin',{manifest:secondManifest});await write('append',{id:next.id,records:second});await write('commit',{id:next.id})
  const history=await read('history',{nip:rows[0].nip});assert.equal(history.imports.length,2);assert.equal(history.rows.length,4);assert.equal(history.rows[0].final,80);assert.equal(history.rows[2].final,70)
  assert.equal((await read('manifest')).importId,next.id)
  await db.exec(`select set_config('request.jwt.claim.sub','${viewer}',false)`)
  assert.equal((await read('query',{filters})).summary.rows,2)
  await assert.rejects(write('begin',{manifest}),/FORBIDDEN/)
  await assert.rejects(db.query('select * from recovery_adjustments.records'),/permission denied/)
  await db.exec(`select set_config('request.jwt.claim.sub','',false)`)
  await assert.rejects(read('manifest'),/FORBIDDEN/)
  await db.exec('reset role')
  assert.equal((await db.query('select value from sentinel')).rows[0].value,42)
  assert.equal((await db.query("select has_function_privilege('anon','public.recovery_adjustment_read(text,jsonb)','execute') ok")).rows[0].ok,false)
 }finally{await db.close()}
})
