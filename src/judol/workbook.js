import {openSnapshot} from '../import/xlsxSnapshot.js'

export const categories=['Berat','Sedang','Ringan','Perlu validasi','Tidak ada transaksi']
export const assessmentStatuses=['Terbukti','Tidak Terbukti','Belum ditetapkan','Tidak ditemukan di Data Olah']
export function parseAssessment(bytes){
 const sheet=openSnapshot(bytes,{normalizeNamespaces:true}).read('Data Olah')
 const normalize=v=>String(v??'').trim().replace(/\s+/g,' ').toUpperCase()
 const hi=sheet.findIndex(r=>normalize(r[2])==='NIK'&&normalize(r[19])==='HASIL PENILAIAN')
 if(hi<0)throw Error('Sheet Data Olah harus memiliki NIK di kolom C dan HASIL PENILAIAN di kolom T.')
 const rows=[],seen=new Set()
 for(const [offset,r] of sheet.slice(hi+1).entries()){
  if(r[2]===undefined||r[2]===null||r[2]===''){
   if(['TERBUKTI','TIDAK TERBUKTI'].includes(normalize(r[19])))throw Error(`Baris ${hi+offset+2}: hasil penilaian tanpa NIK.`)
   continue
  }
  const nik=r[2],raw=String(r[19]??'').trim(),value=normalize(raw)
  if(typeof nik!=='string'||!/^\d{16}$/.test(nik))throw Error(`Baris ${hi+offset+2}: NIK Data Olah wajib berupa teks 16 digit.`)
  if(seen.has(nik))throw Error(`Baris ${hi+offset+2}: NIK Data Olah duplikat.`)
  if(!['TERBUKTI','TIDAK TERBUKTI','PILIH',''].includes(value))throw Error(`Baris ${hi+offset+2}: HASIL PENILAIAN tidak dikenali. Periksa kolom T.`)
  seen.add(nik);rows.push({nik,hasilPenilaian:value==='TERBUKTI'?'Terbukti':value==='TIDAK TERBUKTI'?'Tidak Terbukti':'Belum ditetapkan',hasilAsli:raw,keterangan:String(r[20]??''),baris:hi+offset+2})
 }
 if(!rows.length)throw Error('Tidak ada NIK pada sheet Data Olah.')
 return {rows}
}
export function mergeAssessment(rows,assessment){
 const index=new Map(assessment.rows.map(r=>[r.nik,r])),ids=new Set(rows.map(r=>r.nik))
 return {rows:rows.map(r=>({...r,...(index.get(r.nik)||{hasilPenilaian:'Tidak ditemukan di Data Olah',hasilAsli:'',keterangan:'',baris:null})})),matched:rows.filter(r=>index.has(r.nik)).length,unmatched:assessment.rows.filter(r=>!ids.has(r.nik)).length}
}
export function filterJudol(rows,{category='',assessment='',search=''}={}){
 return rows.filter(r=>(!category||r.kategori===category)&&(!assessment||r.hasilPenilaian===assessment)&&(!search.trim()||`${r.nama} ${r.nik}`.toLowerCase().includes(search.trim().toLowerCase())))
}
const fields={nik:'NIK',nama:'Nama ASN',historis:'Kategori Historis',frekuensi:'Frek Pasca ASN',nominal:'Deposit Pasca ASN',dalam:'Dalam Jam',luar:'Luar Jam',kategori:'Kategori Pasca (SIMULASI)',kategoriFrekuensi:'Kategori Frek',nilaiFrekuensi:'Nilai Frek',kategoriDeposit:'Kategori Deposit',nilaiDeposit:'Nilai Deposit',kategoriWaktu:'Kategori Waktu',nilaiWaktu:'Nilai Waktu',total:'TOTAL NILAI',audit:'Audit Historis',status:'Status Verifikasi'}
export function parseJudol(bytes){
 const book=openSnapshot(bytes,{normalizeNamespaces:true}),sheet=book.read('Penilaian Pasca ASN')
 const headerIndex=sheet.findIndex(row=>Object.values(fields).every(label=>row.includes(label)))
 if(headerIndex<0)throw Error('Header Penilaian Pasca ASN tidak sesuai. Gunakan workbook analisis hasil pairing yang lengkap.')
 const header=sheet[headerIndex],seen=new Set(),rows=[]
 for(const [offset,values] of sheet.slice(headerIndex+1).entries()){
  if(!values.some(v=>v!==undefined&&v!==null&&v!==''))continue
  const row=Object.fromEntries(Object.entries(fields).map(([key,label])=>[key,values[header.indexOf(label)]??null]))
  const line=headerIndex+offset+2
  if(typeof row.nik!=='string'||!/^\d{16}$/.test(row.nik))throw Error(`Baris ${line}: NIK wajib berupa teks 16 digit agar presisinya terjaga.`)
  if(seen.has(row.nik))throw Error(`Baris ${line}: NIK duplikat. Periksa workbook sumber.`)
  if(!row.nama||!categories.includes(row.kategori))throw Error(`Baris ${line}: nama atau kategori tidak valid. Pastikan hasil rumus sudah tersimpan di Excel.`)
  for(const key of ['frekuensi','nominal','dalam','luar'])if(typeof row[key]!=='number'||!Number.isFinite(row[key])||row[key]<0)throw Error(`Baris ${line}: ${fields[key]} tidak valid atau hasil rumus belum tersimpan.`)
  for(const key of ['frekuensi','dalam','luar'])if(!Number.isInteger(row[key]))throw Error(`Baris ${line}: jumlah transaksi harus bilangan bulat.`)
  for(const key of ['nilaiFrekuensi','nilaiDeposit','nilaiWaktu','total'])if(row[key]!==null&&(typeof row[key]!=='number'||!Number.isFinite(row[key])))throw Error(`Baris ${line}: skor tidak valid.`)
  seen.add(row.nik);rows.push(row)
 }
 if(!rows.length)throw Error('Tidak ada data ASN pada sheet penilaian.')
 return {rows}
}
export function summarizeJudol(rows){
 return rows.reduce((s,r)=>{s.total++;s.aktif+=r.frekuensi>0?1:0;s.frekuensi+=r.frekuensi;s.nominal+=r.nominal;s.dalam+=r.dalam;s.luar+=r.luar;s.categories[r.kategori]++;return s},{total:0,aktif:0,frekuensi:0,nominal:0,dalam:0,luar:0,categories:Object.fromEntries(categories.map(c=>[c,0]))})
}
