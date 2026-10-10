import {matchNonactive} from '../import/nonactive.js'

export function reviewStoredNonactive(snapshot,source){
 if(snapshot?.source!=='database')throw Error('Muat master tersimpan sebelum rekonsiliasi status.')
 const records=(source.nonactiveReview||[]).map(({nip,nama,category,endDateRaw,reasonRaw})=>({nip,nama,category,endDateRaw,reasonRaw}))
 return matchNonactive(snapshot.results,{records,issues:source.nonactive?.issues||[]})
}
export function statusClient(client,mode,url){
 if(!client||mode!=='production-sdm')return null
 try{if(new URL(url).origin!=='https://tagokvlsirebfgltbxmq.supabase.co')return null}catch{return null}
 return {rpc:(action,payload)=>{
  if(!['prepare','commit'].includes(action))throw Error('Operasi status tidak diizinkan.')
  return client.rpc('recovery_sdm_rpc',{p_action:action,p_payload:payload})
 }}
}
export async function prepareStatus(client,snapshot,source,review){
 if(snapshot?.source!=='database'||snapshot.scope!=='production')throw Error('Gunakan master produksi tersimpan.')
 const records=review.filter(r=>r.matchStatus==='Cocok').map(({nip,nama,bank,category,endDateRaw,reasonRaw})=>({nip,nama,bank,category,endDateRaw,reasonRaw}))
 if(!records.length||records.length>500)throw Error('Batch status harus berisi 1–500 data yang cocok.')
 const q=await client.rpc('prepare',{revision:snapshot.revision,sourceHash:source.sha256,sourceName:source.fileName,records})
 if(q.error)throw q.error
 return q.data
}
export async function commitStatus(client,batch,reason){
 if(reason.trim().length<3)throw Error('Isi alasan penyimpanan, minimal 3 karakter.')
 const q=await client.rpc('commit',{batch,reason:reason.trim()});if(q.error)throw q.error;return q.data
}
