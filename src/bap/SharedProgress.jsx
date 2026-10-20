import React,{useEffect,useState} from 'react'
import {listCases} from './api.js'
import './portal.css'
export default function SharedProgress({client,onOpenBap,entries,isAdmin,onLoadSchedule}){
 const [rows,setRows]=useState([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
 async function refresh(){try{setRows(await listCases(client));setError('')}catch(e){setError(e.message)}}
 useEffect(()=>{refresh();const id=setInterval(refresh,15000);return()=>clearInterval(id)},[client])
 const changes=rows.filter(r=>entries?.[r.nik]&&(entries[r.nik].date!==r.scheduled_date||entries[r.nik].time!==r.scheduled_time.slice(0,5)||entries[r.nik].roomId!==r.room_id))
 async function publish(){
  if(!window.confirm(`Kirim perubahan jadwal ${changes.length} peserta ke portal pewawancara? Jadwal yang sudah mulai diperiksa akan ditolak.`))return
  setBusy(true);setError('');setMessage('')
  try{
   const {error}=await client.rpc('interview_schedule_batch',{p_items:changes.map(r=>({nik:r.nik,revision:r.revision,schedule:{date:entries[r.nik].date,time:entries[r.nik].time,roomId:entries[r.nik].roomId}}))})
   if(error)throw error
   setMessage('Perubahan jadwal tersimpan di database dan tersedia bagi pewawancara.');await refresh()
  }catch(e){setError(e.message+' Tidak ada perubahan jadwal batch yang disimpan.')}finally{setBusy(false)}
 }
 return <section className="panel bap-progress-link"><div><h2>Portal BAP · database bersama</h2><p>{rows.length} peserta · {rows.filter(r=>r.status==='Dalam wawancara').length} sedang diwawancarai · {rows.filter(r=>r.status==='Draf').length} draf · {rows.filter(r=>r.status==='Selesai').length} selesai.</p><p>Progres BAP lintas perangkat diperbarui setiap 15 detik. Kertas kerja Zoom di bawah tetap lokal; perubahan jadwal perlu dikirim ke portal.</p>{message&&<p role="status">{message}</p>}{error&&<p role="alert" className="danger-text">{error}</p>}</div><div className="bap-preview-actions"><button className="btn primary" onClick={()=>onOpenBap()}>Buka antrean & hasil BAP</button><button className="btn secondary" disabled={!rows.length||busy} onClick={()=>onLoadSchedule(rows)}>Ambil jadwal dari portal</button>{isAdmin&&<button className="btn secondary" disabled={busy||!changes.length||Boolean(error)} onClick={publish}>{busy?'Mengirim…':`Kirim ${changes.length} perubahan jadwal lokal`}</button>}</div></section>
}
