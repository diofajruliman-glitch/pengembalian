import {hasPairingCategoryReference} from '../judol/availability.js'

export const ROUTING_BASIS = 'historical'
export const CATEGORY_BASES = Object.freeze([
 {value:'after',label:'Sesudah ASN'},
 {value:'historical',label:'Pairing Sekjen asli'},
 {value:'anyPeriod',label:'Sebelum / sesudah ASN'}
])

const categories = ['Ringan','Sedang','Berat']
const text = value => String(value??'').trim()
const categoryOf = period => period?.status!=='Perlu validasi'&&categories.includes(period?.kategori)?period.kategori:null
const result = (category,sourceLabel,reference=false) => ({category:category||'Belum tersedia',sourceLabel,reference})

// The original pairing and calculated periods can disagree. Routing must use
// the selected source explicitly and never manufacture a per-period score.
export function getRoutingCategory(person,basis=ROUTING_BASIS) {
 if(basis==='historical')return result(categoryOf(person?.historical),'Pairing Sekjen asli')
 if(basis==='after') {
  if(hasPairingCategoryReference(person))return result(person.historical.kategori,'Acuan Hasil pairing; rincian sesudah ASN belum tersedia',true)
  return result(categoryOf(person?.after),'Sesudah ASN')
 }
 if(basis==='anyPeriod') {
  if(hasPairingCategoryReference(person))return result(person.historical.kategori,'Acuan Hasil pairing; rincian sebelum/sesudah ASN belum tersedia',true)
  const before=categoryOf(person?.before),after=categoryOf(person?.after)
  const beforeRank=categories.indexOf(before),afterRank=categories.indexOf(after)
  const category=categories[Math.max(beforeRank,afterRank)]
  const sourceLabel=beforeRank>afterRank?'Sebelum ASN':afterRank>beforeRank?'Sesudah ASN':'Sebelum / sesudah ASN'
  return result(category,sourceLabel)
 }
 throw Error('Acuan kategori distribusi tidak dikenal.')
}

export function isHeavyPerson(person,basis=ROUTING_BASIS) {
 return getRoutingCategory(person,basis).category==='Berat'
}

export function isSpecialistRoom(room) {
 // Match the institution at the start of the primary interviewer field only.
 // A mention in a cross interviewer or an arbitrary team name is insufficient.
 return /^(?:itjen|osdm)(?=$|[\s\d()/_.:\-])/iu.test(text(room?.interviewer))
}

export function specialistRooms(rooms=[]) {
 return (Array.isArray(rooms)?rooms:[]).filter(room=>room?.enabled!==false&&isSpecialistRoom(room))
}

export function assertRoutingAssignment(person,room,basis=ROUTING_BASIS) {
 if(isHeavyPerson(person,basis)&&(!isSpecialistRoom(room)||room.enabled===false)) {
  throw Error('SDM kategori Berat wajib ditempatkan pada room aktif dengan pewawancara utama Itjen atau OSDM.')
 }
 return true
}

export function getRoutingConflicts(population=[],entries={},rooms=[],basis=ROUTING_BASIS) {
 const roomById=new Map((Array.isArray(rooms)?rooms:[]).map(room=>[room.id,room]))
 const seen=new Set(),conflicts=[]
 for(const person of Array.isArray(population)?population:[]) {
  const nik=text(person?.nik)
  if(!nik||seen.has(nik))continue
  seen.add(nik)
  const entry=entries&&Object.hasOwn(entries,nik)?entries[nik]:null
  if(!entry||!text(entry.roomId)||!isHeavyPerson(person,basis))continue
  const room=roomById.get(entry.roomId)||null
  if(isSpecialistRoom(room)&&room.enabled!==false)continue
  conflicts.push({nik,entry,room,category:'Berat',readOnly:entry.status==='Di room'||entry.status==='Selesai'})
 }
 return conflicts
}
