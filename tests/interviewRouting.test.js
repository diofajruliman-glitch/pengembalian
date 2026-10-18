import test from 'node:test'
import assert from 'node:assert/strict'
import {DEFAULT_ROOMS} from '../src/interviews/model.js'
import {CATEGORY_BASES,ROUTING_BASIS,getRoutingCategory,isHeavyPerson,isSpecialistRoom,specialistRooms,assertRoutingAssignment,getRoutingConflicts} from '../src/interviews/routing.js'

const person = (nik,category,patch={}) => ({nik,historical:{kategori:category,status:'Sumber asli Sekjen'},...patch})

test('routing defaults to the original pairing even when period categories disagree',()=>{
 const originalHeavy=person('1','Berat',{before:{kategori:'Sedang'},after:{kategori:'Ringan'}})
 const periodHeavy=person('2','Ringan',{before:{kategori:'Ringan'},after:{kategori:'Berat'}})
 assert.equal(ROUTING_BASIS,'historical')
 assert.deepEqual(CATEGORY_BASES.map(basis=>basis.value),['after','historical','anyPeriod'])
 assert.deepEqual(getRoutingCategory(originalHeavy),{category:'Berat',sourceLabel:'Pairing Sekjen asli',reference:false})
 assert.equal(isHeavyPerson(originalHeavy),true)
 assert.equal(isHeavyPerson(originalHeavy,'after'),false)
 assert.equal(isHeavyPerson(periodHeavy),false)
 assert.equal(isHeavyPerson(periodHeavy,'after'),true)
 assert.equal(isHeavyPerson(originalHeavy,'anyPeriod'),false)
})

test('the highest valid before/after category is used only with the anyPeriod basis',()=>{
 const rows=[
  [{before:{kategori:'Berat'},after:{kategori:'Ringan'}},'Berat','Sebelum ASN'],
  [{before:{kategori:'Sedang'},after:{kategori:'Berat'}},'Berat','Sesudah ASN'],
  [{before:{kategori:'Ringan'},after:{kategori:'Ringan'}},'Ringan','Sebelum / sesudah ASN'],
  [{before:{kategori:'Sedang'}},'Sedang','Sebelum ASN'],
  [{before:{kategori:'Berat',status:'Perlu validasi'},after:{kategori:'Ringan'}},'Ringan','Sesudah ASN'],
  [{before:{kategori:'Rincian transaksi belum tersedia'},after:{kategori:'Tidak ada transaksi'}},'Belum tersedia','Sebelum / sesudah ASN']
 ]
 for(const [row,category,sourceLabel] of rows)assert.deepEqual(getRoutingCategory(row,'anyPeriod'),{category,sourceLabel,reference:false})
})

test('missing period details retain a clearly labelled pairing reference without synthesizing scores',()=>{
 const row=person('1','Berat',{categoryFromPairing:true,missingTransactionDetails:true,before:{kategori:'Berat',frekuensi:null},after:{kategori:'Berat',frekuensi:null}})
 const before=structuredClone(row)
 for(const basis of ['after','anyPeriod']) {
  const category=getRoutingCategory(row,basis)
  assert.equal(category.category,'Berat')
  assert.equal(category.reference,true)
  assert.match(category.sourceLabel,/Acuan Hasil pairing.*belum tersedia/)
 }
 assert.equal(getRoutingCategory(row).reference,false)
 assert.deepEqual(row,before)
})

test('unknown or invalid original categories remain unavailable instead of borrowing another period',()=>{
 for(const row of [null,{},person('1',''),person('1','berat'),person('1','Tidak diketahui'),{after:{kategori:'Berat'}}]) {
  assert.equal(getRoutingCategory(row).category,'Belum tersedia')
  assert.equal(isHeavyPerson(row),false)
 }
 assert.throws(()=>getRoutingCategory({},'unknown'),/Acuan kategori/)
})

test('a validation flag preserves the original pairing category and remains visible in its source label',()=>{
 const row=person('1','Berat',{historical:{kategori:'Berat',status:'Perlu validasi',frekuensi:null},before:{kategori:'Ringan'},after:{kategori:'Sedang'}})
 const original=structuredClone(row)
 assert.deepEqual(getRoutingCategory(row),{category:'Berat',sourceLabel:'Pairing Sekjen asli — perlu validasi',reference:false})
 assert.equal(isHeavyPerson(row),true)
 assert.throws(()=>assertRoutingAssignment(row,DEFAULT_ROOMS[4]),/Berat.*Itjen atau OSDM/)
 assert.equal(assertRoutingAssignment(row,DEFAULT_ROOMS[0]),true)
 assert.deepEqual(row,original)
})

