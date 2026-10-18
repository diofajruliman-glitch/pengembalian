// All views using the same connection share a lane for expensive recap queries.
// Manifest/version checks and per-person history stay independent of that lane.
const querySchedulers=new WeakMap()
const aborted=()=>new DOMException('Permintaan dibatalkan','AbortError')
function createQueryScheduler(){
 const waiting=[];let running=false
 async function next(){
  if(running||!waiting.length)return
  const task=waiting.shift()
  task.signal?.removeEventListener('abort',task.cancel)
  if(task.signal?.aborted){task.reject(aborted());next();return}
  running=true
  try{task.resolve(await task.run())}catch(error){task.reject(error)}finally{running=false;next()}
 }
 return (run,signal)=>new Promise((resolve,reject)=>{
  if(signal?.aborted){reject(aborted());return}
  const task={run,signal,resolve,reject,cancel:()=>{
   const index=waiting.indexOf(task)
   if(index!==-1){waiting.splice(index,1);reject(aborted())}
  }}
  signal?.addEventListener('abort',task.cancel,{once:true})
  waiting.push(task);next()
 })
}

export function adjustmentApi(supabase,{local=false}={}){
 let scheduleQuery
 if(!local&&supabase){
  scheduleQuery=querySchedulers.get(supabase)
  if(!scheduleQuery){scheduleQuery=createQueryScheduler();querySchedulers.set(supabase,scheduleQuery)}
 }else scheduleQuery=createQueryScheduler()
 async function call(action,payload={},signal){
  if(signal?.aborted)throw aborted()
  if(local){
   const params=new URLSearchParams()
   if(action==='query'){params.set('filters',JSON.stringify(payload.filters||{}));params.set('page',String(payload.page||0))}
   if(action==='history')params.set('nip',payload.nip)
   const response=await fetch(`/__adjustments/${action}?${params}`,{signal,cache:'no-store'})
   const data=await response.json()
   if(!response.ok)throw Error(data.error||'Data tidak dapat dimuat')
   return data
  }
  if(!supabase)throw Error('Koneksi Supabase belum tersedia')
  let request=supabase.rpc('recovery_adjustment_read',{p_action:action,p_payload:payload})
  if(signal)request=request.abortSignal(signal)
  const {data,error}=await request
  if(signal?.aborted)throw aborted()
  if(error){
   const message=error.code==='PGRST202'?'Menu sudah tersedia; tabel lampiran Supabase belum diaktifkan.':error.code==='57014'||/statement timeout/i.test(error.message||'')?'Perhitungan lampiran melewati batas waktu database. Klik Muat ulang untuk mencoba kembali. Jika berulang, query rekap Supabase perlu diperiksa.':error.message
   throw Object.assign(Error(message),{code:error.code})
  }
  return data
 }
 return {manifest:signal=>call('manifest',{},signal),query:(filters,page,signal)=>scheduleQuery(()=>call('query',{filters,page},signal),signal),history:async(nip,signal)=>{
  const manifest=await call('manifest',{},signal),history=await call('history',{nip},signal),after=await call('manifest',{},signal)
  if(manifest.importId!==after.importId||manifest.preparedAt!==after.preparedAt)throw Error('Versi workbook baru diaktifkan. Buka ulang riwayat untuk memuat data terbaru.')
  return {...history,activeImportId:manifest.importId??0}
 }}
}
