import test from 'node:test'
import assert from 'node:assert/strict'
import {
 DEFAULT_ROOMS,STATUSES,selectPopulation,sourceKey,createSchedule,
 validateAssignment,updateEntry,timerState,monitoringCsv
} from '../src/interviews/model.js'

const people = count => Array.from({length:count},(_,index)=>({nik:String(index+1).padStart(16,'0'),nip:String(index+1).padStart(18,'0'),nama:`Peserta ${index+1}`,hasilPenilaian:'Terbukti'}))
const settings = {startDate:'2026-10-19',startTime:'08:00',duration:40,gap:5,perDay:11,skipWeekends:true}
const assignment = (nik='0000000000000001',patch={}) => ({nik,date:'2026-10-19',session:1,roomId:'room-1',time:'08:00',duration:40,status:'Terjadwal',...patch})
const asEntries = rows => Object.fromEntries(rows.map(row=>[row.nik,row]))
const snapshot = rows => ({kind:'analysis',active:0,filename:'workbook.xlsx',versions:[{number:1,createdAt:'2026-10-17T01:00:00Z',result:{source:{sha256:'workbook-sha256'},rows}}]})

test('population references only the active analysis Terbukti rows and preserves exact text identity',()=>{
 const proven=people(1057),other={nik:'9000000000000001',hasilPenilaian:'Tidak Terbukti'}
 const input=snapshot([...proven,other,{...proven[0]},{nik:10000000000000000,hasilPenilaian:'Terbukti'}])
 input.versions.push({number:2,result:{rows:[other]}})
 const before=JSON.stringify(input),selected=selectPopulation(input)
 assert.equal(selected.length,1057)
 assert.equal(selected[0],proven[0])
 assert.equal(selected[0].nik,'0000000000000001')
 assert.equal(JSON.stringify(input),before)
 input.active=1
 assert.deepEqual(selectPopulation(input),[])
 assert.deepEqual(selectPopulation({...input,kind:'legacy'}),[])
 assert.deepEqual(selectPopulation({...input,active:9}),[])
})

test('source namespaces contain no raw identity and remain stable through online save and name changes',()=>{
 const input=snapshot(people(1)),key=sourceKey(input)
 assert.match(key,/^interviews-v1-[a-f0-9]{16}$/)
 assert.equal(key.includes(input.versions[0].result.rows[0].nik),false)
 assert.equal(key,sourceKey({...input,name:'Nama diubah',versions:[{...input.versions[0],id:'saved-online-id'}]}))
 assert.notEqual(key,sourceKey({...input,versions:[{...input.versions[0],number:2}]}))
 assert.notEqual(key,sourceKey({...input,versions:[{...input.versions[0],result:{source:{sha256:'other-workbook'},rows:[]}}]}))
 assert.equal(sourceKey(null),'')
})

test('18 room allocations match the supplied CSV including empty traffic officers',()=>{
 assert.equal(DEFAULT_ROOMS.length,18)
 assert.deepEqual(DEFAULT_ROOMS[0],{id:'room-1',name:'Room 1',interviewer:'Itjen 1',crossInterviewer:'',trafficOfficer:'Dio',enabled:true})
 assert.equal(DEFAULT_ROOMS[4].interviewer,'Sekretariat Linjamsos')
 assert.equal(DEFAULT_ROOMS[9].interviewer,'Asiafry Raynaldi')
 assert.equal(DEFAULT_ROOMS[17].interviewer,'TU 2')
 assert.ok(DEFAULT_ROOMS.slice(9).every(room=>room.crossInterviewer==='Abi Setiadi Halim'&&room.trafficOfficer===''))
})

test('1057 participants use 11 per room per day, concurrent rooms, and six weekdays',()=>{
 const population=people(1057),schedule=createSchedule(population,{},DEFAULT_ROOMS,settings)
 const dates=new Map()
 for(const entry of schedule)dates.set(entry.date,(dates.get(entry.date)||0)+1)
 assert.equal(schedule.length,1057)
 assert.equal(new Set(schedule.map(entry=>entry.nik)).size,1057)
 assert.deepEqual([...dates],[['2026-10-19',198],['2026-10-20',198],['2026-10-21',198],['2026-10-22',198],['2026-10-23',198],['2026-10-26',67]])
 assert.deepEqual(schedule.slice(0,18).map(entry=>entry.roomId),DEFAULT_ROOMS.map(room=>room.id))
 assert.ok(schedule.slice(0,18).every(entry=>entry.session===1&&entry.time==='08:00'))
 assert.ok(schedule.slice(180,198).every(entry=>entry.session===11&&entry.time==='15:30'&&entry.duration===40))
 const roomDates=new Map()
 for(const entry of schedule){const key=`${entry.date}/${entry.roomId}`;roomDates.set(key,(roomDates.get(key)||0)+1)}
 assert.ok([...roomDates.values()].every(count=>count<=11))
 assert.equal('nama' in schedule[0],false)
})

