import {indexSnapshot,selectProgress} from './progress.js'

export function followupClient(client,mode,url){
 if(!client||mode!=='production-followup')return null
 try{if(new URL(url).origin!=='https://tagokvlsirebfgltbxmq.supabase.co')return null}catch{return null}
 return {rpc:(action,payload)=>{
  if(!['meta','page','save'].includes(action))throw Error('Operasi penghubungan tidak diizinkan.')
  return client.rpc('recovery_followup_rpc',{p_action:action,p_payload:payload})
 }}
}
const read=async(client,action,payload)=>{const q=await client.rpc(action,payload);if(q.error)throw q.error;return q.data}
export async function loadFollowups(client,type,target,snapshot){
 if(snapshot?.source!=='database'||snapshot.scope!=='production')throw Error('Muat master produksi tersimpan.')
 const base={type,target:target.no},start=await read(client,'meta',base),rows=[];let after=''
 const consistent=meta=>meta.revision===start.revision&&meta.masterRevision===snapshot.revision&&meta.targetUpdatedAt===start.targetUpdatedAt
 if(start.masterRevision!==snapshot.revision||new Date(start.targetUpdatedAt).getTime()!==new Date(target.updated_at).getTime())throw Error('Master atau kegiatan berubah. Muat ulang data aplikasi dan master.')
 for(;;){const page=await read(client,'page',{...base,after,limit:500})
  if(page.revision!==start.revision||page.masterRevision!==start.masterRevision||page.rows.some((r,i)=>r.nip<=(i?page.rows[i-1].nip:after)))throw Error('Penghubungan berubah saat dibaca. Muat ulang.')
  rows.push(...page.rows);if(page.rows.length<500)break;after=page.rows.at(-1).nip
 }
 const end=await read(client,'meta',base)
 if(!consistent(end)||rows.length!==start.count)throw Error('Data tidak lengkap atau berubah. Muat ulang.')
 return {meta:start,rows}
}
export function linkedFollowupProgress(index,links,filters={}){
 const unique=new Map(links.map(r=>[r.nip,r])),nips=new Set(unique.keys())
 const known=new Set(index.people.map(p=>p.nip))
 const held=[...unique.values()].filter(r=>r.available===false||!known.has(r.nip))
 const heldNips=new Set(held.map(r=>r.nip)),valid=new Set([...nips].filter(nip=>!heldNips.has(nip)))
 const selected=selectProgress({...index,people:index.people.filter(p=>valid.has(p.nip))},filters)
 return {...selected,held,linkedCount:nips.size}
}
export function followupIndex(snapshot){return indexSnapshot(snapshot?.results||[])}
export function prepareFollowup({snapshot,type,target,meta,nips,operation,requestId}){
 if(snapshot?.source!=='database'||snapshot.scope!=='production')throw Error('Gunakan master produksi tersimpan.')
 if(!['action','bottleneck'].includes(type)||!['add','remove'].includes(operation)||!Number.isInteger(target?.no))throw Error('Pilihan penghubungan tidak valid.')
 const unique=[...new Set(nips)].sort()
 if(!unique.length||unique.length>500||unique.some(n=>typeof n!=='string'||!/^\d{18}$/.test(n)))throw Error('Pilih 1–500 NIP sebagai teks.')
 if(meta.masterRevision!==snapshot.revision)throw Error('Master berubah. Muat ulang sebelum meninjau.')
 return {type,target:target.no,targetUpdatedAt:meta.targetUpdatedAt,masterRevision:snapshot.revision,revision:meta.revision,nips:unique,operation,requestId}
}
export async function saveFollowup(client,payload,reason){
 if(!client)throw Error('Penyimpanan penghubungan belum aktif.')
 if(reason.trim().length<3)throw Error('Isi alasan minimal 3 karakter.')
 return read(client,'save',{...payload,reason:reason.trim()})
}
