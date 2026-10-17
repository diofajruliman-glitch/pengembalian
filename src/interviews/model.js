// Operational drafts reference the active discipline population; they never copy
// names, NIPs, or assessment results into monitoring storage.
export const STATUSES = ['Belum dijadwalkan','Terjadwal','Menunggu','Di room','Selesai','Tidak hadir','Terkendala','Jadwal ulang']

// Exact allocation from draft-penugasan-pewawancara.csv. A cross interviewer is
// coordination metadata, not a dedicated interviewer occupying all these rooms.
const interviewers = ['Itjen 1','Itjen 2','OSDM 1','OSDM 2','Sekretariat Linjamsos','Indra Maulana','Achmad Mustaqim','Tasria Efrizka','Helmy','Asiafry Raynaldi','Donny Anugerah Perkasa','Putri Angelina','Prabasari','Wawan Soedarso','Ivo Nilasari','Alfi Sudirasmita','TU 1','TU 2']
export const DEFAULT_ROOMS = interviewers.map((interviewer,index)=>({id:`room-${index+1}`,name:`Room ${index+1}`,interviewer,crossInterviewer:index>=9?'Abi Setiadi Halim':'',trafficOfficer:index<9?'Dio':'',enabled:true}))

const text = value => String(value??'').trim()
const ownEntry = (entries,nik) => entries && Object.hasOwn(entries,nik) ? entries[nik] : undefined
const entryList = entries => Object.entries(entries||{}).map(([nik,entry])=>({...entry,nik}))
const pending = entry => !entry || ((!entry.status||entry.status==='Belum dijadwalkan')&&!entry.date&&!entry.roomId&&!entry.startedAt&&!entry.finishedAt)
const normalizedInterviewer = room => text(room?.interviewer).replace(/\s+/g,' ').toLocaleLowerCase('id-ID')

function dateValue(value) {
 const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text(value))
 if(!match||Number(match[1])<1000)return null
 const timestamp=Date.UTC(Number(match[1]),Number(match[2])-1,Number(match[3]))
 return new Date(timestamp).toISOString().slice(0,10)===value?timestamp:null
}
function minutes(value) {
 const match=/^([01]\d|2[0-3]):([0-5]\d)$/.exec(text(value))
 return match?Number(match[1])*60+Number(match[2]):null
}
function integer(value,min,max,label) {
 if(value===''||value===null||value===undefined||!Number.isInteger(Number(value))||Number(value)<min||Number(value)>max)throw Error(`${label} harus bilangan bulat ${min}–${max}.`)
 return Number(value)
}
function assignmentWindow(entry) {
 const start=minutes(entry?.time),duration=Number(entry?.duration)
 return dateValue(entry?.date)!==null&&start!==null&&Number.isInteger(duration)&&duration>0&&start+duration<=1440?{start,end:start+duration}:null
}
function roomFor(rooms,id) { return (rooms||[]).find(room=>room.id===id) }
function sameInterviewer(first,second) {
 const name=normalizedInterviewer(first)
 return Boolean(name&&name===normalizedInterviewer(second))
}
function validRooms(rooms) {
 if(!Array.isArray(rooms)||rooms.length>200)throw Error('Daftar room tidak valid (maksimal 200 room).')
 const ids=new Set()
 for(const room of rooms) {
  if(!room||!text(room.id)||ids.has(room.id))throw Error('ID room harus terisi dan unik.')
  ids.add(room.id)
 }
 return rooms.filter(room=>room.enabled!==false)
}

export function selectPopulation(snapshot) {
 if(snapshot?.kind!=='analysis'||!Number.isInteger(snapshot.active))return []
 const rows=snapshot.versions?.[snapshot.active]?.result?.rows
 if(!Array.isArray(rows))return []
 const seen=new Set()
 return rows.filter(row=>{
  // Numeric identifiers cannot preserve leading zeroes or unsafe precision.
  const nik=typeof row?.nik==='string'?row.nik.trim():''
  if(row?.hasilPenilaian!=='Terbukti'||!nik||seen.has(nik))return false
  seen.add(nik)
  return true
 })
}

// FNV-1a over source metadata provides a stable opaque browser-storage namespace.
// Prefer the workbook hash so saving an unsaved version does not change its key.
export function sourceKey(snapshot) {
 if(snapshot?.kind!=='analysis')return ''
 const version=snapshot.versions?.[snapshot.active]
 if(!version?.result)return ''
 const source=version.result.source||{}
 const identity=source.sha256?['workbook',source.sha256,version.number??snapshot.active]:version.id?['dataset',version.id]:['local',snapshot.filename||source.filename||'',version.createdAt||'',version.number??snapshot.active]
 let first=2166136261,second=2246822519
 for(const character of JSON.stringify(identity)) {
  first=Math.imul(first^character.charCodeAt(0),16777619)
  second=Math.imul(second^character.charCodeAt(0),3266489917)
 }
 return `interviews-v1-${(first>>>0).toString(16).padStart(8,'0')}${(second>>>0).toString(16).padStart(8,'0')}`
}

