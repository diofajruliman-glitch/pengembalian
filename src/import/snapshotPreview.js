import {BANK_SHEETS,mapColumns,parseBankSheet,comparePayments,obligationKey,paymentKey,reconcileBanks} from './masterWorkbook.js'
export function readRecap(rows){
 const recap={};for(const row of rows){const bank=Object.values(BANK_SHEETS).find(x=>x.toUpperCase()===String(row?.[1]||'').trim().toUpperCase());if(!bank||recap[bank])continue;if(Number.isSafeInteger(row[6])&&Number.isSafeInteger(row[11]))recap[bank]={obligation:row[6],payment:row[11]}}
 return recap
}
export function summarizeBank(rows,bank,baseline){
 const previous=baseline?parseBankSheet(baseline,bank,{keepZeroPayments:false}):null
 const current=parseBankSheet(rows,bank,{keepZeroPayments:false,zeroPaymentKeys:new Set(previous?.payments.map(paymentKey)||[])}),issues=[...current.issues];let comparison=null,details=[]
 const stages=[...new Set(mapColumns(rows).columns.filter(c=>c.type==='payment').map(c=>c.stage))].sort((a,b)=>a-b)
 if(baseline){if(previous.issues.length)issues.push({code:'INVALID_BASELINE'});else{
  const diff=comparePayments(current.payments,previous.payments);const old=new Map(previous.obligations.map(r=>[obligationKey(r),r.amount]));const ids=new Set(previous.people.map(r=>r.nip))
  const obligationCorrections=current.obligations.filter(r=>old.has(obligationKey(r))&&old.get(obligationKey(r))!==r.amount)
  comparison={newPayments:diff.added.length,newAmount:diff.added.reduce((s,r)=>s+r.amount,0),unchanged:diff.unchanged,corrections:diff.corrections.length,correctionDelta:diff.corrections.reduce((s,r)=>s+r.delta,0),missing:diff.missing.length,newPeople:current.people.filter(p=>!ids.has(p.nip)).length,obligationCorrections:obligationCorrections.length,newStages:stages.filter(s=>!mapColumns(baseline).columns.some(c=>c.stage===s))};issues.push(...diff.issues)
  details=[...diff.corrections.slice(0,50).map(c=>({...c.after,type:'Koreksi pembayaran',before:c.before.amount,after:c.after.amount})),...obligationCorrections.slice(0,50).map(r=>({...r,type:'Koreksi kewajiban',before:old.get(obligationKey(r)),after:r.amount})),...diff.added.slice(0,50).map(r=>({...r,type:'Pembayaran baru',before:null,after:r.amount}))]
 }}
 const stagesSummary=stages.map(stage=>{const payments=current.payments.filter(p=>p.stage===stage);return {stage,positive:payments.filter(p=>p.amount>0).length,tukin:payments.filter(p=>p.kind==='TUKIN').reduce((s,p)=>s+p.amount,0),um:payments.filter(p=>p.kind==='UM').reduce((s,p)=>s+p.amount,0)}})
 const lastCol=(rows[0]||[]).findIndex(v=>String(v||'').trim().toUpperCase()==='SISA TAGIHAN');let legacy=0;if(lastCol>=0)for(const row of rows.slice(2))if(typeof row[0]==='string'&&/^\d{18}$/.test(row[0])&&typeof row[lastCol]==='number')legacy+=row[lastCol]
 return {summary:{bank,totals:current.totals,stages:stagesSummary,comparison,details,issueCount:issues.length,issues:issues.slice(0,20),legacyDifference:lastCol>=0?legacy-current.totals.remaining:null},result:current}
}
export function finalizePreview(results,recap){const overlaps=new Set(),seen=new Set();for(const r of results)for(const p of r.people){if(seen.has(p.nip))overlaps.add(p.nip);seen.add(p.nip)}return {issues:reconcileBanks(results,recap),overlaps:overlaps.size,people:seen.size}}
