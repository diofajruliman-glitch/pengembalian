import React,{useCallback,useEffect,useRef,useState} from 'react'
import {listCases,act} from './api.js'
import {QUESTIONS,IDENTITY_FIELDS,initialIdentity,missingFields,dateWords} from './model.js'
import {buildWord,renderPreview,buildPdf,download} from './documents.js'
import './portal.css'

const when=row=>`${row.scheduled_date} · ${row.scheduled_time.slice(0,5)} WIB`
export default function InterviewerPortal({client,profile,userId,onSignOut,initialNik=''}){
 const [rows,setRows]=useState([]),[error,setError]=useState(''),[loading,setLoading]=useState(true),[query,setQuery]=useState(''),[date,setDate]=useState(''),[room,setRoom]=useState(''),[selected,setSelected]=useState(null)
 const alive=useRef(true),dirty=useRef(false)
 const reload=useCallback(async()=>{try{const data=await listCases(client);if(alive.current){setRows(data);setError('')}}catch(e){if(alive.current)setError(e.message)}finally{if(alive.current)setLoading(false)}},[client])
 useEffect(()=>{alive.current=true;reload();const id=setInterval(reload,15000);return()=>{alive.current=false;clearInterval(id)}},[reload])
 useEffect(()=>{if(initialNik&&rows.some(r=>r.nik===initialNik))setSelected(initialNik)},[initialNik,rows.length])
 const row=rows.find(r=>r.nik===selected)
 const privileged=['admin','editor','viewer'].includes(profile.role)
 const filtered=rows.filter(r=>(!date||r.scheduled_date===date)&&(!room||r.room_id===room)&&`${r.person.nama} ${r.person.nip}`.toLowerCase().includes(query.toLowerCase()))
 function close(){if(dirty.current&&!window.confirm('Jawaban belum tersimpan. Tetap tutup dan buang perubahan?'))return;dirty.current=false;setSelected(null)}
 return <div className="bap-portal">
  <header className="bap-portal-heading"><div><span className="eyebrow">PELAKSANAAN WAWANCARA</span><h1>{privileged?'Hasil & Portal BAP':'Portal Pewawancara'}</h1><p>{profile.nama} · {privileged?'Seluruh room':rows[0]?.room_id.replace('room-','Room ')||'Penugasan Anda'}</p></div>{onSignOut&&<button className="btn secondary" onClick={()=>{if(!dirty.current||window.confirm('Ada jawaban belum tersimpan. Tetap keluar?'))onSignOut()}}>Keluar</button>}</header>
  <p className="notice blue-notice">Pilih peserta yang sudah hadir tanpa harus mengikuti urutan jadwal. Tanggal BAP mengikuti waktu mulai aktual dalam WIB. Progres diperbarui setiap 15 detik.</p>
  <div className="bap-stats">{['Terjadwal','Dalam wawancara','Draf','Selesai'].map(s=><div key={s}><strong>{rows.filter(r=>r.status===s).length}</strong><span>{s}</span></div>)}</div>
  {error&&<p role="alert" className="notice red-notice">{error} <button className="btn secondary" onClick={reload}>Coba lagi</button></p>}
  <section className="panel"><div className="bap-filters"><label>Cari peserta<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Nama atau NIP"/></label><label>Tanggal jadwal<select value={date} onChange={e=>setDate(e.target.value)}><option value="">Semua tanggal</option>{[...new Set(rows.map(r=>r.scheduled_date))].map(d=><option key={d}>{d}</option>)}</select></label>{privileged&&<label>Room<select value={room} onChange={e=>setRoom(e.target.value)}><option value="">Semua room</option>{[...new Set(rows.map(r=>r.room_id))].sort((a,b)=>Number(a.slice(5))-Number(b.slice(5))).map(r=><option key={r} value={r}>{r.replace('room-','Room ')}</option>)}</select></label>}<button className="btn secondary" onClick={reload}>Perbarui</button></div>
   <p>{loading?'Memuat antrean…':`${filtered.length} peserta`}</p><div className="bap-queue">{filtered.map(r=><button className="bap-queue-item" key={r.nik} onClick={()=>setSelected(r.nik)}><span><b>{r.person.nama}</b><small>NIP {r.person.nip}</small><small>{when(r)} · {r.room_id.replace('room-','Room ')}</small></span><span className={'bap-badge '+(r.status==='Selesai'?'done':'')}>{r.status}</span><span>Buka BAP →</span></button>)}</div>{!loading&&!rows.length&&!error&&<p>Belum ada peserta pada penugasan akun ini. Hubungi admin untuk memeriksa pembagian room.</p>}
  </section>
  {row&&<BapEditor key={row.nik} row={row} client={client} profile={profile} userId={userId} dirtyRef={dirty} onClose={close} onSaved={saved=>setRows(current=>current.map(r=>r.nik===saved.nik?saved:r))}/>}
 </div>
}

