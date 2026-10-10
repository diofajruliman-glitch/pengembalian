// Pure mapping: no database writes, no dependency on physical column positions.
const roman = {I:1,II:2,III:3,IV:4,V:5,VI:6,VII:7,VIII:8,IX:9,X:10}
const clean = value => String(value ?? '').replace(/\s+/g,' ').trim()
const normalize = value => clean(value).toUpperCase()
const normalizeNip = value => {
 if(value===null||value===undefined) return ''
 if(typeof value === 'number') return Number.isSafeInteger(value) ? String(value) : ''
 return String(value).replace(/\s+/g,'').trim()
}
export const BANK_SHEETS = {'BNBA PENGEMBALIAN MANDIRI':'Mandiri','BNBA PENGEMBALIAN BRI':'BRI','BNBA PENGEMBALIAN BSI':'BSI'}
export function mapColumns(rows) {
 const first = rows[0] || [], second = rows[1] || []
 const columns=[], issues=[]; let inherited=''
 for(let index=0;index<Math.max(first.length,second.length);index++){
  if(clean(first[index]))inherited=normalize(first[index])
  const year=Number(second[index]); if(!Number.isInteger(year)||year<2000||year>2100){
   if(/^(FINAL TOTAL PIUTANG TUKIN|PIUTANG UANG MAKAN TOTAL|PENGEMBALIAN (TUKIN|UANG MAKAN) TAHAP)/.test(inherited)&&clean(second[index]))issues.push({code:'UNSUPPORTED_YEAR',column:index+1})
   continue
  }
  const kind=inherited.includes('UANG MAKAN')?'UM':inherited.includes('TUKIN')?'TUKIN':null
  if(!kind)continue
  if(inherited.startsWith('FINAL TOTAL PIUTANG TUKIN')||inherited==='PIUTANG UANG MAKAN TOTAL')columns.push({index,kind,year,type:'obligation'})
  else {
   const match=inherited.match(/^PENGEMBALIAN (?:TUKIN|UANG MAKAN) TAHAP ([IVX]+|\d+)$/)
   if(match){const stage=roman[match[1]]||Number(match[1]);if(!Number.isInteger(stage)||stage<1)issues.push({code:'INVALID_STAGE',column:index+1});else columns.push({index,kind,year,stage,type:'payment'})}
  }
 }
 const keys=new Set();for(const c of columns){const k=[c.type,c.kind,c.year,c.stage||0].join('|');if(keys.has(k))issues.push({code:'DUPLICATE_COLUMN',column:c.index+1});keys.add(k)}
 const years=[...new Set(columns.map(c=>c.year))]
 if(!years.length)issues.push({code:'MISSING_OBLIGATION_HEADERS'})
 for(const kind of ['TUKIN','UM'])for(const year of years)if(!columns.some(c=>c.type==='obligation'&&c.kind===kind&&c.year===year))issues.push({code:'MISSING_OBLIGATION',kind,year})
 return {columns,issues}
}
export function parseNumericAmount(value){
 if(value===null||value===undefined||value==='')return null
 if(typeof value === 'number'){if(!Number.isFinite(value)||value<0)throw Error('INVALID_AMOUNT');return value}
 let source=String(value).trim()
 if(!source||source==='null'||source==='undefined')return null
 source=source.replace(/Rp|IDR/gi,'').replace(/\s+/g,'')
 if(!source||source==='-'||source==='.'||source==='-.')return null
 if(source.includes(',')&&source.includes('.')){
  const lastComma=source.lastIndexOf(',');const lastDot=source.lastIndexOf('.')
  const decimalSeparator=lastComma>lastDot?',':'.'
  const thousandsSeparator=decimalSeparator===','?'.':','
  source=source.split(thousandsSeparator).join('').replace(decimalSeparator,'.')
 } else if(source.includes(',')){
  const parts=source.split(',')
  const lastPart=parts.at(-1)
  source = parts.length>1 && lastPart.length===3 && source.indexOf(',')===source.lastIndexOf(',') && !source.includes('.') ? parts.join('') : source.replace(/,/g,'.')
 } else if(source.includes('.')){
  const parts=source.split('.')
  if(parts.length>2 && parts.every(p=>p.length===3) && !source.includes(',') && !/\.\d{3}$/.test(source))source=parts.join('')
 }
 const numeric=Number(source)
 if(!Number.isFinite(numeric)||numeric<0)throw Error('INVALID_AMOUNT')
 return numeric
}
function amount(value){
 return parseNumericAmount(value)
}
export const obligationKey = r => [r.nip,r.bank,r.kind,r.year].join('|')
export const paymentKey = r => [obligationKey(r),r.stage].join('|')
export function parseBankSheet(rows,bank,{keepZeroPayments=true,zeroPaymentKeys=new Set()}={}){
 const {columns,issues}=mapColumns(rows);const people=[],obligations=[],payments=[];const seen=new Set();const headings=rows[0]||[]
 const column=label=>headings.findIndex(v=>normalize(v)===label)
 const nipCol=column('NIP'),nameCol=column('NAMA SK'),provinceCol=column('PROVINSI')
 if(nipCol<0||nameCol<0)issues.push({code:'MISSING_IDENTITY_HEADERS'})
 if(issues.length)return {bank,people,obligations,payments,issues,totals:{}}
 for(let i=2;i<rows.length;i++){
  const row=rows[i]||[], raw=row[nipCol];if(raw===null||raw===undefined||raw==='')continue
  // Ignore summary/header rows, but flag all numeric identifiers (precision is unsafe).
  if(typeof raw==='string'&&['NIP','TOTAL','JUMLAH'].includes(normalize(raw)))continue
  const nip=normalizeNip(raw)
  if(!/^\d{18}$/.test(nip)){issues.push({code:'INVALID_NIP',row:i+1});continue}
  if(seen.has(nip)){issues.push({code:'DUPLICATE_NIP',row:i+1});continue}seen.add(nip)
  if(!clean(row[nameCol])){issues.push({code:'MISSING_NAME',row:i+1});continue}
  people.push({nip,nama:clean(row[nameCol]),provinsi:clean(row[provinceCol]),bank})
  const local=new Map()
  for(const c of columns){try{const nominal=amount(row[c.index]);if(nominal===null)continue
   const record={nip,bank,kind:c.kind,year:c.year,amount:nominal,sourceRow:i+1,sourceColumn:c.index+1}
   if(c.type==='obligation'){obligations.push(record);local.set(obligationKey(record),nominal)}
   else {const payment={...record,stage:c.stage,verification:'pending'};if(nominal===0&&zeroPaymentKeys.has(paymentKey(payment)))payment.correctsExisting=true;if(nominal>0||keepZeroPayments||zeroPaymentKeys.has(paymentKey(payment)))payments.push(payment)}
  }catch{issues.push({code:'INVALID_AMOUNT',row:i+1,column:c.index+1})}}
  const grouped=new Map();for(const p of payments.slice(-columns.length).filter(p=>p.nip===nip)){const k=obligationKey(p);grouped.set(k,(grouped.get(k)||0)+p.amount)}
  for(const [k,total] of grouped){if(!local.has(k)&&total>0)issues.push({code:'PAYMENT_WITHOUT_OBLIGATION',row:i+1});else if(total>(local.get(k)||0))issues.push({code:'OVERPAYMENT',row:i+1})}
 }
 const obligation=obligations.reduce((s,r)=>s+r.amount,0),payment=payments.reduce((s,r)=>s+r.amount,0)
 return {bank,people,obligations,payments,issues,totals:{people:people.length,obligation,payment,remaining:obligation-payment}}
}
// A blank cell never removes an existing transaction. Zero is an explicit correction.
export function comparePayments(incoming,existing){
 const prior=new Map(existing.map(r=>[paymentKey(r),r]));const seen=new Set();const result={added:[],unchanged:0,corrections:[],missing:[],issues:[]}
 for(const r of incoming){const k=paymentKey(r);if(seen.has(k)){result.issues.push({code:'DUPLICATE_TRANSACTION'});continue}seen.add(k);const old=prior.get(k);if(!old){if(r.amount>0)result.added.push(r)}else if(old.amount===r.amount)result.unchanged++;else result.corrections.push({before:old,after:r,delta:r.amount-old.amount})}
 for(const [k,r] of prior)if(!seen.has(k))result.missing.push(r)
 return result
}
export function reconcileBanks(results,recap){
 const issues=[];for(const r of results){const expected=recap[r.bank];if(!expected){issues.push({code:'MISSING_RECAP',bank:r.bank});continue}for(const measure of ['obligation','payment'])if(r.totals[measure]!==expected[measure])issues.push({code:'RECAP_MISMATCH',bank:r.bank,measure,actual:r.totals[measure],expected:expected[measure]})}
 return issues
}
