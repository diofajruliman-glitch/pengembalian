import React,{useState} from 'react'
import {liveProgressCounts,interviewTime} from '../interviews/liveProgress.js'
import './portal.css'

export default function SharedProgress({client,onOpenBap,localEntries,liveEntries,isAdmin,liveState,onRefresh}){
 const {rows=[],error='',ready=false,updatedAt=''}=liveState
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[publishError,setPublishError]=useState('')
 const counts=liveProgressCounts(liveEntries)
 const changes=rows.filter(r=>!r.started_at&&!['Selesai','Tertunda'].includes(r.status)&&localEntries?.[r.nik]?.date&&localEntries[r.nik].time&&localEntries[r.nik].roomId&&(localEntries[r.nik].date!==r.scheduled_date||localEntries[r.nik].time!==String(r.scheduled_time||'').slice(0,5)||localEntries[r.nik].roomId!==r.room_id))
 async function publish(){
  if(!window.confirm(`Kirim perubahan jadwal ${changes.length} peserta ke portal pewawancara? Jadwal yang sudah mulai diperiksa atau tertunda akan ditolak.`))return
  setBusy(true);setPublishError('');setMessage('')
  try{
   const {error}=await client.rpc('interview_schedule_batch',{p_items:changes.map(r=>({nik:r.nik,revision:r.revision,schedule:{date:localEntries[r.nik].date,time:localEntries[r.nik].time,roomId:localEntries[r.nik].roomId}}))})
   if(error)throw error
   setMessage('Perubahan jadwal tersimpan di database dan tersedia bagi pewawancara.');await onRefresh?.()
  }catch(e){setPublishError(e.message+' Tidak ada perubahan jadwal batch yang disimpan.')}finally{setBusy(false)}
 }
 return <section className="panel bap-progress-link"><div><h2>Portal BAP · monitoring bersama</h2><p>{ready?`${rows.length} peserta · ${liveState.activityReady===false?'Pembukaan BAP belum tersedia':`${counts.opened} BAP dibuka`} · ${counts.ongoing} dalam wawancara · ${counts.draft} draf · ${counts.deferred} tertunda · ${counts.completed} selesai · ${liveState.activityReady===false?'Kendala belum tersedia':`${counts.obstacles} kendala terbuka` }.`:'Memuat status wawancara dari database…'}</p><p>Room, BNBA, dan Portal Wawancara menampilkan status database secara otomatis setiap 5 detik. Progres menunjukkan jawaban yang sudah tersimpan. Pembukaan BAP belum menandakan wawancara dimulai.</p>{updatedAt&&<small>Pembaruan terakhir: {interviewTime(updatedAt)}{error?' · koneksi terganggu; data terakhir dapat berubah.':' · terhubung'}</small>}{message&&<p role="status">{message}</p>}{(error||publishError)&&<p role="alert" className="danger-text">{error&&`Status terbaru belum dapat dimuat: ${error}. ${ready?'Data terakhir ditampilkan dengan penanda gangguan koneksi.':'Status lokal tidak digunakan sebagai status wawancara bersama.'}`}{publishError}</p>}</div><div className="bap-preview-actions">{onOpenBap&&<button className="btn primary" onClick={()=>onOpenBap()}>Buka antrean & hasil BAP</button>}<button className="btn secondary" onClick={()=>onRefresh?.()}>Perbarui monitoring</button>{isAdmin&&<button className="btn secondary" disabled={busy||!ready||!changes.length||Boolean(error)} onClick={publish}>{busy?'Mengirim…':`Kirim ${changes.length} perubahan jadwal lokal`}</button>}</div></section>
}
