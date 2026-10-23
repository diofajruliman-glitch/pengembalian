import {QUESTIONS} from '../bap/model.js'
import {monitoringCsv} from './model.js'

export const LIVE_STATUSES=['Belum dimuat','Belum terhubung','Terjadwal','BAP dibuka','Dalam wawancara','Draf','Tertunda','Selesai','Kendala terbuka']
export const PRESENCE_WINDOW_MS=90000
export const displayInterviewStatus=entry=>entry?.live?.status||entry?.status||'Belum dijadwalkan'
export const isLiveInterview=entry=>Boolean(entry?.live?.startedAt&&['Dalam wawancara','Draf'].includes(entry.live.status))
export const isOpenedBap=entry=>entry?.live?.status==='BAP dibuka'
export const isDeferredInterview=entry=>entry?.live?.status==='Tertunda'
export const isProtectedInterview=entry=>Boolean(entry?.live?.startedAt)||isDeferredInterview(entry)||['Di room','Selesai'].includes(entry?.status)
export const interviewTime=value=>value&&Number.isFinite(Date.parse(value))?new Date(value).toLocaleString('id-ID',{timeZone:'Asia/Jakarta',dateStyle:'medium',timeStyle:'medium'})+' WIB':'—'
export function liveMonitoringPopulation(population,rows=[]){
 const byNik=new Map(population.map(person=>[person.nik,person]))
 for(const row of rows)if(!byNik.has(row.nik))byNik.set(row.nik,{...row.person,nik:row.nik,nama:row.person?.nama||row.nik})
 return [...byNik.values()]
}
export function liveMonitoringRooms(officialRooms,rows=[]){
 const byId=new Map(officialRooms.map(room=>[room.id,room]))
 for(const row of rows)if(row.room_id&&!byId.has(row.room_id))byId.set(row.room_id,{id:row.room_id,name:row.room_id.replace(/^room-/,'Room '),interviewer:'Penugasan database',enabled:true})
 return [...byId.values()]
}
export function liveInterviewSession(time){
 const slots=['08:30','09:00','09:30','10:00','10:30','11:00','11:30','13:00','13:30','14:00','14:30','15:00','15:30','16:00']
 const index=slots.indexOf(String(time||'').slice(0,5))
 return index<0?'':index+1
}
export const initialLiveProgressState=()=>({rows:[],activity:[],ready:false,activityReady:false,error:'',errorPhase:'',updatedAt:''})
export const receivedLiveProgress=data=>({...data,ready:true,activityReady:true,error:'',errorPhase:''})
export function failedLiveProgress(current,error){
 return {...current,...(error.rows?{rows:error.rows,ready:true}:{}),error:error.message||String(error),errorPhase:error.phase||'cases'}
}

// This is a display projection. Never persist it over the local scheduling
// workspace: database status and local Zoom notes have different owners.
export function liveMonitoringEntries(localEntries={},rows=[],activity=[],{connected=false,ready=false,activityReady=ready,stale=false,now=Date.now(),population=[]}={}){
 if(!connected)return localEntries
 const byNik=new Map(rows.map(row=>[row.nik,row])),activityByNik=new Map(activity.map(row=>[row.nik,row]))
 const result={}
 for(const nik of new Set([...population.map(person=>person.nik),...Object.keys(localEntries),...byNik.keys()])){
  const local=localEntries[nik]||{},row=byNik.get(nik),presence=activityByNik.get(nik)
  if(!row){result[nik]={...local,status:'Belum dijadwalkan',startedAt:'',finishedAt:'',verified:false,live:{status:ready?'Belum terhubung':'Belum dimuat',available:false}};continue}
  const seen=Date.parse(presence?.last_seen_at||''),recent=Number.isFinite(seen)&&now-seen>=-5000&&now-seen<PRESENCE_WINDOW_MS
  const status=row.status==='Selesai'?'Selesai':row.status==='Tertunda'?'Tertunda':row.started_at?(row.status==='Draf'?'Draf':'Dalam wawancara'):recent?'BAP dibuka':'Terjadwal'
  const answered=QUESTIONS.reduce((count,_,index)=>count+(typeof row.answers?.[index+1]==='string'&&row.answers[index+1].trim()?1:0),0)
  result[nik]={...local,nik,date:row.scheduled_date||'',time:String(row.scheduled_time||'').slice(0,5),session:liveInterviewSession(row.scheduled_time),roomId:row.room_id||'',duration:30,status:row.status==='Selesai'?'Selesai':row.status==='Tertunda'?'Tertunda':row.started_at?'Di room':'Terjadwal',verified:Boolean(row.started_at),startedAt:row.started_at||'',finishedAt:row.finished_at||'',live:{available:true,activityAvailable:activityReady,stale,status,person:row.person||{},answered,total:QUESTIONS.length,progress:Math.round(answered/QUESTIONS.length*100),openedAt:presence?.opened_at||'',lastSeenAt:presence?.last_seen_at||'',startedAt:row.started_at||'',finishedAt:row.finished_at||'',updatedAt:row.updated_at||'',present:recent&&!['Tertunda','Selesai'].includes(status),deferredReason:row.deferred_reason||'',deferredAt:row.deferred_at||'',deferredBy:row.deferred_by||'',obstacleStatus:activityReady?(presence?.obstacle_status||'none'):'unknown',obstacleNote:presence?.obstacle_note||'',obstacleReportedAt:presence?.obstacle_reported_at||'',obstacleResolutionNote:presence?.obstacle_resolution_note||'',obstacleResolvedAt:presence?.obstacle_resolved_at||'',revision:row.revision}}
 }
 return result
}

