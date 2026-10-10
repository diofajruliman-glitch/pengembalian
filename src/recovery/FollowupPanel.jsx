import React,{useEffect,useMemo,useRef,useState} from 'react'
import {selectProgress,exportRows} from './progress.js'
import {followupIndex,loadFollowups,linkedFollowupProgress,prepareFollowup,saveFollowup} from './followups.js'
import {statusOf,targetStatuses} from '../import/sourceMetadata.js'
const rp=n=>'Rp '+Number(n||0).toLocaleString('id-ID')

export default function FollowupPanel({type,targets,snapshot,client,isAdmin}){
 const [targetNo,setTargetNo]=useState(''),[filters,setFilters]=useState({bank:'',year:'',kind:'',search:'',worklist:'nonactive',remainingOnly:true}),[picked,setPicked]=useState(new Set()),[page,setPage]=useState(0),[stored,setStored]=useState(null),[attempt,setAttempt]=useState(0),[loading,setLoading]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[review,setReview]=useState(null),[reviewPage,setReviewPage]=useState(0),[seen,setSeen]=useState(0),[reason,setReason]=useState(''),[approved,setApproved]=useState(false),[saving,setSaving]=useState(false)
 const [exporting,setExporting]=useState(false)
 const retry=useRef(null),index=useMemo(()=>followupIndex(snapshot),[snapshot]),target=targets.find(t=>String(t.no)===targetNo)
 const peopleByNip=useMemo(()=>new Map(index.people.map(p=>[p.nip,p])),[index])
 const linkedNips=useMemo(()=>new Set(stored?.rows.map(r=>r.nip)||[]),[stored])
 const scopedFilters=useMemo(()=>({...filters,targetStatuses:filters.worklist==='nonactive'?targetStatuses(target):[]}),[filters,target])
 const selected=useMemo(()=>selectProgress(filters.onlyLinked?{...index,people:index.people.filter(p=>linkedNips.has(p.nip))}:index,scopedFilters),[index,scopedFilters,linkedNips])
 const linked=useMemo(()=>stored?linkedFollowupProgress(index,stored.rows,scopedFilters):null,[index,stored,scopedFilters])
 const years=useMemo(()=>[...new Set(index.obligations.filter(o=>o.amount>0).map(o=>o.year))].sort(),[index])
 const statuses=useMemo(()=>[...new Set(index.people.map(p=>statusOf(p)))].sort(),[index])
 useEffect(()=>{setFilters(old=>({...old,status:''}));setPicked(new Set());setReview(null);retry.current=null;setReason('');setApproved(false);setPage(0);setMessage('')},[targetNo,snapshot?.revision])
 useEffect(()=>{
  let live=true;setStored(null);setError('')
  if(!client||!target||!snapshot||!isAdmin){setLoading(false);return}
  setLoading(true)
  loadFollowups(client,type,target,snapshot).then(data=>{if(live)setStored(data)}).catch(e=>{if(live)setError(e.message||'Penghubungan belum dapat dimuat.')}).finally(()=>{if(live)setLoading(false)})
  return()=>{live=false}
 },[client,type,targetNo,target?.updated_at,snapshot?.revision,isAdmin,attempt])
 if(!isAdmin)return null
 if(snapshot?.source!=='database')return <section className="panel"><h2>Penghubungan SDM ke master</h2><p>Muat Master & Progres tersimpan untuk melihat saldo pegawai dan menyiapkan penghubungan.</p></section>
 const label=type==='action'?'Rencana Aksi':'Bottleneck',totalPages=review?Math.ceil(review.nips.length/15):0
 const update=(key,value)=>{setFilters(old=>({...old,[key]:value,...(key==='worklist'?{remainingOnly:value==='nonactive'}:{})}));setPage(0);setPicked(new Set())}
 const makeReview=(operation,explicitNips)=>{
  setError('');setMessage('');setReason('');setApproved(false);retry.current=null
  try{
   if(operation==='add'&&filters.worklist!=='nonactive')throw Error('Penghubungan baru hanya untuk SDM nonaktif dengan sisa positif. Riwayat dan data perlu pemeriksaan tetap dapat dilihat.')
   const meta=stored?.meta||{masterRevision:snapshot.revision,revision:0,targetUpdatedAt:target?.updated_at||null}
   const nips=explicitNips||(operation==='add'?[...picked]:[...picked].filter(n=>stored?.rows.some(r=>r.nip===n)))
   const payload=prepareFollowup({snapshot,type,target,meta,nips,operation,requestId:crypto.randomUUID()})
   setReview(payload);setReviewPage(0);setSeen(0)
  }catch(e){setError(e.message)}
 }
 const save=async()=>{
  setSaving(true);setError('')
  try{
   if(!retry.current)retry.current={payload:review,reason}
   const result=await saveFollowup(client,retry.current.payload,retry.current.reason)
   setMessage(`${result.changed} penghubungan ${review.operation==='add'?'disimpan':'dilepas'}. Data kegiatan dan saldo master tetap utuh.`)
   setReview(null);setPicked(new Set());retry.current=null;setAttempt(v=>v+1)
  }catch(e){setError(`Belum berhasil dikonfirmasi. Ulangi permintaan yang sama, atau batalkan lalu muat ulang untuk tinjauan baru. ${e.message||''}`)}finally{setSaving(false)}
 }
 const exportLinked=async()=>{
  setExporting(true);setError('')
  try{
   const {default:write}=await import('write-excel-file/browser'),data=exportRows(linked)
   const context=[['Keterangan','Nilai'],['Jenis penghubungan',label],['Kegiatan / Kategori',type==='action'?target.kegiatan:target.kategori],['PIC',target.pic||''],['Deadline',target.deadline||''],['Status kegiatan',target.status||''],['Revisi master',snapshot.revision],['Revisi penghubungan',stored.meta.revision],['Filter bank',filters.bank||'Semua'],['Filter tahun SP2D',filters.year||'Semua'],['Filter jenis',filters.kind||'Semua'],['Pencarian',filters.search||''],['Catatan','Pengembalian tercatat belum sama dengan penerimaan terverifikasi. Pegawai dapat terkait beberapa kegiatan; saldo antar kegiatan tidak dijumlahkan.']]
   context.push(['Kelompok tindak lanjut',filters.worklist||'Semua master'],['Status sesuai kegiatan',scopedFilters.targetStatuses.join(', ')||'Semua'],['Filter status SDM (sumber)',filters.status||'Semua'],['Filter sisa menurut Excel',filters.remainingOnly?'Hanya sisa positif':'Semua saldo'])
   const cells=rows=>rows.map((row,i)=>row.map(v=>({value:v??'',type:typeof v==='number'?Number:String,...(i===0?{fontWeight:'bold',backgroundColor:'#E7F0FF'}:{})})))
   await write([{sheet:'SDM terkait',data:cells(data.summary)},{sheet:'Riwayat pengembalian',data:cells(data.transactions)},{sheet:'Konteks laporan',data:cells(context)}]).toFile(`TukinUMrecovery-${type}-${target.no}-SDM-terkait.xlsx`)
  }catch(e){setError(e.message||'Ekspor belum berhasil.')}finally{setExporting(false)}
 }
 return <section className="panel" aria-label={`Penghubungan ${label} ke master`}>
  <h2>SDM terkait {label}</h2><p>Penghubungan memakai NIP dari master tersimpan, revisi {snapshot.revision}. PIC, tenggat, dan status kegiatan tidak berubah otomatis saat pegawai membayar. Saldo antar kegiatan dapat mencakup pegawai yang sama dan tidak boleh dijumlahkan sebagai total tagihan.</p>
  <label className="form-field"><span>Pilih {label}</span><select disabled={!!review||saving} value={targetNo} onChange={e=>setTargetNo(e.target.value)}><option value="">Pilih kegiatan / kategori</option>{targets.map(t=><option key={t.no} value={t.no}>{t.no}. {type==='action'?t.kegiatan:t.kategori}</option>)}</select></label>
  {!client&&<p>Penyimpanan penghubungan belum diaktifkan. Pilihan di bawah hanya untuk tinjauan lokal.</p>}
  {target&&<><p>PIC: {target.pic||'Belum diisi'} • Tenggat: {target.deadline||'Belum diisi'} • Status kegiatan: {target.status||'Belum Mulai'}</p>
   {loading&&<p role="status">Memuat penghubungan tersimpan…</p>}
   {linked&&<button className="btn secondary" disabled={exporting||!linked.rows.length||linked.held.length>0} onClick={exportLinked}>{exporting?'Menyiapkan Excel…':'Ekspor SDM terkait sesuai filter'}</button>}{linked&&<div className="notice demo-notice">{linked.linkedCount} NIP terhubung • {linked.totals.people} SDM sesuai filter • Kewajiban {rp(linked.totals.obligation)} • Pengembalian tercatat {rp(linked.totals.payment)} • Sisa {rp(linked.totals.remaining)} • Terverifikasi {rp(linked.totals.verified)}.{linked.held.length>0&&` ${linked.held.length} referensi tidak tersedia; saldo ringkasan ini belum lengkap.`}</div>}
   {!review&&<><div className="form-grid"><label className="form-field"><span>Cari NIP / nama / provinsi</span><input value={filters.search} onChange={e=>update('search',e.target.value)}/></label>{[['bank','Bank',['Mandiri','BRI','BSI']],['year','Tahun SP2D',years],['kind','Jenis',['TUKIN','UM']]].map(([key,name,options])=><label className="form-field" key={key}><span>{name}</span><select value={filters[key]} onChange={e=>update(key,e.target.value)}><option value="">Semua</option>{options.map(v=><option key={v} value={v}>{v}</option>)}</select></label>)}</div>
    <label className="form-field"><span>Kelompok tindak lanjut</span><select value={filters.worklist} onChange={e=>update('worklist',e.target.value)}><option value="nonactive">Nonaktif dengan sisa pengembalian</option><option value="paid">Riwayat lunas menurut saldo</option><option value="review">Status perlu pemeriksaan</option><option value="">Semua master</option></select></label><label className="form-field"><span>Status SDM (sumber)</span><select value={filters.status||''} onChange={e=>update('status',e.target.value)}><option value="">Semua</option>{statuses.map(v=><option key={v} value={v}>{v}</option>)}</select></label>
    <label><input type="checkbox" checked={!!filters.remainingOnly} onChange={e=>update('remainingOnly',e.target.checked)}/> Hanya SDM dengan sisa menurut Excel</label><p>Sisa mengikuti filter bank, tahun SP2D dan jenis yang dipilih. Saldo nol menurut Excel belum berarti penerimaan telah diverifikasi.</p>
    <label><input type="checkbox" disabled={!stored} checked={!!filters.onlyLinked} onChange={e=>update('onlyLinked',e.target.checked)}/> Tampilkan hanya SDM terkait</label><p>{selected.totals.people} SDM dengan kewajiban positif sesuai filter • {picked.size} dipilih. Filter tahun/jenis membantu pemilihan; penghubungan berlaku untuk pegawai, bukan mengalokasikan nominal tahun tertentu.</p>
    <div className="toolbar"><button className="btn secondary" disabled={!selected.rows.length||selected.rows.length>500} onClick={()=>setPicked(new Set(selected.rows.map(r=>r.nip)))}>Pilih semua hasil filter (maks. 500)</button><button className="btn secondary" onClick={()=>setPicked(new Set())}>Kosongkan pilihan</button>{client&&<button className="btn secondary" disabled={loading} onClick={()=>setAttempt(v=>v+1)}>Muat ulang penghubungan</button>}</div>
    <div className="table-scroll"><table><thead><tr><th>Pilih</th><th>SDM / Bank</th><th>Status SDM</th><th>Kewajiban</th><th>Pengembalian tercatat</th><th>Sisa</th><th>Penghubungan</th></tr></thead><tbody>{selected.rows.slice(page*25,page*25+25).map(p=><tr key={p.nip}><td><input type="checkbox" aria-label={`Pilih ${p.nip}`} checked={picked.has(p.nip)} onChange={e=>setPicked(old=>{const next=new Set(old);if(e.target.checked)next.add(p.nip);else next.delete(p.nip);return next})}/></td><td>{p.nama}<small>{p.nip} • {p.bank}</small></td><td>{statusOf(p)}</td><td>{rp(p.obligation)}</td><td>{rp(p.payment)}</td><td>{rp(p.remaining)}<small>{p.remaining===0?'Lunas menurut saldo':'Belum Lunas'}</small></td><td>{stored?(linkedNips.has(p.nip)?'Terhubung':'Belum terhubung'):'Belum dimuat'}</td></tr>)}</tbody></table></div><div className="pagination"><span>Halaman {page+1}</span><div><button className="btn secondary" disabled={!page} onClick={()=>setPage(v=>v-1)}>Sebelumnya</button><button className="btn secondary" disabled={(page+1)*25>=selected.rows.length} onClick={()=>setPage(v=>v+1)}>Berikutnya</button></div></div>
    <div className="toolbar">{stored&&<button className="btn secondary" disabled={loading||!stored.rows.length||stored.rows.length>500} onClick={()=>makeReview('remove',stored.rows.map(r=>r.nip))}>Tinjau pelepasan semua SDM terkait (maks. 500)</button>}<button className="btn secondary" disabled={!picked.size||picked.size>500||loading||(!!client&&!stored)} onClick={()=>makeReview('add')}>Tinjau penghubungan SDM</button><button className="btn secondary" disabled={!stored||!picked.size||loading} onClick={()=>makeReview('remove')}>Tinjau pelepasan penghubungan</button></div>
   </>}
   {review&&<><h3>Tinjauan {review.operation==='add'?'penghubungan':'pelepasan'} — {review.nips.length} SDM</h3><p>Melepas penghubungan tidak menghapus pegawai, transaksi, atau kegiatan.</p><ul>{review.nips.slice(reviewPage*15,reviewPage*15+15).map(nip=><li key={nip}>{peopleByNip.get(nip)?.nama||'Referensi tidak tersedia'} — {nip}</li>)}</ul><div className="pagination"><span>Halaman {reviewPage+1} / {totalPages}</span><div><button className="btn secondary" disabled={saving||!reviewPage} onClick={()=>setReviewPage(p=>p-1)}>Sebelumnya</button><button className="btn secondary" disabled={saving||reviewPage+1>=totalPages} onClick={()=>{setReviewPage(p=>p+1);setSeen(v=>Math.max(v,reviewPage+1))}}>Berikutnya</button></div></div><label className="form-field"><span>Alasan penghubungan / pelepasan</span><textarea disabled={saving||!!retry.current} value={reason} onChange={e=>setReason(e.target.value)}/></label><label><input type="checkbox" disabled={saving||seen<totalPages-1} checked={approved} onChange={e=>setApproved(e.target.checked)}/> Saya telah meninjau seluruh pilihan SDM.</label><div className="toolbar"><button className="btn primary" disabled={!client||saving||!approved||reason.trim().length<3} onClick={save}>Simpan penghubungan</button><button className="btn secondary" disabled={saving} onClick={()=>{setReview(null);retry.current=null;setAttempt(v=>v+1)}}>Batalkan tinjauan</button></div></>}
  </>}
  {message&&<p role="status">{message}</p>}{error&&<p role="alert" className="notice red-notice">{error}</p>}
 </section>
}
