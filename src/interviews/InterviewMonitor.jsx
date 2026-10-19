import React,{useEffect,useMemo,useRef,useState} from 'react'
import {createPortal} from 'react-dom'
import {CalendarDays,CheckCircle2,Clock3,Download,Info,Users,Video} from 'lucide-react'
import {DEFAULT_ROOMS,STATUSES,selectPopulation,sourceKey,createSchedule,validateAssignment,updateEntry,timerState,monitoringCsv} from './model.js'
import {loadWorkspace,saveWorkspace,validateWorkspace,recoverWorkspace} from './storage.js'
import BnbaPanel from './BnbaPanel.jsx'
import {getRoutingCategory,isHeavyPerson,isSpecialistRoom,specialistRooms,getRoutingConflicts} from './routing.js'
import {BulkDistributionDialog,ScheduleImportDialog,InterviewerPackagesDialog} from './DistributionTools.jsx'
import {OFFICIAL_POPULATION_1057,OFFICIAL_ROOMS_19,OFFICIAL_SETTINGS_2026,createOfficialWorkspace} from './officialSchedule1057.js'
import './interviews.css'

const DEFAULT_SETTINGS=OFFICIAL_SETTINGS_2026
const number=value=>Number(value||0).toLocaleString('id-ID')
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
const displayDate=value=>value?new Date(`${value}T12:00:00+07:00`).toLocaleDateString('id-ID',{timeZone:'Asia/Jakarta',dateStyle:'medium'}):'Belum dijadwalkan'
const statusOf=entry=>entry?.status||'Belum dijadwalkan'
const terminal=new Set(['Selesai','Tidak hadir','Terkendala','Jadwal ulang'])
const roomName=(rooms,id)=>rooms.find(room=>room.id===id)?.name||'Belum ditempatkan'
const clockText=seconds=>`${String(Math.floor(Math.abs(seconds)/60)).padStart(2,'0')}:${String(Math.abs(seconds)%60).padStart(2,'0')}`
const broadcastText='Pengingat: waktu wawancara 30 menit. Mohon selesaikan pencatatan dan hubungi Dio sebelum pergantian peserta. Peserta berikutnya menunggu di Main Room.'
function download(content,filename,type){
 const url=URL.createObjectURL(new Blob([content],{type}))
 const link=document.createElement('a');link.href=url;link.download=filename;link.click()
 setTimeout(()=>URL.revokeObjectURL(url),1000)
}
function Status({value}){return <span className={'interview-status status-'+STATUSES.indexOf(value)}>{value}</span>}
function Dialog({title,onClose,children}){
 const ref=useRef(null)
 useEffect(()=>{
  const element=ref.current,opener=document.activeElement
  element.showModal()
  return()=>{element.close();if(opener?.isConnected)opener.focus()}
 },[])
 return createPortal(<dialog ref={ref} role="dialog" className="interview-dialog" aria-label={title} onCancel={event=>{event.preventDefault();onClose()}}><div className="interview-dialog-heading"><h2>{title}</h2><button className="btn secondary" type="button" onClick={onClose}>Tutup</button></div>{children}</dialog>,document.body)
}

export default function InterviewMonitor({snapshot,canEdit=false,accountId='demo',onOpenSource}){
 const population=useMemo(()=>{
  const list=selectPopulation(snapshot)
  return list.length?list:OFFICIAL_POPULATION_1057
 },[snapshot])
 const datasetKey=sourceKey(snapshot)||'interviews-v1-official-1057'
 return <div className="interview-module">
  <div className="page-title"><div><span className="eyebrow">PELAKSANAAN WAWANCARA · DIO</span><h1>Monitoring Wawancara</h1><p>BNBA, antrean Zoom, dan kendali breakout room dalam satu kertas kerja.</p></div><span className="interview-draft">Jadwal Resmi 26–29 Okt 2026</span></div>
  <div className="notice blue-notice"><Info size={17}/><span>Jadwal Resmi Pelaksanaan Wawancara 26–29 Oktober 2026 (1.057 ASN). 19 Breakout Room, 14 sesi per hari @ 30 menit (08.30–12.00 &amp; 13.00–16.30 WIB). Seluruh kategori (Berat/Sedang/Ringan) telah didistribusikan merata ke 19 room.</span></div>
  {!population.length?<section className="panel interview-empty"><Users size={32}/><h2>Hubungkan daftar ASN Terbukti</h2><p>Buka atau muat dataset di Kategorisasi Disiplin ASN. Daftar wawancara otomatis memakai seluruh status Terbukti dari versi aktif, tanpa perlu mengunggah ulang BNBA.</p><button className="btn primary" onClick={onOpenSource}>Buka Kategorisasi Disiplin ASN</button></section>:<InterviewWorkspace key={`${accountId}:${datasetKey}`} population={population} snapshot={snapshot} datasetKey={datasetKey} accountId={accountId} canEdit={canEdit} onOpenSource={onOpenSource}/>}
 </div>
}

