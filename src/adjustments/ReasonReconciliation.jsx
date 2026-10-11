import React from 'react'
import {MONTHS,REASONS} from './model.js'

const labels={...REASONS,UNCHANGED:'Tidak berubah nominal',MISSING:'Nominal belum lengkap'}
const money=v=>'Rp '+Number(v).toLocaleString('id-ID',{maximumFractionDigits:2})
const rounded=v=>'Rp '+Math.round(v).toLocaleString('id-ID')
const count=v=>Number(v).toLocaleString('id-ID')
export function comparisonRows(data){
 const groups=data.retained.reasonGroups||[]
 const delta=keys=>groups.filter(g=>keys.includes(g.values[0])).reduce((n,g)=>n+g.delta,0)
 return [
  ['Awal temuan',data.initial.initial,2954469439],
  ['Dipisahkan ke SP2D 2026',data.moved.initial,317985032],
  ['Awal setelah pemutakhiran SP2D',data.retained.initial,2636484407],
  ['Pengurangan cuti / absensi',-delta(['MATERNITY','LEAVE','ATTENDANCE']),54069022],
  ['Pengurangan WIT',-delta(['WIT']),6023720],
  ['Pengurangan WITA',-delta(['WITA']),44467814],
  ['Pengurangan tendik',-delta(['TENDIK']),430062273],
  ['Pengurangan bersih seluruh alasan',data.retained.initial-data.retained.final,534622828],
  ['Final kelompok data awal',data.retained.final,2101861579],
  ['Data tambahan',data.added.final,430072161],
  ['Total final SP2D update 2025',data.total.final,2531933740]
 ]
}
export default function ReasonReconciliation({data,year,onSelect,base}){
 const groups=data.retained.reasonGroups
 if(!groups)return <p className="notice amber-notice">Rekap alasan memerlukan versi terbaru fungsi baca Supabase.</p>
 const ordered=[...groups].sort((a,b)=>MONTHS.indexOf(a.values[1])-MONTHS.indexOf(b.values[1])||a.values[0].localeCompare(b.values[0]))
 return <div className="adjustment-reconciliation"><h3>Rekap alasan utama per bulan · kelompok data awal SP2D {year}</h3>
  <p>Seluruh kelompok: <b>{count(data.retained.rows)} data / {count(data.retained.people)} SDM unik</b>. Awal {money(data.retained.initial)} → final {money(data.retained.final)}; selisih {money(data.retained.delta)}.</p>
  <p>Setiap baris masuk satu alasan utama. Keterangan spesifik kolom S didahulukan, lalu keterangan “cek selisih”. Jika masih terdapat beberapa alasan, urutannya tendik, cuti melahirkan, cuti, WIT, WITA, lalu absensi. Alasan tambahan tetap tersedia di BNBA; nominal workbook tidak diubah.</p>
  {data.retained.sourcePriorityGroups?.length>0&&<div className="notice demo-notice"><div><b>Penjelasan atribusi alasan dari sumber workbook</b>{data.retained.sourcePriorityGroups.map(g=><p key={g.values[0]}>{g.values[0]}: {count(g.rows)} data, selisih nominal {money(g.delta)}. Alasan utama mengikuti keterangan spesifik kolom S; alasan lain tetap dicatat.<br/><button className="btn secondary" onClick={()=>onSelect({...base,month:g.values[0],sourcePriority:'changed'})}>Lihat BNBA atribusi kolom S</button></p>)}</div></div>}
  <div className="table-scroll"><table><thead><tr><th>Bulan / alasan utama</th><th>Data / SDM unik bulan ini</th><th>Awal</th><th>Pengurangan</th><th>Penambahan</th><th>Final</th><th>Detail</th></tr></thead><tbody>{ordered.map(g=><tr key={g.values.join('-')}><td>{g.values[1]}<br/><b>{labels[g.values[0]]||g.values[0]}</b></td><td>{count(g.rows)} / {count(g.people)}<small>{count(g.automaticRows)} alasan utama otomatis</small></td><td>{money(g.initial)}{g.missingInitial>0&&<small>{count(g.missingInitial)} kosong</small>}</td><td>{money(g.reduction)}</td><td>{money(g.increase)}</td><td>{money(g.final)}{g.missingFinal>0&&<small>{count(g.missingFinal)} kosong</small>}</td><td><button className="btn secondary" onClick={()=>onSelect({...base,month:g.values[1],primaryReason:g.values[0]})}>Lihat BNBA</button></td></tr>)}</tbody></table></div>
  <p>Pengurangan dan penambahan dijumlahkan terpisah dari setiap baris. “Otomatis” berarti alasan utama ditentukan aturan dari status/cuti/wilayah, bukan keterangan perubahan eksplisit. SDM unik antarbulan dapat berulang dan tidak boleh dijumlahkan. Nilai kosong tetap kosong dan selisihnya tidak dihitung.</p>
  {year===2025&&<><h3>Pencocokan dengan berita acara verifikasi 8 September 2026</h3><div className="table-scroll"><table><thead><tr><th>Komponen</th><th>Workbook (rupiah bulat)</th><th>Berita acara</th><th>Selisih workbook − BA</th><th>Hasil</th></tr></thead><tbody>{comparisonRows(data).map(([label,actual,reference])=>{const difference=Math.round(actual)-reference;return <tr key={label}><td>{label}</td><td>{rounded(actual)}</td><td>{rounded(reference)}</td><td>{rounded(difference)}</td><td><span className={'pill '+(difference===0?'slate':'amber')}>{difference===0?'Sesuai':'Berbeda'}</span></td></tr>})}</tbody></table></div><p>Sumber acuan: PDF berita acara, halaman 6–10, tabel 3–11. Kategori cuti/absensi menggabungkan cuti melahirkan, cuti, dan absensi untuk pencocokan. BA memuat rekonsiliasi pembulatan +Rp1; nilai sumber tidak diubah untuk menyamakan kategori.</p><p>Perbedaan kategori dapat berasal dari aturan pengelompokan atau keterangan sumber. Gunakan BNBA untuk menelusuri alasan utama, tambahan, serta alasan otomatis berdasarkan wilayah.</p></>}
 </div>
}
