import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {filterDisciplineRows,getTransactionAvailability,hasPairingCategoryReference,MISSING_DETAILS_LABEL,PAIRING_CATEGORY_REFERENCE_STATUS} from '../src/judol/availability.js'
import {parseDisciplineWorkbook,analyzeDiscipline} from '../src/judol/analysis.js'
import {buildDisciplineSheets} from '../src/judol/export.js'

const rows=[
 {nik:'0000000000000001',nip:'00111',nama:'ASN Satu',hasilPenilaian:'Terbukti',sourceTransactionCount:2,missingTransactionDetails:false,before:{frekuensi:2,kategori:'Ringan'},after:{frekuensi:0,kategori:'Tidak ada transaksi'}},
 {nik:'0000000000000002',nip:'00222',nama:'ASN Dua',hasilPenilaian:'Tidak Terbukti',sourceTransactionCount:0,missingTransactionDetails:true,before:{frekuensi:null,kategori:MISSING_DETAILS_LABEL},after:{frekuensi:null,kategori:MISSING_DETAILS_LABEL}},
 {nik:'0000000000000003',nip:'00333',nama:'ASN Tiga',hasilPenilaian:'Terbukti',sourceTransactionCount:0,missingTransactionDetails:true,before:{frekuensi:null,kategori:MISSING_DETAILS_LABEL},after:{frekuensi:null,kategori:MISSING_DETAILS_LABEL}},
 {nik:'0000000000000004',nip:'00444',nama:'ASN Empat',hasilPenilaian:'Tidak Terbukti',sourceTransactionCount:3,missingTransactionDetails:false,before:{frekuensi:0,kategori:'Tidak ada transaksi'},after:{frekuensi:3,kategori:'Sedang'}},
 {nik:'0000000000000005',nama:'Belum Diputuskan',hasilPenilaian:'Belum ditetapkan',sourceTransactionCount:0,missingTransactionDetails:true,before:{kategori:MISSING_DETAILS_LABEL},after:{kategori:MISSING_DETAILS_LABEL}},
 {nik:'0000000000000006',nama:'Di Luar Populasi',hasilPenilaian:'Tidak ditemukan di Data Olah',sourceTransactionCount:1,before:{kategori:'Ringan'},after:{kategori:'Ringan'}}
]

test('focus includes both decided assessments and excludes unresolved statuses without changing source rows',()=>{
 const original=structuredClone(rows)
 assert.equal(filterDisciplineRows(rows).length,4)
 assert.deepEqual(filterDisciplineRows(rows,{assessment:'Terbukti'}).map(row=>row.nik),[rows[0].nik,rows[2].nik])
 assert.deepEqual(filterDisciplineRows(rows,{assessment:'Tidak Terbukti'}).map(row=>row.nik),[rows[1].nik,rows[3].nik])
 assert.equal(filterDisciplineRows(rows,{assessment:'Belum ditetapkan'}).length,0)
 assert.deepEqual(rows,original)
})

test('search, status, category period and availability combine over all matching rows',()=>{
 assert.deepEqual(filterDisciplineRows(rows,{availability:'missing'}).map(row=>row.nik),[rows[1].nik,rows[2].nik])
 assert.deepEqual(filterDisciplineRows(rows,{assessment:'Tidak Terbukti',availability:'missing',category:MISSING_DETAILS_LABEL,period:'before',search:'  asn dua '}).map(row=>row.nik),[rows[1].nik])
 assert.deepEqual(filterDisciplineRows(rows,{availability:'available',category:'Sedang',period:'after',search:'00444'}).map(row=>row.nik),[rows[3].nik])
 assert.equal(filterDisciplineRows(rows,{availability:'available',category:'Sedang',period:'before'}).length,0)
 assert.equal(filterDisciplineRows(rows,{assessment:'Terbukti',search:'0000000000000002'}).length,0)
})

test('source presence is independent of the active period and legacy zero results remain unrecorded',()=>{
 assert.equal(getTransactionAvailability(rows[0]),'available')
 assert.equal(getTransactionAvailability({...rows[0],before:{frekuensi:0},after:{frekuensi:0}}),'available')
 assert.equal(getTransactionAvailability({...rows[0],sourceTransactionCount:0}),'none')
 assert.equal(getTransactionAvailability({before:{frekuensi:0},after:{frekuensi:0},historical:{frekuensi:100}}),'unrecorded')
 assert.equal(getTransactionAvailability({before:{frekuensi:1},after:{frekuensi:0}}),'available')
 assert.equal(getTransactionAvailability({before:{kategori:MISSING_DETAILS_LABEL}}),'missing')
})

