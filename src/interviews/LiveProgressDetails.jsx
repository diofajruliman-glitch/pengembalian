import React from 'react'
import {interviewTime} from './liveProgress.js'

export default function LiveProgressDetails({entry,compact=false}){
 const live=entry?.live
 if(!live?.available)return null
 return <div className="interview-live-details">
  <span>{live.answered}/{live.total} jawaban tersimpan · {live.progress}%</span>
  <progress max={live.total} value={live.answered} aria-label="Progres jawaban BAP tersimpan"/>
  {live.status==='Tertunda'&&<div className="interview-live-deferral" role="status"><b>Wawancara tertunda</b><span>{live.deferredReason||'Alasan penundaan belum tersedia'}</span><small>Ditunda {interviewTime(live.deferredAt)}</small></div>}
  {live.stale&&<small className="interview-live-stale-note">Data terakhir · koneksi monitoring terganggu</small>}
  {live.activityAvailable===false&&<small>Aktivitas pembukaan dan kendala belum tersedia.</small>}
  {!compact&&<small>{live.startedAt?`Mulai: ${interviewTime(live.startedAt)}`:live.lastSeenAt?`BAP terakhir dibuka: ${interviewTime(live.lastSeenAt)}`:'Wawancara belum dimulai'}{live.finishedAt&&` · Selesai: ${interviewTime(live.finishedAt)}`}</small>}
  {!compact&&live.updatedAt&&<small>Pembaruan BAP: {interviewTime(live.updatedAt)}</small>}
  {live.obstacleStatus==='open'&&<div className="interview-live-obstacle" role="status"><b>Kendala berlangsung</b><span>{live.obstacleNote}</span><small>Dilaporkan {interviewTime(live.obstacleReportedAt)}</small></div>}
  {!compact&&live.obstacleStatus==='resolved'&&<small className="interview-obstacle-resolved">Kendala ditangani: {live.obstacleNote}{live.obstacleResolutionNote&&` · ${live.obstacleResolutionNote}`} · {interviewTime(live.obstacleResolvedAt)}</small>}
 </div>
}
