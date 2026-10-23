export async function listCases(client){
 const rows=[]
 for(let offset=0;;offset+=500){
  const {data,error}=await client.from('interview_cases').select('*').order('scheduled_date').order('scheduled_time').order('nik').range(offset,offset+499)
  if(error)throw error
  rows.push(...data);if(data.length<500)break
 }
 return rows
}
export async function listInterviewActivity(client){
 const rows=[]
 for(let offset=0;;offset+=500){
  const {data,error}=await client.from('interview_activity').select('*').order('nik').range(offset,offset+499)
  if(error)throw error
  rows.push(...data);if(data.length<500)break
 }
 return rows
}

// Activity and obstacles have their own revision. They must never make an
// interviewer's pending answers stale or change the BAP lock or completion.
export async function activityAction(client,nik,action,payload={},revision=null){
 const {data,error}=await client.rpc('interview_activity_action',{p_nik:nik,p_action:action,p_revision:revision,p_payload:payload})
 if(error)throw error
 return data
}

// Polling also works when Postgres Changes is unavailable. A single in-flight
// read prevents old responses overtaking new state; cleanup ignores late reads.
export function watchInterviewProgress(client,{onData,onError},environment=globalThis){
 let stopped=false,inFlight=null
 async function read(){
  const [cases,activity]=await Promise.allSettled([listCases(client),listInterviewActivity(client)])
  if(stopped)return
  if(cases.status==='rejected'){
   onError?.(Object.assign(new Error(cases.reason?.message||'Progres wawancara belum dapat dimuat.'),{phase:'cases'}));return
  }
  if(activity.status==='rejected'){
   onError?.(Object.assign(new Error('Aktivitas BAP dan laporan kendala belum dapat dimuat. '+(activity.reason?.message||'')),{phase:'activity',rows:cases.value}));return
  }
  onData({rows:cases.value,activity:activity.value,updatedAt:new Date().toISOString()})
 }
 function refresh(){
  if(stopped)return Promise.resolve()
  if(!inFlight)inFlight=read().finally(()=>{inFlight=null})
  return inFlight
 }
 const onVisible=()=>{if(environment.document?.visibilityState!=='hidden')void refresh()}
 const interval=environment.setInterval(onVisible,5000)
 environment.addEventListener?.('online',onVisible)
 environment.addEventListener?.('focus',onVisible)
 environment.document?.addEventListener('visibilitychange',onVisible)
 void refresh()
 function stop(){
  stopped=true;environment.clearInterval(interval)
  environment.removeEventListener?.('online',onVisible)
  environment.removeEventListener?.('focus',onVisible)
  environment.document?.removeEventListener('visibilitychange',onVisible)
 }
 stop.refresh=refresh
 return stop
}
export async function act(client,row,action,payload={}){
 const {data,error}=await client.rpc('interview_action',{p_nik:row.nik,p_action:action,p_revision:row.revision,p_payload:payload})
 if(error)throw error
 return data
}

// Only reopening a completed, read-only BAP can safely recover this way.
// Saves keep their original revision so unsaved answers never overwrite a
// concurrent edit. A lost revise response may already have opened our draft.
export async function reviseCase(client,row,userId,payload={}){
 const recoverable=error=>/INTERVIEW_CONFLICT|failed to fetch|fetch failed|network|load failed/i.test(error?.message||'')
 const ownedDraft=latest=>latest.status==='Draf'&&latest.locked_by===userId&&latest.revision>row.revision
 async function refresh(){
  const {data,error}=await client.from('interview_cases').select('*').eq('nik',row.nik).single()
  if(error)throw error
  return data
 }
 try{return await act(client,row,'revise',payload)}catch(error){
  if(!recoverable(error))throw error
  const latest=await refresh()
  if(ownedDraft(latest))return latest
  if(latest.status!=='Selesai')throw new Error('BAP sudah dibuka atau diperbarui petugas lain. Tutup lalu buka kembali BAP untuk melihat data terbaru.')
  try{return await act(client,latest,'revise',payload)}catch(retryError){
   if(!recoverable(retryError))throw retryError
   // The first transaction may have committed after our refresh, or the retry
   // response itself was lost. Reconcile once without issuing a third write.
   const confirmed=await refresh()
   if(ownedDraft(confirmed))return confirmed
   throw retryError
  }
 }
}