function InterviewWorkspace({population,snapshot,datasetKey,accountId,canEdit,onOpenSource}){
 const [initial]=useState(()=>{
  try{
   const loaded=loadWorkspace(window.localStorage,accountId,datasetKey)
   if(!loaded||!loaded.entries||Object.keys(loaded.entries).length===0){
    const official=createOfficialWorkspace(population)
    if(canEdit){
     try{
      const saved=saveWorkspace(window.localStorage,accountId,datasetKey,official,0)
      return {workspace:saved}
     }catch{
      return {workspace:official}
     }
    }
    return {workspace:official}
   }
   return {workspace:loaded}
  }catch(error){
   const official=createOfficialWorkspace(population)
   return {error:error.message,errorCode:error.code,workspace:official}
  }
 })
 const [workspace,setWorkspace]=useState(initial.workspace),[loadError,setLoadError]=useState(initial.error||''),[loadErrorCode,setLoadErrorCode]=useState(initial.errorCode||'')
 const [error,setError]=useState(''),[message,setMessage]=useState(''),[tab,setTab]=useState('rooms'),[selected,setSelected]=useState(null)
 const [query,setQuery]=useState(''),[statusFilter,setStatusFilter]=useState(''),[roomFilter,setRoomFilter]=useState(''),[dateFilter,setDateFilter]=useState(''),[categoryFilter,setCategoryFilter]=useState(''),[page,setPage]=useState(0)
 const [selectedIds,setSelectedIds]=useState([]),[distributionDialog,setDistributionDialog]=useState(null)
 const [schedule,setSchedule]=useState(null),[restore,setRestore]=useState(null),[now,setNow]=useState(Date.now())
 const fileInput=useRef(null),workspaceRef=useRef(workspace)
 const entries=workspace.entries,rooms=workspace.rooms||DEFAULT_ROOMS,settings=workspace.settings||DEFAULT_SETTINGS
 const editable=canEdit&&!loadError
 const populationById=useMemo(()=>new Map(population.map(person=>[person.nik,person])),[population])
 useEffect(()=>{
  setSelectedIds(current=>{
   const next=current.filter(nik=>populationById.has(nik)&&!['Di room','Selesai'].includes(entries[nik]?.status))
   return next.length===current.length?current:next
  })
 },[populationById,entries])
 const heavyPeople=useMemo(()=>population.filter(person=>isHeavyPerson(person)),[population])
 const routingConflicts=useMemo(()=>getRoutingConflicts(population,entries,rooms),[population,entries,rooms])
 const heavyPending=useMemo(()=>heavyPeople.filter(person=>{
  const entry=entries[person.nik]
  if(['Di room','Selesai'].includes(entry?.status))return false
  return !entry?.roomId||['Belum dijadwalkan','Jadwal ulang'].includes(entry.status)||!specialistRooms(rooms).some(room=>room.id===entry.roomId)
 }),[heavyPeople,entries,rooms])
 function distributeHeavy(){
  setSelectedIds(heavyPending.map(person=>person.nik));setQuery('');setStatusFilter('');setRoomFilter('');setDateFilter('');setCategoryFilter('Berat');setPage(0);setDistributionDialog('bulk')
 }
 const active=population.filter(person=>statusOf(entries[person.nik])==='Di room')
 useEffect(()=>{
  if(!active.length)return
  const interval=setInterval(()=>setNow(Date.now()),1000)
  return()=>clearInterval(interval)
 },[active.length>0])
 useEffect(()=>{
  function changed(event){if(event.storageArea===window.localStorage&&event.key?.startsWith('tlhp_interviews_v1:'))setMessage('Ada perubahan pada penyimpanan browser. Muat ulang catatan sebelum melanjutkan jika draft ini dibuka di tab lain.')}
  window.addEventListener('storage',changed);return()=>window.removeEventListener('storage',changed)
 },[])
 function commit(patch,success='Catatan tersimpan di browser ini.'){
  if(!editable)return 'Perubahan catatan belum diizinkan.'
  try{
   const current=workspaceRef.current
   const next=saveWorkspace(window.localStorage,accountId,datasetKey,{...current,...patch},current.revision)
   workspaceRef.current=next;setWorkspace(next);setError('');setMessage(success);return true
  }catch(err){setError(err.message);return err.message}
 }
 function reload(){try{const next=loadWorkspace(window.localStorage,accountId,datasetKey);workspaceRef.current=next;setWorkspace(next);setLoadError('');setLoadErrorCode('');setError('');setSchedule(null);setSelected(null);setSelectedIds([]);setDistributionDialog(null);setMessage('Catatan browser dimuat ulang.')}catch(err){setLoadError(err.message);setLoadErrorCode(err.code||'')}}
 function changePerson(nik,patch){
  try{return commit({entries:updateEntry(nik,patch,workspaceRef.current.entries,rooms,new Date().toISOString(),populationById.get(nik),settings)})}catch(err){setError(err.message);return err.message}
 }
 function applyDistribution(nextEntries,expectedRevision,success,nextSettings){
  if(expectedRevision!==workspaceRef.current.revision)return 'Catatan berubah sejak pratinjau. Tutup dialog dan buat pratinjau dari catatan terbaru.'
  const outcome=commit({entries:nextEntries,...(nextSettings?{settings:nextSettings}:{})},success)
  if(outcome===true)setSelectedIds([])
  return outcome
 }
 function previewSchedule(event){
  event.preventDefault()
  try{
   const form=new FormData(event.currentTarget)
   const proposed={startDate:form.get('startDate'),startTime:form.get('startTime'),duration:Number(form.get('duration')),gap:Number(form.get('gap')),perDay:Number(form.get('perDay')),skipWeekends:form.get('skipWeekends')==='on'}
   const assignments=createSchedule(population,entries,rooms,proposed)
   if(!assignments.length)throw Error('Tidak ada peserta yang belum dijadwalkan. Gunakan rincian peserta untuk menjadwalkan ulang.')
   setError('');setSchedule({assignments,settings:proposed})
  }catch(err){setError(err.message)}
 }
 function applySchedule(){
  try{
   const current=workspaceRef.current.entries
   const assignments=createSchedule(population,current,rooms,schedule.settings)
   if(JSON.stringify(assignments)!==JSON.stringify(schedule.assignments))throw Error('Catatan berubah sejak pratinjau. Susun pratinjau jadwal kembali.')
   const next={...current};for(const assignment of assignments)next[assignment.nik]={...current[assignment.nik],...assignment}
   if(commit({entries:next,settings:schedule.settings},`${number(assignments.length)} peserta dijadwalkan dalam draft browser.`)===true){setDateFilter(assignments[0].date);setSchedule(null);setTab('bnba')}
  }catch(err){setError(err.message)}
 }
 async function readBackup(event){
  const file=event.target.files?.[0];event.target.value=''
  if(!file)return
  try{
   if(file.size>4*1024*1024)throw Error('Berkas cadangan terlalu besar (maksimal 4 MiB).')
   const payload=JSON.parse(await file.text())
   if(payload.kind!=='tlhp-interviews-backup'||payload.version!==1||payload.sourceKey!==datasetKey)throw Error('Cadangan harus berasal dari sumber dan versi dataset wawancara yang sama.')
   const candidate=validateWorkspace(payload.workspace)
   const candidateRooms=candidate.rooms||DEFAULT_ROOMS
   const occupied=new Set(),interviewers=new Set()
   for(const [nik,entry] of Object.entries(candidate.entries)){
    if(!populationById.has(nik)||!STATUSES.includes(statusOf(entry)))throw Error('Cadangan berisi peserta atau status yang tidak sesuai sumber aktif.')
    if(entry.date||entry.roomId||['Terjadwal','Menunggu','Di room','Selesai'].includes(entry.status))validateAssignment({...entry,nik},candidate.entries,candidateRooms)
    if(entry.status==='Selesai'&&(!entry.verified||!Number.isFinite(Date.parse(entry.startedAt))||!Number.isFinite(Date.parse(entry.finishedAt))||Date.parse(entry.finishedAt)<Date.parse(entry.startedAt)))throw Error('Waktu mulai dan selesai dalam cadangan tidak valid.')
    if(entry.status==='Di room'){
     const interviewer=candidateRooms.find(room=>room.id===entry.roomId)?.interviewer?.trim().toLowerCase()
     if(!entry.verified||entry.finishedAt||!Number.isFinite(Date.parse(entry.startedAt))||occupied.has(entry.roomId)||(interviewer&&interviewers.has(interviewer)))throw Error('Catatan room aktif dalam cadangan tidak valid atau bentrok.')
     occupied.add(entry.roomId);if(interviewer)interviewers.add(interviewer)
    }
   }
   setRestore(candidate);setError('')
  }catch(err){setError(err instanceof SyntaxError?'Berkas cadangan JSON tidak valid.':err.message)}
 }
 const filtered=useMemo(()=>{
  const term=query.trim().toLocaleLowerCase('id-ID')
  return population.filter(person=>{
   const entry=entries[person.nik]
   return (!term||`${person.nama} ${person.nip||''} ${person.nik} ${entry?.zoomName||''}`.toLocaleLowerCase('id-ID').includes(term))&&(!categoryFilter||getRoutingCategory(person).category===categoryFilter)&&(!statusFilter||statusOf(entry)===statusFilter)&&(!roomFilter||entry?.roomId===roomFilter)&&(!dateFilter||entry?.date===dateFilter)
  }).sort((a,b)=>`${entries[a.nik]?.date||'9999'} ${entries[a.nik]?.time||''} ${a.nama}`.localeCompare(`${entries[b.nik]?.date||'9999'} ${entries[b.nik]?.time||''} ${b.nama}`,'id-ID'))
 },[population,entries,query,categoryFilter,statusFilter,roomFilter,dateFilter])
 const currentPage=Math.min(page,Math.max(0,Math.ceil(filtered.length/25)-1))
 const counts=Object.fromEntries(STATUSES.map(status=>[status,population.filter(person=>statusOf(entries[person.nik])===status).length]))
 const missing=population.filter(person=>{const entry=entries[person.nik];return entry?.date&&entry.date<=today()&&entry.status==='Terjadwal'}).length
 const orphanCount=Object.keys(entries).filter(nik=>!populationById.has(nik)).length
 function filters(patch){if('category'in patch)setCategoryFilter(patch.category);if('query'in patch)setQuery(patch.query);if('status'in patch)setStatusFilter(patch.status);if('room'in patch)setRoomFilter(patch.room);if('date'in patch)setDateFilter(patch.date);setPage(0)}
 return <>
  <section className="panel interview-source"><div><span className="eyebrow">SUMBER BNBA AKTIF</span><h2>{number(population.length)} ASN Terbukti</h2><p>{snapshot?.name||snapshot?.filename||'Jadwal Resmi 1.057 ASN (26–29 Okt 2026)'} · versi {snapshot?.versions?.[snapshot?.active]?.number||1}. Seluruh daftar Terbukti digunakan, terlepas dari filter analisis.</p>{population.length!==1057&&<p className="interview-warning">Acuan Anda 1.057 peserta; sumber aktif saat ini berisi {number(population.length)}. Periksa versi dataset sebelum menyusun jadwal.</p>}</div><button className="btn secondary" onClick={onOpenSource}>Lihat sumber</button></section>
  <div className="notice demo-notice"><Info size={17}/><span><b>Kertas kerja lokal.</b> Jadwal dan catatan disimpan di browser serta akun ini. Gunakan cadangan JSON sebelum pindah perangkat atau membersihkan browser. Perpindahan peserta dan Broadcast tetap dilakukan melalui Zoom.</span></div>
  {loadError&&<div className="notice red-notice" role="alert">{loadError} Perubahan dikunci agar catatan tersimpan tidak tertimpa.</div>}
  {orphanCount>0&&<div className="notice amber-notice">{number(orphanCount)} catatan tidak cocok dengan populasi aktif; catatan tersebut dipertahankan dan tidak masuk rekap.</div>}
  {error&&<div className="notice red-notice" role="alert">{error}</div>}
  {message&&<p className="interview-message" role="status">{message}</p>}
  <div className="interview-toolbar">
   <button className="btn secondary" onClick={reload}>Muat ulang catatan</button>
   {canEdit&&<button className="btn primary" disabled={!canEdit||Boolean(loadError)} onClick={()=>{const official=createOfficialWorkspace(population);commit(official,'Jadwal resmi 26–29 Oktober 2026 (1.057 ASN, 19 Room) diterapkan ke kertas kerja.')}}>Terapkan Jadwal Resmi 26–29 Okt (1.057 ASN)</button>}
   <button className="btn secondary" disabled={Boolean(loadError)} onClick={()=>download(JSON.stringify({kind:'tlhp-interviews-backup',version:1,sourceKey:datasetKey,exportedAt:new Date().toISOString(),workspace}),`cadangan-wawancara-${today()}.json`,'application/json')}><Download size={14}/> Cadangan JSON</button>
   {canEdit&&<><button className="btn secondary" disabled={!canEdit||(Boolean(loadError)&&loadErrorCode!=='INTERVIEW_STORAGE_CORRUPT')} onClick={()=>fileInput.current.click()}>Pulihkan cadangan</button><input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={readBackup}/></>}
   <button className="btn secondary" onClick={()=>download(monitoringCsv(population,entries,rooms),`rekap-wawancara-${today()}.csv`,'text/csv;charset=utf-8')}><Download size={14}/> Rekap seluruh BNBA</button>
  </div>
  {!canEdit&&<p className="interview-muted">Akses viewer: daftar dan rekap dapat dilihat; perubahan memerlukan akun admin atau editor.</p>}
  <div className="interview-stats">{[['Populasi',population.length,Users],['Belum dijadwalkan',counts['Belum dijadwalkan'],CalendarDays],['Terjadwal',counts.Terjadwal,CalendarDays],['Menunggu',counts.Menunggu,Clock3],['Di room',counts['Di room'],Video],['Selesai',counts.Selesai,CheckCircle2],['Perlu perhatian',counts['Tidak hadir']+counts.Terkendala+counts['Jadwal ulang'],Info]].map(([label,value,Icon])=><div key={label}><Icon size={17}/><span>{label}</span><strong>{number(value)}</strong></div>)}</div>
  <nav className="interview-tabs" aria-label="Bagian monitoring wawancara">{[['rooms','Kendali room'],['bnba','BNBA & jadwal'],['settings','Penugasan & parameter'],['guide','Panduan Dio']].map(([key,label])=><button key={key} className={'btn '+(tab===key?'primary':'secondary')} aria-current={tab===key?'page':undefined} onClick={()=>setTab(key)}>{label}</button>)}</nav>
  {(tab==='rooms'||tab==='bnba')&&<section className="panel interview-filters"><label>Tanggal kegiatan<input type="date" value={dateFilter} onChange={event=>filters({date:event.target.value})}/></label><button className="btn secondary" onClick={()=>filters({date:''})}>Semua tanggal</button>{missing>0&&<span className="interview-warning">{number(missing)} peserta terjadwal hari ini/sebelumnya belum dicatat masuk.</span>}</section>}
  {tab==='rooms'&&<>
   <section className="panel"><div className="panel-heading"><h2>Main Room & pimpinan</h2><span className="interview-muted">Catat setelah perpindahan di Zoom</span></div><form className="interview-leader" onSubmit={event=>{event.preventDefault();const data=new FormData(event.currentTarget);commit({leader:{name:data.get('name'),roomId:data.get('roomId'),notes:data.get('notes')}})}} key={workspace.revision}><label>Nama pimpinan<input name="name" maxLength={160} defaultValue={workspace.leader?.name||''} placeholder="Nama / jabatan" disabled={!editable}/></label><label>Posisi pimpinan<select name="roomId" defaultValue={workspace.leader?.roomId||'main'} disabled={!editable}><option value="main">Main Room</option>{rooms.filter(room=>room.enabled).map(room=><option key={room.id} value={room.id}>{room.name}</option>)}</select></label><label>Catatan kunjungan<input name="notes" maxLength={2000} defaultValue={workspace.leader?.notes||''} placeholder="Tujuan / waktu kunjungan" disabled={!editable}/></label><button className="btn secondary" disabled={!editable}>Simpan posisi</button></form></section>
   <div className="interview-room-grid">{rooms.filter(room=>room.enabled||active.some(person=>entries[person.nik].roomId===room.id)).map(room=>{
    const current=active.find(person=>entries[person.nik].roomId===room.id)
    const waiting=population.filter(person=>{const entry=entries[person.nik];return entry?.roomId===room.id&&(!dateFilter||entry.date===dateFilter)&&['Terjadwal','Menunggu'].includes(entry.status)}).sort((a,b)=>`${entries[a.nik].date} ${entries[a.nik].time}`.localeCompare(`${entries[b.nik].date} ${entries[b.nik].time}`))
    const next=waiting[0],entry=current?entries[current.nik]:null,timer=entry?timerState(entry,now):null
    return <section key={room.id} className={'interview-room '+(current?'is-active':'')+(timer?.overdue?' is-overdue':'')}><div className="interview-room-heading"><h2>{room.name}</h2>{current?<Status value="Di room"/>:<span className="interview-status">Belum aktif</span>}</div><p className="interview-interviewer">{room.interviewer||'Pewawancara belum ditetapkan'}</p><p className="interview-muted">Lintas: {room.crossInterviewer||'—'} · Lalu lintas: {room.trafficOfficer||'Belum ditetapkan'}</p>{current?<><div className="interview-timer" role="timer" aria-label={`Timer ${room.name}`}>{timer.overdue?'+':''}{clockText(timer.overdue?timer.elapsedSeconds-entry.duration*60:timer.remainingSeconds)}<small>{timer.overdue?'Melewati durasi':'Sisa waktu'} · {entry.duration} menit</small></div><h3>{current.nama}</h3><p>{entry.zoomName||'Nama Zoom belum dicatat'} · sesi {entry.session}</p><button className="btn primary" disabled={!editable} onClick={()=>changePerson(current.nik,{status:'Selesai'})}>Catat selesai & keluar</button><button className="btn secondary" onClick={()=>setSelected(current.nik)}>Rincian / pindah room</button></>:<div className="interview-room-idle"><Video size={25}/><b>Room belum aktif</b><span>Mulai setelah identitas diverifikasi.</span></div>}<div className="interview-next"><span>BERIKUTNYA · {number(waiting.length)} dalam antrean</span>{next?<><b>{next.nama}</b><small>{displayDate(entries[next.nik].date)} · {entries[next.nik].time} WIB · sesi {entries[next.nik].session}</small><button className="btn secondary" onClick={()=>setSelected(next.nik)}>Periksa peserta</button></>:<small>Belum ada peserta pada pilihan tanggal.</small>}</div></section>
   })}</div>
   <section className="panel interview-broadcast"><h2>Pengingat untuk seluruh room</h2><p>{broadcastText}</p><button className="btn secondary" onClick={async()=>{try{await navigator.clipboard.writeText(broadcastText);setMessage('Teks pengingat disalin. Tempel melalui Broadcast di Zoom.')}catch{setError('Teks belum dapat disalin. Pilih dan salin teks pengingat secara manual.')}}}>Salin teks Broadcast</button></section>
  </>}
  {tab==='bnba'&&<BnbaPanel filtered={filtered} entries={entries} rooms={rooms} editable={editable} query={query} statusFilter={statusFilter} roomFilter={roomFilter} currentPage={currentPage} onFilters={filters} onPage={setPage} onManage={setSelected} categoryFilter={categoryFilter} heavyStats={{total:heavyPeople.length,pending:heavyPending.length,conflicts:routingConflicts.length,locked:routingConflicts.filter(item=>item.readOnly).length,rooms:specialistRooms(rooms).length,perDay:settings.perDay}} onHeavy={distributeHeavy} onExportFiltered={()=>download(monitoringCsv(filtered,entries,rooms),`wawancara-sesuai-filter-${today()}.csv`,'text/csv;charset=utf-8')} selectedIds={selectedIds} onSelectionChange={setSelectedIds} onBulk={()=>setDistributionDialog('bulk')} onImport={()=>setDistributionDialog('import')} onPackages={()=>setDistributionDialog('packages')}/>}
  {tab==='settings'&&<>
   <section className="panel"><h2>Susun draft jadwal</h2><p>14 responden <b>per room per hari</b> (durasi 30 menit). Hanya peserta yang belum memiliki penempatan disusun otomatis. Peserta selesai, terkendala, dan perlu jadwal ulang dikelola melalui rincian.</p><form onSubmit={previewSchedule} className="interview-settings" key={`settings-${workspace.revision}`}><label>Tanggal mulai<input type="date" name="startDate" required defaultValue={settings.startDate} disabled={!editable}/></label><label>Mulai pukul (WIB)<input type="time" name="startTime" required defaultValue={settings.startTime} disabled={!editable}/></label><label>Durasi wawancara (menit)<input type="number" name="duration" min="1" max="240" required defaultValue={settings.duration} disabled={!editable}/></label><label>Jeda pergantian (menit)<input type="number" name="gap" min="0" max="120" required defaultValue={settings.gap} disabled={!editable}/></label><label>Responden / room / hari<input type="number" name="perDay" min="1" max="50" required defaultValue={settings.perDay} disabled={!editable}/></label><label className="interview-checkbox"><input type="checkbox" name="skipWeekends" defaultChecked={settings.skipWeekends} disabled={!editable}/> Lewati Sabtu & Minggu</label><div className="interview-form-actions"><button className="btn primary" disabled={!editable}>Pratinjau jadwal</button><span>{rooms.filter(room=>room.enabled).length} room aktif · kapasitas acuan {number(rooms.filter(room=>room.enabled).length*settings.perDay)} / hari</span></div></form></section>
   <RoomSettings rooms={rooms} entries={entries} editable={editable} onSave={next=>commit({rooms:next},'Draft penugasan room disimpan di browser.')}/>
  </>}
  {tab==='guide'&&<DioGuide/>}
  {distributionDialog==='bulk'&&editable&&<BulkDistributionDialog population={population} entries={entries} rooms={rooms} settings={settings} selectedIds={selectedIds} revision={workspace.revision} onApply={applyDistribution} onClose={()=>setDistributionDialog(null)}/>}
  {distributionDialog==='import'&&editable&&<ScheduleImportDialog population={population} entries={entries} rooms={rooms} settings={settings} revision={workspace.revision} onApply={applyDistribution} onClose={()=>setDistributionDialog(null)}/>}
  {distributionDialog==='packages'&&<InterviewerPackagesDialog population={population} entries={entries} rooms={rooms} onClose={()=>setDistributionDialog(null)}/>}
  {selected&&populationById.has(selected)&&<ParticipantDialog key={selected} person={populationById.get(selected)} entry={entries[selected]} rooms={rooms} settings={settings} editable={editable} onClose={()=>setSelected(null)} onSave={patch=>changePerson(selected,patch)}/>}
  {schedule&&<Dialog title="Tinjau draft jadwal" onClose={()=>setSchedule(null)}>{error&&<p role="alert" className="interview-warning">{error}</p>}<p><b>{number(schedule.assignments.length)} responden</b> · {new Set(schedule.assignments.map(entry=>entry.date)).size} hari kegiatan · {schedule.settings.perDay} responden per room per hari.</p><p>{displayDate(schedule.assignments[0].date)} sampai {displayDate(schedule.assignments.at(-1).date)}. {schedule.settings.duration} menit wawancara + {schedule.settings.gap} menit pergantian. Jadwal belum diterapkan.</p><div className="table-scroll"><table><thead><tr><th>Tanggal / sesi</th><th>Room</th><th>Responden</th><th>Waktu WIB</th></tr></thead><tbody>{schedule.assignments.slice(0,12).map(entry=><tr key={entry.nik}><td>{displayDate(entry.date)} · sesi {entry.session}</td><td>{roomName(rooms,entry.roomId)}</td><td>{populationById.get(entry.nik)?.nama}</td><td>{entry.time}</td></tr>)}</tbody></table></div><p>Menampilkan {Math.min(12,schedule.assignments.length)} baris pertama. Seluruh jadwal tersedia di BNBA setelah diterapkan.</p><div className="interview-form-actions"><button className="btn secondary" onClick={()=>setSchedule(null)}>Kembali</button><button className="btn primary" disabled={!editable} onClick={applySchedule}>Terapkan draft ke kertas kerja</button></div></Dialog>}
  {restore&&<Dialog title="Tinjau pemulihan cadangan" onClose={()=>setRestore(null)}>{error&&<p role="alert" className="interview-warning">{error}</p>}<p>Cadangan berisi {number(Object.keys(restore.entries).length)} catatan. Pemulihan akan mengganti draft di browser ini. Unduh cadangan draft saat ini terlebih dahulu bila masih diperlukan.</p><button className="btn primary" disabled={!canEdit} onClick={()=>{if(loadErrorCode==='INTERVIEW_STORAGE_CORRUPT'){try{const next=recoverWorkspace(window.localStorage,accountId,datasetKey,restore);workspaceRef.current=next;setWorkspace(next);setLoadError('');setLoadErrorCode('');setError('');setRestore(null);setMessage('Cadangan dipulihkan. Salinan catatan rusak tetap dipertahankan di penyimpanan browser.')}catch(err){setError(err.message)}}else if(commit({...restore,revision:workspace.revision},'Cadangan dipulihkan ke browser ini.')===true)setRestore(null)}}>Pulihkan & ganti draft lokal</button></Dialog>}
 </>
}