export function validateAssignment(assignment,entries={},rooms=DEFAULT_ROOMS) {
 if(!text(assignment?.nik))throw Error('Pilih peserta dari populasi Terbukti.')
 if(dateValue(assignment.date)===null)throw Error('Tanggal wawancara harus tanggal kalender yang valid (YYYY-MM-DD).')
 integer(assignment.session,1,1440,'Sesi')
 const start=minutes(assignment.time)
 if(start===null)throw Error('Waktu mulai harus valid (HH:MM).')
 const duration=integer(assignment.duration,1,480,'Durasi wawancara')
 if(start+duration>1440)throw Error('Wawancara harus selesai sebelum pergantian tanggal.')
 const room=roomFor(rooms,assignment.roomId)
 if(!room||room.enabled===false)throw Error('Pilih room aktif untuk wawancara.')
 if(!text(room.interviewer))throw Error('Pewawancara utama room belum diisi.')
 for(const entry of entryList(entries)) {
  if(entry.nik===text(assignment.nik)||entry.date!==assignment.date||!entry.roomId||entry.status==='Belum dijadwalkan'||entry.status==='Jadwal ulang')continue
  const other=assignmentWindow(entry)
  if(!other||start>=other.end||start+duration<=other.start)continue
  if(entry.roomId===room.id)throw Error('Room sudah terpakai pada waktu yang beririsan.')
  if(sameInterviewer(room,roomFor(rooms,entry.roomId)))throw Error('Pewawancara utama sudah bertugas pada waktu yang beririsan.')
 }
 return true
}

export function createSchedule(population,existingEntries={},rooms=DEFAULT_ROOMS,settings={}) {
 if(!Array.isArray(population)||population.length>100000)throw Error('Populasi wawancara tidak valid atau melebihi 100.000 peserta.')
 let day=dateValue(settings.startDate)
 if(day===null)throw Error('Tanggal awal harus tanggal kalender yang valid (YYYY-MM-DD).')
 const start=minutes(settings.startTime??'08:00')
 if(start===null)throw Error('Waktu mulai harus valid (HH:MM).')
 const duration=integer(settings.duration??40,1,480,'Durasi wawancara')
 const gap=integer(settings.gap??5,0,240,'Jeda pergantian')
 const perDay=integer(settings.perDay??11,1,500,'Total peserta per hari')
 if(start+duration>1440)throw Error('Wawancara harus selesai sebelum pergantian tanggal.')
 const activeRooms=validRooms(rooms)
 if(!activeRooms.length)throw Error('Aktifkan setidaknya satu room.')
 if(activeRooms.some(room=>!text(room.interviewer)))throw Error('Isi pewawancara utama pada setiap room aktif.')
 const seen=new Set()
 const people=population.filter(person=>{
  const nik=text(person?.nik)
  if(!nik||seen.has(nik))return false
  seen.add(nik)
  return pending(ownEntry(existingEntries,nik))
 })
 const generated=[],entries={...existingEntries}
 let personIndex=0,cursor=0,daysVisited=0
 while(personIndex<people.length) {
  if(++daysVisited>36600||new Date(day).getUTCFullYear()>9999)throw Error('Jadwal melampaui rentang tanggal yang didukung. Periksa kapasitas harian.')
  const weekday=new Date(day).getUTCDay()
  if(settings.skipWeekends!==false&&(weekday===0||weekday===6)){day+=86400000;continue}
  const date=new Date(day).toISOString().slice(0,10)
  let count=entryList(entries).filter(entry=>entry.date===date&&entry.status!=='Belum dijadwalkan'&&entry.status!=='Jadwal ulang').length
  for(let time=start,session=1;time+duration<=1440&&count<perDay&&personIndex<people.length;time+=duration+gap,session++) {
   const firstRoom=cursor
   for(let step=0;step<activeRooms.length&&count<perDay&&personIndex<people.length;step++) {
    const roomIndex=(firstRoom+step)%activeRooms.length,room=activeRooms[roomIndex]
    const nik=text(people[personIndex].nik)
    const assignment={nik,date,session,roomId:room.id,time:`${String(Math.floor(time/60)).padStart(2,'0')}:${String(time%60).padStart(2,'0')}`,duration,status:'Terjadwal'}
    try{validateAssignment(assignment,entries,rooms)}catch{continue}
    entries[nik]=assignment
    generated.push(assignment)
    personIndex++;count++;cursor=(roomIndex+1)%activeRooms.length
   }
  }
  day+=86400000
 }
 return generated
}

