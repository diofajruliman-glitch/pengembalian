import React,{useCallback,useEffect,useRef,useState} from 'react'
import {flushSync} from 'react-dom'
import {act,reviseCase,watchInterviewProgress} from './api.js'
import {QUESTIONS,IDENTITY_FIELDS,INTERVIEWER_FIELDS,initialIdentity,missingFields,dateWords,interviewTimestamp} from './model.js'
import {buildWord,renderPreview,buildPdf,download} from './documents.js'
import './portal.css'
import CategoryComparison from './CategoryComparison.jsx'
import StatementPanel from './StatementPanel.jsx'
import LhpPanel from './LhpPanel.jsx'
import InterviewActivityPanel,{activityIsLive} from './InterviewActivityPanel.jsx'
import {interviewEditorState,deferInterviewPayload} from './lifecycle.js'

const when=row=>`${row.scheduled_date} · ${row.scheduled_time.slice(0,5)} WIB`
const cleanBapState={dirty:false,statementDirty:false,activityDirty:false,deferDirty:false,busy:false}
const deferredTime=value=>value?new Date(value).toLocaleString('id-ID',{timeZone:'Asia/Jakarta',dateStyle:'medium',timeStyle:'short'})+' WIB':'Belum tersedia'
function mergeActivity(current,incoming){
 const next={...current}
 for(const item of incoming||[]){
  const previous=next[item.nik]
  if(!previous||item.revision>previous.revision||(item.revision===previous.revision&&String(item.updated_at||'')>=String(previous.updated_at||'')))next[item.nik]=item
 }
 return next
}
function mergeCases(current,incoming){
 const existing=new Map(current.map(row=>[row.nik,row]))
 return incoming.map(row=>existing.get(row.nik)?.revision>row.revision?existing.get(row.nik):row)
}
export default function InterviewerPortal({client,profile,userId,onSignOut,onDirtyChange,initialNik=''}){
 const [rows,setRows]=useState([]),[error,setError]=useState(''),[loading,setLoading]=useState(true),[query,setQuery]=useState(''),[date,setDate]=useState(''),[room,setRoom]=useState(''),[selected,setSelected]=useState(null)
 const [activity,setActivity]=useState({})
 const refresh=useRef(null),dirtyParticipants=useRef(new Set())
 const updateActivity=useCallback(item=>setActivity(current=>mergeActivity(current,[item])),[])
 const trackDirty=useCallback((nik,value)=>{
  if(value)dirtyParticipants.current.add(nik);else dirtyParticipants.current.delete(nik)
  onDirtyChange?.(dirtyParticipants.current.size>0)
 },[onDirtyChange])
 useEffect(()=>{
  function leave(event){if(dirtyParticipants.current.size){event.preventDefault();event.returnValue=''}}
  window.addEventListener('beforeunload',leave)
  return()=>{window.removeEventListener('beforeunload',leave);onDirtyChange?.(false)}
 },[onDirtyChange])
 const reload=useCallback(()=>refresh.current?.(),[])
 useEffect(()=>{
  const stop=watchInterviewProgress(client,{
   onData:({rows:nextRows,activity:nextActivity})=>{setRows(current=>mergeCases(current,nextRows));if(nextActivity)setActivity(current=>mergeActivity(current,nextActivity));setLoading(false);setError('')},
   onError:failure=>{if(failure.rows)setRows(current=>mergeCases(current,failure.rows));setError(failure.phase==='activity'?`Data BAP dimuat, tetapi aktivitas/kendala belum dapat diperbarui: ${failure.message}`:failure.message);setLoading(false)}
  })
  refresh.current=stop.refresh
  return()=>{refresh.current=null;stop()}
 },[client])
 useEffect(()=>{if(initialNik&&rows.some(r=>r.nik===initialNik))setSelected(initialNik)},[initialNik,rows.length])
 const privileged=['admin','editor','viewer'].includes(profile.role)
 const filtered=rows.filter(r=>(!date||r.scheduled_date===date)&&(!room||r.room_id===room)&&`${r.person.nama} ${r.person.nip}`.toLowerCase().includes(query.toLowerCase()))
 const visibleIds=new Set(filtered.map(r=>r.nik))
 return <div className="bap-portal">
  <header className="bap-portal-heading"><div><span className="eyebrow">PELAKSANAAN WAWANCARA</span><h1>{privileged?'Hasil & Portal BAP':'Portal Pewawancara'}</h1><p>{profile.nama} · {privileged?'Seluruh room':rows[0]?.room_id.replace('room-','Room ')||'Penugasan Anda'}</p></div>{onSignOut&&<button className="btn secondary" onClick={()=>{if(!dirtyParticipants.current.size||window.confirm('Ada perubahan BAP, kategori, SPTJM, LHP atau laporan kendala belum tersimpan. Tetap keluar?'))onSignOut(true)}}>Keluar</button>}</header>
  <p className="notice blue-notice">Pilih peserta yang sudah hadir tanpa harus mengikuti urutan jadwal. Tanggal BAP mengikuti jadwal wawancara peserta dalam WIB. Aktivitas membuka BAP, progres tersimpan, dan laporan kendala terhubung ke monitoring pimpinan; data diperbarui setiap 5 detik.</p>
  <div className="bap-stats bap-lifecycle-stats">{['Terjadwal','Dalam wawancara','Draf','Tertunda','Selesai'].map(s=><div key={s}><strong>{rows.filter(r=>r.status===s).length}</strong><span>{s}</span></div>)}</div>
  {error&&<p role="alert" className="notice red-notice">{error} <button className="btn secondary" onClick={reload}>Coba lagi</button></p>}
  <section className="panel"><div className="bap-filters"><label>Cari peserta<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Nama atau NIP"/></label><label>Tanggal jadwal<select value={date} onChange={e=>setDate(e.target.value)}><option value="">Semua tanggal</option>{[...new Set(rows.map(r=>r.scheduled_date))].map(d=><option key={d}>{d}</option>)}</select></label>{privileged&&<label>Room<select value={room} onChange={e=>setRoom(e.target.value)}><option value="">Semua room</option>{[...new Set(rows.map(r=>r.room_id))].sort((a,b)=>Number(a.slice(5))-Number(b.slice(5))).map(r=><option key={r} value={r}>{r.replace('room-','Room ')}</option>)}</select></label>}<button className="btn secondary" onClick={reload}>Perbarui</button></div>
   <p>{loading?'Memuat antrean…':`${filtered.length} peserta`}</p><div className="bap-queue">{rows.map(r=><ParticipantCard key={r.nik} row={r} activity={activity[r.nik]} onActivity={updateActivity} refreshError={error} client={client} profile={profile} userId={userId} hidden={!visibleIds.has(r.nik)} editing={selected===r.nik} onOpen={()=>setSelected(r.nik)} onClose={()=>setSelected(null)} onDirty={trackDirty} onSaved={saved=>setRows(current=>current.map(item=>item.nik===saved.nik?saved:item))}/>)}</div>{!loading&&!rows.length&&!error&&<p>Belum ada peserta pada penugasan akun ini. Hubungi admin untuk memeriksa pembagian room.</p>}
  </section>
 </div>
}