function ParticipantDialog({person,entry,rooms,settings,editable,onClose,onSave}){
 const [form,setForm]=useState(()=>({date:'',time:settings.startTime,session:1,roomId:'',duration:settings.duration,status:'Belum dijadwalkan',verified:false,zoomName:'',notes:'',leader:'',...entry})),[error,setError]=useState('')
 const isActive=entry?.status==='Di room'
 const heavy=isHeavyPerson(person)
 function set(key,value){setForm(current=>({...current,[key]:value}))}
 function submit(event){event.preventDefault();const patch={...form};delete patch.nik;delete patch.startedAt;delete patch.finishedAt;delete patch.updatedAt;if(!patch.date&&!patch.roomId){delete patch.time;delete patch.session;delete patch.duration}else if(patch.date&&patch.roomId&&patch.status==='Belum dijadwalkan')patch.status='Terjadwal';const outcome=onSave(patch);if(outcome===true)onClose();else setError(outcome||'Catatan belum tersimpan. Periksa isian.')}
  return <Dialog title={`Kelola ${person.nama}`} onClose={onClose}><p>NIP <b>{person.nip||'Belum tersedia'}</b> · NIK <b>{person.nik}</b></p><p>Cocokkan identitas dengan BNBA dan nama Zoom sebelum memasukkan peserta. Status mencatat tindakan yang sudah dilakukan di Zoom.</p>{heavy&&<p className="interview-heavy-note"><b>Berat · {getRoutingCategory(person).sourceLabel}.</b> {settings?.enforceSpecialist===false?'Distribusi kategori merata ke seluruh room.':'Penempatan wajib pada pewawancara utama Itjen atau OSDM.'}</p>}{error&&<p role="alert" className="interview-warning">{error}</p>}<form onSubmit={submit} className="interview-settings"><label>Tanggal<input type="date" value={form.date} disabled={!editable||isActive} onChange={event=>set('date',event.target.value)}/></label><label>Jam jadwal (WIB)<input type="time" value={form.time} disabled={!editable||isActive} onChange={event=>set('time',event.target.value)}/></label><label>Sesi<input type="number" min="1" max="100" value={form.session} disabled={!editable||isActive} onChange={event=>set('session',Number(event.target.value))}/></label><label>Breakout room<select value={form.roomId} disabled={!editable} onChange={event=>set('roomId',event.target.value)}><option value="">Belum ditempatkan</option>{rooms.filter(room=>(room.enabled||room.id===form.roomId)&&(!heavy||settings?.enforceSpecialist===false||isSpecialistRoom(room)||room.id===form.roomId)).map(room=><option key={room.id} value={room.id} disabled={heavy&&settings?.enforceSpecialist!==false&&!isSpecialistRoom(room)}>{room.name} · {room.interviewer}</option>)}</select></label><label>Durasi (menit)<input type="number" min="1" max="240" value={form.duration} disabled={!editable||isActive} onChange={event=>set('duration',Number(event.target.value))}/></label><label>Status<select value={form.status} disabled={!editable} onChange={event=>set('status',event.target.value)}>{STATUSES.map(status=><option key={status}>{status}</option>)}</select></label><label>Nama pada Zoom<input maxLength={200} value={form.zoomName} disabled={!editable} onChange={event=>set('zoomName',event.target.value)} placeholder="Nama yang tampil saat peserta masuk"/></label><label className="interview-checkbox"><input type="checkbox" checked={form.verified} disabled={!editable||isActive||entry?.status==='Selesai'} onChange={event=>set('verified',event.target.checked)}/> Identitas peserta sesuai BNBA</label><label className="interview-wide">Kendala / hasil / alasan jadwal ulang<textarea maxLength={4000} rows={3} value={form.notes} disabled={!editable} onChange={event=>set('notes',event.target.value)}/></label><label className="interview-wide">Catatan pemantauan pimpinan<input maxLength={500} value={form.leader} disabled={!editable} onChange={event=>set('leader',event.target.value)}/></label>{entry?.startedAt&&<p className="interview-wide interview-muted">Mulai aktual: {new Date(entry.startedAt).toLocaleString('id-ID',{timeZone:'Asia/Jakarta'})} WIB{entry.finishedAt&&` · selesai ${new Date(entry.finishedAt).toLocaleString('id-ID',{timeZone:'Asia/Jakarta'})} WIB`}</p>}<div className="interview-form-actions"><button className="btn secondary" type="button" onClick={onClose}>Batal</button><button className="btn primary" disabled={!editable}>Simpan catatan</button></div></form></Dialog>
}