export function updateEntry(nik,patch,entries={},rooms=DEFAULT_ROOMS,now=new Date().toISOString()) {
 nik=text(nik)
 if(!nik)throw Error('Pilih peserta dari populasi Terbukti.')
 if(!patch||typeof patch!=='object'||Array.isArray(patch))throw Error('Perubahan monitoring tidak valid.')
 if(!Number.isFinite(Date.parse(now)))throw Error('Waktu pencatatan tidak valid.')
 const previous=ownEntry(entries,nik)||{}
 const fields=['date','session','roomId','time','duration','status','verified','zoomName','notes','leader']
 const safePatch=Object.fromEntries(fields.filter(field=>Object.hasOwn(patch,field)).map(field=>[field,patch[field]]))
 const next={...previous,...safePatch,nik,status:safePatch.status??previous.status??'Belum dijadwalkan',updatedAt:new Date(now).toISOString()}
 if(!STATUSES.includes(next.status))throw Error('Status wawancara tidak dikenal.')
 if(Object.hasOwn(safePatch,'verified')&&typeof safePatch.verified!=='boolean')throw Error('Verifikasi identitas harus bernilai ya atau tidak.')
 for(const field of ['zoomName','notes','leader'])if(Object.hasOwn(safePatch,field)) {
  if(typeof safePatch[field]!=='string'||safePatch[field].length>(field==='notes'?10000:500))throw Error(`Isian ${field==='notes'?'catatan':field==='leader'?'pimpinan':'nama Zoom'} tidak valid atau terlalu panjang.`)
 }
 const hasAssignment=Boolean(next.date||next.roomId||next.time||next.session)
 const needsAssignment=['Terjadwal','Menunggu','Di room','Selesai'].includes(next.status)
 if(hasAssignment||needsAssignment)validateAssignment(next,entries,rooms)
 const scheduleChanged=['date','time','duration','session'].some(field=>Object.hasOwn(safePatch,field)&&String(safePatch[field])!==String(previous[field]??''))
 if(previous.status==='Di room'&&next.status==='Di room'&&scheduleChanged)throw Error('Ubah jadwal setelah wawancara dihentikan; perpindahan room dapat dilakukan langsung.')
 const newAppointment=next.status==='Terjadwal'&&(scheduleChanged||(previous.status&&previous.status!=='Terjadwal'))
 if(newAppointment) {next.startedAt='';next.finishedAt='';next.verified=false}
 if(next.status==='Di room') {
  if(next.verified!==true)throw Error('Verifikasi identitas peserta sebelum memasukkannya ke room.')
  const room=roomFor(rooms,next.roomId)
  for(const entry of entryList(entries)) {
   if(entry.nik===nik||entry.status!=='Di room')continue
   if(entry.roomId===next.roomId)throw Error('Masih ada peserta Di room yang sama. Selesaikan atau pindahkan peserta tersebut.')
   if(sameInterviewer(room,roomFor(rooms,entry.roomId)))throw Error('Pewawancara utama masih menangani peserta Di room lain.')
  }
  if(previous.status!=='Di room'){next.startedAt=next.updatedAt;next.finishedAt=''}
 }
 if(next.status==='Selesai'&&previous.status!=='Selesai') {
  if(!next.startedAt)throw Error('Mulai wawancara melalui status Di room sebelum menandainya selesai.')
  next.finishedAt=next.updatedAt
 }
 return {...entries,[nik]:next}
}

export function timerState(entry,nowMs=Date.now()) {
 const duration=Number(entry?.duration),total=Number.isFinite(duration)&&duration>0?duration*60:0
 const start=Date.parse(entry?.startedAt||''),end=Date.parse(entry?.finishedAt||'')
 const current=Number(nowMs)
 const elapsedSeconds=Number.isFinite(start)&&Number.isFinite(current)?Math.max(0,Math.floor(((Number.isFinite(end)?end:current)-start)/1000)):0
 return {remainingSeconds:Math.max(0,total-elapsedSeconds),overdue:elapsedSeconds>total,elapsedSeconds}
}

function csvCell(value,identifier=false) {
 let content=String(value??'')
 if(content&&(identifier||/^[\s\u0000-\u001f]*[=+\-@]/.test(content)||/^[\t\r\n]/.test(content)))content=`'${content}`
 return `"${content.replace(/"/g,'""')}"`
}
export function monitoringCsv(population,entries={},rooms=DEFAULT_ROOMS) {
 const headers=['Tanggal','Sesi','Room','Nama','NIP','NIK','Pewawancara Utama','Pewawancara Lintas','Petugas Lalu Lintas','Jadwal','Status','Identitas Terverifikasi','Mulai Aktual','Selesai Aktual','Catatan','Pimpinan','Durasi (menit)','Nama Zoom']
 const lines=[headers.map(value=>csvCell(value)).join(';')]
 for(const person of population||[]) {
  const nik=text(person?.nik),entry=ownEntry(entries,nik)||{},room=roomFor(rooms,entry.roomId)||{}
  const row=[entry.date,entry.session,room.name,person.nama,String(person.nip??''),nik,room.interviewer,room.crossInterviewer,room.trafficOfficer,entry.time,entry.status||'Belum dijadwalkan',entry.verified===true?'Ya':'Belum',entry.startedAt,entry.finishedAt,entry.notes,entry.leader,entry.duration,entry.zoomName]
  lines.push(row.map((value,index)=>csvCell(value,index===4||index===5)).join(';'))
 }
 return '\uFEFF'+lines.join('\r\n')+'\r\n'
}
