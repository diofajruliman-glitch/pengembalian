import React,{useCallback,useEffect,useRef,useState} from 'react'
import {flushSync} from 'react-dom'
import {listCases,act} from './api.js'
import {QUESTIONS,IDENTITY_FIELDS,INTERVIEWER_FIELDS,initialIdentity,missingFields,dateWords,interviewTimestamp} from './model.js'
import {buildWord,renderPreview,buildPdf,download} from './documents.js'
import './portal.css'
import CategoryComparison from './CategoryComparison.jsx'
import StatementPanel from './StatementPanel.jsx'
import LhpPanel from './LhpPanel.jsx'

const when=row=>`${row.scheduled_date} · ${row.scheduled_time.slice(0,5)} WIB`
const cleanBapState={dirty:false,statementDirty:false,busy:false}
export default function InterviewerPortal({client,profile,userId,onSignOut,onDirtyChange,initialNik=''}){
 const [rows,setRows]=useState([]),[error,setError]=useState(''),[loading,setLoading]=useState(true),[query,setQuery]=useState(''),[date,setDate]=useState(''),[room,setRoom]=useState(''),[selected,setSelected]=useState(null)
 const alive=useRef(true),dirtyParticipants=useRef(new Set())
 const trackDirty=useCallback((nik,value)=>{
  if(value)dirtyParticipants.current.add(nik);else dirtyParticipants.current.delete(nik)
  onDirtyChange?.(dirtyParticipants.current.size>0)
 },[onDirtyChange])
 useEffect(()=>{
  function leave(event){if(dirtyParticipants.current.size){event.preventDefault();event.returnValue=''}}
  window.addEventListener('beforeunload',leave)
  return()=>{window.removeEventListener('beforeunload',leave);onDirtyChange?.(false)}
 },[onDirtyChange])
 const reload=useCallback(async()=>{try{const data=await listCases(client);if(alive.current){setRows(data);setError('')}}catch(e){if(alive.current)setError(e.message)}finally{if(alive.current)setLoading(false)}},[client])
 useEffect(()=>{alive.current=true;reload();const id=setInterval(reload,15000);return()=>{alive.current=false;clearInterval(id)}},[reload])
 useEffect(()=>{if(initialNik&&rows.some(r=>r.nik===initialNik))setSelected(initialNik)},[initialNik,rows.length])
 const privileged=['admin','editor','viewer'].includes(profile.role)
 const filtered=rows.filter(r=>(!date||r.scheduled_date===date)&&(!room||r.room_id===room)&&`${r.person.nama} ${r.person.nip}`.toLowerCase().includes(query.toLowerCase()))
 const visibleIds=new Set(filtered.map(r=>r.nik))
 return <div className="bap-portal">
  <header className="bap-portal-heading"><div><span className="eyebrow">PELAKSANAAN WAWANCARA</span><h1>{privileged?'Hasil & Portal BAP':'Portal Pewawancara'}</h1><p>{profile.nama} · {privileged?'Seluruh room':rows[0]?.room_id.replace('room-','Room ')||'Penugasan Anda'}</p></div>{onSignOut&&<button className="btn secondary" onClick={()=>{if(!dirtyParticipants.current.size||window.confirm('Ada perubahan BAP, kategori, SPTJM atau LHP belum tersimpan. Tetap keluar?'))onSignOut(true)}}>Keluar</button>}</header>
  <p className="notice blue-notice">Pilih peserta yang sudah hadir tanpa harus mengikuti urutan jadwal. Tanggal BAP mengikuti jadwal wawancara peserta dalam WIB. Progres diperbarui setiap 15 detik.</p>
  <div className="bap-stats">{['Terjadwal','Dalam wawancara','Draf','Selesai'].map(s=><div key={s}><strong>{rows.filter(r=>r.status===s).length}</strong><span>{s}</span></div>)}</div>
  {error&&<p role="alert" className="notice red-notice">{error} <button className="btn secondary" onClick={reload}>Coba lagi</button></p>}
  <section className="panel"><div className="bap-filters"><label>Cari peserta<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Nama atau NIP"/></label><label>Tanggal jadwal<select value={date} onChange={e=>setDate(e.target.value)}><option value="">Semua tanggal</option>{[...new Set(rows.map(r=>r.scheduled_date))].map(d=><option key={d}>{d}</option>)}</select></label>{privileged&&<label>Room<select value={room} onChange={e=>setRoom(e.target.value)}><option value="">Semua room</option>{[...new Set(rows.map(r=>r.room_id))].sort((a,b)=>Number(a.slice(5))-Number(b.slice(5))).map(r=><option key={r} value={r}>{r.replace('room-','Room ')}</option>)}</select></label>}<button className="btn secondary" onClick={reload}>Perbarui</button></div>
   <p>{loading?'Memuat antrean…':`${filtered.length} peserta`}</p><div className="bap-queue">{rows.map(r=><ParticipantCard key={r.nik} row={r} client={client} profile={profile} userId={userId} hidden={!visibleIds.has(r.nik)} editing={selected===r.nik} onOpen={()=>setSelected(r.nik)} onClose={()=>setSelected(null)} onDirty={trackDirty} onSaved={saved=>setRows(current=>current.map(item=>item.nik===saved.nik?saved:item))}/>)}</div>{!loading&&!rows.length&&!error&&<p>Belum ada peserta pada penugasan akun ini. Hubungi admin untuk memeriksa pembagian room.</p>}
  </section>
 </div>
}

