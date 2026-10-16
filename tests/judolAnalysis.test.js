import test from 'node:test'
import assert from 'node:assert/strict'
import {zipSync,strToU8} from 'fflate'
import {DEFAULT_RULES,DISCIPLINE_CATEGORIES,validateRules,parseDisciplineWorkbook,analyzeDiscipline} from '../src/judol/analysis.js'

const nik='1234567890123456',other='2234567890123456'
const person={nik,nama:'ASN Uji',nip:'123456789012345678',hasilPenilaian:'Terbukti',hasilAsli:'Terbukti',keterangan:'',baris:2}
const tx=(date='2025-09-30',time=9*3600,amount=100000,extra={})=>({nik,date,time,amount,row:2,duplicate:false,identityConflict:false,...extra})
const source=transactions=>({people:[person],history:{[nik]:{frekuensi:99,nominal:9000000,kategori:'Berat',total:48,sourceRow:4}},transactions,audits:[],metadata:{transactionCount:transactions.length}})
const first=(transactions,rules)=>analyzeDiscipline(source(transactions),rules).rows[0]
const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;')
function fixture({people=[[1,person.nip,nik,'Data konfirmasi','Berat',person.nama,...Array(13).fill(''),'Terbukti','']],history,transactions,prefixed=false}={}){
 const entries={},sheets=[['Data Olah',[[null,'NIP','NIK',null,null,'NAMA ASN',...Array(13).fill(null),'HASIL PENILAIAN','KETERANGAN'],...people]],['Hasil pairing',[
  [null,'NIK',null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,'TOTAL NILAI'],[],[],
  ...(history||[[1,nik,null,person.nama,null,2,'Rp605.000',1,1,'Rendah',20,12,'Sedang',30,9,'Dalam Jam Kerja',70,7,28,'Ringan']])
 ]],['data transaksi 2025',[
  ['No','nik',null,null,null,null,'TANGGAL','JAM','NOMINAL_RP',null,'NIK_PEMAIN'],
  ...(transactions||[[1,nik,null,null,null,null,45930,'09:00:01',100000,null,nik]])
 ]]]
 let workbook='<workbook><sheets>',relationships='<Relationships>'
 for(const [i,[name,rows]] of sheets.entries()){
  workbook+=`<sheet name="${name}" r:id="r${i}"/>`;relationships+=`<Relationship Id="r${i}" Target="worksheets/sheet${i}.xml"/>`
  const column=n=>{let result='';for(n++;n;n=Math.floor((n-1)/26))result=String.fromCharCode(65+(n-1)%26)+result;return result}
  const xml=rows.map((r,j)=>`<row r="${j+1}">${r.map((value,k)=>value===null||value===undefined?'':`<c r="${column(k)}${j+1}"${typeof value==='string'?' t="inlineStr"':''}>${typeof value==='string'?`<is><t>${escape(value)}</t></is>`:`<v>${value}</v>`}</c>`).join('')}</row>`).join('')
  entries[`xl/worksheets/sheet${i}.xml`]=`<worksheet>${xml}</worksheet>`
 }
 entries['xl/workbook.xml']=workbook+'</sheets></workbook>';entries['xl/_rels/workbook.xml.rels']=relationships+'</Relationships>'
 return zipSync(Object.fromEntries(Object.entries(entries).map(([path,xml])=>[path,strToU8(prefixed?xml.replace(/<(\/?)([A-Za-z]+)/g,'<$1x:$2'):xml)])))
}

test('official component weights are 60/30/10 and configurable rules are validated',()=>{
 assert.deepEqual([DEFAULT_RULES.weightFrequency,DEFAULT_RULES.weightDeposit,DEFAULT_RULES.weightTime],[60,30,10])
 assert.ok(DEFAULT_RULES.provenance.some(p=>p.includes('rekonstruksi')))
 for(const bad of [{weightTime:20},{frequencyMedium:28},{depositMedium:2545000},{categoryMedium:46},{cutoff:'2025-02-30'},{start:'2025-10-01'},{workEnd:'24:00'},{workStart:'17:00'},{baseHigh:NaN},{tiePolicy:'guess'},{compactTime:'true'},{missingTimePolicy:'guess'},{missingTimePolicy:null}])assert.throws(()=>validateRules({...DEFAULT_RULES,...bad}))
 assert.equal(validateRules({depositMedium:700000}).depositMedium,700000)
 assert.equal(validateRules().missingTimePolicy,'pairing')
 assert.equal(validateRules({missingTimePolicy:'validate'}).missingTimePolicy,'validate')
})

