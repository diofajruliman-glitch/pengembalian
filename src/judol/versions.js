function newRequestId(){
 if(!globalThis.crypto?.randomUUID)throw Error('Browser tidak dapat membuat kunci penyimpanan. Buka aplikasi melalui HTTPS atau localhost.')
 return globalThis.crypto.randomUUID()
}

// Publish the retry key before sending an immutable version. A lost response can
// then be retried without creating another dataset. The liveness guard also
// prevents completed requests from restoring a previous user's session data.
export async function persistVersionChain({snapshot,storage,isActive=()=>true,onProgress=()=>{},createRequestId=newRequestId}){
 const versions=snapshot.versions.map(v=>({...v}));let pending=false,cancelled=false
 const active=()=>{if(!isActive()){cancelled=true;return false}return true}
 const publish=()=>{if(active())onProgress([...versions])}
 async function persistFollowups(index){
  const item=versions[index]
  if(item.status==='archived'){pending||=item.followups?.some(f=>f.pending)||false;return}
  for(let position=0;position<(item.followups||[]).length;position++){
   if(!active())return
   const followup=versions[index].followups[position]
   if(!followup.pending)continue
   const expectedUpdatedAt=Object.hasOwn(followup,'expectedUpdatedAt')?followup.expectedUpdatedAt:null
   let value
   try{value=await storage.saveFollowup({datasetId:item.id,nik:followup.nik,patch:followup,expectedUpdatedAt})}
   catch(error){
    value={...followup,pending:true,expectedUpdatedAt,pendingError:error.message,pendingCode:error.code};pending=true
    if(error.code==='DISCIPLINE_ARCHIVED'&&active())versions[index]={...versions[index],status:'archived'}
   }
   if(!active())return
   versions[index]={...versions[index],followups:versions[index].followups.map((f,i)=>i===position?value:f)}
   publish()
   if(versions[index].status==='archived')return
  }
 }
 async function persist(index){
  if(!active())return null
  let item=versions[index]
  if(!item)throw Error('Riwayat versi tidak lengkap.')
  if(item.id){await persistFollowups(index);return active()?item.id:null}
  if(item.parentIndex!=null&&(!Number.isInteger(item.parentIndex)||item.parentIndex<0||item.parentIndex>=index))throw Error('Urutan versi pendahulu tidak valid.')
  const parentId=item.parentIndex==null?(item.parentId||null):await persist(item.parentIndex)
  if(!active())return null
  if(!item.requestId){versions[index]={...item,requestId:createRequestId()};publish();item=versions[index]}
  if(!active())return null
  const saved=await storage.saveVersion({name:snapshot.name,filename:snapshot.filename,result:item.result,parentId,requestId:item.requestId})
  if(!active())return null
  versions[index]={...item,id:saved.id,number:saved.version,status:saved.status,createdAt:saved.createdAt,followups:(item.followups||[]).map(f=>({...f,pending:true,expectedUpdatedAt:null}))}
  publish()
  await persistFollowups(index)
  if(!active())return null
  return saved.id
 }
 await persist(snapshot.active)
 return {versions,pending,cancelled}
}

export function removeVersionFromSnapshot(snapshot, index){
 if(!snapshot?.versions || !Number.isInteger(index) || index < 0 || index >= snapshot.versions.length){
  return snapshot
 }
 if(snapshot.versions.length <= 1){
  return null
 }
 const nextVersions = snapshot.versions.filter((_, i) => i !== index).map(v => {
  if(v.parentIndex == null) return v
  if(v.parentIndex === index) return { ...v, parentIndex: index > 0 ? index - 1 : null }
  if(v.parentIndex > index) return { ...v, parentIndex: v.parentIndex - 1 }
  return v
 })
 const nextActive = index === snapshot.active
  ? Math.min(index, nextVersions.length - 1)
  : (index < snapshot.active ? snapshot.active - 1 : snapshot.active)
 return {
  ...snapshot,
  versions: nextVersions,
  active: nextActive
 }
}