function RoomSettings({rooms,entries,editable,onSave}){
 const [draft,setDraft]=useState(rooms)
 useEffect(()=>setDraft(rooms),[rooms])
 function change(id,key,value){setDraft(current=>current.map(room=>room.id===id?{...room,[key]:value}:room))}
 return <section className="panel"><h2>Draft penugasan 18 room</h2><p>Sumber: draft-penugasan-pewawancara.csv. Dio tercatat di Room 1–9; petugas lalu lintas Room 10–18 belum ditetapkan. Pewawancara lintas merupakan koordinasi kunjungan, bukan penempatan tetap di seluruh room.</p><form onSubmit={event=>{event.preventDefault();onSave(draft)}}><div className="table-scroll" tabIndex={0} role="region" aria-label="Penugasan room"><table><thead><tr>{['Aktif','Room','Pewawancara utama','Pewawancara lintas','Petugas lalu lintas'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{draft.map(room=>{const used=Object.values(entries).some(entry=>entry.roomId===room.id&&!terminal.has(entry.status));return <tr key={room.id}><td><input type="checkbox" aria-label={`Aktifkan ${room.name}`} checked={room.enabled} disabled={!editable||used} onChange={event=>change(room.id,'enabled',event.target.checked)}/></td><td><b>{room.name}</b>{used&&<small>Masih terjadwal / aktif</small>}</td>{[['interviewer','Pewawancara utama'],['crossInterviewer','Pewawancara lintas'],['trafficOfficer','Petugas lalu lintas']].map(([key,label])=><td key={key}><input aria-label={`${label} ${room.name}`} value={room[key]} maxLength={160} disabled={!editable||used} onChange={event=>change(room.id,key,event.target.value)} placeholder="Belum ditetapkan"/></td>)}</tr>})}</tbody></table></div><div className="interview-form-actions"><button className="btn primary" disabled={!editable}>Simpan penugasan room</button><span>Room dengan jadwal berjalan dikunci; selesaikan atau ubah jadwal peserta terlebih dahulu.</span></div></form></section>
}

function DioGuide(){
 return <section className="panel interview-guide"><h2>Alur kerja Dio saat pelaksanaan</h2><ol><li><b>Sebelum kegiatan:</b> pastikan sumber BNBA Terbukti, tanggal, penugasan pewawancara, dan room sudah sesuai keputusan rapat. Susun dan ekspor jadwal.</li><li><b>Peserta masuk:</b> cari nama/NIP/NIK, catat nama Zoom, cocokkan identitas, lalu catat status Menunggu.</li><li><b>Mulai wawancara:</b> gunakan Assign atau Move To pada Zoom; setelah peserta masuk, catat status Di room. Timer dihitung dari waktu mulai aktual, dengan acuan 40 menit.</li><li><b>Selama wawancara:</b> pantau timer, antrean, peserta yang belum hadir, dan kendala. Gunakan teks pengingat melalui Broadcast di Zoom bila diperlukan.</li><li><b>Pimpinan bergabung:</b> bantu Join/Leave atau perpindahan ke room tujuan, lalu simpan posisi dan catatan kunjungannya.</li><li><b>Pergantian sesi:</b> pindahkan peserta selesai ke Main Room/keluar melalui Zoom, catat Selesai, kemudian periksa peserta berikutnya.</li><li><b>Pelaporan:</b> catat Tidak hadir, Terkendala, atau Jadwal ulang beserta alasannya. Unduh rekap CSV dan cadangan JSON setelah kegiatan.</li></ol><h3>Persiapan Zoom</h3><p>Dio perlu akses Host atau Co-Host untuk mengatur peserta dan berpindah antar-breakout room. Gunakan penempatan manual sesuai BNBA dan pastikan pengaturan Broadcast tersedia. Dio sebaiknya tetap memantau Main Room selama wawancara berlangsung.</p><p><a href="https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0062540" target="_blank" rel="noreferrer">Panduan resmi Zoom: Managing meeting breakout rooms</a></p><p>Catatan aplikasi tidak mengendalikan Zoom secara otomatis. Setiap perubahan status dan posisi pimpinan dilakukan setelah tindakan pada Zoom.</p></section>
}