test('before and after are independently counted and scored while history remains exact',()=>{
 const row=first([tx('2025-09-30',36000,5000000),tx('2025-10-01',36000,50000),tx('2025-12-31',36000,50000),tx('2026-01-01',36000,9000000)])
 assert.equal(row.historical.frekuensi,99);assert.equal(row.historical.nominal,9000000)
 assert.equal(row.before.frekuensi,1);assert.equal(row.before.nominal,5000000);assert.equal(row.before.total,34);assert.equal(row.before.kategori,'Sedang')
 assert.equal(row.after.frekuensi,2);assert.equal(row.after.nominal,100000);assert.equal(row.after.total,25);assert.equal(row.after.kategori,'Ringan')
 assert.notEqual(row.before.total,row.historical.total-row.after.total)
 assert.equal(row.categoryFromPairing,false)
})

test('frequencies and deposit values use exact inclusive thresholds',()=>{
 for(const [count,category,score] of [[8,'Rendah',12],[9,'Sedang',18],[27,'Sedang',18],[28,'Tinggi',30]]){
  const p=first(Array.from({length:count},()=>tx('2025-10-01',36000,0))).after
  assert.equal(p.categoryFrequency,category);assert.equal(p.scoreFrequency,score)
 }
 for(const [amount,category,score] of [[604999,'Rendah',6],[605000,'Sedang',9],[2544999,'Sedang',9],[2545000,'Tinggi',15]]){
  const p=first([tx('2025-10-01',36000,amount)]).after
  assert.equal(p.categoryDeposit,category);assert.equal(p.scoreDeposit,score)
 }
 const heavy=first(Array.from({length:28},()=>tx('2025-10-01',36000,100000))).after
 assert.equal(heavy.total,52);assert.equal(heavy.kategori,'Berat')
})

test('work windows include exact second boundaries and exclude weekends',()=>{
 const times=[26999,27000,57600,57601]
 const mon=first(times.map(t=>tx('2025-06-02',t,0))).before
 assert.equal(mon.dalam,2);assert.equal(mon.luar,2)
 const fri=first([tx('2025-06-06',59400),tx('2025-06-06',59401)]).before
 assert.equal(fri.dalam,1);assert.equal(fri.luar,1)
 const weekend=first([tx('2025-06-07',36000),tx('2025-06-08',36000)]).before
 assert.equal(weekend.dalam,0);assert.equal(weekend.luar,2)
})

test('time ties reproduce the source by default and can require validation',()=>{
 const rows=[tx('2025-06-02',36000),tx('2025-06-02',66000)]
 assert.equal(first(rows).before.scoreTime,7)
 const changed=first(rows,{...DEFAULT_RULES,tiePolicy:'validate'}).before
 assert.equal(changed.kategori,'Perlu validasi');assert.equal(changed.total,null)
 assert.equal(first(rows,{...DEFAULT_RULES,tiePolicy:'outside'}).before.scoreTime,3)
})

test('missing dates, amounts, times and duplicate records never become a valid zero result',()=>{
 const emptySource=source([]);emptySource.history={}
 const no=analyzeDiscipline(emptySource).rows[0].after;assert.equal(no.kategori,'Tidak ada transaksi');assert.equal(no.total,null)
 const invalidDate=first([tx(null)]);assert.equal(invalidDate.before.kategori,'Perlu validasi');assert.equal(invalidDate.after.kategori,'Perlu validasi')
 for(const bad of [{time:null},{amount:null},{duplicate:true},{identityConflict:true}]){
  const p=first([tx('2025-10-01',36000,100000,bad)]).after
  assert.equal(p.kategori,'Perlu validasi');assert.equal(p.total,null)
 }
 assert.equal(first([tx('2025-10-01',null)]).after.unknown,1)
})

