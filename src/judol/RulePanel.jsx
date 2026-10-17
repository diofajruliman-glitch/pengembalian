import React,{useState} from 'react'
import {DEFAULT_RULES,validateRules} from './analysis.js'

const fields=[
 ['start','Awal cakupan transaksi','date'],['cutoff','Mulai sesudah ASN (inklusif)','date'],['end','Akhir cakupan transaksi','date'],
 ['workStart','Jam mulai kerja','time'],['workEnd','Jam selesai Senin–Kamis','time'],['fridayEnd','Jam selesai Jumat','time'],
 ['frequencyMedium','Minimal frekuensi Sedang','number'],['frequencyHigh','Minimal frekuensi Tinggi','number'],
 ['depositMedium','Minimal deposit Sedang (Rp)','number'],['depositHigh','Minimal deposit Tinggi (Rp)','number'],
 ['categoryMedium','Minimal skor kategori Sedang','number'],['categoryHigh','Minimal skor kategori Berat','number'],
 ['weightFrequency','Bobot frekuensi (%)','number'],['weightDeposit','Bobot deposit (%)','number'],['weightTime','Bobot aktivitas (%)','number'],
 ['baseLow','Bobot kategori Rendah','number'],['baseMedium','Bobot kategori Sedang','number'],['baseHigh','Bobot kategori Tinggi','number'],
 ['timeOutside','Bobot aktivitas luar jam','number'],['timeInside','Bobot aktivitas dalam jam','number']
]
export default function RulePanel({rules,version,canImport,canCalculate,onCalculate,onRestoreSource,onDraftChange,onDeleteVersion,busy,archived}){
 const currentRules={...DEFAULT_RULES,...rules,missingTimePolicy:rules?.missingTimePolicy??'validate'}
 const [draft,setDraft]=useState(()=>currentRules),[error,setError]=useState('')
 function edit(patch){setDraft(d=>({...d,...patch}));onDraftChange?.()}
 const changed=JSON.stringify(draft)!==JSON.stringify(currentRules)
 function calculate(e){e.preventDefault();setError('');try{validateRules(draft);onCalculate(draft)}catch(err){setError(err.message)}}
 return <section className="panel"><h2>Parameter & dasar penilaian — versi {version}</h2>
  <p><b>Acuan:</b> Nodin Sekjen Nomor 3513/I/KP.06.08/09/2026 tanggal 14 September 2026. Bobot tertulis: frekuensi 60%, deposit 30%, aktivitas 10%.</p>
  <div className="notice amber-notice"><span>Batas frekuensi, nominal, skor akhir, perlakuan waktu seimbang, dan jadwal kerja direkonstruksi dari pola Hasil Pairing atau asumsi analisis. Batas deposit Rp605.000/Rp2.545.000 bukan batas nominal yang tertulis dalam nota dinas. Perubahan parameter membuat hasil analisis baru dan tidak mengubah Hasil Pairing asli.</span></div>
  {archived&&<p>Dataset diarsipkan. Parameter dan hasil versi ini hanya dapat dibaca.</p>}
  <form onSubmit={calculate}><fieldset disabled={!canImport||archived||busy} className="discipline-fields"><legend>Konfigurasi analisis</legend><div className="discipline-rule-grid">{fields.map(([key,label,type])=><label key={key}>{label}<input type={type} step={type==='number'?'any':undefined} value={draft[key]??''} required onChange={e=>edit({[key]:type==='number'?(e.target.value===''?'':Number(e.target.value)):e.target.value})}/></label>)}<label>Aktivitas dalam/luar jam seimbang<select value={draft.tiePolicy} onChange={e=>edit({tiePolicy:e.target.value})}><option value="inside">Dalam jam — mengikuti pola Hasil Pairing</option><option value="outside">Luar jam — asumsi analisis</option><option value="validate">Perlu validasi</option></select></label><label>Format jam angka tanpa titik dua<select value={String(draft.compactTime)} onChange={e=>edit({compactTime:e.target.value==='true'})}><option value="true">HHMMSS, lengkapi nol di depan</option><option value="false">Hanya 6 digit; sisanya perlu validasi</option></select></label></div></fieldset>
   <label>Penanganan jam bertanda -<select value={draft.missingTimePolicy} disabled={!canImport||archived||busy} onChange={e=>edit({missingTimePolicy:e.target.value})}><option value="pairing">Ikuti kategori waktu Hasil pairing</option><option value="validate">Tetap perlu validasi waktu</option></select></label>
   <p>Tanda - dapat mengikuti kategori Dalam/Luar Jam Kerja pada Hasil pairing berdasarkan NIK. Jam asli tetap tersimpan sebagai -, dan jumlah transaksi yang menggunakan acuan ini dicatat. Jam lengkap tetap dibaca sesuai nilainya; format salah, kategori acuan yang tidak valid, atau pairing yang tidak tersedia tetap perlu validasi.</p>
   <p>Hari libur, shift, cuti, dan zona waktu belum dikoreksi otomatis. Skor tidak menetapkan keputusan hukuman.</p>
   {error&&<p className="notice red-notice" role="alert">{error}</p>}
   {!canCalculate&&<><p>Untuk menghitung ulang hasil tersimpan, lampirkan workbook sumber yang sama. SHA-256 diperiksa sebelum data dipasangkan. Transaksi mentah tidak disimpan online.</p>{canImport&&!archived&&<label className="btn secondary judol-upload">Lampirkan kembali sumber asli<input type="file" accept=".xlsx" disabled={busy} onChange={onRestoreSource} aria-label="Lampirkan sumber asli untuk hitung ulang"/></label>}</>}
   {canImport&&<div className="discipline-toolbar">{!archived&&<button type="submit" className="btn primary" disabled={busy||!canCalculate}>{busy?'Menghitung…':'Hitung pratinjau versi baru'}</button>}{!archived&&<button type="button" className="btn secondary" disabled={busy} onClick={()=>{setDraft(currentRules);onDraftChange?.();setError('')}}>Pulihkan parameter versi ini</button>}{onDeleteVersion&&<button type="button" className="btn secondary" style={{color:'#b91c1c'}} disabled={busy} onClick={onDeleteVersion}>Hapus versi {version}</button>}{changed&&!archived&&<span>Perubahan belum dihitung atau disimpan.</span>}</div>}
  </form>
 </section>
}
