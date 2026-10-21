import React,{useEffect,useRef,useState} from 'react'
import {CATEGORY_OPTIONS,categoryState,initialCategoryForm} from './categoryModel.js'
import './portal.css'
const labels={draft:'Draf disimpan',deepen:'Perlu pendalaman',submit:'Usulan diajukan',approve:'Kategori ditetapkan',return:'Dikembalikan untuk pendalaman'}
export default function CategoryComparison({client,row,profile,userId,bapDirty,bapBusy,onDirty,active=true}){
 const [review,setReview]=useState(null),[history,setHistory]=useState([]),[form,setForm]=useState({category:'',reason:'',evidence:'',questionRefs:[]}),[decision,setDecision]=useState({category:'',reason:''}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
 const dirty=useRef(false),alive=useRef(true),reviewRef=useRef(null)
 async function load(){
  try{
   const [r,h]=await Promise.all([client.from('interview_categories').select('*').eq('nik',row.nik).single(),client.from('interview_category_events').select('*').eq('nik',row.nik).order('id',{ascending:false}).limit(15)])
   if(r.error)throw r.error;if(h.error)throw h.error;if(!alive.current)return
   if(dirty.current&&reviewRef.current&&r.data.revision!==reviewRef.current.revision){setError('Usulan berubah di perangkat lain. Salin perubahan Anda lalu buka kembali peserta.');return}
   setReview(r.data);reviewRef.current=r.data;setHistory(h.data||[])
   if(!dirty.current){setForm(initialCategoryForm(r.data));setDecision(d=>({...d,category:r.data.final_category||r.data.proposed_category||''}))}
  }catch(e){if(alive.current)setError(e.message)}
 }
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
 useEffect(()=>{if(!active)return;load();const timer=setInterval(load,15000);return()=>clearInterval(timer)},[row.nik,row.revision,active])
 function change(key,value){dirty.current=true;onDirty(true);setForm(f=>({...f,[key]:value}));setNotice('Usulan belum tersimpan')}
 async function action(name){
  setBusy(true);setError('');setNotice('')
  try{
   const {data,error}=await client.rpc('interview_category_action',{p_nik:row.nik,p_action:name,p_revision:review.revision,p_bap_revision:row.revision,p_payload:['approve','return'].includes(name)?decision:form})
   if(error)throw error
   dirty.current=false;onDirty(false);setReview(data);reviewRef.current=data;setForm(initialCategoryForm(data));setNotice(labels[name]);await load()
  }catch(e){setError(e.message)}finally{setBusy(false)}
 }
 const state=categoryState(review,row),finalCurrent=state==='Ditetapkan'
 const canEdit=review&&row.started_at&&profile.role!=='viewer'&&(profile.role==='admin'||row.locked_by===userId)&&!finalCurrent
 const disabled=busy||bapBusy||bapDirty
 const answered=Object.entries(row.answers||{}).filter(([,text])=>text?.trim()).map(([n])=>Number(n))
 return <section className="panel bap-comparison" aria-label="Perbandingan kategorisasi">
  <h3>Perbandingan sebelum & sesudah wawancara</h3>
  <p>Kategori awal tetap tersimpan. Usulan dan penetapan merupakan penilaian pemeriksa berdasarkan jawaban serta bukti, tanpa menentukan sanksi otomatis.</p>
  {error&&<p role="alert" className="notice red-notice">{error} <button className="btn secondary" onClick={load}>Muat ulang penilaian</button></p>}
  {notice&&<p role="status">{notice}</p>}
  {review&&<><div className="bap-comparison-grid"><div><h4>Sebelum wawancara</h4><b>{review.initial_snapshot.afterCategory||'Belum tersedia'}</b><p>Kategori awal setelah ASN</p><p>Kategori historis: {review.initial_snapshot.historicalCategory||'Belum tersedia'}</p><p>Status sumber: {review.initial_snapshot.assessment||'Belum tersedia'}</p><small>{review.initial_snapshot.sourceName} {review.initial_snapshot.datasetVersion?`· versi ${review.initial_snapshot.datasetVersion}`:''}</small></div><div><h4>Sesudah wawancara</h4><b>Usulan: {review.proposed_category||'Belum diisi'}</b><p>Status: <strong>{state}</strong></p><p>Kategori akhir: <strong>{finalCurrent?review.final_category:'Belum ditetapkan'}</strong></p>{state==='Perlu ditinjau ulang'&&<p>BAP telah berubah sejak penilaian terakhir. Ajukan kembali setelah BAP difinalisasi.</p>}{review.reason&&<p>Alasan usulan: {review.reason}</p>}{review.decision_reason&&<p>Catatan peninjau: {review.decision_reason}</p>}</div></div>
  <div className="bap-category-form"><label>Usulan kategori<select aria-label="Usulan kategori" value={form.category} disabled={!canEdit||disabled} onChange={e=>change('category',e.target.value)}><option value="">Pilih kategori</option>{CATEGORY_OPTIONS.map(c=><option key={c}>{c}</option>)}</select></label><label>Alasan / pertimbangan<textarea aria-label="Alasan usulan" rows={3} maxLength={8000} value={form.reason} disabled={!canEdit||disabled} onChange={e=>change('reason',e.target.value)}/></label><label>Bukti pendukung / hasil verifikasi<textarea aria-label="Bukti pendukung kategorisasi" rows={2} maxLength={8000} value={form.evidence} disabled={!canEdit||disabled} onChange={e=>change('evidence',e.target.value)}/></label><fieldset disabled={!canEdit||disabled}><legend>Jawaban BAP pendukung</legend>{answered.length?answered.map(n=><label key={n} className="bap-ref"><input type="checkbox" checked={form.questionRefs.includes(n)} onChange={e=>change('questionRefs',e.target.checked?[...form.questionRefs,n]:form.questionRefs.filter(q=>q!==n))}/>Q{n}<span title={row.answers[n]}>{row.answers[n].slice(0,140)}{row.answers[n].length>140?'…':''}</span></label>):<p>Isi dan simpan jawaban BAP untuk memilih rujukan.</p>}</fieldset></div>
  {bapDirty&&<p className="notice amber-notice">Simpan jawaban BAP dahulu sebelum menyimpan penilaian.</p>}
  {canEdit&&<div className="bap-preview-actions"><button className="btn secondary" disabled={disabled} onClick={()=>action('draft')}>Simpan draf kategori</button><button className="btn secondary" disabled={disabled||form.reason.trim().length<20} onClick={()=>action('deepen')}>Tandai perlu pendalaman</button><button className="btn primary" disabled={disabled||row.status!=='Selesai'||!form.category||form.category==='Belum dapat disimpulkan'||form.reason.trim().length<20||!form.questionRefs.length} onClick={()=>action('submit')}>Ajukan untuk ditinjau</button></div>}
  {canEdit&&row.status!=='Selesai'&&<p>Usulan dapat disimpan sebagai draf. Finalisasi BAP sebelum mengajukan kategori.</p>}
  {profile.role==='admin'&&state==='Diajukan'&&<section className="bap-category-review"><h4>Penetapan oleh admin</h4><label>Kategori akhir<select aria-label="Kategori akhir" value={decision.category} disabled={disabled} onChange={e=>(dirty.current=true,onDirty(true),setDecision({...decision,category:e.target.value}))}>{CATEGORY_OPTIONS.filter(c=>c!=='Belum dapat disimpulkan').map(c=><option key={c}>{c}</option>)}</select></label><label>Dasar penetapan / alasan pengembalian<textarea aria-label="Dasar penetapan" rows={3} maxLength={8000} value={decision.reason} disabled={disabled} onChange={e=>(dirty.current=true,onDirty(true),setDecision({...decision,reason:e.target.value}))}/></label><div className="bap-preview-actions"><button className="btn secondary" disabled={disabled||decision.reason.trim().length<20} onClick={()=>action('return')}>Kembalikan untuk pendalaman</button><button className="btn primary" disabled={disabled||decision.reason.trim().length<20||!decision.category} onClick={()=>action('approve')}>Tetapkan kategori akhir</button></div></section>}
  {history.length>0&&<details><summary>Riwayat penilaian ({history.length} terbaru)</summary><ol>{history.map(event=><li key={event.id}><b>{labels[event.action]||event.action}</b> · {event.actor_name} · {new Date(event.occurred_at).toLocaleString('id-ID',{timeZone:'Asia/Jakarta'})} WIB<p>{event.details.final_category||event.details.proposed_category||'Belum dipilih'} — {['approve','return'].includes(event.action)?event.details.decision_reason:event.details.reason}</p></li>)}</ol></details>}
  </>}
 </section>
}