export function liveProgressCounts(entries){
 const counts={opened:0,ongoing:0,draft:0,deferred:0,completed:0,obstacles:0,scheduled:0}
 for(const entry of Object.values(entries||{})){
  if(!entry.live?.available)continue
  if(isOpenedBap(entry))counts.opened++
  else if(entry.live.status==='Dalam wawancara')counts.ongoing++
  else if(entry.live.status==='Draf')counts.draft++
  else if(isDeferredInterview(entry))counts.deferred++
  else if(entry.live.status==='Selesai')counts.completed++
  else counts.scheduled++
  if(entry.live.obstacleStatus==='open')counts.obstacles++
 }
 return counts
}

const csvValue=value=>{
 let text=String(value??'')
 if(/^[\s\u0000-\u001f]*[=+\-@]/.test(text)||/^[\t\r\n]/.test(text))text=`'${text}`
 return `"${text.replace(/"/g,'""')}"`
}
export function sharedMonitoringCsv(population,entries,rooms,{connected=false,error='',updatedAt=''}={}){
 if(!connected)return monitoringCsv(population,entries,rooms)
 const extraHeaders=['Sumber jadwal','Jawaban BAP tersimpan','Jumlah pertanyaan BAP','Progres BAP (%)','BAP terakhir dibuka','Pembaruan BAP','Alasan penundaan terakhir','Waktu penundaan terakhir','Status kendala bersama','Laporan kendala bersama','Kendala dilaporkan','Kendala diselesaikan','Catatan penyelesaian kendala','Kesegaran monitoring','Pembaruan monitoring bersama']
 const baseHeader=monitoringCsv([],{},rooms).slice(0,-2).replace('"Status"','"Status portal BAP"').replace('"Catatan"','"Catatan lokal Zoom"').replace('"Pimpinan"','"Catatan pimpinan lokal"')
 const lines=[baseHeader+';'+extraHeaders.map(csvValue).join(';')]
 for(const person of population||[]){
  const entry=entries?.[person.nik]||{},live=entry.live
  const rowCsv=monitoringCsv([person],{[person.nik]:{...entry,status:live?.status||'Belum dimuat'}},rooms)
  // Slice at the header boundary instead of splitting records: a quoted local
  // note may contain semicolons, CRLFs or double quotes.
  const record=rowCsv.slice(rowCsv.indexOf('\r\n')+2,-2)
  const obstacle=live?.activityAvailable?({none:'Tidak ada',open:'Terbuka',resolved:'Selesai ditangani'}[live.obstacleStatus]||'Belum tersedia'):'Belum tersedia'
  const extras=[live?.available?'Database BAP':'Acuan lokal; jadwal database belum tersedia',live?.available?live.answered:'',live?.available?live.total:'',live?.available?live.progress:'',live?.lastSeenAt,live?.updatedAt,live?.deferredReason,live?.deferredAt,obstacle,live?.obstacleNote,live?.obstacleReportedAt,live?.obstacleResolvedAt,live?.obstacleResolutionNote,error||live?.stale?'Data terakhir; koneksi terganggu':live?.available?'Terhubung':'Belum tersedia',updatedAt]
  lines.push(record+';'+extras.map(csvValue).join(';'))
 }
 return lines.join('\r\n')+'\r\n'
}
