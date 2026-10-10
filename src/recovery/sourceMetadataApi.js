import {statusOf} from '../import/sourceMetadata.js'
const normalized=v=>String(v||'').replace(/\s+/g,' ').trim().toUpperCase()
export function metadataClient(client,mode,url){
 if(!client||mode!=='production-metadata')return null
 try{if(new URL(url).origin!=='https://tagokvlsirebfgltbxmq.supabase.co')return null}catch{return null}
 return {rpc:(action,payload={})=>{if(!['prepare','commit','meta','page','references'].includes(action))throw Error('Operasi metadata tidak diizinkan.');return client.rpc('recovery_metadata_rpc',{p_action:action,p_payload:payload})}}
}
const read=async(client,action,payload)=>{const q=await client.rpc(action,payload);if(q.error)throw q.error;return q.data}
export function prepareMetadataPayload(stored,source,requestId){
 if(stored?.source!=='database'||stored.scope!=='production'||!source?.sourceMetadata)throw Error('Muat master tersimpan dan metadata workbook terlebih dahulu.')
 const people=new Map(stored.results.flatMap(r=>r.people).map(p=>[p.nip,p])),records=[],heldIdentity=[]
 for(const p of source.results.flatMap(r=>r.people)){
  const metadata=p.sourceMetadata;if(!metadata||!metadata.sources.some(s=>s.raw)||(!metadata.needsReview&&metadata.status==='Aktif'))continue
  const old=people.get(p.nip);if(!old||old.bank!==p.bank||normalized(old.nama)!==normalized(p.nama)){heldIdentity.push(p.nip);continue}
  records.push({nip:p.nip,nama:old.nama,bank:old.bank,metadata})
 }
 const stages=new Set(stored.results.flatMap(r=>r.payments).filter(p=>p.amount>0).map(p=>[p.bank,p.kind,p.year,p.stage].join('|'))),references=[],heldReferences=[]
 for(const r of source.sourceMetadata.ntpnReferences||[]){(stages.has([r.bank,r.kind,r.year,r.stage].join('|'))?references:heldReferences).push(r)}
 const payload={requestId,revision:stored.revision,sourceHash:source.sha256,sourceName:source.fileName,records,references}
 if(records.length>1000||references.length>500||!records.length&&!references.length)throw Error('Batch metadata harus berisi maksimal 1.000 status dan 500 referensi.')
 return {payload,heldIdentity,heldReferences}
}
export const prepareMetadata=(client,payload)=>read(client,'prepare',payload)
export const commitMetadata=(client,batch,reason)=>{if(reason.trim().length<3)throw Error('Isi alasan penyimpanan.');return read(client,'commit',{batch,reason:reason.trim()})}
export async function attachStoredMetadata(snapshot,client){
 const start=await read(client,'meta');if(start.revision!==snapshot.revision)throw Error('Metadata berubah. Muat ulang master.');let after='';const rows=[]
 for(;;){const page=await read(client,'page',{after,limit:500});if(page.revision!==start.revision||page.rows.some((p,i)=>p.nip<=(i?page.rows[i-1].nip:after)))throw Error('Metadata berubah atau tidak berurutan.');rows.push(...page.rows);if(page.rows.length<500)break;after=page.rows.at(-1).nip}
 const refs=await read(client,'references'),end=await read(client,'meta');if(refs.revision!==start.revision||end.revision!==start.revision||rows.length!==start.people||refs.rows.length!==start.references||end.people!==start.people||end.references!==start.references)throw Error('Metadata belum lengkap atau berubah.')
 const metadata=new Map(rows.map(r=>[r.nip,r.metadata]));const results=snapshot.results.map(r=>({...r,people:r.people.map(p=>metadata.has(p.nip)?{...p,sourceMetadata:metadata.get(p.nip)}:p),payments:r.payments.map(p=>({...p,ntpnReferences:p.amount>0?refs.rows.filter(n=>n.bank===p.bank&&n.kind===p.kind&&n.year===p.year&&n.stage===p.stage):[]}))}))
 return {...snapshot,results,metadataLoaded:true,sourceMetadata:{ntpnReferences:refs.rows,summary:{people:rows.length,held:rows.filter(r=>r.metadata.needsReview||statusOf({sourceMetadata:r.metadata})==='Perlu pemeriksaan').length}}}
}
