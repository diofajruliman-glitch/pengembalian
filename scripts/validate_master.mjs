import fs from 'node:fs'
import {BANK_SHEETS,parseBankSheet,reconcileBanks,comparePayments} from '../src/import/masterWorkbook.js'
const workbook=JSON.parse(fs.readFileSync(process.argv[2],'utf8'))
const results=Object.entries(BANK_SHEETS).map(([sheet,bank])=>parseBankSheet(workbook[sheet]||[],bank))
const recap={};for(const row of (workbook.REKAPITULASI||[]).slice(4,7)){const bank=String(row[1]||'');const name=Object.values(BANK_SHEETS).find(x=>x.toUpperCase()===bank);if(name)recap[name]={obligation:row[6],payment:row[11]}}
const global=new Set();let overlaps=0;for(const r of results)for(const p of r.people){if(global.has(p.nip))overlaps++;global.add(p.nip)}
const reconciliation=reconcileBanks(results,recap)
const report={source:'Rekap Master Pengembalian Uang Makan dan Tukin PPPK 2025 (22).xlsx',cutoff:'2026-10-09',readOnly:true,banks:results.map(r=>({bank:r.bank,totals:r.totals,obligations:r.obligations.length,paymentCells:r.payments.length,positivePayments:r.payments.filter(p=>p.amount>0).length,issues:r.issues.reduce((a,x)=>(a[x.code]=(a[x.code]||0)+1,a),{}),repeatImportAdded:comparePayments(r.payments,r.payments).added.length})),crossBankOverlaps:overlaps,reconciliation,deployAllowed:false}
const text=JSON.stringify(report,null,2);if(process.argv[3])fs.writeFileSync(process.argv[3],text);console.log(text)
