import React,{useEffect,useId,useRef,useState} from 'react'
import {activityAction} from './api.js'
import './interview-activity.css'

export function activityIsLive(activity,now=Date.now()){
 const lastSeen=Date.parse(activity?.last_seen_at||'')
 return Number.isFinite(lastSeen)&&now-lastSeen<90000&&now-lastSeen>=-30000
}
const stamp=value=>value?new Date(value).toLocaleString('id-ID',{timeZone:'Asia/Jakarta',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})+' WIB':'—'
const emptyForm={mode:null,note:'',revision:0}

export default function InterviewActivityPanel({row,activity,onActivity,client,profile,userId,onDraftChange}){
 const [signalError,setSignalError]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[form,setForm]=useState(emptyForm)
 const mounted=useRef(true),submitting=useRef(false)
 const noteId=useId()
 const canManage=['admin','editor','interviewer'].includes(profile.role)
 const canReport=canManage&&row.status!=='Selesai'
 const canSignal=canReport&&row.status!=='Tertunda'&&(!row.locked_by||row.locked_by===userId)
 const isOpen=activity?.obstacle_status==='open'
 const live=!['Selesai','Tertunda'].includes(row.status)&&activityIsLive(activity)
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[])
 useEffect(()=>{onDraftChange(Boolean(form.mode));return()=>onDraftChange(false)},[form.mode,onDraftChange])
 useEffect(()=>{
  if(!canSignal)return
  let active=true,pending=false
  async function signal(){
   if(pending)return
   pending=true
   try{
    const next=await activityAction(client,row.nik,'open')
    if(active){onActivity(next);setSignalError('')}
   }catch(failure){if(active)setSignalError(`Aktivitas membuka BAP belum tercatat di monitoring: ${failure.message}`)}
   finally{pending=false}
  }
  signal()
  const timer=setInterval(signal,20000)
  return()=>{active=false;clearInterval(timer)}
 },[canSignal,client,row.nik,onActivity])
 function begin(mode){
  if(mode==='report'&&!canReport)return
  setForm({mode,note:mode==='report'&&isOpen?activity.obstacle_note||'':'',revision:activity?.revision||0})
  setError('');setNotice('')
 }
 async function submit(event){
  event.preventDefault()
  if(submitting.current)return
  if(form.mode==='report'&&!canReport){setError('Wawancara sudah selesai. Laporan kendala baru tidak dapat dikirim. Catatan Anda tetap tersedia untuk disalin.');return}
  const note=form.note.trim()
  if(form.mode==='report'&&note.length<5){setError('Jelaskan kendala minimal 5 karakter.');return}
  submitting.current=true;setBusy(true);setError('');setNotice('')
  try{
   const next=await activityAction(client,row.nik,form.mode,{note},form.revision)
   if(mounted.current){onActivity(next);setNotice(form.mode==='report'?'Kendala dilaporkan. Laporan tersedia di monitoring pimpinan.':'Kendala ditandai teratasi di monitoring pimpinan.');setForm(emptyForm)}
  }catch(failure){
   if(mounted.current)setError(/CONFLICT/i.test(failure.message)?'Laporan kendala telah diubah akun lain. Catatan Anda tetap ada. Salin catatan bila diperlukan, lalu batalkan dan buka kembali formulir untuk memakai laporan terbaru.':`Laporan belum tersimpan: ${failure.message}`)
  }finally{submitting.current=false;if(mounted.current)setBusy(false)}
 }
 return <section className="panel bap-activity-panel" aria-label="Aktivitas dan kendala wawancara">
  <div className="bap-activity-heading"><h3>Aktivitas & kendala wawancara</h3><div className="bap-activity-badges">{live&&<span className="bap-badge bap-live-badge">BAP sedang dibuka</span>}{isOpen&&<span className="bap-badge bap-obstacle-badge">Kendala perlu ditangani</span>}{activity?.obstacle_status==='resolved'&&<span className="bap-badge done">Kendala teratasi</span>}</div></div>
  <p className="bap-activity-help">{canSignal?'Aktivitas BAP diperbarui selama jendela ini terbuka. ':profile.role==='viewer'?'Akun Anda melihat progres wawancara. ':row.status==='Selesai'?'Wawancara selesai. ':row.status==='Tertunda'?'Wawancara tertunda; aktivitas dilanjutkan setelah pewawancara menekan Lanjutkan wawancara. ':'BAP sedang ditangani akun lain. '}Progres jawaban di monitoring mengikuti draf yang sudah disimpan.</p>
  {activity?.last_seen_at&&<p className="bap-activity-time">Aktivitas BAP terakhir: {stamp(activity.last_seen_at)}{!live&&row.status!=='Selesai'?' · belum ada aktivitas terbaru':''}.</p>}
  {signalError&&canSignal&&<p className="notice amber-notice" role="alert">{signalError} Sistem akan mencoba lagi otomatis.</p>}
  {activity?.obstacle_note&&<div className={'bap-obstacle-record '+(isOpen?'is-open':'is-resolved')}><b>{isOpen?'Kendala dilaporkan':'Kendala sebelumnya'}</b><p>{activity.obstacle_note}</p><small>Dilaporkan {stamp(activity.obstacle_reported_at)}</small>{activity.obstacle_status==='resolved'&&<><small>Teratasi {stamp(activity.obstacle_resolved_at)}</small>{activity.obstacle_resolution_note&&<p>Penanganan: {activity.obstacle_resolution_note}</p>}</>}</div>}
  {error&&<p className="notice red-notice" role="alert">{error}</p>}
  {notice&&<p className="notice blue-notice" role="status">{notice}</p>}
  {canManage&&!form.mode&&(canReport||isOpen)&&<div className="bap-activity-actions">{canReport&&<button type="button" className="btn secondary" onClick={()=>begin('report')}>{isOpen?'Perbarui laporan kendala':'Laporkan kendala'}</button>}{isOpen&&<button type="button" className="btn secondary" onClick={()=>begin('resolve')}>Tandai kendala teratasi</button>}</div>}
  {canManage&&form.mode&&<form className="bap-obstacle-form" onSubmit={submit}>{form.mode==='report'&&!canReport&&<p className="notice amber-notice" role="status">Wawancara sudah selesai. Laporan kendala baru tidak dapat dikirim. Catatan Anda tetap tersedia untuk disalin.</p>}<label htmlFor={noteId}>{form.mode==='report'?'Kendala yang perlu ditangani':'Catatan penanganan (opsional)'}</label><textarea id={noteId} rows={3} maxLength={2000} minLength={form.mode==='report'?5:undefined} required={form.mode==='report'} value={form.note} onChange={event=>setForm(current=>({...current,note:event.target.value}))} disabled={busy} placeholder={form.mode==='report'?'Contoh: peserta tidak dapat melanjutkan karena koneksi terputus.':'Jelaskan penanganan yang telah dilakukan.'}/><small>Laporan dikirim terpisah dari isian BAP dan tetap tersedia saat draf disimpan.</small><div className="bap-activity-actions"><button type="submit" className="btn primary" disabled={busy||(form.mode==='report'&&(!canReport||form.note.trim().length<5))}>{busy?'Mengirim…':form.mode==='report'?'Kirim laporan kendala':'Konfirmasi teratasi'}</button><button type="button" className="btn secondary" disabled={busy} onClick={()=>{setForm(emptyForm);setError('')}}>Batal</button></div></form>}
 </section>
}
