// Production remains locked while real Supabase staging verification is pending.
export function stagingEnabled(mode,url){
 if(mode!=='staging')return false
 try{const parsed=new URL(url);return parsed.protocol==='https:'&&/^[a-z0-9]+\.supabase\.co$/.test(parsed.hostname)&&parsed.hostname!=='tagokvlsirebfgltbxmq.supabase.co'}catch{return false}
}
export function isolatedTestClient(client,mode,url){
 if(!client||mode!=='isolated-test')return null
 try{if(new URL(url).origin!=='https://tagokvlsirebfgltbxmq.supabase.co')return null}catch{return null}
 const allowed=new Set(['recovery_begin','recovery_append','recovery_validate','recovery_diff','recovery_commit','recovery_read_meta','recovery_read_page'])
 return {rpc:(name,args)=>{
  if(!allowed.has(name))throw Error('Operasi tidak tersedia pada schema pengujian.')
  return client.rpc('recovery_test_rpc',{p_action:name,p_payload:args})
 }}
}
export async function loadStoredSnapshot(client,onProgress=()=>{}){
 const read=async(name,args={})=>{const q=await client.rpc(name,args);if(q.error)throw q.error;return q.data}
 const start=await read('recovery_read_meta'),result={people:[],obligations:[],payments:[],issues:[]};let after=''
 for(;;){
  const page=await read('recovery_read_page',{p_after:after,p_limit:500})
  if(page.revision!==start.revision)throw Error('Data berubah selama pemuatan. Muat ulang master.')
  if(page.people.some((p,i)=>p.nip<=(i?page.people[i-1].nip:after)))throw Error('Urutan data server tidak valid.')
  result.people.push(...page.people);result.obligations.push(...page.obligations);result.payments.push(...page.payments)
  onProgress(result.people.length,start.people)
  if(page.people.length<500)break
  after=page.people.at(-1).nip
 }
 const end=await read('recovery_read_meta')
 if(end.revision!==start.revision||result.people.length!==start.people)throw Error('Data berubah selama pemuatan. Muat ulang master.')
 return {source:'database',fileName:'Master tersimpan • schema pengujian',revision:start.revision,results:[result]}
}
export function makeRecords(results){return results.flatMap(r=>[
 ...r.people.map(data=>({type:'person',data})),
 ...r.obligations.map(data=>({type:'obligation',data})),
 ...r.payments.filter(p=>p.amount>0||p.correctsExisting).map(data=>({type:'payment',data}))
])}
export async function stageBatch(client,{fileName,sha256,results,recap,onProgress=()=>{}}){
 if(results.some(r=>r.issues.length))throw Error('Data bermasalah tidak boleh disimpan.')
 const records=makeRecords(results)
 const begin=await client.rpc('recovery_begin',{p_name:fileName,p_hash:sha256,p_rows:records.length,p_totals:recap});if(begin.error)throw begin.error
 const id=begin.data
 for(let i=0;i<records.length;i+=500){const q=await client.rpc('recovery_append',{p_batch:id,p_records:records.slice(i,i+500)});if(q.error)throw q.error;onProgress(Math.min(i+500,records.length),records.length)}
 const check=await client.rpc('recovery_validate',{p_batch:id});if(check.error)throw check.error
 return {id,summary:check.data}
}
export async function commitBatch(client,id,reason){if(!reason.trim())throw Error('Alasan wajib diisi.');const q=await client.rpc('recovery_commit',{p_batch:id,p_reason:reason});if(q.error)throw q.error;return q.data}
export async function batchChanges(client,id,offset=0){
 const q=await client.rpc('recovery_diff',{p_batch:id,p_offset:offset,p_limit:50});if(q.error)throw q.error;return q.data||[]
}
