import fs from 'node:fs/promises'
import {createReadStream} from 'node:fs'
import readline from 'node:readline'
import path from 'node:path'
import {queryRows,MONTHS} from '../src/adjustments/model.js'

export function localAccessAllowed(req){
 const remote=req.socket?.remoteAddress
 if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(remote))return false
 const host=req.headers.host
 if(!host||!/^localhost(:\d+)?$|^127\.0\.0\.1(:\d+)?$|^\[::1\](:\d+)?$/.test(host))return false
 if(req.headers.origin&&!['http://','https://'].some(protocol=>req.headers.origin===protocol+host))return false
 if(req.headers['sec-fetch-site']&& !['same-origin','none'].includes(req.headers['sec-fetch-site']))return false
 return true
}
export default function adjustmentsDev(){
 let pending,signature
 async function load(){
  const folder=path.resolve('.local-analysis/adjustments'),stat=await fs.stat(path.join(folder,'prepared.json')),nextSignature=`${stat.mtimeMs}:${stat.size}`
  if(!pending||signature!==nextSignature){signature=nextSignature;pending=(async()=>{
   const manifest=JSON.parse(await fs.readFile(path.join(folder,'prepared.json'),'utf8')),rows=[]
   for await(const line of readline.createInterface({input:createReadStream(path.join(folder,'records.ndjson')),crlfDelay:Infinity}))if(line.trim())rows.push(JSON.parse(line))
   if(rows.length!==manifest.expectedRows)throw Error('Sumber lokal tidak lengkap')
   return {manifest,rows}
  })().catch(error=>{pending=null;throw error})}
  return pending
 }
 return {name:'private-adjustments-local',apply:'serve',configureServer(server){
  server.middlewares.use('/__adjustments',async(req,res)=>{
   res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('X-Content-Type-Options','nosniff')
   const send=(status,data)=>{res.statusCode=status;res.end(JSON.stringify(data))}
   if(req.method!=='GET'||!localAccessAllowed(req))return send(403,{error:'Akses lokal ditolak'})
   try{
    const endpoint=new URL(req.url,'http://localhost'),{manifest,rows}=await load()
    if(endpoint.pathname==='/manifest')return send(200,{...manifest,source:'local',importedAt:manifest.preparedAt})
    if(endpoint.pathname==='/query'){
     const filters=JSON.parse(endpoint.searchParams.get('filters')||'{}')
     return send(200,queryRows(rows,filters,endpoint.searchParams.get('page'),25))
    }
    if(endpoint.pathname==='/history'){
     const nip=endpoint.searchParams.get('nip')
     if(!/^\d{18}$/.test(nip||''))return send(400,{error:'NIP tidak valid'})
     const history=rows.filter(r=>r.nip===nip).sort((a,b)=>a.periodYear-b.periodYear||MONTHS.indexOf(a.month)-MONTHS.indexOf(b.month))
     return send(200,{rows:history,imports:[{fileName:manifest.fileName,sha256:manifest.sha256,importedAt:manifest.preparedAt,ruleVersion:manifest.ruleVersion}],headers:manifest.headers})
    }
    return send(404,{error:'Endpoint tidak ditemukan'})
   }catch(error){return send(error.code==='ENOENT'?404:500,{error:error.code==='ENOENT'?'Data lampiran lokal belum disiapkan. Jalankan ekstraksi dan persiapan workbook.':'Data lampiran tidak dapat dimuat.'})}
  })
 }}
}
