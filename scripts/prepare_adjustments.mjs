import fs from 'node:fs/promises'
import {createReadStream} from 'node:fs'
import readline from 'node:readline'
import path from 'node:path'
import {normalizeRow,buildDistrictZones,aggregate,facets,RULE_VERSION} from '../src/adjustments/model.js'

const folder=path.resolve(process.argv[2]||'.local-analysis/adjustments')
const manifest=JSON.parse(await fs.readFile(path.join(folder,'manifest.json'),'utf8'))
const raw=[]
for await(const line of readline.createInterface({input:createReadStream(path.join(folder,'raw.ndjson')),crlfDelay:Infinity}))if(line.trim())raw.push(JSON.parse(line))
const districts=buildDistrictZones(raw,manifest.headers),seen=new Set(),rows=[]
for(const item of raw){
 const row=normalizeRow(item.values,manifest.headers,item.sourceRow,districts)
 const key=[row.nip,row.periodYear,row.month].join('|')
 if(seen.has(key))throw Error(`Duplikat NIP/periode pada baris ${item.sourceRow}`)
 seen.add(key);rows.push(row)
}
if(rows.length!==manifest.expectedRows)throw Error('Jumlah baris sumber tidak cocok')
const summary=aggregate(rows),warnings=[]
// Compare source detail with cached pivot totals; never substitute a cached pivot for detail.
const cached=manifest.recap.find(r=>r.row===33)?.values
if(cached){
 for(const [field,column] of [['initial',9],['final',10]])if(typeof cached[column]==='number'&&Math.abs(summary[field]-cached[column])>0.01){
  warnings.push({field,detail:summary[field],cached:cached[column],description:`Total ${field==='initial'?'pengembalian awal':'pengembalian final'} rincian berbeda dari rekap tersimpan. Tampilan memakai rincian sheet 3 bulan.`})
 }
}
const prepared={...manifest,ruleVersion:RULE_VERSION,summary,facets:facets(rows),warnings,districtZones:districts,zoneCorrections:rows.filter(r=>r.zoneAdjusted).length}
await fs.writeFile(path.join(folder,'records.ndjson'),rows.map(r=>JSON.stringify(r)).join('\n')+'\n')
await fs.writeFile(path.join(folder,'prepared.json'),JSON.stringify(prepared,null,2))
console.log(JSON.stringify({rows:rows.length,people:summary.people,changed:summary.changed,zoneCorrections:prepared.zoneCorrections,bytes:(await fs.stat(path.join(folder,'records.ndjson'))).size,warnings},null,2))
