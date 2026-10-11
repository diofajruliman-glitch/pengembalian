import React,{useEffect,useState} from 'react'
import ReasonReconciliation from './ReasonReconciliation.jsx'

export const chronologyFilters = year => ({
 initial:{sp2dOld:year,bpk:'TAHAP 1 SEND BPK'},
 retained:{sp2dOld:year,sp2dUpdated:year,bpk:'TAHAP 1 SEND BPK'},
 moved:{sp2dOld:year,sp2dUpdated:year+1,bpk:'TAHAP 1 SEND BPK'},
 correction:{sp2dOld:year,sp2dUpdated:year,bpk:'TAHAP 1 SEND BPK',change:'amount'},
 added:{sp2dUpdated:year,bpk:'BELUM MASUK BPK'},
 total:{sp2dUpdated:year}
})
const money=v=>'Rp '+Math.round(v).toLocaleString('id-ID')

export default function ChronologyRecap({api,version,refresh,onSelect}){
 const [year,setYear]=useState(2025),[data,setData]=useState(null),[error,setError]=useState('')
 const presets=chronologyFilters(year)
 useEffect(()=>{
  const controller=new AbortController();setData(null);setError('')
  Promise.all(Object.entries(chronologyFilters(year)).map(async([key,filters])=>{const result=await api.query(filters,0,controller.signal);return [key,{...result.summary,reasonGroups:result.recaps?.reasons,sourcePriorityGroups:result.recaps?.sourcePriority}]}))
   .then(entries=>setData(Object.fromEntries(entries))).catch(e=>{if(e.name!=='AbortError')setError(e.message)})
  return()=>controller.abort()
 },[api,version,refresh,year])
 const rows=data?[
  ['initial',`Data awal pengembalian Tukin · STATUS SP2D ${year} · TAHAP 1 SEND BPK`,data.initial.initial],
  ['moved',`Data awal yang berpindah ke SP2D update ${year+1} (dipisahkan dari rekap ${year})`,-data.moved.initial],
  ['retained',`Nilai awal setelah pemutakhiran SP2D ${year}`,data.retained.initial],
  ['correction','Penyesuaian absensi/cuti, WIT, WITA, dan tendik · final − awal',data.retained.final-data.retained.initial],
  ['retained',`Final hasil verifikasi kelompok data awal SP2D ${year}`,data.retained.final],
  ['added',`Data tambahan SP2D update ${year} · BELUM MASUK BPK`,data.added.final],
  ['total',`Total final pengembalian SP2D update ${year}`,data.total.final]
 ]:[]
 return <section className="panel table-panel adjustment-recap adjustment-chronology"><div className="panel-heading"><div><h2>Rekap alur perubahan pengembalian</h2><p>Rekap seluruh workbook. Pilih kelompok untuk menampilkan BNBA dan riwayat per SDM.</p></div><label className="form-field"><span>Tahun rekap SP2D</span><select aria-label="Tahun rekap SP2D" value={year} onChange={e=>setYear(Number(e.target.value))}><option value={2025}>2025</option><option value={2026}>2026</option></select></label></div>
  {error&&<p role="alert" className="notice red-notice">{error}</p>}
  {!data&&!error&&<p role="status">Menghitung rekap alur dari workbook…</p>}
  {data&&<><div className="table-scroll"><table><thead><tr><th>No</th><th>Uraian perubahan</th><th>Nilai (Rp)</th><th>Detail workbook</th></tr></thead><tbody>{rows.map(([key,label,amount],i)=><tr key={i}><td>{i+1}</td><td>{label}</td><td><b>{money(amount)}</b></td><td><button className="btn secondary" onClick={()=>onSelect(presets[key],label)}>Lihat BNBA</button></td></tr>)}</tbody></table></div><p className="adjustment-recap-note">Nominal ditampilkan dalam rupiah bulat; perhitungan menggunakan presisi workbook. Tahun 2026 yang dipisahkan tetap menjadi kewajiban dalam kelompok tahun tersebut. Rekap ini tidak mengikuti filter BNBA di bawah.</p>
   <div className="adjustment-recap-note"><b>Telusuri alasan penyesuaian:</b><div className="adjustment-recap-options">{[['MATERNITY','Cuti melahirkan'],['LEAVE','Cuti'],['WIT','WIT'],['WITA','WITA'],['TENDIK','Tendik'],['ATTENDANCE','Absensi eSDM / e-Absensi']].map(([reason,label])=><button className="btn secondary" key={reason} onClick={()=>onSelect({...presets.correction,reason},label)}>{label}</button>)}</div><small>Satu baris dapat memiliki beberapa alasan. Nominal antarfilter alasan tidak boleh dijumlahkan sebagai kategori yang saling terpisah.</small></div>
   {Math.abs(data.retained.final+data.added.final-data.total.final)>0.5&&<p className="notice amber-notice">Total tahun update juga mencakup kelompok lain di luar data awal dan tambahan di atas. Gunakan “Total final” untuk melihat seluruh rinciannya.</p>}
   {year===2025&&<div className="adjustment-payroll"><h3>Pembagian berdasarkan payroll bank · rekap dokumen 9 September 2026</h3><div className="table-scroll"><table><thead><tr><th>Bank</th><th>Kewajiban pengembalian</th></tr></thead><tbody><tr><td>Bank Mandiri</td><td>{money(2368241950)}</td></tr><tr><td>Bank BSI</td><td>{money(163691790)}</td></tr><tr><td><b>Total</b></td><td><b>{money(2531933740)}</b></td></tr></tbody></table></div><p>Angka bank berasal dari rekap dokumen. Workbook ini tidak memiliki kolom bank, sehingga filter BNBA per bank belum tersedia. Nilai ini adalah kewajiban, bukan realisasi setoran.</p></div>}
   <ReasonReconciliation data={data} year={year} onSelect={onSelect} base={presets.retained}/>
  </>}
 </section>
}