test('reference categories are filtered separately from data availability without changing assessment status',()=>{
 const reference={...rows[1],categoryFromPairing:true,historical:{kategori:'Ringan',status:'Sumber asli Sekjen'},before:{frekuensi:null,kategori:'Ringan',status:PAIRING_CATEGORY_REFERENCE_STATUS},after:{frekuensi:null,kategori:'Ringan',status:PAIRING_CATEGORY_REFERENCE_STATUS}}
 assert.equal(hasPairingCategoryReference(reference),true)
 assert.equal(getTransactionAvailability(reference),'missing')
 assert.equal(filterDisciplineRows([reference],{availability:'missing',category:'Ringan',assessment:'Tidak Terbukti'}).length,1)
 assert.equal(filterDisciplineRows([reference],{availability:'available',category:'Ringan'}).length,0)
 assert.equal(filterDisciplineRows([reference],{assessment:'Terbukti'}).length,0)
 assert.equal(hasPairingCategoryReference({...reference,categoryFromPairing:false}),false)
 assert.equal(hasPairingCategoryReference({...reference,historical:{kategori:'Ringan',status:'Perlu validasi'}}),false)
 assert.equal(hasPairingCategoryReference({...reference,historical:{kategori:'Tidak diketahui'}}),false)
})

test('actual workbook focuses 1357 decided SDM and exposes 16 proven plus4 negative missing records consistently through export',{skip:!process.env.DISCIPLINE_WORKBOOK_PATH},()=>{
 const source=parseDisciplineWorkbook(fs.readFileSync(process.env.DISCIPLINE_WORKBOOK_PATH))
 const result=analyzeDiscipline(source)
 const focused=filterDisciplineRows(result.rows),missing=filterDisciplineRows(result.rows,{availability:'missing'})
 assert.equal(result.rows.length,1359);assert.equal(focused.length,1357);assert.equal(missing.length,20)
 assert.equal(filterDisciplineRows(result.rows,{assessment:'Terbukti',availability:'missing'}).length,16)
 assert.equal(filterDisciplineRows(result.rows,{assessment:'Tidak Terbukti',availability:'missing'}).length,4)
 assert.equal(filterDisciplineRows(result.rows,{assessment:'Terbukti',availability:'available'}).length,1041)
 assert.equal(filterDisciplineRows(result.rows,{assessment:'Tidak Terbukti',availability:'available'}).length,296)
 assert.equal(filterDisciplineRows(result.rows,{category:MISSING_DETAILS_LABEL,period:'before'}).length,0)
 assert.equal(filterDisciplineRows(result.rows,{category:MISSING_DETAILS_LABEL,period:'after'}).length,0)
 for(const period of ['before','after']){
  assert.equal(filterDisciplineRows(result.rows,{category:'Ringan',availability:'missing',period}).length,16)
  assert.equal(filterDisciplineRows(result.rows,{category:'Sedang',availability:'missing',period}).length,1)
  assert.equal(filterDisciplineRows(result.rows,{category:'Berat',availability:'missing',period}).length,3)
 }
 assert.equal(missing.reduce((sum,row)=>sum+row.historical.frekuensi,0),444)
 assert.equal(missing.reduce((sum,row)=>sum+row.historical.nominal,0),38225279)
 for(const row of missing){
  assert.equal(row.sourceTransactionCount,0)
  assert.equal(hasPairingCategoryReference(row),true)
  assert.equal(row.before.kategori,row.historical.kategori);assert.equal(row.after.kategori,row.historical.kategori)
  assert.equal(row.before.frekuensi,null);assert.equal(row.after.nominal,null)
  assert.equal(row.audits.filter(a=>a.type==='missing-transaction-details').length,1)
 }
 const filters={assessment:'Tidak Terbukti',availability:'missing',period:'after',category:'',search:''}
 const selected=filterDisciplineRows(result.rows,filters)
 const sheets=buildDisciplineSheets({rows:selected,rules:result.rules,filters})
 const headers=sheets[0].data[0].map(cell=>cell.value)
 assert.equal(sheets[0].data.length,5)
 for(const row of sheets[0].data.slice(1)){
  assert.equal(row[headers.indexOf('Hasil penilaian Data Olah')].value,'Tidak Terbukti')
  assert.equal(row[headers.indexOf('Kelengkapan data')].value,MISSING_DETAILS_LABEL)
  assert.equal(row[headers.indexOf('Sebelum ASN — Frekuensi')].value,'')
  assert.equal(row[headers.indexOf('Sesudah ASN — Nominal deposit (Rp)')].value,'')
 }
 assert.equal(sheets[2].data.length,5)
 assert.ok(sheets[2].data.slice(1).every(row=>row[2].value==='Tidak Terbukti'))
})