function ParticipantCard({row,activity,onActivity,refreshError,client,profile,userId,hidden,editing,onOpen,onClose,onSaved,onDirty}){
 const [activePanel,setActivePanel]=useState(null)
 const [categoryLoaded,setCategoryLoaded]=useState(false),[categoryDirty,setCategoryDirty]=useState(false)
 const [reportLoaded,setReportLoaded]=useState(false),[reportDirty,setReportDirty]=useState(false)
 const [bapState,setBapState]=useState(cleanBapState)
 const pending=bapState.dirty||bapState.statementDirty||bapState.activityDirty||bapState.deferDirty||categoryDirty||reportDirty
 useEffect(()=>{onDirty(row.nik,pending);return()=>onDirty(row.nik,false)},[row.nik,pending,onDirty])
 function openPanel(name){if(name==='category')setCategoryLoaded(true);else setReportLoaded(true);setActivePanel(name)}
 function closeBap(){
  if(bapState.busy)return
  if((bapState.dirty||bapState.statementDirty||bapState.activityDirty||bapState.deferDirty)&&!window.confirm('Ada perubahan BAP, SPTJM, laporan kendala atau alasan penundaan belum tersimpan. Tetap tutup dan buang perubahan?'))return
  onClose()
 }
 return <article className="bap-case" hidden={hidden&&!editing&&!activePanel} aria-label={`Peserta ${row.person.nama}`}>
  <div className="bap-queue-item"><span><b>{row.person.nama}</b><small>NIP {row.person.nip}</small><small>{when(row)} · {row.room_id.replace('room-','Room ')}</small>{row.status==='Tertunda'&&<small className="bap-deferred-summary">Tertunda: {row.deferred_reason}</small>}<span className="bap-activity-badges">{!['Selesai','Tertunda'].includes(row.status)&&activityIsLive(activity)&&<span className="bap-badge bap-live-badge">BAP sedang dibuka</span>}{activity?.obstacle_status==='open'&&<span className="bap-badge bap-obstacle-badge">Kendala dilaporkan</span>}</span></span><div className="bap-case-actions"><span className={'bap-badge '+(row.status==='Selesai'?'done':row.status==='Tertunda'?'bap-obstacle-badge':'')}>{row.status}</span><div className="bap-case-controls"><button className="btn primary bap-open-button" onClick={onOpen} aria-label={`Buka BAP ${row.person.nama}`}>Buka BAP →</button><div className="bap-secondary-actions"><button type="button" className="btn secondary bap-document-button" onClick={()=>openPanel('category')} title="Perbandingan kategori awal dan hasil wawancara" aria-haspopup="dialog">Perbandingan kategori{categoryDirty&&<small className="bap-unsaved-badge">Belum tersimpan</small>}</button><button type="button" className="btn secondary bap-document-button" onClick={()=>openPanel('report')} title="Draf LHP — analisis, rekomendasi dan unduhan" aria-haspopup="dialog">Draf LHP{reportDirty&&<small className="bap-unsaved-badge">Belum tersimpan</small>}</button></div></div></div></div>
  {categoryLoaded&&<DocumentDialog open={activePanel==='category'} title="Perbandingan kategori awal dan hasil wawancara" row={row} dirty={categoryDirty} onClose={()=>setActivePanel(null)}><CategoryComparison client={client} row={row} profile={profile} userId={userId} active={activePanel==='category'} bapDirty={bapState.dirty} bapBusy={bapState.busy} onDirty={setCategoryDirty}/></DocumentDialog>}
  {reportLoaded&&<DocumentDialog open={activePanel==='report'} title="Draf LHP — analisis, rekomendasi dan unduhan" row={row} dirty={reportDirty} onClose={()=>setActivePanel(null)}><LhpPanel client={client} row={row} profile={profile} userId={userId} active={activePanel==='report'} bapDirty={bapState.dirty||categoryDirty||bapState.statementDirty} bapBusy={bapState.busy} onDirty={setReportDirty}/></DocumentDialog>}
  {editing&&<BapEditor row={row} activity={activity} onActivity={onActivity} refreshError={refreshError} client={client} profile={profile} userId={userId} onStateChange={setBapState} onClose={closeBap} onSaved={onSaved}/>}
 </article>
}

