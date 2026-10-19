const PREFIX='tlhp_interviews_v1'
const MAX_BYTES=3*1024*1024
const BAD_KEYS=new Set(['__proto__','prototype','constructor'])
const STATUSES=new Set(['Belum dijadwalkan','Terjadwal','Menunggu','Di room','Selesai','Tidak hadir','Terkendala','Jadwal ulang'])
const ENTRY_FIELDS=new Set(['nik','date','session','roomId','time','duration','status','verified','zoomName','startedAt','finishedAt','notes','leader','updatedAt'])
const ROOM_FIELDS=new Set(['id','name','interviewer','crossInterviewer','trafficOfficer','enabled'])
const SETTINGS_FIELDS=new Set(['startDate','startTime','duration','gap','perDay','skipWeekends','enforceSpecialist'])
const ROOT_FIELDS=new Set(['entries','rooms','settings','revision','leader','broadcast'])

function fail(code,message){const error=new Error(message);error.code=code;return error}
const invalid=()=>fail('INTERVIEW_WORKSPACE_INVALID','Format draf wawancara tidak valid. Periksa berkas cadangan; data yang tersimpan belum diubah.')
const tooLarge=()=>fail('INTERVIEW_WORKSPACE_TOO_LARGE','Draf wawancara melebihi batas 3 MB. Ringkas catatan sebelum menyimpan.')
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value))
const empty=()=>({entries:{},rooms:null,settings:null,revision:0})

function cloneJSON(value,depth=0,budget={nodes:0}){
 if(depth>12||++budget.nodes>100000)throw invalid()
 if(value===null||typeof value==='boolean')return value
 if(typeof value==='string'){if(value.length>MAX_BYTES)throw tooLarge();return value}
 if(typeof value==='number'){if(!Number.isFinite(value))throw invalid();return value}
 if(Array.isArray(value)){
  if(value.length>10000||Object.keys(value).length!==value.length)throw invalid()
  return value.map(item=>cloneJSON(item,depth+1,budget))
 }
 if(!plain(value)||Object.getOwnPropertySymbols(value).length)throw invalid()
 const result={}
 for(const key of Object.getOwnPropertyNames(value)){
  const descriptor=Object.getOwnPropertyDescriptor(value,key)
  if(BAD_KEYS.has(key)||!descriptor.enumerable||!Object.hasOwn(descriptor,'value'))throw invalid()
  result[key]=cloneJSON(descriptor.value,depth+1,budget)
 }
 return result
}

