import React,{useMemo,useState} from 'react'
import {reviewStoredNonactive,prepareStatus,commitStatus} from './nonactiveStatus.js'
import NonactivePreview from '../import/NonactivePreview.jsx'

export default function NonactiveStatusReview({snapshot,source,client,onSaved}){
 const [batch,setBatch]=useState(null),[page,setPage]=useState(0),[lastSeen,setLastSeen]=useState(0),[reason,setReason]=useState(''),[approved,setApproved]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[done,setDone]=useState(false),[savedCount,setSavedCount]=useState(0)
 const matched=useMemo(()=>snapshot?.source==='database'&&source?.nonactive?reviewStoredNonactive(snapshot,source):null,[snapshot,source])
 if(!matched)return <section className="panel"><h2>Rekonsiliasi status ke master tersimpan</h2><p>Muat master tersimpan dan periksa workbook yang memuat sheet master tidak aktif.</p></section>
 const eligible=matched.review.filter(r=>r.matchStatus==='Cocok').length
 const run=async fn=>{setBusy(true);setError('');try{await fn()}catch(e){setError(`Belum berhasil dikonfirmasi. Muat ulang master dan tinjau kembali sebelum mencoba. ${e.message||''}`)}finally{setBusy(false)}}
 return <section aria-label="Rekonsiliasi status SDM ke master tersimpan">
  <h2>Rekonsiliasi terhadap master tersimpan — revisi {snapshot.revision}</h2>
  <NonactivePreview summary={matched.summary} review={matched.review} fileName={source.fileName}/>
  <section className="panel"><p>{eligible} NIP dan nama cocok dengan master tersimpan. Nama berbeda, NIP ambigu, dan data belum cocok tidak disertakan. Catatan yang tidak muncul pada file tidak diubah menjadi aktif.</p>
   {!client&&<p>Penyimpanan status belum diaktifkan. Rekonsiliasi dan ekspor tinjauan dapat dilakukan sekarang.</p>}
   {!batch&&!done&&<button className="btn secondary" disabled={!client||busy||!eligible||eligible>500||matched.summary.issues.length>0} onClick={()=>run(async()=>{const result=await prepareStatus(client,snapshot,source,matched.review);if(result.committed){setDone(true);setSavedCount(result.count);await onSaved?.();return}setBatch(result);setPage(0);setLastSeen(0)})}>Siapkan batch status nonaktif</button>}
   {batch&&!done&&<><p>{batch.count} status diperiksa di server. Tinjau seluruh halaman sebelum menyimpan. Nominal kewajiban dan pembayaran tidak diubah.</p><div className="table-scroll"><table><thead><tr><th>NIP / Nama</th><th>Bank</th><th>Status sebelumnya</th><th>Status sumber</th><th>Tanggal sumber (mentah)</th></tr></thead><tbody>{batch.review.slice(page*15,page*15+15).map(r=><tr key={r.nip}><td>{r.nip}<small>{r.nama}</small></td><td>{r.bank}</td><td>{r.before||'Belum ditandai nonaktif'}</td><td>{r.after}</td><td>{String(r.endDateRaw??'—')}</td></tr>)}</tbody></table></div><div className="pagination"><span>Halaman {page+1} / {Math.ceil(batch.count/15)}</span><div><button className="btn secondary" disabled={busy||!page} onClick={()=>setPage(p=>p-1)}>Sebelumnya</button><button className="btn secondary" disabled={busy||(page+1)*15>=batch.count} onClick={()=>{const next=page+1;setPage(next);setLastSeen(p=>Math.max(p,next))}}>Berikutnya</button></div></div><label className="form-field"><span>Alasan penetapan status</span><textarea disabled={busy} value={reason} onChange={e=>setReason(e.target.value)}/></label><label><input type="checkbox" disabled={busy||lastSeen<Math.ceil(batch.count/15)-1} checked={approved} onChange={e=>setApproved(e.target.checked)}/> Saya telah meninjau seluruh status dan sumbernya.</label><div className="toolbar"><button className="btn primary" disabled={busy||!approved||reason.trim().length<3} onClick={()=>run(async()=>{const result=await commitStatus(client,batch.id,reason);setSavedCount(result.saved);setDone(true);await onSaved?.()})}>Simpan status nonaktif</button><button className="btn secondary" disabled={busy} onClick={()=>{setBatch(null);setApproved(false);setReason('')}}>Batalkan tinjauan</button></div></>}
   {done&&<p role="status">{savedCount} status telah disimpan. Saldo tetap mengikuti transaksi Master & Progres.</p>}
   {error&&<p role="alert" className="notice red-notice">{error}</p>}
  </section>
 </section>
}