test('parses namespace XML, original rupiah, Excel dates and strict Indonesian date text',()=>{
 const parsed=parseDisciplineWorkbook(fixture({prefixed:true,transactions:[
  [1,nik,null,null,null,null,45930,'07:30:00',100000,null,nik],
  [2,nik,null,null,null,null,'28/06/2025',0.5,500000,null,nik]
 ]}))
 assert.equal(parsed.people.length,1);assert.equal(parsed.people[0].hasilPenilaian,'Terbukti')
 assert.equal(parsed.history[nik].nominal,605000);assert.equal(parsed.history[nik].sourceRow,4)
 assert.equal(parsed.transactions[0].date,'2025-09-30');assert.equal(parsed.transactions[0].time,27000)
 assert.equal(parsed.transactions[1].date,'2025-06-28');assert.equal(parsed.transactions[1].time,43200)
 assert.equal(parsed.metadata.transactionCount,2)
})

test('rejects numeric and malformed NIK rather than rounding or stripping digits',()=>{
 const numeric=[1,1234567890123456,null,null,null,null,45930,'09:00',1000]
 assert.throws(()=>parseDisciplineWorkbook(fixture({transactions:[numeric]})),/teks 16 digit/)
 numeric[1]='1234 5678 9012 3456';assert.throws(()=>parseDisciplineWorkbook(fixture({transactions:[numeric]})),/teks 16 digit/)
 const p=[1,person.nip,nik,null,null,person.nama,...Array(13).fill(''),'Terbukti']
 assert.throws(()=>parseDisciplineWorkbook(fixture({people:[p,p]})),/duplikat/)
})

test('ambiguous historical rows are flagged and source transaction ids are not silently deduplicated',()=>{
 const h=[1,nik,null,'ASN',null,1,'Rp100.000',1,0,'Rendah',20,12,'Rendah',20,6,'Dalam Jam Kerja',70,7,25,'Ringan']
 const t=[1,nik,null,null,null,null,45930,'09:00:00',100000,null,nik]
 const parsed=parseDisciplineWorkbook(fixture({history:[h,h],transactions:[t,t]}))
 assert.equal(parsed.history[nik],null);assert.equal(parsed.transactions.length,2)
 const result=analyzeDiscipline(parsed)
 assert.equal(result.rows[0].before.frekuensi,2);assert.equal(result.rows[0].before.kategori,'Perlu validasi')
 assert.equal(result.rows[0].before.invalidDuplicates,2)
 assert.ok(result.audits.some(a=>a.type==='duplicate-history'))
 assert.ok(result.audits.some(a=>a.type==='duplicate-transaction'))
})

test('invalid source values retain flags and unmatched NIK are audited separately',()=>{
 const parsed=parseDisciplineWorkbook(fixture({transactions:[
  [1,nik,null,null,null,null,'31/02/2025','??','Rp-1',null,nik],
  [2,other,null,null,null,null,'2025-10-01','09:00',1000,null,other]
 ]}))
 const result=analyzeDiscipline(parsed)
 assert.equal(result.stats.unmatchedTransactions,1);assert.equal(result.stats.matchedTransactions,1)
 assert.equal(result.rows[0].after.kategori,'Perlu validasi')
 assert.ok(result.rows[0].audits.some(a=>a.type==='invalid-date'))
 assert.ok(result.audits.some(a=>a.type==='unmatched-transaction'))
})

test('compact HHMMSS assumption preserves seconds and is recomputed when disabled',()=>{
 const parsed=parseDisciplineWorkbook(fixture({transactions:[
  [1,nik,null,null,null,null,'2025-10-01','073000',1000,null,nik],
  [2,nik,null,null,null,null,'2025-10-01','73000',1000,null,nik],
  [3,nik,null,null,null,null,'2025-10-01','246001',1000,null,nik]
 ]}))
 assert.equal(parsed.transactions[0].time,27000)
 assert.equal(parsed.transactions[1].time,27000);assert.equal(parsed.transactions[2].time,null)
 const result=analyzeDiscipline(parsed)
 assert.equal(result.rows[0].after.unknown,1);assert.equal(result.rows[0].after.kategori,'Perlu validasi')
 const strict=analyzeDiscipline(parsed,{...DEFAULT_RULES,compactTime:false})
 assert.equal(strict.rows[0].after.unknown,2)
 assert.equal(strict.audits.filter(a=>a.type==='invalid-time').length,2)
 assert.equal(result.audits.filter(a=>a.type==='invalid-time').length,1)
})

const withTimeHistory=(transactions,history={})=>{
 const data=source(transactions)
 data.history[nik]={...data.history[nik],categoryTime:'Dalam Jam Kerja',scoreTime:7,weightTime:70,status:'Sumber asli Sekjen',...history}
 return data
}

