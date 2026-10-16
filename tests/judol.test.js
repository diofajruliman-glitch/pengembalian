import test from 'node:test'
import assert from 'node:assert/strict'
import {zipSync,strToU8} from 'fflate'
import {parseJudol,summarizeJudol,parseAssessment,mergeAssessment,filterJudol} from '../src/judol/workbook.js'
const labels=['NIK','Nama ASN','Kategori Historis','Frek Pasca ASN','Deposit Pasca ASN','Dalam Jam','Luar Jam','Kategori Pasca (SIMULASI)','Kategori Frek','Nilai Frek','Kategori Deposit','Nilai Deposit','Kategori Waktu','Nilai Waktu','TOTAL NILAI','Audit Historis','Status Verifikasi']
const data=['1234567890123456','ASN Uji','Sedang',1,100000,0,1,'Ringan','Rendah',12,'Rendah',6,'Luar jam kerja',3,21,'Sesuai angka asal','SIMULASI']
function fixture(records,prefixed=false){
 const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;')
 const xml=[labels,...records].map((row,i)=>`<row r="${i+1}">${row.map((v,j)=>`<c r="${String.fromCharCode(65+j)}${i+1}"${typeof v==='string'?' t="inlineStr"':''}>${typeof v==='string'?`<is><t>${esc(v)}</t></is>`:`<v>${v}</v>`}</c>`).join('')}</row>`).join('')
 return zipSync(Object.fromEntries(Object.entries({'xl/workbook.xml':'<workbook><sheets><sheet name="Penilaian Pasca ASN" r:id="r1"/></sheets></workbook>','xl/_rels/workbook.xml.rels':'<Relationships><Relationship Id="r1" Target="worksheets/sheet1.xml"/></Relationships>','xl/worksheets/sheet1.xml':`<worksheet><sheetData>${xml}</sheetData></worksheet>`}).map(([k,v])=>[k,strToU8(prefixed?v.replace(/<(\/?)([A-Za-z]+)/g,'<$1x:$2'):v)])))
}
test('reads namespace-prefixed XML used by the source workbook',()=>{
 assert.equal(parseJudol(fixture([data],true)).rows.length,1)
})
test('imports stored results and aggregates matched ASN',()=>{
 const {rows}=parseJudol(fixture([data]));assert.equal(rows[0].nik,data[0]);const s=summarizeJudol(rows);assert.equal(s.nominal,100000);assert.equal(s.aktif,1);assert.equal(s.categories.Ringan,1)
})
test('rejects duplicate and numeric NIK',()=>{
 assert.throws(()=>parseJudol(fixture([data,data])),/duplikat/)
 assert.throws(()=>parseJudol(fixture([[1234567890123456,...data.slice(1)]])),/teks 16 digit/)
})
test('rejects missing formula result and invalid category',()=>{
 const invalid=[...data];invalid[3]='';assert.throws(()=>parseJudol(fixture([invalid])),/hasil rumus/)
 invalid[3]=1;invalid[7]='Lulus';assert.throws(()=>parseJudol(fixture([invalid])),/kategori tidak valid/)
})
function assessmentFixture(records){
 const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;')
 const sheet=[['NIK','HASIL PENILAIAN','KETERANGAN'],...records].map((r,i)=>`<row r="${i+1}">${r.map((v,j)=>`<c r="${['C','T','U'][j]}${i+1}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`).join('')}</row>`).join('')
 return zipSync({'xl/workbook.xml':strToU8('<workbook><sheet name="Data Olah" r:id="r1"/></workbook>'),'xl/_rels/workbook.xml.rels':strToU8('<Relationships><Relationship Id="r1" Target="worksheets/sheet1.xml"/></Relationships>'),'xl/worksheets/sheet1.xml':strToU8(`<worksheet>${sheet}</worksheet>`)})
}
test('assessment preserves explicit negative results and leaves Pilih unresolved',()=>{
 const a=parseAssessment(assessmentFixture([[data[0],' tidak terbukti ','Catatan sumber'],['2234567890123456','Pilih','']]))
 assert.equal(a.rows[0].hasilPenilaian,'Tidak Terbukti');assert.equal(a.rows[1].hasilPenilaian,'Belum ditetapkan')
 const merged=mergeAssessment([{nik:data[0],nama:'Uji',kategori:'Berat',nominal:123},{nik:'3234567890123456',nama:'Lain',kategori:'Ringan'}],a)
 assert.equal(merged.rows[0].nominal,123);assert.equal(merged.rows[0].keterangan,'Catatan sumber');assert.equal(merged.matched,1);assert.equal(merged.unmatched,1)
 assert.equal(merged.rows[1].hasilPenilaian,'Tidak ditemukan di Data Olah')
 assert.equal(filterJudol(merged.rows,{category:'Berat',assessment:'Tidak Terbukti',search:'Uji'}).length,1)
 assert.equal(filterJudol(merged.rows,{category:'Ringan',assessment:'Tidak Terbukti'}).length,0)
})
test('assessment refuses duplicate NIK and unknown outcomes',()=>{
 assert.throws(()=>parseAssessment(assessmentFixture([[data[0],'Terbukti',''],[data[0],'Tidak Terbukti','']])),/duplikat/)
 assert.throws(()=>parseAssessment(assessmentFixture([[data[0],'Tidak diketahui','']])),/tidak dikenali/)
})