function DocumentDialog({open,title,row,dirty,onClose,children}){
 const dialog=useRef(null)
 useEffect(()=>{
  const element=dialog.current
  if(!open)return
  element.showModal()
  return()=>element.close()
 },[open])
 return <dialog ref={dialog} className="bap-dialog bap-document-dialog" aria-label={`${title} — ${row.person.nama}`} onCancel={event=>{event.preventDefault();onClose()}}>
  <header className="bap-editor-header"><div><h2>{title}</h2><p>{row.person.nama} · NIP {row.person.nip} · {row.room_id.replace('room-','Room ')} · {row.status}</p></div><button type="button" className="btn secondary" onClick={onClose}>Tutup</button></header>
  {dirty&&<p className="notice amber-notice" role="status">Draf belum tersimpan. Perubahan tetap tersedia saat popup ditutup.</p>}
  {children}
 </dialog>
}

function BapEditor({row:remote,activity,onActivity,refreshError,client,profile,userId,onStateChange,onClose,onSaved}){
 const [row,setRow]=useState(remote),[identity,setIdentity]=useState(()=>initialIdentity(remote,remote.locked_by===userId?{nama:profile.nama}:{})),[answers,setAnswers]=useState(remote.answers||{}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[preview,setPreview]=useState(false),[previewBusy,setPreviewBusy]=useState(false),[word,setWord]=useState(null),[reason,setReason]=useState(''),[schedule,setSchedule]=useState({roomId:remote.room_id,date:remote.scheduled_date,time:remote.scheduled_time.slice(0,5)})
 const [statementDirty,setStatementDirty]=useState(false)
 const [activityDirty,setActivityDirty]=useState(false)
 const [deferOpen,setDeferOpen]=useState(false),[deferReason,setDeferReason]=useState('')
 const [signatoryError,setSignatoryError]=useState('')
 const dirty=useRef(false),saving=useRef(false),conflict=useRef(false),editSeq=useRef(0),current=useRef({row,identity,answers}),previewNode=useRef(null),dialog=useRef(null),mounted=useRef(true)
 current.current={row,identity,answers}
 const {readOnly,paused,showBap,canStart,canDefer}=interviewEditorState(row,profile.role,userId)
 const canRevise=row.status==='Selesai'&&['admin','editor','interviewer'].includes(profile.role)&&(profile.role==='admin'||profile.role==='interviewer'||row.locked_by===userId)
 const missing=missingFields(row,identity,answers)
 const progress=Object.values(answers).filter(a=>a.trim()).length
 useEffect(()=>{mounted.current=true;const el=dialog.current;el.showModal();return()=>{mounted.current=false;el.close()}},[])
 useEffect(()=>{onStateChange({dirty:dirty.current,statementDirty,activityDirty,deferDirty:deferOpen,busy:busy||previewBusy})},[identity,answers,statementDirty,activityDirty,deferOpen,busy,previewBusy,onStateChange])
 useEffect(()=>()=>onStateChange(cleanBapState),[onStateChange])
 useEffect(()=>{
  if(remote.revision<=current.current.row.revision)return
  // A read poll can observe our own pending save before its response arrives.
  // Recheck after the request ends instead of treating that as another editor.
  if(saving.current)return
  if(dirty.current){conflict.current=true;setError('INTERVIEW_CONFLICT: Data berubah di perangkat lain. Salin perubahan yang belum tersimpan sebelum membuka ulang.');return}
  setRow(remote);setIdentity(initialIdentity(remote,remote.locked_by===userId?{nama:profile.nama}:{}));setAnswers(remote.answers||{});setPreview(false);setWord(null)
 },[remote.revision,busy])
 useEffect(()=>{
  let active=true
  async function loadSignatory(){
   const sequence=editSeq.current
   try{
    const {data,error}=await client.rpc('interview_signatory_source',{p_nik:row.nik})
    if(error)throw error
    if(!active)return
    setSignatoryError('')
    if(dirty.current||sequence!==editSeq.current)return
    setIdentity(previous=>({...previous,
     pewawancaraNama:row.identity_details?.pewawancaraNama?.trim()?previous.pewawancaraNama:data?.nama||'',
     pewawancaraNip:row.identity_details?.pewawancaraNip?.trim()?previous.pewawancaraNip:data?.nip||''}))
   }catch(error){if(active)setSignatoryError('Identitas pewawancara belum dapat dimuat. Lengkapi nama dan NIP sebelum mengunduh BAP.')}
  }
  loadSignatory();return()=>{active=false}
 },[row.nik,row.locked_by,row.revision])
 const saved=next=>{setRow(next);onSaved(next);current.current.row=next}
 async function save(action='save'){
  if(saving.current)return false
  saving.current=true;setBusy(true);setError('')
  const seq=editSeq.current,c=current.current
  try{
   const next=await act(client,c.row,action,{identity:c.identity,answers:c.answers})
   if(mounted.current){saved(next);if(seq===editSeq.current){dirty.current=false}if(action==='finalize'){setPreview(false);setWord(null)}setNotice(action==='finalize'?'BAP selesai. Gunakan Revisi BAP jika perlu memperbaiki isian.':'Tersimpan di database · '+new Date().toLocaleTimeString('id-ID',{timeZone:'Asia/Jakarta'}))}
   return true
  }catch(e){if(mounted.current){setError(e.message);if(e.message.includes('CONFLICT')||e.message.includes('LOCKED'))conflict.current=true}return false}
  finally{saving.current=false;if(mounted.current)setBusy(false)}
 }
 useEffect(()=>{
  if(!dirty.current||readOnly||conflict.current)return
  const id=setTimeout(()=>{if(dirty.current&&!saving.current&&!conflict.current)save()},60000)
  return()=>clearTimeout(id)
 },[identity,answers,readOnly])
 function change(kind,key,value){editSeq.current++;dirty.current=true;setWord(null);setPreview(false);setNotice('Perubahan belum tersimpan · otomatis disimpan setelah berhenti mengetik 1 menit');if(kind==='identity')setIdentity(prev=>({...prev,[key]:value}));else setAnswers(prev=>({...prev,[key]:value}))}
 async function action(name,payload={}){
  if(saving.current)return false
  saving.current=true;setBusy(true);setError('')
  const sequence=editSeq.current,previousStatus=current.current.row.status
  try{
   const next=name==='revise'?await reviseCase(client,current.current.row,userId,payload):await act(client,current.current.row,name,payload)
   if(!mounted.current)return
   saved(next)
   if(name==='revise'){
    setIdentity(initialIdentity(next,next.locked_by===userId?{nama:profile.nama}:{}));setAnswers(next.answers||{});dirty.current=false
   }
   if(name==='defer'){
    if(sequence===editSeq.current)dirty.current=false
    setDeferOpen(false);setDeferReason('')
   }
   conflict.current=false;setWord(null);setPreview(false);setNotice(name==='defer'?'Wawancara ditandai Tertunda. Alasan dan draf BAP tersimpan serta terlihat di monitoring.':name==='start'?(previousStatus==='Tertunda'?'Wawancara dilanjutkan. Isian BAP sebelumnya tetap tersedia.':'Wawancara dimulai. Silakan isi BAP.'):name==='revise'?'BAP dibuka untuk diperbarui. Kategori, SPTJM dan LHP perlu ditinjau kembali setelah revisi.':'Data pemeriksaan diperbarui.')
   return true
  }catch(e){if(mounted.current){setError(e.message);if(/CONFLICT|LOCKED/.test(e.message))conflict.current=true}return false}finally{saving.current=false;if(mounted.current)setBusy(false)}
 }
 async function defer(event){
  event.preventDefault()
  if(!canDefer||deferReason.trim().length<5||deferReason.trim().length>2000)return
  const value=current.current
  await action('defer',deferInterviewPayload(value.row,value.identity,value.answers,deferReason,userId))
 }
 async function openPreview(){
  if(dirty.current&&!(await save()))return
  setPreview(true);setPreviewBusy(true);setError('')
  try{const c=current.current;const blob=await buildWord(c.row,c.identity,c.answers);flushSync(()=>setWord(blob));await renderPreview(blob,previewNode.current)}catch(e){setError(e.message);setWord(null)}finally{setPreviewBusy(false)}
 }
 async function exportPdf(){setBusy(true);setError('');try{download(await buildPdf(previewNode.current),`BAP-${row.person.nip}.pdf`)}catch(e){setError(e.message)}finally{setBusy(false)}}
 const panels={
  bap:(<section key="bap" className="bap-workspace" aria-label="Berita Acara Pemeriksaan"><h3>Berita Acara Pemeriksaan (BAP)</h3>
  {row.started_at&&<p>Tanggal BAP sesuai jadwal: {dateWords(interviewTimestamp(row)).hari}, {dateWords(interviewTimestamp(row)).tanggal_huruf} {dateWords(interviewTimestamp(row)).bulan} {dateWords(interviewTimestamp(row)).tahun_huruf} (WIB)</p>}
  {canRevise&&<section className="notice blue-notice"><span>BAP sudah selesai dan dapat diperbaiki. Revisi akan menjadi draf kembali; kategori, SPTJM dan LHP terkait perlu ditinjau ulang.</span><button className="btn secondary" disabled={busy||conflict.current} onClick={()=>action('revise',{reason:'Perbaikan BAP setelah selesai'})}>Revisi BAP</button></section>}
  {row.started_at&&!paused&&row.status!=='Selesai'&&row.locked_by!==userId&&<p className="notice amber-notice">{row.locked_by?'Sedang ditangani pewawancara lain.':'Draf siap dilanjutkan.'}{canStart&&<button className="btn primary" disabled={busy||conflict.current} onClick={()=>action('start')}>Lanjutkan wawancara</button>}</p>}
  {!preview&&<><section className="panel"><h3>Identitas & administrasi</h3><p>Nama dan NIP mengikuti peserta terjadwal. Pangkat dan jabatan terhubung ke data surat panggilan berdasarkan NIP. Periksa kesesuaiannya sebelum melanjutkan.</p><div className="bap-identity">{IDENTITY_FIELDS.map(([key,label])=><label key={key}>{label}{!identity[key]&&<small className="bap-required">Belum diisi</small>}<input aria-label={label} type={key==='tanggalSurat'?'date':'text'} maxLength={500} value={identity[key]||''} disabled={readOnly||busy} onChange={e=>change('identity',key,e.target.value)}/></label>)}</div>
   <h4>Pewawancara pendamping</h4><p>Nama diisi dari akun yang menangani wawancara. Periksa nama lengkap dan lengkapi NIP untuk blok tanda tangan di bawah Faisal. Untuk akun unit/room, isi nama petugas yang melaksanakan wawancara.</p>
   {signatoryError&&<p className="notice amber-notice">{signatoryError}</p>}
   {row.status==='Selesai'&&(!identity.pewawancaraNama?.trim()||!identity.pewawancaraNip?.trim())&&<p className="notice amber-notice">Identitas pewawancara belum lengkap. Gunakan Revisi BAP untuk melengkapinya sebelum mengunduh.</p>}
   <div className="bap-identity">{INTERVIEWER_FIELDS.map(([key,label])=><label key={key}>{label}<input aria-label={label} inputMode={key==='pewawancaraNip'?'numeric':undefined} maxLength={key==='pewawancaraNip'?30:200} value={identity[key]||''} disabled={readOnly||busy} onChange={e=>change('identity',key,e.target.value)} placeholder={key==='pewawancaraNip'?'18 digit NIP pewawancara':'Nama lengkap pewawancara'}/></label>)}</div>
   </section>
   <section className="panel"><h3>Jawaban BAP · {progress}/22 terisi</h3>{QUESTIONS.map((q,i)=><label className="bap-question" key={i}><b>{i+1}. {q.replace('{nomorSurat}',identity.nomorSurat||'…').replace('{tanggalSuratTeks}',identity.tanggalSurat||'…')}</b><textarea rows={3} maxLength={8000} value={answers[i+1]||''} disabled={readOnly||busy} onChange={e=>change('answer',i+1,e.target.value)} placeholder="Catat jawaban peserta sesuai keterangannya"/></label>)}</section></>}
  {preview&&<section><div className="bap-preview-actions"><button className="btn secondary" disabled={busy||previewBusy} onClick={()=>setPreview(false)}>Kembali ke isian / revisi</button><button className="btn primary" disabled={busy||previewBusy||!word||missing.length>0} onClick={()=>download(word,`BAP-${row.person.nip}.docx`)}>Unduh Word</button><button className="btn primary" disabled={busy||previewBusy||!word||missing.length>0} onClick={exportPdf}>{busy?'Menyiapkan…':'Unduh PDF'}</button></div>{missing.length>0&&<p role="alert" className="notice amber-notice">Lengkapi sebelum unduh: {missing.join(', ')}.</p>}{previewBusy&&<p role="status">Menyiapkan halaman pratinjau…</p>}<div className="bap-preview-scroll"><div ref={previewNode}/></div><p className="bap-preview-note">PDF mengikuti halaman pratinjau ini. Word menggunakan template asli; pemenggalan halaman dapat menyesuaikan aplikasi Word/WPS dan font yang tersedia.</p></section>}
  </section>),
  statement:(<details key="statement" hidden={preview||paused} className="panel"><summary><b>SPTJM — pernyataan, pratinjau dan unduhan</b></summary><StatementPanel client={client} row={row} profile={profile} userId={userId} bapDirty={dirty.current} bapBusy={busy||paused} onDirty={setStatementDirty}/></details>),
 }
 const panelOrder=showBap?['bap','statement']:[]
 return <dialog ref={dialog} className="bap-dialog" aria-label={`BAP ${row.person.nama}`} onCancel={e=>{e.preventDefault();onClose()}}>
  <header className="bap-editor-header"><div><h2>{row.person.nama}</h2><p>NIP {row.person.nip} · {row.room_id.replace('room-','Room ')} · {row.status}</p></div><button className="btn secondary" onClick={onClose} disabled={busy}>Tutup</button></header>
  {refreshError&&<p className="notice amber-notice" role="alert">Pembaruan monitoring terkendala. Aktivitas dan laporan kendala terakhir tetap ditampilkan. {refreshError}</p>}
  {error&&<p className="notice red-notice" role="alert">{error}{conflict.current&&' Salin jawaban yang belum tersimpan sebelum menutup, lalu buka kembali data terbaru.'}</p>}
  {notice&&<p role="status">{notice}</p>}
  {!showBap&&!paused&&<section className="panel bap-start-card" aria-label="Verifikasi sebelum mulai wawancara"><span className="eyebrow">LANGKAH 1 · VERIFIKASI PESERTA</span><h3>Mulai wawancara</h3><p>Cocokkan nama dan NIP peserta yang hadir dengan jadwal: <b>{when(row)}</b>. Tekan Mulai wawancara untuk mencatat waktu mulai dan membuka isian BAP.</p><dl><div><dt>Nama peserta</dt><dd>{row.person.nama}</dd></div><div><dt>NIP</dt><dd>{row.person.nip}</dd></div><div><dt>Room</dt><dd>{row.room_id.replace('room-','Room ')}</dd></div></dl>{canStart&&<button type="button" className="btn primary bap-start-button" disabled={busy||conflict.current} onClick={()=>action('start')}>Mulai wawancara</button>}{profile.role==='viewer'&&<p>Akun Anda dapat memantau; isian BAP tersedia setelah pewawancara memulai.</p>}</section>}
  {paused&&<section className="panel bap-deferred-card" aria-label="Wawancara tertunda"><h3>Wawancara Tertunda</h3><p className="bap-deferred-reason">{row.deferred_reason||'Alasan penundaan belum tersedia.'}</p><small>Ditunda {deferredTime(row.deferred_at)}</small><p>Isian BAP sebelumnya tetap tersimpan. Lanjutkan wawancara untuk mengisi atau menyelesaikan BAP.</p>{canStart&&<button type="button" className="btn primary" disabled={busy||conflict.current} onClick={()=>action('start')}>Lanjutkan wawancara</button>}</section>}
  {canDefer&&<section className="panel bap-defer-controls" aria-label="Penundaan wawancara">{!deferOpen?<div className="bap-defer-intro"><p>Jika wawancara belum dapat dimulai atau perlu dihentikan sementara, catat penundaan beserta alasannya.</p><button type="button" className="btn secondary" disabled={busy||conflict.current} onClick={()=>setDeferOpen(true)}>Tunda wawancara</button></div>:<form onSubmit={defer}><label htmlFor="bap-defer-reason">Alasan penundaan (wajib)</label><textarea id="bap-defer-reason" rows={3} required minLength={5} maxLength={2000} value={deferReason} disabled={busy} onChange={event=>setDeferReason(event.target.value)} placeholder="Jelaskan mengapa wawancara perlu ditunda, minimal 5 karakter."/><small>Alasan dan jawaban BAP yang sedang diisi akan disimpan bersama. Status Tertunda langsung tersedia bagi pimpinan.</small><div className="bap-activity-actions"><button type="submit" className="btn primary" disabled={busy||conflict.current||deferReason.trim().length<5}>Simpan sebagai Tertunda</button><button type="button" className="btn secondary" disabled={busy} onClick={()=>{setDeferOpen(false);setDeferReason('')}}>Batal</button></div></form>}</section>}
  <InterviewActivityPanel row={row} activity={activity} onActivity={onActivity} client={client} profile={profile} userId={userId} onDraftChange={setActivityDirty}/>
  {panelOrder.map(key=>panels[key])}
  {!readOnly&&<p id="bap-completion-help" className="bap-completion-help">{deferOpen?'Simpan atau batalkan penundaan sebelum menyelesaikan wawancara.':missing.length?`Selesai wawancara tersedia setelah seluruh isian wajib lengkap. Belum lengkap: ${missing.join(', ')}.`:'Seluruh isian wajib BAP lengkap. Tekan Selesai wawancara untuk menyimpan dan menandai wawancara selesai.'}</p>}
  {profile.role==='admin'&&<details className="panel"><summary>Administrasi penugasan / pembukaan draf</summary>{!row.started_at&&!paused&&<div className="bap-filters"><label>Room<select value={schedule.roomId} onChange={e=>setSchedule({...schedule,roomId:e.target.value})}>{Array.from({length:19},(_,i)=><option key={i} value={`room-${i+1}`}>Room {i+1}</option>)}</select></label><label>Tanggal<input type="date" value={schedule.date} onChange={e=>setSchedule({...schedule,date:e.target.value})}/></label><label>Jam WIB<input type="time" value={schedule.time} onChange={e=>setSchedule({...schedule,time:e.target.value})}/></label><button className="btn secondary" disabled={busy} onClick={()=>action('schedule',schedule)}>Simpan penugasan</button></div>}{(row.started_at||paused)&&<><label>Alasan membuka / melepas kunci<input value={reason} onChange={e=>setReason(e.target.value)} placeholder="Minimal 5 karakter"/></label><button className="btn secondary" disabled={busy||reason.trim().length<5} onClick={()=>action('reopen',{reason})}>Buka kembali / lepaskan kunci</button></>}</details>}
  <footer className="bap-editor-footer"><span>{busy?'Memproses…':notice||(paused?'Wawancara tertunda. Lanjutkan untuk mengisi BAP.':!showBap?'Mulai wawancara untuk membuka isian BAP.':'Draf tersimpan otomatis setelah berhenti mengetik selama 1 menit. Gunakan Simpan draf untuk menyimpan sekarang.')}</span><div>{!readOnly&&<button className="btn secondary" disabled={busy||conflict.current} onClick={()=>save()}>Simpan draf</button>}{showBap&&<button className="btn primary" disabled={busy||previewBusy||conflict.current} onClick={openPreview}>Pratinjau BAP</button>}{!readOnly&&<button className="btn primary" aria-describedby="bap-completion-help" disabled={busy||previewBusy||missing.length>0||deferOpen||conflict.current} onClick={()=>save('finalize')}>Selesai wawancara</button>}</div></footer>
 </dialog>
}