test('literal dash defaults to historical time classification while source and history remain unchanged',()=>{
 const data=withTimeHistory([
  tx('2025-09-30',null,100000,{timeRaw:' - ',row:21}),
  tx('2025-10-01',null,200000,{timeRaw:'-',row:22})
 ])
 data.audits=[{type:'invalid-time',nik,message:'Jam tidak tersedia',row:21},{type:'invalid-time',nik,message:'Jam tidak tersedia',row:22}]
 const original=structuredClone(data),result=analyzeDiscipline(data),row=result.rows[0]
 assert.deepEqual(data,original)
 assert.deepEqual(row.historical,original.history[nik])
 for(const period of [row.before,row.after]){
  assert.equal(period.timeFromPairing,1);assert.equal(period.timeFromPairingInside,1);assert.equal(period.timeFromPairingOutside,0)
  assert.equal(period.unknown,0);assert.equal(period.dalam,1);assert.equal(period.luar,0)
  assert.equal(period.scoreTime,7);assert.equal(period.total,25);assert.equal(period.kategori,'Ringan')
  assert.equal(period.status,'Simulasi menggunakan acuan waktu Hasil pairing')
 }
 assert.equal(row.historical.kategori,'Berat')
 assert.equal(result.audits.filter(a=>a.type==='invalid-time').length,0)
 const assumptions=result.audits.filter(a=>a.type==='time-from-pairing')
 assert.deepEqual(assumptions.map(a=>a.row),[21,22])
 assert.ok(assumptions.every(a=>a.message.includes('"-"')&&a.message.includes('Hasil pairing baris 4')&&a.message.includes('jam asli tetap belum diketahui')))
 const strict=analyzeDiscipline(data,{missingTimePolicy:'validate'})
 assert.equal(strict.rows[0].before.unknown,1);assert.equal(strict.rows[0].before.timeFromPairing,0)
 assert.equal(strict.rows[0].before.total,null);assert.equal(strict.rows[0].before.kategori,'Perlu validasi')
 assert.equal(strict.audits.filter(a=>a.type==='invalid-time').length,2)
 assert.equal(strict.audits.filter(a=>a.type==='time-from-pairing').length,0)
 assert.deepEqual(data,original)
})

test('real times and historical assumptions are counted together separately for each period',()=>{
 const data=withTimeHistory([
  tx('2025-09-30',36000),tx('2025-09-30',40000),tx('2025-09-30',null,100000,{timeRaw:'-'}),
  tx('2025-10-01',36000),tx('2025-10-01',null,100000,{timeRaw:'-'}),tx('2025-10-01',null,100000,{timeRaw:'-'})
 ],{categoryTime:' luar   jam kerja ',scoreTime:99})
 const row=analyzeDiscipline(data).rows[0]
 assert.equal(row.before.dalam,2);assert.equal(row.before.luar,1);assert.equal(row.before.timeFromPairingOutside,1)
 assert.equal(row.before.categoryTime,'Dalam Jam Kerja');assert.equal(row.before.scoreTime,7)
 assert.equal(row.after.dalam,1);assert.equal(row.after.luar,2);assert.equal(row.after.timeFromPairingOutside,2)
 assert.equal(row.after.categoryTime,'Luar Jam Kerja');assert.equal(row.after.scoreTime,3)
 assert.equal(row.before.frekuensi,3);assert.equal(row.after.frekuensi,3)
 assert.equal(row.before.nominal,300000);assert.equal(row.after.nominal,300000)
})

test('fallback recalculates the time score using active weights and retains the configured tie policy',()=>{
 const data=withTimeHistory([tx('2025-09-30',null,100000,{timeRaw:'-'})],{scoreTime:99,weightTime:99})
 const period=analyzeDiscipline(data,{weightFrequency:50,weightDeposit:30,weightTime:20,timeInside:80}).rows[0].before
 assert.equal(period.scoreTime,16);assert.equal(period.total,32);assert.equal(period.kategori,'Ringan')
 const mixed=withTimeHistory([tx('2025-09-30',36000),tx('2025-09-30',null,100000,{timeRaw:'-'})],{categoryTime:'Luar Jam Kerja'})
 const tied=analyzeDiscipline(mixed,{tiePolicy:'validate'}).rows[0].before
 assert.equal(tied.timeFromPairing,1);assert.equal(tied.unknown,0);assert.equal(tied.total,null)
 assert.equal(tied.categoryTime,'Perlu validasi (seri)');assert.equal(tied.kategori,'Perlu validasi')
})