test('specialist rooms use an anchored primary institution name, including institutional numbering',()=>{
 for(const interviewer of ['Itjen','Itjen 1','  ITJEN   2  ','OSDM 1','OSDM2','Itjen-2','OSDM / Tim 2'])assert.equal(isSpecialistRoom({interviewer}),true,interviewer)
 for(const room of [null,{}, {interviewer:''},{interviewer:'Tim A lintas Itjen'},{interviewer:'OSDMx'},{interviewer:'Itjenisasi'},{interviewer:'Tim A',crossInterviewer:'Itjen 1'},{name:'Itjen 1',crossInterviewer:'OSDM 2'}])assert.equal(isSpecialistRoom(room),false)
 assert.deepEqual(specialistRooms(DEFAULT_ROOMS).map(room=>room.id),['room-1','room-2','room-3','room-4'])
 const rooms=DEFAULT_ROOMS.map(room=>room.id==='room-1'?{...room,enabled:false}:room)
 assert.equal(isSpecialistRoom(rooms[0]),true)
 assert.deepEqual(specialistRooms(rooms).map(room=>room.id),['room-2','room-3','room-4'])
 assert.deepEqual(specialistRooms(null),[])
})

test('heavy assignments reject a general, missing, disabled, or cross-only target',()=>{
 const heavy=person('1','Berat'),light=person('2','Ringan')
 for(const room of specialistRooms(DEFAULT_ROOMS))assert.equal(assertRoutingAssignment(heavy,room),true)
 for(const room of [null,DEFAULT_ROOMS[4],{...DEFAULT_ROOMS[0],enabled:false},{interviewer:'Tim A',crossInterviewer:'Itjen 1'}])assert.throws(()=>assertRoutingAssignment(heavy,room),/Berat.*Itjen atau OSDM/)
 assert.equal(assertRoutingAssignment(light,DEFAULT_ROOMS[4]),true)
 assert.equal(assertRoutingAssignment({after:{kategori:'Berat'}},DEFAULT_ROOMS[4]),true,'unknown pairing must not be inferred heavy')
 assert.throws(()=>assertRoutingAssignment({after:{kategori:'Berat'}},DEFAULT_ROOMS[4],'after'),/Berat/)
})

test('conflict review includes existing active and completed records without changing their assignments',()=>{
 const population=[person('1','Berat'),person('2','Berat'),person('3','Berat'),person('4','Berat'),person('5','Berat'),person('6','Ringan'),person('7','Berat'),person('8','Berat'),person('9','Berat'),person('1','Berat')]
 const entries={
  1:{roomId:'room-5',status:'Terjadwal',date:'2026-10-19'},
  2:{roomId:'room-6',status:'Di room',startedAt:'2026-10-19T01:00:00Z'},
  3:{roomId:'room-7',status:'Selesai',finishedAt:'2026-10-19T01:40:00Z'},
  4:{roomId:'room-1',status:'Terjadwal'},
  5:{status:'Belum dijadwalkan'},
  6:{roomId:'room-8',status:'Terjadwal'},
  7:{roomId:'missing-room',status:'Terjadwal'},
  8:{roomId:'room-2',status:'Terjadwal'},
  9:{roomId:'room-3',status:'Terjadwal'},
  outsidePopulation:{roomId:'room-8',status:'Terjadwal'}
 }
 const rooms=DEFAULT_ROOMS.map(room=>room.id==='room-2'?{...room,enabled:false}:room)
 const original=structuredClone({population,entries,rooms})
 const conflicts=getRoutingConflicts(population,entries,rooms)
 assert.deepEqual(conflicts.map(({nik,readOnly,category})=>({nik,readOnly,category})),[
  {nik:'1',readOnly:false,category:'Berat'},
  {nik:'2',readOnly:true,category:'Berat'},
  {nik:'3',readOnly:true,category:'Berat'},
  {nik:'7',readOnly:false,category:'Berat'},
  {nik:'8',readOnly:false,category:'Berat'}
 ])
 assert.equal(conflicts[0].entry,entries[1])
 assert.equal(conflicts[0].room,rooms[4])
 assert.equal(conflicts[3].room,null)
 assert.deepEqual({population,entries,rooms},original)
 assert.deepEqual(getRoutingConflicts(),[])
})