function BapEditor({row:remote,client,profile,userId,dirtyRef,onClose,onSaved}){
 const [row,setRow]=useState(remote),[identity,setIdentity]=useState(()=>initialIdentity(remote)),[answers,setAnswers]=useState(remote.answers||{}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[preview,setPreview]=useState(false),[previewBusy,setPreviewBusy]=useState(false),[word,setWord]=useState(null),[reason,setReason]=useState(''),[schedule,setSchedule]=useState({roomId:remote.room_id,date:remote.scheduled_date,time:remote.scheduled_time.slice(0,5)})
 const dirty=useRef(false),saving=useRef(false),conflict=useRef(false),editSeq=useRef(0),current=useRef({row,identity,answers}),previewNode=useRef(null),dialog=useRef(null),mounted=useRef(true)
 current.current={row,identity,answers}
 const readOnly=profile.role==='viewer'||row.status==='Selesai'||!row.started_at||row.locked_by!==userId
 const missing=missingFields(row,identity,answers)
 const progress=Object.values(answers).filter(a=>a.trim()).length
 useEffect(()=>{const el=dialog.current;el.showModal();return()=>{mounted.current=false;el.close()}},[])
 useEffect(()=>{function leave(e){if(dirty.current){e.preventDefault();e.returnValue=''}}window.addEventListener('beforeunload',leave);return()=>window.removeEventListener('beforeunload',leave)},[])
 useEffect(()=>{
  if(remote.revision<=current.current.row.revision)return
  if(dirty.current||saving.current){conflict.current=true;setError('INTERVIEW_CONFLICT: Data berubah di perangkat lain. Salin perubahan yang belum tersimpan sebelum membuka ulang.');return}
  setRow(remote);setIdentity(initialIdentity(remote));setAnswers(remote.answers||{});setPreview(false);setWord(null)
 },[remote.revision])
 const saved=next=>{setRow(next);onSaved(next);current.current.row=next}
 async function save(action='save'){
  if(saving.current)return false
  saving.current=true;setBusy(true);setError('')
  const seq=editSeq.current,c=current.current
  try{
   const next=await act(client,c.row,action,{identity:c.identity,answers:c.answers})
   if(mounted.current){saved(next);if(seq===editSeq.current){dirty.current=false;dirtyRef.current=false}setNotice(action==='finalize'?'BAP difinalisasi. Dokumen dikunci.':'Tersimpan di database · '+new Date().toLocaleTimeString('id-ID',{timeZone:'Asia/Jakarta'}))}
   return true
  }catch(e){if(mounted.current){setError(e.message);if(e.message.includes('CONFLICT')||e.message.includes('LOCKED'))conflict.current=true}return false}
  finally{saving.current=false;if(mounted.current)setBusy(false)}
 }
 useEffect(()=>{const id=setInterval(()=>{if(dirty.current&&!conflict.current)save()},4000);return()=>clearInterval(id)},[])
 function change(kind,key,value){editSeq.current++;dirty.current=true;dirtyRef.current=true;setWord(null);setPreview(false);setNotice('Perubahan belum tersimpan');if(kind==='identity')setIdentity(prev=>({...prev,[key]:value}));else setAnswers(prev=>({...prev,[key]:value}))}
 async function action(name,payload={}){setBusy(true);setError('');try{const next=await act(client,current.current.row,name,payload);saved(next);setNotice('Data pemeriksaan diperbarui.')}catch(e){setError(e.message)}finally{setBusy(false)}}
 async function openPreview(){
  if(dirty.current&&!(await save()))return
  setPreview(true);setPreviewBusy(true);setError('')
  try{const c=current.current;const blob=await buildWord(c.row,c.identity,c.answers);setWord(blob);await new Promise(resolve=>requestAnimationFrame(resolve));await renderPreview(blob,previewNode.current)}catch(e){setError(e.message);setWord(null)}finally{setPreviewBusy(false)}
 }
 async function exportPdf(){setBusy(true);setError('');try{download(await buildPdf(previewNode.current),`BAP-${row.person.nip}.pdf`)}catch(e){setError(e.message)}finally{setBusy(false)}}
 return <dialog ref={dialog} className="bap-dialog" aria-label={`BAP ${row.person.nama}`} onCancel={e=>{e.preventDefault();onClose()}}>
  <header className="bap-editor-header"><div><h2>{row.person.nama}</h2><p>NIP {row.person.nip} · {row.room_id.replace('room-','Room ')} · {row.status}</p></div><button className="btn secondary" onClick={onClose} disabled={busy}>Tutup</button></header>
  {error&&<p className="notice red-notice" role="alert">{error}{conflict.current&&' Salin jawaban yang belum tersimpan sebelum menutup, lalu buka kembali data terbaru.'}</p>}
  {notice&&<p role="status">{notice}</p>}
  {!row.started_at&&<section className="notice blue-notice"><span>Jadwal: {when(row)}. Pastikan peserta yang hadir sesuai identitas ini.</span>{profile.role!=='viewer'&&<button className="btn primary" disabled={busy} onClick={()=>action('start')}>Identitas sesuai — Mulai wawancara</button>}</section>}
  {row.started_at&&<p>Pelaksanaan: {dateWords(row.started_at).hari}, {dateWords(row.started_at).tanggal_huruf} {dateWords(row.started_at).bulan} {dateWords(row.started_at).tahun_huruf} (WIB)</p>}
  {row.started_at&&row.status!=='Selesai'&&row.locked_by!==userId&&<p className="notice amber-notice">{row.locked_by?'Sedang ditangani pewawancara lain.':'Draf siap dilanjutkan.'}{!row.locked_by&&profile.role!=='viewer'&&<button className="btn primary" disabled={busy} onClick={()=>action('start')}>Lanjutkan wawancara</button>}</p>}
  {profile.role==='admin'&&<details className="panel"><summary>Administrasi penugasan / pembukaan draf</summary>{!row.started_at&&<div className="bap-filters"><label>Room<select value={schedule.roomId} onChange={e=>setSchedule({...schedule,roomId:e.target.value})}>{Array.from({length:19},(_,i)=><option key={i} value={`room-${i+1}`}>Room {i+1}</option>)}</select></label><label>Tanggal<input type="date" value={schedule.date} onChange={e=>setSchedule({...schedule,date:e.target.value})}/></label><label>Jam WIB<input type="time" value={schedule.time} onChange={e=>setSchedule({...schedule,time:e.target.value})}/></label><button className="btn secondary" disabled={busy} onClick={()=>action('schedule',schedule)}>Simpan penugasan</button></div>}{row.started_at&&<><label>Alasan membuka / melepas kunci<input value={reason} onChange={e=>setReason(e.target.value)} placeholder="Minimal 5 karakter"/></label><button className="btn secondary" disabled={busy||reason.trim().length<5} onClick={()=>action('reopen',{reason})}>Buka kembali / lepaskan kunci</button></>}</details>}
  {!preview&&<><section className="panel"><h3>Identitas & administrasi</h3><p>Nama dan NIP mengikuti peserta terjadwal. Pangkat/jabatan yang kosong perlu diverifikasi dan dilengkapi.</p><div className="bap-identity">{IDENTITY_FIELDS.map(([key,label])=><label key={key}>{label}{!identity[key]&&<small className="bap-required">Belum diisi</small>}<input aria-label={label} type={key==='tanggalSurat'?'date':'text'} maxLength={500} value={identity[key]||''} disabled={readOnly||busy} onChange={e=>change('identity',key,e.target.value)}/></label>)}</div></section>
   <section className="panel"><h3>Jawaban BAP · {progress}/22 terisi</h3>{QUESTIONS.map((q,i)=><label className="bap-question" key={i}><b>{i+1}. {q.replace('{nomorSurat}',identity.nomorSurat||'…').replace('{tanggalSuratTeks}',identity.tanggalSurat||'…')}</b><textarea rows={3} maxLength={8000} value={answers[i+1]||''} disabled={readOnly||busy} onChange={e=>change('answer',i+1,e.target.value)} placeholder="Catat jawaban peserta sesuai keterangannya"/></label>)}</section></>}
  {preview&&<section><div className="bap-preview-actions"><button className="btn secondary" disabled={busy||previewBusy} onClick={()=>setPreview(false)}>Kembali ke isian / revisi</button><button className="btn primary" disabled={busy||previewBusy||!word||missing.length>0} onClick={()=>download(word,`BAP-${row.person.nip}.docx`)}>Unduh Word</button><button className="btn primary" disabled={busy||previewBusy||!word||missing.length>0} onClick={exportPdf}>{busy?'Menyiapkan…':'Unduh PDF'}</button></div>{missing.length>0&&<p role="alert" className="notice amber-notice">Lengkapi sebelum unduh: {missing.join(', ')}.</p>}{previewBusy&&<p role="status">Menyiapkan halaman pratinjau…</p>}<div className="bap-preview-scroll"><div ref={previewNode}/></div><p className="bap-preview-note">PDF mengikuti halaman pratinjau ini. Word menggunakan template asli; pemenggalan halaman dapat menyesuaikan aplikasi Word/WPS dan font yang tersedia.</p></section>}
  <footer className="bap-editor-footer"><span>{busy?'Memproses…':notice||'Jawaban tersimpan otomatis setiap 4 detik setelah perubahan.'}</span><div>{!readOnly&&<button className="btn secondary" disabled={busy||conflict.current} onClick={()=>save()}>Simpan draf</button>}<button className="btn primary" disabled={busy||previewBusy||!row.started_at||conflict.current} onClick={openPreview}>Pratinjau BAP</button>{!readOnly&&<button className="btn primary" disabled={busy||missing.length>0||!preview||!word||conflict.current} onClick={()=>save('finalize')}>Finalisasi BAP</button>}</div></footer>
 </dialog>
}