function onlyFields(value,allowed){if(!plain(value)||Object.keys(value).some(key=>!allowed.has(key)))throw invalid()}
function text(value,max=10000){if(typeof value!=='string'||value.length>max)throw invalid()}
function integer(value,min,max){if(!Number.isSafeInteger(value)||value<min||value>max)throw invalid()}
function date(value){
 text(value,10)
 if(value!==''&&(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T12:00:00Z'))||new Date(value+'T12:00:00Z').toISOString().slice(0,10)!==value))throw invalid()
}
function time(value){text(value,5);if(value!==''&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(value))throw invalid()}
function timestamp(value){text(value,40);if(value!==''&&(!/^\d{4}-\d{2}-\d{2}T/.test(value)||!Number.isFinite(Date.parse(value))))throw invalid()}
function checkEntry(entry,nik){
 onlyFields(entry,ENTRY_FIELDS)
 for(const [field,value] of Object.entries(entry)){
  if(field==='nik'){text(value,128);if(value!==nik)throw invalid()}
  else if(field==='date')date(value)
  else if(field==='time')time(value)
  else if(field==='session'){if(value!==''&&value!==null)integer(value,0,10000)}
  else if(field==='duration')integer(value,1,1440)
  else if(field==='status'){if(!STATUSES.has(value))throw invalid()}
  else if(field==='verified'){if(typeof value!=='boolean')throw invalid()}
  else if(['startedAt','finishedAt','updatedAt'].includes(field))timestamp(value)
  else text(value,field==='roomId'?128:10000)
 }
}

// The stored document is operational metadata only. Population rows and credentials
// cannot be persisted because every object has an explicit field allowlist.
export function validateWorkspace(payload){
 const copy=cloneJSON(payload)
 onlyFields(copy,ROOT_FIELDS)
 if(!Object.hasOwn(copy,'entries')||!plain(copy.entries))throw invalid()
 for(const [nik,entry] of Object.entries(copy.entries)){
  if(!nik.trim()||nik.length>128||BAD_KEYS.has(nik))throw invalid()
  checkEntry(entry,nik)
 }
 const normalized={entries:copy.entries,rooms:copy.rooms??null,settings:copy.settings??null,revision:Object.hasOwn(copy,'revision')?copy.revision:0}
 integer(normalized.revision,0,Number.MAX_SAFE_INTEGER-1)
 if(normalized.rooms!==null){
  if(!Array.isArray(normalized.rooms)||normalized.rooms.length>200)throw invalid()
  const ids=new Set()
  for(const room of normalized.rooms){
   onlyFields(room,ROOM_FIELDS)
   text(room.id,128)
   if(!room.id.trim()||ids.has(room.id))throw invalid()
   ids.add(room.id)
   for(const [field,value] of Object.entries(room)){
    if(field==='enabled'){if(typeof value!=='boolean')throw invalid()}
    else text(value,500)
   }
  }
 }
 if(normalized.settings!==null){
  onlyFields(normalized.settings,SETTINGS_FIELDS)
  for(const [field,value] of Object.entries(normalized.settings)){
   if(field==='startDate')date(value)
   else if(field==='startTime')time(value)
   else if(['skipWeekends','enforceSpecialist'].includes(field)){if(typeof value!=='boolean')throw invalid()}
   else integer(value,field==='gap'?0:1,field==='perDay'?10000:1440)
  }
 }
 if(Object.hasOwn(copy,'leader')){
  onlyFields(copy.leader,new Set(['name','roomId','notes']))
  for(const value of Object.values(copy.leader))text(value)
  normalized.leader=copy.leader
 }
 if(Object.hasOwn(copy,'broadcast')){text(copy.broadcast);normalized.broadcast=copy.broadcast}
 if(new TextEncoder().encode(JSON.stringify(normalized)).byteLength>MAX_BYTES)throw tooLarge()
 return normalized
}

function keyFor(accountId,sourceKey){
 if(typeof accountId!=='string'||!accountId.trim()||typeof sourceKey!=='string'||!sourceKey.trim())throw fail('INTERVIEW_STORAGE_SCOPE','Akun dan sumber data wawancara harus dipilih sebelum membuka draf.')
 try{return `${PREFIX}:${encodeURIComponent(accountId)}:${encodeURIComponent(sourceKey)}`}
 catch{throw fail('INTERVIEW_STORAGE_SCOPE','Identitas akun atau sumber data wawancara tidak valid.')}
}
function readRaw(storage,key){
 try{if(!storage||typeof storage.getItem!=='function')throw Error();return storage.getItem(key)}
 catch{throw fail('INTERVIEW_STORAGE_UNAVAILABLE','Draf wawancara lokal tidak dapat dibaca. Periksa izin penyimpanan browser lalu coba kembali.')}
}
function parseRaw(raw){
 if(raw===null)return empty()
 try{
  if(typeof raw!=='string')throw invalid()
  if(new TextEncoder().encode(raw).byteLength>MAX_BYTES)throw tooLarge()
  return validateWorkspace(JSON.parse(raw))
 }catch(error){
  if(error.code==='INTERVIEW_WORKSPACE_TOO_LARGE')throw error
  throw fail('INTERVIEW_STORAGE_CORRUPT','Draf wawancara lokal rusak atau formatnya tidak dikenali. Data lama tetap tersimpan; pulihkan cadangan sebelum menyimpan lagi.')
 }
}
const read=(storage,key)=>parseRaw(readRaw(storage,key))

export function loadWorkspace(storage,accountId,sourceKey){return read(storage,keyFor(accountId,sourceKey))}

export function saveWorkspace(storage,accountId,sourceKey,workspace,expectedRevision){
 const key=keyFor(accountId,sourceKey)
 integer(expectedRevision,0,Number.MAX_SAFE_INTEGER-1)
 const normalized=validateWorkspace(workspace)
 const current=read(storage,key)
 if(current.revision!==expectedRevision)throw fail('INTERVIEW_WORKSPACE_CONFLICT','Draf wawancara sudah berubah di tab lain. Muat ulang draf terbaru sebelum menyimpan agar perubahan tidak tertimpa.')
 const next=validateWorkspace({...normalized,revision:current.revision+1})
 try{
  if(typeof storage.setItem!=='function')throw Error()
  storage.setItem(key,JSON.stringify(next))
 }catch{throw fail('INTERVIEW_STORAGE_WRITE_FAILED','Draf wawancara belum tersimpan. Penyimpanan browser penuh atau tidak diizinkan; simpan cadangan dan coba kembali.')}
 return next
}

// Recovery is an explicit repair path for corrupt data, never an alternative to
// revision checks for a valid workspace. Keep the exact old value for inspection.
export function recoverWorkspace(storage,accountId,sourceKey,workspace){
 const key=keyFor(accountId,sourceKey)
 const next=validateWorkspace({...validateWorkspace(workspace),revision:1})
 const previous=readRaw(storage,key)
 try{
  parseRaw(previous)
  throw fail('INTERVIEW_STORAGE_RECOVERY_NOT_NEEDED','Draf wawancara saat ini dapat dibaca. Muat draf terbaru lalu gunakan penyimpanan biasa agar revisi tetap diperiksa.')
 }catch(error){if(error.code!=='INTERVIEW_STORAGE_CORRUPT')throw error}
 let recoveryKey,stamp=Date.now()
 for(let attempt=0;attempt<100;attempt++,stamp++){
  const candidate=`${key}:recovery:${stamp}`
  if(readRaw(storage,candidate)===null){recoveryKey=candidate;break}
 }
 if(!recoveryKey)throw fail('INTERVIEW_STORAGE_RECOVERY_FAILED','Pemulihan belum dilakukan karena lokasi salinan pemulihan tidak tersedia. Draf lama tetap tersimpan; coba kembali.')
 const unchanged=()=>{
  if(readRaw(storage,key)!==previous)throw fail('INTERVIEW_WORKSPACE_CONFLICT','Draf wawancara berubah di tab lain saat pemulihan. Muat ulang kondisi terbaru sebelum mencoba lagi; salinan pemulihan yang sudah dibuat tetap tersimpan.')
 }
 unchanged()
 try{
  if(typeof storage.setItem!=='function')throw Error()
  storage.setItem(recoveryKey,previous)
  if(readRaw(storage,recoveryKey)!==previous)throw Error()
 }catch{
  throw fail('INTERVIEW_STORAGE_RECOVERY_FAILED','Pemulihan belum dilakukan karena salinan draf lama gagal disimpan. Draf lama tetap tersimpan; periksa ruang dan izin penyimpanan browser.')
 }
 unchanged()
 try{storage.setItem(key,JSON.stringify(next))}
 catch{
  // localStorage.setItem is atomic on failure; retain both the original value
  // and its recovery copy rather than removing either during a failed repair.
  throw fail('INTERVIEW_STORAGE_WRITE_FAILED','Draf wawancara belum dipulihkan karena penyimpanan gagal. Draf lama dan salinan pemulihannya tetap tersimpan; periksa ruang penyimpanan browser.')
 }
 return next
}