test('blank or malformed times never use historical fallback and history must be an exact valid match',()=>{
 const invalidTimes=[null,'','??','246001','--','−']
 const data=withTimeHistory(invalidTimes.map((timeRaw,i)=>tx('2025-09-30',null,100000,{timeRaw,row:i+2})))
 const result=analyzeDiscipline(data),period=result.rows[0].before
 assert.equal(period.unknown,invalidTimes.length);assert.equal(period.timeFromPairing,0);assert.equal(period.total,null)
 assert.equal(result.audits.filter(a=>a.type==='invalid-time').length,invalidTimes.length)
 for(const history of [null,{categoryTime:'Tidak diketahui',status:'Sumber asli Sekjen'},{categoryTime:'Dalam Jam Kerja',status:'Perlu validasi'}]){
  const candidate=withTimeHistory([tx('2025-09-30',null,100000,{timeRaw:'-'})])
  candidate.history[nik]=history
  assert.equal(analyzeDiscipline(candidate).rows[0].before.unknown,1)
 }
 const wrongNik=withTimeHistory([tx('2025-09-30',null,100000,{timeRaw:'-'})])
 wrongNik.history={[other]:wrongNik.history[nik]}
 assert.equal(analyzeDiscipline(wrongNik).rows[0].before.unknown,1)
 const h=[1,nik,null,'ASN',null,1,'Rp100.000',1,0,'Rendah',20,12,'Rendah',20,6,'Dalam Jam Kerja',70,7,25,'Ringan']
 const t=[1,nik,null,null,null,null,45930,'-',100000,null,nik]
 const duplicate=analyzeDiscipline(parseDisciplineWorkbook(fixture({history:[h,h],transactions:[t]}))).rows[0].before
 assert.equal(duplicate.unknown,1);assert.equal(duplicate.timeFromPairing,0)
 const invalidHistory=[...h];invalidHistory[18]=null
 const invalid=analyzeDiscipline(parseDisciplineWorkbook(fixture({history:[invalidHistory],transactions:[t]}))).rows[0].before
 assert.equal(invalid.unknown,1);assert.equal(invalid.timeFromPairing,0)
})

test('historical time assumptions do not clear other source errors or assign undated transactions',()=>{
 for(const issue of [{amount:null},{duplicate:true},{identityConflict:true}]){
  const data=withTimeHistory([tx('2025-09-30',null,100000,{timeRaw:'-',...issue})])
  const period=analyzeDiscipline(data).rows[0].before
  assert.equal(period.timeFromPairing,1);assert.equal(period.unknown,0)
  assert.equal(period.total,null);assert.equal(period.kategori,'Perlu validasi');assert.equal(period.status,'Perlu validasi')
 }
 const undated=withTimeHistory([tx(null,null,100000,{timeRaw:'-'})]),result=analyzeDiscipline(undated)
 assert.equal(result.rows[0].before.invalidDates,1);assert.equal(result.rows[0].after.invalidDates,1)
 assert.equal(result.rows[0].before.total,null);assert.equal(result.rows[0].after.total,null)
 assert.equal(result.audits.filter(a=>a.type==='time-from-pairing').length,0)
 assert.equal(result.audits.filter(a=>a.type==='invalid-time').length,1)
})

