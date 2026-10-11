import {obligationKey} from '../import/masterWorkbook.js'
import {statusOf,isNonactiveStatus} from '../import/sourceMetadata.js'
export function indexSnapshot(results){
 const people=new Map(),obligations=[],payments=[],byNip=new Map()
 for(const result of results){for(const p of result.people)people.set(p.nip,p);obligations.push(...result.obligations);payments.push(...result.payments)}
 for(const p of people.values())byNip.set(p.nip,{...p,obligations:[],payments:[]})
 for(const r of obligations)byNip.get(r.nip)?.obligations.push(r)
 for(const r of payments)byNip.get(r.nip)?.payments.push(r)
 return {people:[...byNip.values()],obligations,payments}
}
export function selectProgress(index,{bank='',year='',kind='',stage='',search='',status='',remainingOnly=false,worklist='',targetStatuses=[]}={}){
 const term=search.trim().toLowerCase()
 const matches=r=>(!bank||r.bank===bank)&&(!year||r.year===Number(year))&&(!kind||r.kind===kind)
 const people=index.people.filter(p=>(!bank||p.bank===bank)&&(!status||statusOf(p)===status||(!p.sourceMetadata&&(p.nonactive?.category||p.status_sdm||'Belum ditandai nonaktif')===status))&&(!term||[p.nip,p.nama,p.provinsi].some(v=>String(v||'').toLowerCase().includes(term))))
 const selected=[];let obligation=0,payment=0,verified=0,stagePayment=0
 for(const p of people){const os=p.obligations.filter(r=>r.amount>0&&matches(r));if(!os.length)continue;const keys=new Set(os.map(obligationKey));const ps=p.payments.filter(r=>matches(r)&&keys.has(obligationKey(r)));const kw=os.reduce((s,r)=>s+r.amount,0),real=ps.reduce((s,r)=>s+r.amount,0),checked=ps.filter(r=>r.verification==='verified').reduce((s,r)=>s+r.amount,0);const perStage=ps.filter(r=>!stage||r.stage===Number(stage)).reduce((s,r)=>s+r.amount,0)
  const sourceStatus=statusOf(p),held=p.sourceMetadata?.needsReview||sourceStatus==='Perlu pemeriksaan'
  if(worklist==='nonactive'&&(!isNonactiveStatus(sourceStatus)||held||kw-real<=0))continue
  if(worklist==='nonactive'&&targetStatuses.length&&!targetStatuses.includes(sourceStatus))continue
  if(worklist==='active'&&(sourceStatus!=='Aktif'||held||kw-real<=0))continue
  if(worklist==='paid'&&kw-real!==0)continue
  if(worklist==='review'&&!held)continue
  if(stage&&!ps.some(r=>r.stage===Number(stage)&&r.amount>0))continue
  if(remainingOnly&&kw-real<=0)continue
  selected.push({...p,obligations:os,payments:ps,obligation:kw,payment:real,verified:checked,stagePayment:perStage,remaining:kw-real});obligation+=kw;payment+=real;verified+=checked;stagePayment+=perStage
 }
 return {rows:selected,totals:{people:selected.length,obligation,payment,verified,stagePayment,remaining:obligation-payment,pct:obligation?100*payment/obligation:0}}
}
export function detailBalances(person){const paid=new Map();for(const r of person.payments){const k=obligationKey(r);paid.set(k,(paid.get(k)||0)+r.amount)}return person.obligations.filter(r=>r.amount>0).map(r=>({...r,payment:paid.get(obligationKey(r))||0,remaining:r.amount-(paid.get(obligationKey(r))||0)}))}
export function exportRows(selection,stage=''){
 const summary=[['NIP','Nama','Provinsi','Bank','Kewajiban','Pengembalian master (workbook dan setoran langsung terverifikasi)','Penerimaan terverifikasi','Sisa master','Pengembalian tahap terpilih','Tahun SP2D','Tag saldo','Referensi NTPN sumber','Status SDM (sumber)'],...selection.rows.map(p=>[p.nip,p.nama,p.provinsi,p.bank,p.obligation,p.payment,p.verified,p.remaining,p.stagePayment,[...new Set(p.obligations.filter(r=>r.amount>0).map(r=>r.year))].sort().join(', '),p.remaining===0?'Lunas menurut saldo':'Belum Lunas',[...new Set(p.payments.flatMap(r=>(r.ntpnReferences||[]).map(n=>n.code)))].join('; '),statusOf(p)])]
 const transactions=[['NIP','Nama','Bank','Jenis','Tahun SP2D','Tahap','Nominal','Status verifikasi','Tanggal pengembalian','NTPN sumber tahap'],...selection.rows.flatMap(p=>p.payments.filter(r=>!stage||r.stage===Number(stage)).map(r=>[p.nip,p.nama,r.bank,r.kind,r.year,r.stage,r.amount,r.verification||'pending',r.paymentDate||'',(r.ntpnReferences||[]).map(n=>n.code).join('; ')]))]
 return {summary,transactions}
}