function ParticipantCard({row,client,profile,userId,hidden,editing,onOpen,onClose,onSaved,onDirty}){
 const [activePanel,setActivePanel]=useState(null)
 const [categoryLoaded,setCategoryLoaded]=useState(false),[categoryDirty,setCategoryDirty]=useState(false)
 const [reportLoaded,setReportLoaded]=useState(false),[reportDirty,setReportDirty]=useState(false)
 const [bapState,setBapState]=useState(cleanBapState)
 const pending=bapState.dirty||bapState.statementDirty||categoryDirty||reportDirty
 useEffect(()=>{onDirty(row.nik,pending);return()=>onDirty(row.nik,false)},[row.nik,pending,onDirty])
 function openPanel(name){if(name==='category')setCategoryLoaded(true);else setReportLoaded(true);setActivePanel(name)}
 function closeBap(){
  if((bapState.dirty||bapState.statementDirty)&&!window.confirm('Ada perubahan BAP atau SPTJM belum tersimpan. Tetap tutup dan buang perubahan?'))return
  onClose()
 }
 return <article className="bap-case" hidden={hidden&&!editing&&!activePanel} aria-label={`Peserta ${row.person.nama}`}>
  <div className="bap-queue-item"><span><b>{row.person.nama}</b><small>NIP {row.person.nip}</small><small>{when(row)} · {row.room_id.replace('room-','Room ')}</small></span><div className="bap-case-actions"><span className={'bap-badge '+(row.status==='Selesai'?'done':'')}>{row.status}</span><div className="bap-case-controls"><button className="btn primary bap-open-button" onClick={onOpen} aria-label={`Buka BAP ${row.person.nama}`}>Buka BAP →</button><div className="bap-secondary-actions"><button type="button" className="btn secondary bap-document-button" onClick={()=>openPanel('category')} title="Perbandingan kategori awal dan hasil wawancara" aria-haspopup="dialog">Perbandingan kategori{categoryDirty&&<small className="bap-unsaved-badge">Belum tersimpan</small>}</button><button type="button" className="btn secondary bap-document-button" onClick={()=>openPanel('report')} title="Draf LHP — analisis, rekomendasi dan unduhan" aria-haspopup="dialog">Draf LHP{reportDirty&&<small className="bap-unsaved-badge">Belum tersimpan</small>}</button></div></div></div></div>
  {categoryLoaded&&<DocumentDialog open={activePanel==='category'} title="Perbandingan kategori awal dan hasil wawancara" row={row} dirty={categoryDirty} onClose={()=>setActivePanel(null)}><CategoryComparison client={client} row={row} profile={profile} userId={userId} active={activePanel==='category'} bapDirty={bapState.dirty} bapBusy={bapState.busy} onDirty={setCategoryDirty}/></DocumentDialog>}
  {reportLoaded&&<DocumentDialog open={activePanel==='report'} title="Draf LHP — analisis, rekomendasi dan unduhan" row={row} dirty={reportDirty} onClose={()=>setActivePanel(null)}><LhpPanel client={client} row={row} profile={profile} userId={userId} active={activePanel==='report'} bapDirty={bapState.dirty||categoryDirty||bapState.statementDirty} bapBusy={bapState.busy} onDirty={setReportDirty}/></DocumentDialog>}
  {editing&&<BapEditor row={row} client={client} profile={profile} userId={userId} onStateChange={setBapState} onClose={closeBap} onSaved={onSaved}/>}
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

function BapEditor({row:remote,client,profile,userId,onStateChange,onClose,onSaved}){
 const [row,setRow]=useState(remote),[identity,setIdentity]=useState(()=>initialIdentity(remote,remote.locked_by===userId?{nama:profile.nama}:{})),[answers,setAnswers]=useState(remote.answers||{}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[preview,setPreview]=useState(false),[previewBusy,setPreviewBusy]=useState(false),[word,setWord]=useState(null),[reason,setReason]=useState(''),[schedule,setSchedule]=useState({roomId:remote.room_id,date:remote.scheduled_date,time:remote.scheduled_time.slice(0,5)})
 const [statementDirty,setStatementDirty]=useState(false)
 const [signatoryError,setSignatoryError]=useState('')
 const dirty=useRef(false),saving=useRef(false),conflict=useRef(false),editSeq=useRef(0),current=useRef({row,identity,answers}),previewNode=useRef(null),dialog=useRef(null),mounted=useRef(true)
 current.current={row,identity,answers}
 const readOnly=profile.role==='viewer'||row.status==='Selesai'||!row.started_at||row.locked_by!==userId
 const canRevise=row.status==='Selesai'&&['admin','editor','interviewer'].includes(profile.role)&&(profile.role==='admin'||profile.role==='interviewer'||row.locked_by===userId)
 const missing=missingFields(row,identity,answers)
 const progress=Object.values(answers).filter(a=>a.trim()).length
 useEffect(()=>{mounted.current=true;const el=dialog.current;el.showModal();return()=>{mounted.current=false;el.close()}},[])
 useEffect(()=>{onStateChange({dirty:dirty.current,statementDirty,busy})},[identity,answers,statementDirty,busy,onStateChange])
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
 async function action(name,payload={}){setBusy(true);setError('');try{const next=await act(client,current.current.row,name,payload);saved(next);conflict.current=false;setWord(null);setPreview(false);setNotice(name==='revise'?'BAP dibuka untuk diperbarui. Kategori, SPTJM dan LHP perlu ditinjau kembali setelah revisi.':'Data pemeriksaan diperbarui.')}catch(e){setError(e.message)}finally{setBusy(false)}}
 async function openPreview(){
  if(dirty.current&&!(await save()))return
  setPreview(true);setPreviewBusy(true);setError('')
  try{const c=current.current;const blob=await buildWord(c.row,c.identity,c.answers);flushSync(()=>setWord(blob));await renderPreview(blob,previewNode.current)}catch(e){setError(e.message);setWord(null)}finally{setPreviewBusy(false)}
 }
 async function exportPdf(){setBusy(true);setError('');try{download(await buildPdf(previewNode.current),`BAP-${row.person.nip}.pdf`)}catch(e){setError(e.message)}finally{setBusy(false)}}
 const panels={
  bap:(<section key="bap" className="bap-workspace" aria-label="Berita Acara Pemeriksaan"><h3>Berita Acara Pemeriksaan (BAP)</h3>
  {!row.started_at&&<section className="notice blue-notice"><span>Jadwal: {when(row)}. Pastikan peserta yang hadir sesuai identitas ini.</span>{profile.role!=='viewer'&&<button className="btn primary" disabled={busy} onClick={()=>action('start')}>Identitas sesuai — Mulai wawancara</button>}</section>}
  {row.started_at&&<p>Tanggal BAP sesuai jadwal: {dateWords(interviewTimestamp(row)).hari}, {dateWords(interviewTimestamp(row)).tanggal_huruf} {dateWords(interviewTimestamp(row)).bulan} {dateWords(interviewTimestamp(row)).tahun_huruf} (WIB)</p>}
  {canRevise&&<section className="notice blue-notice"><span>BAP sudah selesai dan dapat diperbaiki. Revisi akan menjadi draf kembali; kategori, SPTJM dan LHP terkait perlu ditinjau ulang.</span><button className="btn secondary" disabled={busy||conflict.current} onClick={()=>action('revise',{reason:'Perbaikan BAP setelah selesai'})}>Revisi BAP</button></section>}
  {row.started_at&&row.status!=='Selesai'&&row.locked_by!==userId&&<p className="notice amber-notice">{row.locked_by?'Sedang ditangani pewawancara lain.':'Draf siap dilanjutkan.'}{!row.locked_by&&profile.role!=='viewer'&&<button className="btn primary" disabled={busy} onClick={()=>action('start')}>Lanjutkan wawancara</button>}</p>}
  {!preview&&<><section className="panel"><h3>Identitas & administrasi</h3><p>Nama dan NIP mengikuti peserta terjadwal. Pangkat dan jabatan terhubung ke data surat panggilan berdasarkan NIP. Periksa kesesuaiannya sebelum melanjutkan.</p><div className="bap-identity">{IDENTITY_FIELDS.map(([key,label])=><label key={key}>{label}{!identity[key]&&<small className="bap-required">Belum diisi</small>}<input aria-label={label} type={key==='tanggalSurat'?'date':'text'} maxLength={500} value={identity[key]||''} disabled={readOnly||busy} onChange={e=>change('identity',key,e.target.value)}/></label>)}</div>
   <h4>Pewawancara pendamping</h4><p>Nama diisi dari akun yang menangani wawancara. Periksa nama lengkap dan lengkapi NIP untuk blok tanda tangan di bawah Faisal. Untuk akun unit/room, isi nama petugas yang melaksanakan wawancara.</p>
   {signatoryError&&<p className="notice amber-notice">{signatoryError}</p>}
   {row.status==='Selesai'&&(!identity.pewawancaraNama?.trim()||!identity.pewawancaraNip?.trim())&&<p className="notice amber-notice">Identitas pewawancara belum lengkap. Gunakan Revisi BAP untuk melengkapinya sebelum mengunduh.</p>}
   <div className="bap-identity">{INTERVIEWER_FIELDS.map(([key,label])=><label key={key}>{label}<input aria-label={label} inputMode={key==='pewawancaraNip'?'numeric':undefined} maxLength={key==='pewawancaraNip'?30:200} value={identity[key]||''} disabled={readOnly||busy} onChange={e=>change('identity',key,e.target.value)} placeholder={key==='pewawancaraNip'?'18 digit NIP pewawancara':'Nama lengkap pewawancara'}/></label>)}</div>
   </section>
   <section className="panel"><h3>Jawaban BAP · {progress}/22 terisi</h3>{QUESTIONS.map((q,i)=><label className="bap-question" key={i}><b>{i+1}. {q.replace('{nomorSurat}',identity.nomorSurat||'…').replace('{tanggalSuratTeks}',identity.tanggalSurat||'…')}</b><textarea rows={3} maxLength={8000} value={answers[i+1]||''} disabled={readOnly||busy} onChange={e=>change('answer',i+1,e.target.value)} placeholder="Catat jawaban peserta sesuai keterangannya"/></label>)}</section></>}
  {preview&&<section><div className="bap-preview-actions"><button className="btn secondary" disabled={busy||previewBusy} onClick={()=>setPreview(false)}>Kembali ke isian / revisi</button><button className="btn primary" disabled={busy||previewBusy||!word||missing.length>0} onClick={()=>download(word,`BAP-${row.person.nip}.docx`)}>Unduh Word</button><button className="btn primary" disabled={busy||previewBusy||!word||missing.length>0} onClick={exportPdf}>{busy?'Menyiapkan…':'Unduh PDF'}</button></div>{missing.length>0&&<p role="alert" className="notice amber-notice">Lengkapi sebelum unduh: {missing.join(', ')}.</p>}{previewBusy&&<p role="status">Menyiapkan halaman pratinjau…</p>}<div className="bap-preview-scroll"><div ref={previewNode}/></div><p className="bap-preview-note">PDF mengikuti halaman pratinjau ini. Word menggunakan template asli; pemenggalan halaman dapat menyesuaikan aplikasi Word/WPS dan font yang tersedia.</p></section>}
  </section>),
  statement:(<details key="statement" hidden={preview} className="panel"><summary><b>SPTJM — pernyataan, pratinjau dan unduhan</b></summary><StatementPanel client={client} row={row} profile={profile} userId={userId} bapDirty={dirty.current} bapBusy={busy} onDirty={setStatementDirty}/></details>),
 }
 const panelOrder=['bap','statement']
 return <dialog ref={dialog} className="bap-dialog" aria-label={`BAP ${row.person.nama}`} onCancel={e=>{e.preventDefault();onClose()}}>
  <header className="bap-editor-header"><div><h2>{row.person.nama}</h2><p>NIP {row.person.nip} · {row.room_id.replace('room-','Room ')} · {row.status}</p></div><button className="btn secondary" onClick={onClose} disabled={busy}>Tutup</button></header>
  {error&&<p className="notice red-notice" role="alert">{error}{conflict.current&&' Salin jawaban yang belum tersimpan sebelum menutup, lalu buka kembali data terbaru.'}</p>}
  {notice&&<p role="status">{notice}</p>}
  {panelOrder.map(key=>panels[key])}
  {profile.role==='admin'&&<details className="panel"><summary>Administrasi penugasan / pembukaan draf</summary>{!row.started_at&&<div className="bap-filters"><label>Room<select value={schedule.roomId} onChange={e=>setSchedule({...schedule,roomId:e.target.value})}>{Array.from({length:19},(_,i)=><option key={i} value={`room-${i+1}`}>Room {i+1}</option>)}</select></label><label>Tanggal<input type="date" value={schedule.date} onChange={e=>setSchedule({...schedule,date:e.target.value})}/></label><label>Jam WIB<input type="time" value={schedule.time} onChange={e=>setSchedule({...schedule,time:e.target.value})}/></label><button className="btn secondary" disabled={busy} onClick={()=>action('schedule',schedule)}>Simpan penugasan</button></div>}{row.started_at&&<><label>Alasan membuka / melepas kunci<input value={reason} onChange={e=>setReason(e.target.value)} placeholder="Minimal 5 karakter"/></label><button className="btn secondary" disabled={busy||reason.trim().length<5} onClick={()=>action('reopen',{reason})}>Buka kembali / lepaskan kunci</button></>}</details>}
  <footer className="bap-editor-footer"><span>{busy?'Memproses…':notice||'Draf tersimpan otomatis setelah berhenti mengetik selama 1 menit. Gunakan Simpan draf untuk menyimpan sekarang.'}</span><div>{!readOnly&&<button className="btn secondary" disabled={busy||conflict.current} onClick={()=>save()}>Simpan draf</button>}<button className="btn primary" disabled={busy||previewBusy||!row.started_at||conflict.current} onClick={openPreview}>Pratinjau BAP</button>{!readOnly&&<button className="btn primary" disabled={busy||missing.length>0||!preview||!word||conflict.current} onClick={()=>save('finalize')}>Finalisasi BAP</button>}</div></footer>
 </dialog>
}
