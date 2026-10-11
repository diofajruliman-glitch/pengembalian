// Workbook-owner rules. Explanations are classifications, not payment receipts.
export const RULE_VERSION = '2026-10-11.1'
export const MONTHS = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']
export const REASONS = {
 WIT:'Penyesuaian zona waktu WIT', WITA:'Penyesuaian zona waktu WITA',
 LEAVE:'Penyesuaian cuti', MATERNITY:'Penyesuaian cuti melahirkan',
 TENDIK:'Penyesuaian tendik', ATTENDANCE:'Penyesuaian absen eSDM dan e-Absensi',
 STATUS:'Perubahan status pengembalian'
}
export const text = value => value == null || value === '#N/A' || value === 0 ? '' : String(value).replace(/\s+/g,' ').trim()
const upper = value => text(value).toUpperCase()
const number = value => typeof value === 'number' && Number.isFinite(value) ? value : null
const year = value => /^20\d{2}$/.test(String(value)) ? Number(value) : null

// Provinces entirely share a time zone. District aliases resolve absent province values.
// Source: https://www.bmkg.go.id/tanda-waktu and Indonesia's Keppres 41/1987.
const central = new Set(['BALI','NUSA TENGGARA BARAT','NUSA TENGGARA TIMUR','NTB','NTT','GORONTALO','KALIMANTAN SELATAN','KALIMANTAN TIMUR','KALIMANTAN UTARA'])
const western = /^(ACEH|NANGGROE ACEH|SUMATERA|SUMATRA|RIAU|KEPULAUAN RIAU|KEPULAUAN BANGKA|BANGKA BELITUNG|JAMBI|BENGKULU|LAMPUNG|BANTEN|JAWA|DKI JAKARTA|DAERAH KHUSUS.*JAKARTA|DI YOGYAKARTA|D\.?I\.? YOGYAKARTA|DAERAH ISTIMEWA YOGYAKARTA|YOGYAKARTA|KALIMANTAN BARAT|KALIMANTAN TENGAH)/
export function regionalZone(province,district,original,districtZones={}) {
 let p=upper(province).replace(/^PROVINSI\s+|^PROPINSI\s+/,'')
 if(p.replace(/\s/g,'')==='PAPUA')p='PAPUA'
 if(p.includes('PAPUA')||p.startsWith('MALUKU'))return {zone:'WIT',basis:'PROPINSI'}
 if(p.startsWith('SULAWESI')||central.has(p))return {zone:'WITA',basis:'PROPINSI'}
 if(western.test(p))return {zone:'WIB',basis:'PROPINSI'}
 const districtZone=districtZones[upper(district)]
 if(districtZone)return {zone:districtZone,basis:'KABUPATEN'}
 return {zone:['WIB','WITA','WIT'].includes(upper(original))?upper(original):null,basis:'ZONA WAKTU SUMBER'}
}
function dateParts(value) {
 const match=text(value).match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/)
 if(!match)return null
 const month=MONTHS.findIndex(m=>m.toLowerCase()===match[2].toLowerCase())
 return month<0?null:Date.UTC(Number(match[3]),month,Number(match[1]))
}
function leaveApplies(leave,start,end,periodYear,month) {
 if(!text(leave))return false
 const from=dateParts(start),to=dateParts(end),index=MONTHS.indexOf(month)
 if(from===null||to===null||index<0||!periodYear||to<from)return false
 return from<Date.UTC(periodYear,index+1,1)&&to>=Date.UTC(periodYear,index,1)
}
export function normalizeRow(values,headers,sourceRow,districtZones={}) {
 const source=Object.fromEntries(headers.map((h,i)=>[h,values[i]=== '#N/A'?null:values[i]??null]))
 const get=h=>source[h]
 const nip=text(get('NIP'))
 if(!/^\d{18}$/.test(nip)||typeof get('NIP')==='number')throw Error(`NIP harus teks 18 digit pada baris ${sourceRow}`)
 const initial=number(get('PENGEMBALIAN AWAL')),final=number(get('FINAL PENGEMBALIAN'))
 const delta=initial===null||final===null?null:final-initial
 const changed=delta!==null&&delta!==0
 const statusInitial=text(get('STATUS PENGEMBALIAN AWAL')),statusFinal=text(get('STATUS PENGEMBALIAN FINAL'))
 const statusChanged=statusInitial!==statusFinal
 const originalZone=text(get('ZONA WAKTU')),province=text(get('PROPINSI')),district=text(get('KABUPATEN'))
 const {zone,basis}=regionalZone(province,district,originalZone,districtZones)
 const note=[text(get('cek selisih')),text(get('S'))].filter(Boolean).join(' · ')
 const reasons=[],evidence=[]
 function add(key,description,origin='aturan') {
  if(!reasons.includes(key)){reasons.push(key);evidence.push({reason:key,description,origin})}
 }
 if(changed){
  const n=upper(note)
  if(/\bWITA\b/.test(n)||/\bWIT\b/.test(n)){
   if(zone==='WITA'||zone==='WIT')add(zone,`Keterangan sumber: ${note}. Zona disesuaikan dari ${basis}: ${province} / ${district}.`,'keterangan sumber')
  }
  if(/MELAHIRKAN/.test(n))add('MATERNITY',`Keterangan sumber: ${note}.`,'keterangan sumber')
  else if(/CUTI/.test(n))add(/MELAHIRKAN/i.test(text(get('CUTI')))?'MATERNITY':'LEAVE',`Keterangan sumber: ${note}.`,'keterangan sumber')
  const periodYear=year(get('Tahun')),month=text(get('Bulan'))
  if(leaveApplies(get('CUTI'),get('TANGGAL MULAI CUTI'),get('TANGGAL SELESAI CUTI'),periodYear,month)){
   const key=/MELAHIRKAN/i.test(text(get('CUTI')))?'MATERNITY':'LEAVE'
   add(key,`${text(get('CUTI'))}: ${text(get('TANGGAL MULAI CUTI'))} – ${text(get('TANGGAL SELESAI CUTI'))}, beririsan dengan ${month} ${periodYear}.`)
  }
  if(/\bTENDIK\b/.test(n)||/^TENDIK(?:\/CM)?$/.test(upper(get('STATUS TENDIK'))))add('TENDIK',`Status tendik: ${text(get('STATUS TENDIK'))||'kosong'}. ${note?`Keterangan: ${note}.`:''}`)
  if(/ESDM|E-?ABSENSI|ABSEN/.test(n))add('ATTENDANCE',`Keterangan sumber: ${note}.`,'keterangan sumber')
  if(!reasons.length){
   if(zone==='WIT'||zone==='WITA')add(zone,`Aturan wilayah: ${province||'provinsi kosong'} / ${district||'kabupaten kosong'} → ${zone}.`)
   else add('ATTENDANCE','Aturan pemilik workbook: selisih tanpa alasan khusus lainnya merupakan penyesuaian absen eSDM dan e-Absensi.')
  }
 }
 if(statusChanged)add('STATUS',`${statusInitial||'Kosong'} → ${statusFinal||'Kosong'}.`,'keterangan sumber')
 return {sourceRow,nip,name:text(get('Nama')),periodYear:year(get('Tahun')),month:text(get('Bulan')),
  sp2dOld:year(get('STATUS SP2D')),sp2dUpdated:year(get('STATUS SP2D UPDATE')),bpk:text(get('STATUS SEND BPK')),
  province,district,originalZone,zone,zoneBasis:basis,zoneAdjusted:zone!==originalZone,
  tendik:text(get('STATUS TENDIK')),leave:text(get('CUTI')),statusInitial,statusFinal,
  initial,final,delta,changed,statusChanged,reasons,evidence,note,source:values.map(v=>v==='#N/A'?null:v)}
}
export function buildDistrictZones(rows,headers) {
 const pi=headers.indexOf('PROPINSI'),di=headers.indexOf('KABUPATEN'),counts=new Map()
 for(const {values} of rows){
  const key=upper(values[di]),{zone,basis}=regionalZone(values[pi],null,null)
  if(!key||!zone||basis!=='PROPINSI')continue
  if(!counts.has(key))counts.set(key,new Set())
  counts.get(key).add(zone)
 }
 return Object.fromEntries([...counts].filter(([,zones])=>zones.size===1).map(([district,zones])=>[district,[...zones][0]]))
}
export function matches(row,f={}) {
 const term=text(f.search).toLocaleLowerCase('id-ID')
 if(term&&!`${row.nip} ${row.name}`.toLocaleLowerCase('id-ID').includes(term))return false
 for(const key of ['sp2dOld','sp2dUpdated','bpk','month','zone','tendik','leave','statusInitial','statusFinal']){
  if(f[key]==='__EMPTY__'){if(row[key]!==null&&row[key]!=='')return false}
  else if(f[key]!==undefined&&f[key]!==''&&String(row[key]??'')!==String(f[key]))return false
 }
 if(f.change==='amount'&&!row.changed)return false
 if(f.change==='any'&&!row.changed&&!row.statusChanged)return false
 if(f.change==='unchanged'&&(row.changed||row.statusChanged))return false
 if(f.change==='missing'&&row.delta!==null)return false
 if(f.primaryReason&&primaryReason(row)!==f.primaryReason)return false
 if(f.sourcePriority==='changed'&&!sourcePriorityChanged(row))return false
 return !f.reason||row.reasons.includes(f.reason)
}
// Reporting attribution only; never changes the workbook's amounts.
export function primaryReason(row){
 const specific=specificSourceReason(row)
 return specific||defaultPrimaryReason(row)
}
// S is the workbook's specific attribution; cek selisih may describe multiple causes.
export function specificSourceReason(row){
 if(!row.changed||row.delta===null)return null
 const specific=text(row.source?.[40]??(row.note?.includes(' · ')?row.note.split(' · ').at(-1):''))
 const patterns={TENDIK:/\bTENDIK\b/i,MATERNITY:/MELAHIRKAN/i,LEAVE:/CUTI/i,WIT:/\bWIT\b/i,WITA:/\bWITA\b/i}
 return Object.entries(patterns).find(([key,pattern])=>pattern.test(specific)&&row.reasons.includes(key))?.[0]||null
}
export function sourcePriorityChanged(row){return primaryReason(row)!==defaultPrimaryReason(row)}
export function defaultPrimaryReason(row){
 if(row.delta===null)return 'MISSING'
 if(!row.changed)return 'UNCHANGED'
 const order=['TENDIK','MATERNITY','LEAVE','WIT','WITA','ATTENDANCE']
 const explicit=order.find(key=>row.evidence?.some(e=>e.reason===key&&(e.origin==='keterangan sumber'||(key==='TENDIK'&&/\bTENDIK\b/i.test(row.note)))))
 return explicit||order.find(key=>row.reasons.includes(key))||'ATTENDANCE'
}
export function reasonRecap(rows){
 const grouped=new Map()
 for(const r of rows){const key=JSON.stringify([primaryReason(r),r.month]);if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(r)}
 return [...grouped].map(([key,items])=>({values:JSON.parse(key),...aggregate(items),reduction:items.reduce((n,r)=>n+Math.max(0,-(r.delta??0)),0),increase:items.reduce((n,r)=>n+Math.max(0,r.delta??0),0),automaticRows:items.filter(r=>r.changed&&!(primaryReason(r)==='TENDIK'&&/\bTENDIK\b/i.test(r.note))&&r.evidence?.find(e=>e.reason===primaryReason(r))?.origin!=='keterangan sumber').length})).sort((a,b)=>JSON.stringify(a.values).localeCompare(JSON.stringify(b.values)))
}
export function aggregate(rows) {
 const people=new Set()
 const result={rows:rows.length,people:0,changed:0,statusChanged:0,initial:0,final:0,delta:0,missingInitial:0,missingFinal:0,missingDelta:0}
 for(const r of rows){
  people.add(r.nip);result.changed+=Number(r.changed);result.statusChanged+=Number(r.statusChanged)
  for(const key of ['initial','final','delta'])if(r[key]!==null)result[key]+=r[key];else result[`missing${key[0].toUpperCase()+key.slice(1)}`]++
 }
 result.people=people.size
 return result
}
export function groupTotals(rows,keys) {
 const groups=new Map()
 for(const row of rows){const values=keys.map(k=>row[k]),key=JSON.stringify(values);if(!groups.has(key))groups.set(key,{values,rows:[]});groups.get(key).rows.push(row)}
 return [...groups.values()].map(g=>({values:g.values,...aggregate(g.rows)})).sort((a,b)=>JSON.stringify(a.values).localeCompare(JSON.stringify(b.values)))
}
export function facets(rows) {
 const keys=['sp2dOld','sp2dUpdated','bpk','month','zone','tendik','leave','statusInitial','statusFinal']
 return Object.fromEntries(keys.map(k=>[k,[...new Set(rows.map(r=>r[k]))].sort((a,b)=>k==='month'?MONTHS.indexOf(a)-MONTHS.indexOf(b):String(a??'').localeCompare(String(b??'')))]))
}
export function queryRows(rows,filters={},page=0,pageSize=25) {
 const selected=rows.filter(r=>matches(r,filters)),summary=aggregate(selected)
 const ordered=[...selected].sort((a,b)=>Math.abs(b.delta||0)-Math.abs(a.delta||0)||a.nip.localeCompare(b.nip)||MONTHS.indexOf(a.month)-MONTHS.indexOf(b.month))
 const size=Math.max(1,Math.min(100,Number(pageSize)||25)),last=Math.max(0,Math.ceil(selected.length/size)-1),current=Math.min(last,Math.max(0,Number(page)||0))
 return {rows:ordered.slice(current*size,(current+1)*size).map(({source,...r})=>r),summary,page:current,pageSize:size,
  recaps:{sourcePriority:groupTotals(selected.filter(sourcePriorityChanged),['month']),reasons:reasonRecap(selected),old:groupTotals(selected,['sp2dOld','bpk']),updated:groupTotals(selected,['sp2dUpdated','bpk']),transition:groupTotals(selected,['sp2dOld','sp2dUpdated','bpk'])}}
}
