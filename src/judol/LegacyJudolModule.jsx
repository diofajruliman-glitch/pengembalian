import React,{useMemo,useState} from 'react'
import {categories,parseJudol,summarizeJudol,assessmentStatuses,parseAssessment,mergeAssessment,filterJudol} from './workbook.js'
import './judol.css'

const number=value=>Number(value||0).toLocaleString('id-ID')
const money=value=>'Rp '+number(value)
const masked=nik=>nik.slice(0,4)+'••••••••'+nik.slice(-4)
export default function LegacyJudolModule({snapshot,onSnapshot,canImport}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[search,setSearch]=useState(''),[category,setCategory]=useState(''),[assessment,setAssessment]=useState(''),[page,setPage]=useState(0),[selected,setSelected]=useState(null)
 const rows=useMemo(()=>snapshot?.assessment?mergeAssessment(snapshot.rows,snapshot.assessment).rows:snapshot?.rows||[],[snapshot])
 const assessmentCounts=useMemo(()=>Object.fromEntries(assessmentStatuses.map(status=>[status,rows.filter(r=>r.hasilPenilaian===status).length])),[rows])
 const summary=useMemo(()=>summarizeJudol(rows),[rows])
 const filtered=useMemo(()=>filterJudol(rows,{category,assessment,search}),[rows,search,category,assessment])
 async function upload(event,kind='category'){
  const file=event.target.files?.[0];event.target.value='';if(!file)return
  setError('');setBusy(true)
  try{
   if(!file.name.toLowerCase().endsWith('.xlsx'))throw Error('Pilih file Excel .xlsx.')
   if(file.size>25*1024*1024)throw Error('Ukuran file maksimal 25 MB.')
   const bytes=new Uint8Array(await file.arrayBuffer())
   if(kind==='assessment'){
    if(!snapshot)throw Error('Unggah workbook kategorisasi terlebih dahulu.')
    const parsed=parseAssessment(bytes),merged=mergeAssessment(snapshot.rows,parsed)
    if(!merged.matched)throw Error('Tidak ada NIK Data Olah yang cocok dengan workbook kategorisasi.')
    onSnapshot({...snapshot,assessment:{...parsed,filename:file.name},matching:{matched:merged.matched,unmatched:merged.unmatched}})
   }else{
    const parsed=parseJudol(bytes)
    onSnapshot({...parsed,filename:file.name})
   }
   setSelected(null);setPage(0);setSearch('');setCategory('');setAssessment('')
  }catch(e){setError(e.message||'File tidak dapat dibaca.')}finally{setBusy(false)}
 }
 return <div className="judol-module">
  <div className="page-title"><div><span className="eyebrow">ANALISIS HASIL PAIRING</span><h1>Kategorisasi Disiplin ASN — hasil Excel lama</h1><p>Ringkasan dan penilaian pasca ASN dari workbook Excel.</p></div>{canImport&&<label className="btn primary judol-upload">{busy?'Membaca Excel…':'Unggah Excel'}<input type="file" accept=".xlsx" disabled={busy} onChange={e=>upload(e)} aria-label="Unggah Excel kategorisasi judol"/></label>}</div>
  <div className="notice amber-notice"><span><b>Hasil simulasi dari sumber Excel.</b> Kategori bukan penetapan pelanggaran. Ambang skor, kalender libur, shift, dan zona waktu perlu diverifikasi. Aplikasi membaca hasil rumus tersimpan dan tidak menghitung ulang Excel.</span></div>
  <p className="judol-note">File diproses di browser dan hanya tersedia selama sesi halaman ini. Data belum disimpan online atau dibagikan ke akun lain. Memuat ulang halaman atau keluar akan menghapus data sesi.</p>
  {error&&<div className="notice red-notice" role="alert">{error}</div>}
  {!snapshot?<section className="panel"><h2>Belum ada workbook yang dimuat</h2><p>{canImport?'Unggah workbook analisis yang memiliki sheet Penilaian Pasca ASN.':'Minta administrator memuat workbook. Penyimpanan bersama belum diaktifkan.'}</p></section>:<>
   <p><b>Sumber kategorisasi:</b> {snapshot.filename} · {number(rows.length)} ASN</p>
   <section className="panel"><h2>Hasil penilaian dari Data Olah</h2><p>Status Terbukti / Tidak Terbukti dibaca dari kolom T, dicocokkan berdasarkan NIK, dan ditampilkan bersama kategori simulasi.</p>{canImport&&<label className="btn secondary judol-upload">{busy?'Membaca Excel…':'Unggah Excel Data Olah'}<input type="file" accept=".xlsx" disabled={busy} onChange={e=>upload(e,'assessment')} aria-label="Unggah Excel Data Olah hasil penilaian"/></label>}
   {snapshot.assessment?<><p><b>Sumber hasil penilaian:</b> {snapshot.assessment.filename} · {number(snapshot.matching.matched)} NIK cocok · {number(snapshot.matching.unmatched)} NIK sumber di luar data kategorisasi.</p><div className="judol-categories">{assessmentStatuses.map(status=><button key={status} className={'btn '+(assessment===status?'primary':'secondary')} aria-pressed={assessment===status} onClick={()=>{setAssessment(assessment===status?'':status);setPage(0);setSelected(null)}}>{status}: {number(assessmentCounts[status])}</button>)}</div><p>Jumlah status di atas mencakup seluruh data kategorisasi. Nilai kosong atau “Pilih” berarti Belum ditetapkan.</p></>:<p>Belum dimuat. Unggah file Final Data Tarikan dengan sheet Data Olah setelah workbook kategorisasi.</p>}</section>
   <div className="judol-stats">{[['ASN dalam data',number(summary.total)],['ASN dengan transaksi',number(summary.aktif)],['Transaksi pasca ASN',number(summary.frekuensi)],['Nominal pasca ASN',money(summary.nominal)]].map(([label,value])=><section className="panel" key={label}><span>{label}</span><strong>{value}</strong></section>)}</div>
   <section className="panel"><h2>Kategori pasca ASN — simulasi</h2><div className="judol-categories">{categories.map(c=><button type="button" className={'btn '+(category===c?'primary':'secondary')} key={c} onClick={()=>{setCategory(category===c?'':c);setPage(0);setSelected(null)}} aria-pressed={category===c}>{c}: {number(summary.categories[c])}</button>)}</div><p>Dalam jam: {number(summary.dalam)} transaksi · Luar jam: {number(summary.luar)} transaksi. Ringkasan hanya mencakup ASN pada sheet penilaian.</p></section>
   <section className="panel"><div className="judol-filters"><label>Cari nama atau NIK<input value={search} onChange={e=>{setSearch(e.target.value);setPage(0);setSelected(null)}} placeholder="Cari ASN…"/></label><label>Kategori<select value={category} onChange={e=>{setCategory(e.target.value);setPage(0);setSelected(null)}}><option value="">Semua kategori</option>{categories.map(c=><option key={c}>{c}</option>)}</select></label><label>Hasil penilaian<select disabled={!snapshot.assessment} value={assessment} onChange={e=>{setAssessment(e.target.value);setPage(0);setSelected(null)}}><option value="">Semua hasil penilaian</option>{assessmentStatuses.map(status=><option key={status}>{status}</option>)}</select></label></div><p>{number(filtered.length)} ASN ditemukan · NIK disamarkan pada tampilan.</p>
    <div className="table-scroll"><table><thead><tr>{['Nama ASN / NIK','Historis','Frek. pasca','Nominal pasca','Skor','Kategori simulasi','Hasil penilaian','Rincian'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{filtered.slice(page*25,page*25+25).map(r=><tr key={r.nik}><td><b>{r.nama}</b><small>{masked(r.nik)}</small></td><td>{r.historis||'—'}</td><td>{number(r.frekuensi)}</td><td>{money(r.nominal)}</td><td>{r.total??'—'}</td><td>{r.kategori}</td><td>{r.hasilPenilaian||'Belum dimuat'}</td><td><button className="btn secondary" onClick={()=>setSelected(r)} aria-label={'Lihat rincian '+r.nama}>Lihat</button></td></tr>)}</tbody></table></div>
    {!filtered.length&&<p role="status">Tidak ada ASN yang sesuai filter.</p>}<div className="judol-pagination"><button className="btn secondary" disabled={page===0} onClick={()=>setPage(p=>p-1)}>Sebelumnya</button><span>Halaman {page+1} / {Math.max(1,Math.ceil(filtered.length/25))}</span><button className="btn secondary" disabled={(page+1)*25>=filtered.length} onClick={()=>setPage(p=>p+1)}>Berikutnya</button></div>
   </section>
   {selected&&<section className="panel judol-detail" aria-label="Rincian penilaian"><div className="panel-heading"><h2>Rincian: {selected.nama}</h2><button className="btn secondary" onClick={()=>setSelected(null)}>Tutup rincian</button></div><p>NIK {masked(selected.nik)} · {selected.kategori} · Total skor: {selected.total??'Belum ditetapkan'}</p><div className="table-scroll"><table><thead><tr><th>Komponen</th><th>Data / kategori</th><th>Nilai tertimbang</th></tr></thead><tbody><tr><td>Frekuensi (60%)</td><td>{number(selected.frekuensi)} · {selected.kategoriFrekuensi}</td><td>{selected.nilaiFrekuensi??'—'}</td></tr><tr><td>Deposit (30%)</td><td>{money(selected.nominal)} · {selected.kategoriDeposit}</td><td>{selected.nilaiDeposit??'—'}</td></tr><tr><td>Waktu (10%)</td><td>{selected.kategoriWaktu} · Dalam {selected.dalam} / Luar {selected.luar}</td><td>{selected.nilaiWaktu??'—'}</td></tr></tbody></table></div><p>Bobot di atas mengikuti acuan workbook awal; nilai yang ditampilkan berasal dari file yang diunggah.</p><p><b>Hasil penilaian (Data Olah, kolom T):</b> {selected.hasilPenilaian||'Belum dimuat'}<br/><b>Nilai asli sumber:</b> {selected.hasilAsli||'—'}<br/><b>Keterangan (kolom U):</b> {selected.keterangan||'—'}{selected.baris&&<><br/>Referensi: Data Olah, baris {selected.baris}</>}</p><p><b>Audit historis:</b> {selected.audit||'—'}<br/><b>Status verifikasi:</b> {selected.status||'—'}</p></section>}
  </>}
 </div>
}