test('historical activity without any master detail remains unavailable in both periods and preserves source',()=>{
 const missingCategory='Rincian transaksi belum tersedia'
 assert.ok(DISCIPLINE_CATEGORIES.includes(missingCategory))
 assert.equal(new Set(DISCIPLINE_CATEGORIES).size,DISCIPLINE_CATEGORIES.length)
 const numericFields=['frekuensi','nominal','dalam','luar','unknown','timeFromPairing','timeFromPairingInside','timeFromPairingOutside','scoreFrequency','scoreDeposit','scoreTime','total','invalidDates','invalidAmounts','invalidDuplicates','identityConflicts']
 for(const hasilPenilaian of ['Terbukti','Tidak Terbukti','Belum ditetapkan']){
  const data=source([]);data.people=[{...person,hasilPenilaian,hasilAsli:hasilPenilaian}]
  const original=structuredClone(data),result=analyzeDiscipline(data),row=result.rows[0]
  assert.equal(row.sourceTransactionCount,0);assert.equal(row.missingTransactionDetails,true);assert.equal(row.categoryFromPairing,true)
  assert.equal(row.hasilPenilaian,hasilPenilaian)
  assert.deepEqual(row.historical,original.history[nik]);assert.deepEqual(data,original)
  for(const period of [row.before,row.after]){
   assert.equal(period.kategori,'Berat');assert.equal(period.status,'Kategori acuan Hasil pairing; rincian periode belum tersedia')
   for(const key of numericFields)assert.equal(period[key],null,key)
   for(const key of ['categoryFrequency','categoryDeposit','categoryTime'])assert.equal(period[key],'')
   assert.ok(Object.values(period).every(value=>typeof value!=='number'))
  }
  const findings=result.audits.filter(a=>a.type==='missing-transaction-details')
  assert.equal(findings.length,1);assert.equal(findings[0].row,4)
  assert.match(findings[0].message,/frekuensi 99 dan nominal Rp9000000/)
  assert.match(findings[0].message,/Tanggal transaksi tidak tersedia/)
  assert.match(findings[0].message,/Kategori akhir asli Berat dari Hasil pairing digunakan hanya sebagai acuan keseluruhan/)
  assert.equal(result.audits.some(a=>a.type==='historical-frequency-difference'||a.type==='historical-amount-difference'),false)
 }
})

test('master coverage is counted before date filters and never inferred from another NIK',()=>{
 const excluded=source([tx('2024-12-01'),tx('2025-01-10'),tx('2026-01-01')])
 const rules={start:'2025-02-01',cutoff:'2025-08-01',end:'2025-11-30'}
 const result=analyzeDiscipline(excluded,rules),row=result.rows[0]
 assert.equal(row.sourceTransactionCount,3);assert.equal(row.missingTransactionDetails,false);assert.equal(row.categoryFromPairing,false)
 assert.equal(result.stats.outsideRange,3)
 for(const period of [row.before,row.after]){assert.equal(period.frekuensi,0);assert.equal(period.nominal,0);assert.equal(period.kategori,'Tidak ada transaksi')}
 assert.equal(result.stats.before.missingDetails,0);assert.equal(result.stats.before.knownDataOnly,false)
 assert.equal(result.audits.some(a=>a.type==='missing-transaction-details'),false)
 const undated=analyzeDiscipline(source([tx(null)])).rows[0]
 assert.equal(undated.sourceTransactionCount,1);assert.equal(undated.missingTransactionDetails,false)
 assert.equal(undated.before.kategori,'Perlu validasi');assert.equal(undated.after.kategori,'Perlu validasi')
 const unmatched=analyzeDiscipline(source([tx('2025-09-30',36000,100000,{nik:other})]),rules)
 assert.equal(unmatched.rows[0].sourceTransactionCount,0);assert.equal(unmatched.rows[0].missingTransactionDetails,true)
 assert.equal(unmatched.stats.unmatchedTransactions,1)
})

test('missing detail requires positive historical frequency or amount, independent of status and active period',()=>{
 for(const history of [null,{frekuensi:0,nominal:0}]){
  const data=source([]);data.history[nik]=history
  const row=analyzeDiscipline(data).rows[0]
  assert.equal(row.sourceTransactionCount,0);assert.equal(row.missingTransactionDetails,false);assert.equal(row.categoryFromPairing,false)
  assert.equal(row.before.kategori,'Tidak ada transaksi');assert.equal(row.before.frekuensi,0)
 }
 for(const counts of [{frekuensi:1,nominal:0},{frekuensi:0,nominal:1000}]){
  const data=source([]);Object.assign(data.history[nik],counts)
  const result=analyzeDiscipline(data,{start:'2025-02-01',cutoff:'2025-08-01',end:'2025-11-30'})
  assert.equal(result.rows[0].missingTransactionDetails,true)
  assert.equal(result.rows[0].before.frekuensi,null);assert.equal(result.rows[0].after.nominal,null)
 }
})

