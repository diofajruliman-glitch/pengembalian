import {obligationKey} from './masterWorkbook.js'
// Positive obligations establish the source SP2D year. Keep ledger zeros for audit.
export function summarizeSp2dYears(results) {
 const years=new Map()
 for(const result of results){
  const eligible=new Set()
  for(const row of result.obligations){
   if(!(row.amount>0))continue
   eligible.add(obligationKey(row))
   if(!years.has(row.year))years.set(row.year,{year:row.year,people:new Set(),tukin:0,um:0,obligation:0,payment:0})
   const summary=years.get(row.year)
   summary.people.add(row.nip);summary.obligation+=row.amount
   if(row.kind==='TUKIN')summary.tukin+=row.amount
   if(row.kind==='UM')summary.um+=row.amount
  }
  for(const row of result.payments)if(eligible.has(obligationKey(row)))years.get(row.year).payment+=row.amount
 }
 return [...years.values()].sort((a,b)=>a.year-b.year).map(s=>({...s,people:s.people.size,remaining:s.obligation-s.payment}))
}