test('automatic schedule preserves all operational records, including existing reschedule requests',()=>{
 const population=people(10),existing={}
 const statuses=['Selesai','Di room','Terkendala','Jadwal ulang','Terjadwal','Menunggu','Tidak hadir']
 statuses.forEach((status,index)=>{existing[population[index].nik]=assignment(population[index].nik,{status,roomId:`room-${index+1}`})})
 existing[population[7].nik]={nik:population[7].nik,status:'Jadwal ulang',notes:'Perlu tindak lanjut'}
 existing[population[8].nik]={nik:population[8].nik,status:'Belum dijadwalkan',date:'2026-10-20'}
 existing[population[9].nik]={nik:population[9].nik,status:'Belum dijadwalkan',notes:'Catatan persiapan'}
 const before=structuredClone(existing)
 const schedule=createSchedule(population,existing,DEFAULT_ROOMS,settings)
 assert.deepEqual(existing,before)
 assert.deepEqual(schedule.map(row=>row.nik),[population[9].nik])
})

test('scheduler checks actual room and primary interviewer overlaps and enabled rooms',()=>{
 const rooms=[{...DEFAULT_ROOMS[0],interviewer:'Tim A'},{...DEFAULT_ROOMS[1],interviewer:'tim  A'},{...DEFAULT_ROOMS[2],enabled:false}]
 const schedule=createSchedule(people(5),{},rooms,{...settings,perDay:2})
 assert.deepEqual(schedule.map(entry=>[entry.date,entry.session,entry.roomId]),[
  ['2026-10-19',1,'room-1'],['2026-10-19',2,'room-2'],['2026-10-20',1,'room-1'],['2026-10-20',2,'room-2'],['2026-10-21',1,'room-1']
 ])
 const existing={'other':assignment('other',{time:'08:20',duration:40})}
 const second=createSchedule(people(1),existing,DEFAULT_ROOMS.slice(0,2),{...settings,perDay:1})
 assert.equal(second[0].roomId,'room-2')
 assert.equal(second[0].date,'2026-10-19')
})

test('schedule validates calendar dates, numeric bounds, and complete daily window',()=>{
 for(const patch of [{startDate:'2026-02-30'},{startTime:'24:00'},{perDay:0},{perDay:501},{perDay:true},{duration:0},{gap:-1},{startTime:'23:40'},{duration:40,gap:5,perDay:22}]) {
  assert.throws(()=>createSchedule(people(1),{},DEFAULT_ROOMS,{...settings,...patch}))
 }
 assert.throws(()=>createSchedule(people(1),{},DEFAULT_ROOMS.map(room=>({...room,enabled:false})),settings),/Aktifkan/)
 const saturday=createSchedule(people(1),{},DEFAULT_ROOMS,{...settings,startDate:'2026-10-17'})
 assert.equal(saturday[0].date,'2026-10-19')
 assert.equal(createSchedule(people(1),{},DEFAULT_ROOMS,{...settings,startDate:'2026-10-17',skipWeekends:false})[0].date,'2026-10-17')
})

test('manual assignments reject overlapping room and primary interviewer, allow adjacent windows and cross coordination',()=>{
 const existing=asEntries([assignment('other')])
 assert.throws(()=>validateAssignment(assignment(),existing,DEFAULT_ROOMS),/Room/)
 assert.equal(validateAssignment(assignment('other'),existing,DEFAULT_ROOMS),true,'self must not conflict')
 assert.equal(validateAssignment(assignment(undefined,{time:'08:40'}),existing,DEFAULT_ROOMS),true)
 const samePrimary=DEFAULT_ROOMS.map((room,index)=>index===1?{...room,interviewer:'  ITJEN   1 '}:room)
 assert.throws(()=>validateAssignment(assignment(undefined,{roomId:'room-2'}),existing,samePrimary),/Pewawancara utama/)
 assert.equal(validateAssignment(assignment(undefined,{roomId:'room-11'}),asEntries([assignment('other',{roomId:'room-10'})]),DEFAULT_ROOMS),true)
 for(const patch of [{date:'2026-13-01'},{date:'2026-02-29'},{session:0},{time:'12:60'},{time:'23:40'},{duration:481},{roomId:'unknown'}])assert.throws(()=>validateAssignment(assignment(undefined,patch),{},DEFAULT_ROOMS))
})

