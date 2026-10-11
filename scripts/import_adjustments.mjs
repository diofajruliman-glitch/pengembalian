// Admin-only setup tool; stdin holds credentials, stdout only prints progress counts.
import fs from 'node:fs/promises'
import {createReadStream} from 'node:fs'
import readline from 'node:readline'
import path from 'node:path'

const folder=path.resolve(process.argv[2]||'.local-analysis/adjustments')
let auth={url:process.env.ADJUSTMENT_SUPABASE_URL,key:process.env.ADJUSTMENT_PUBLISHABLE_KEY,token:process.env.ADJUSTMENT_ADMIN_JWT}
if(process.argv.includes('--auth-stdin')){
 const reader=readline.createInterface({input:process.stdin,terminal:false})
 for await(const line of reader){auth=JSON.parse(line);reader.close();break}
}
if(!/^https:\/\/[-a-z0-9]+\.supabase\.co$/.test(auth.url||'')||!auth.key||!auth.token)throw Error('Isi URL Supabase, publishable key, dan JWT sesi admin melalui variabel ADJUSTMENT_* atau --auth-stdin. Token bukan service_role atau personal access token.')
async function rpc(action,payload){
 for(let attempt=0;attempt<3;attempt++){
  try{
   const response=await fetch(`${auth.url}/rest/v1/rpc/recovery_adjustment_import`,{method:'POST',headers:{apikey:auth.key,Authorization:`Bearer ${auth.token}`,'Content-Type':'application/json'},body:JSON.stringify({p_action:action,p_payload:payload})})
   const data=await response.json()
   if(!response.ok){const e=Error(`Impor ditolak: ${data.code||response.status} ${data.message||''}`);e.retryable=response.status>=500||response.status===429;throw e}
   return data
  }catch(error){if(attempt===2||error.retryable===false)throw error;await new Promise(resolve=>setTimeout(resolve,1000*(attempt+1)))}
 }
}
const manifest=JSON.parse(await fs.readFile(path.join(folder,'prepared.json'),'utf8'))
const batch=await rpc('begin',{manifest})
if(batch.committed){console.log('Versi workbook sudah tersimpan; tidak diimpor ulang.');process.exit(0)}
let chunk=[],count=0
for await(const line of readline.createInterface({input:createReadStream(path.join(folder,'records.ndjson')),crlfDelay:Infinity})){
 if(!line.trim())continue
 chunk.push(JSON.parse(line));count++
 if(chunk.length===250){await rpc('append',{id:batch.id,records:chunk});chunk=[];if(count%5000===0)console.log(`${count}/${manifest.expectedRows} baris disiapkan`)}
}
if(chunk.length)await rpc('append',{id:batch.id,records:chunk})
const result=await rpc('commit',{id:batch.id})
console.log(JSON.stringify({committed:result.committed,rows:count,importId:result.id}))
