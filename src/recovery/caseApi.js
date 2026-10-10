import {prepareCaseLinkPayload} from './caseLinks.js'
export function caseTestClient(client,mode,url){
 if(!client||mode!=='case-test')return null
 try{if(new URL(url).origin!=='https://tagokvlsirebfgltbxmq.supabase.co')return null}catch{return null}
 const allowed=new Set(['case_prepare','case_commit','recovery_linked_meta','recovery_linked_cases'])
 return {rpc:(name,args={})=>{if(!allowed.has(name))throw Error('Operasi kasus tidak diizinkan.');return client.rpc('recovery_case_test_rpc',{p_action:name,p_payload:args})}}
}
export async function prepareReferences(client,snapshot,rows){
 const q=await client.rpc('case_prepare',prepareCaseLinkPayload(snapshot,rows));if(q.error)throw q.error;return q.data
}
export async function commitReferences(client,id,reason){
 if(!reason.trim())throw Error('Isi alasan persetujuan referensi.')
 const q=await client.rpc('case_commit',{p_batch:id,p_reason:reason});if(q.error)throw q.error;return q.data
}