test('room entry needs a complete schedule and identity verification; actual timer starts on entry',()=>{
 const nik=people(1)[0].nik,initial=asEntries([assignment(nik)]),at='2026-10-19T01:07:00.000Z'
 assert.throws(()=>updateEntry(nik,{status:'Di room'},initial,DEFAULT_ROOMS,at),/Verifikasi identitas/)
 assert.throws(()=>updateEntry(nik,{status:'Di room',verified:true},{},DEFAULT_ROOMS,at),/Tanggal/)
 const entries=updateEntry(nik,{status:'Di room',verified:true,zoomName:'Peserta di Zoom'},initial,DEFAULT_ROOMS,at)
 assert.equal(entries[nik].startedAt,at)
 assert.equal(entries[nik].finishedAt,'')
 assert.equal(entries[nik].verified,true)
 assert.equal(initial[nik].status,'Terjadwal')
 assert.deepEqual(timerState(entries[nik],Date.parse(at)+39*60000),{elapsedSeconds:2340,remainingSeconds:60,overdue:false})
 assert.deepEqual(timerState(entries[nik],Date.parse(at)+41*60000),{elapsedSeconds:2460,remainingSeconds:0,overdue:true})
})

test('moving an active participant preserves actual start and prevents room/interviewer occupancy across dates',()=>{
 const initial=asEntries([assignment('one',{status:'Di room',verified:true,startedAt:'2026-10-19T01:00:00.000Z'})])
 const moved=updateEntry('one',{roomId:'room-2'},initial,DEFAULT_ROOMS,'2026-10-19T01:05:00.000Z')
 assert.equal(moved.one.startedAt,initial.one.startedAt)
 assert.throws(()=>updateEntry('one',{time:'08:05'},initial,DEFAULT_ROOMS),/Ubah jadwal/)
 const withSecond={...initial,two:assignment('two',{roomId:'room-2',date:'2026-10-20'})}
 assert.throws(()=>updateEntry('two',{roomId:'room-1',status:'Di room',verified:true},withSecond,DEFAULT_ROOMS),/Masih ada peserta Di room/)
 const rooms=DEFAULT_ROOMS.map((room,index)=>index===1?{...room,interviewer:'Itjen 1'}:room)
 assert.throws(()=>updateEntry('two',{status:'Di room',verified:true},withSecond,rooms),/Pewawancara utama masih/)
})

test('completion freezes the timer and manual rescheduling clears the earlier visit',()=>{
 const initial=asEntries([assignment('one',{status:'Di room',verified:true,startedAt:'2026-10-19T01:00:00.000Z'})])
 const finished=updateEntry('one',{status:'Selesai',notes:'Selesai diperiksa'},initial,DEFAULT_ROOMS,'2026-10-19T01:42:00.000Z')
 assert.equal(finished.one.finishedAt,'2026-10-19T01:42:00.000Z')
 assert.equal(timerState(finished.one,Date.parse('2026-10-19T03:00:00Z')).elapsedSeconds,2520)
 const retry=updateEntry('one',{status:'Jadwal ulang'},finished,DEFAULT_ROOMS,'2026-10-19T03:00:00Z')
 const rescheduled=updateEntry('one',{status:'Terjadwal',date:'2026-10-20'},retry,DEFAULT_ROOMS,'2026-10-19T03:01:00Z')
 assert.equal(rescheduled.one.startedAt,'')
 assert.equal(rescheduled.one.finishedAt,'')
 assert.equal(rescheduled.one.verified,false)
 assert.throws(()=>updateEntry('new',{...assignment('new'),status:'Selesai'},{},DEFAULT_ROOMS),/Mulai wawancara/)
 assert.throws(()=>updateEntry('one',{status:'unknown'},initial,DEFAULT_ROOMS),/Status/)
 assert.equal(STATUSES.length,8)
})

test('monitoring export escapes CSV and formulas and keeps NIP/NIK as text',()=>{
 const population=[{nik:'0000000000000001',nip:'000000000000000001',nama:'=HYPERLINK("bad")'}]
 const entries=asEntries([assignment(population[0].nik,{verified:true,notes:'baris 1; "kutip"\nbaris 2',leader:' +SUM(1,2)',zoomName:'Nama Zoom'})])
 const csv=monitoringCsv(population,entries,DEFAULT_ROOMS)
 assert.ok(csv.startsWith('\uFEFF"Tanggal";"Sesi"'))
 assert.ok(csv.includes('"\'000000000000000001";"\'0000000000000001"'))
 assert.ok(csv.includes('"\'=HYPERLINK(""bad"")"'))
 assert.ok(csv.includes('"baris 1; ""kutip""\nbaris 2"'))
 assert.ok(csv.includes('"\' +SUM(1,2)"'))
 assert.ok(csv.includes('"Itjen 1";"";"Dio"'))
 assert.ok(csv.includes('"Terjadwal";"Ya"'))
 assert.equal(timerState({},Date.now()).remainingSeconds,0)
})