test('summaries total only available data and count unavailable records without NaN or false zero categories',()=>{
 const third='3234567890123456',data=source([tx('2025-09-30',36000,100000),tx('2025-10-01',36000,200000)])
 data.people.push({...person,nik:other,hasilPenilaian:'Tidak Terbukti'},{...person,nik:third})
 data.history[other]={...data.history[nik]};data.history[third]={frekuensi:0,nominal:0}
 const result=analyzeDiscipline(data)
 for(const [period,nominal] of [['before',100000],['after',200000]]){
  const summary=result.stats[period]
  assert.equal(summary.frekuensi,1);assert.equal(summary.nominal,nominal);assert.equal(summary.aktif,1)
  assert.equal(summary.missingDetails,1);assert.equal(summary.knownDataOnly,true)
  assert.equal(summary.categories['Rincian transaksi belum tersedia'],0)
  assert.equal(summary.categories['Tidak ada transaksi'],1);assert.equal(summary.categories.Ringan,1)
  assert.equal(summary.categories.Berat,1)
  assert.equal(summary.referenceCount,1);assert.deepEqual(summary.referenceCategories,{Ringan:0,Sedang:0,Berat:1})
  assert.equal(Object.values(summary.categories).reduce((sum,value)=>sum+value,0),3)
  assert.ok(Object.values(summary.categories).every(Number.isFinite))
 }
 const onlyMissing=analyzeDiscipline(source([]))
 assert.equal(onlyMissing.stats.before.frekuensi,0);assert.equal(onlyMissing.stats.before.nominal,0)
 assert.equal(onlyMissing.stats.before.missingDetails,1);assert.equal(onlyMissing.stats.before.knownDataOnly,true)
 assert.equal(onlyMissing.stats.before.categories['Tidak ada transaksi'],0)
 assert.equal(onlyMissing.stats.before.categories.Berat,1);assert.equal(onlyMissing.stats.before.referenceCount,1)
})

test('all valid original final categories are references only and never recalculated with current parameters',()=>{
 for(const category of ['Ringan','Sedang','Berat']){
  const data=source([])
  data.history[nik]={...data.history[nik],kategori:category,status:'Sumber asli Sekjen',scoreFrequency:12,scoreDeposit:6,scoreTime:7,total:25}
  const original=structuredClone(data)
  const result=analyzeDiscipline(data,{weightFrequency:50,weightDeposit:30,weightTime:20,categoryMedium:1,categoryHigh:2}),row=result.rows[0]
  assert.equal(row.categoryFromPairing,true);assert.equal(row.missingTransactionDetails,true)
  for(const period of ['before','after']){
   assert.equal(row[period].kategori,category)
   assert.equal(row[period].total,null);assert.equal(row[period].frekuensi,null);assert.equal(row[period].nominal,null)
   assert.equal(row[period].scoreFrequency,null);assert.equal(row[period].scoreDeposit,null);assert.equal(row[period].scoreTime,null)
   assert.equal(result.stats[period].categories[category],1)
   assert.equal(result.stats[period].referenceCount,1)
   assert.equal(result.stats[period].referenceCategories[category],1)
   assert.equal(result.stats[period].missingDetails,1);assert.equal(result.stats[period].knownDataOnly,true)
  }
  assert.deepEqual(row.historical,original.history[nik]);assert.deepEqual(data,original)
 }
})

test('missing detail with absent, unrecognized or invalid historical final category does not create a reference',()=>{
 for(const change of [{kategori:undefined},{kategori:''},{kategori:'ringan'},{kategori:'Perlu validasi'},{kategori:'Berat',status:'Perlu validasi'}]){
  const data=source([]);Object.assign(data.history[nik],change)
  const original=structuredClone(data),result=analyzeDiscipline(data),row=result.rows[0]
  assert.equal(row.missingTransactionDetails,true);assert.equal(row.categoryFromPairing,false)
  for(const period of ['before','after']){
   assert.equal(row[period].kategori,'Rincian transaksi belum tersedia')
   assert.equal(row[period].status,'Rincian transaksi belum tersedia')
   assert.equal(row[period].frekuensi,null);assert.equal(row[period].total,null)
   assert.equal(result.stats[period].referenceCount,0)
   assert.deepEqual(result.stats[period].referenceCategories,{Ringan:0,Sedang:0,Berat:0})
   assert.equal(result.stats[period].categories['Rincian transaksi belum tersedia'],1)
  }
  assert.match(result.audits.find(a=>a.type==='missing-transaction-details').message,/belum dapat dijadikan acuan/)
  assert.deepEqual(data,original)
 }
})
