// Not connected to UI yet. No production writes until migrations and gates pass.
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
