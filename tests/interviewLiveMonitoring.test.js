import test from 'node:test'
import assert from 'node:assert/strict'
import {liveMonitoringEntries,liveMonitoringPopulation,liveProgressCounts,displayInterviewStatus,isProtectedInterview,isLiveInterview,isOpenedBap,isDeferredInterview,PRESENCE_WINDOW_MS} from '../src/interviews/liveProgress.js'

const nik='1111111111111111',otherNik='2222222222222222'
const now=Date.parse('2026-10-26T01:35:00Z')
const local={[nik]:{date:'2026-10-27',time:'10:00',roomId:'room-2',duration:30,status:'Selesai',startedAt:'2026-10-25T01:00:00Z',finishedAt:'2026-10-25T01:30:00Z',notes:'Koordinasi Zoom lokal',zoomName:'Nama Zoom lokal'}}
const scheduled={nik,person:{nama:'Peserta Uji',nip:'123456789012345678'},room_id:'room-1',scheduled_date:'2026-10-26',scheduled_time:'08:30:00',status:'Terjadwal',started_at:null,finished_at:null,answers:{},revision:1}
const project=(rows,activity=[],extra={})=>liveMonitoringEntries(local,rows,activity,{connected:true,ready:true,now,...extra})

test('connected monitor never shows a local completion as shared interview status before data loads or when a case is absent',()=>{
 const loading=project([],[],{ready:false})[nik]
 assert.equal(displayInterviewStatus(loading),'Belum dimuat')
 assert.equal(loading.finishedAt,'');assert.equal(loading.startedAt,'');assert.equal(loading.verified,false)
 assert.equal(displayInterviewStatus(project([])[nik]),'Belum terhubung')
 assert.deepEqual(liveProgressCounts(project([])),{opened:0,ongoing:0,draft:0,deferred:0,completed:0,obstacles:0,scheduled:0})
 assert.equal(liveMonitoringEntries(local,[],[],{connected:false}),local)
})

test('source participants without a local schedule retain an unknown shared status while database data is unavailable',()=>{
 const emptyEntries={},population=[{nik:otherNik,nama:'Peserta sumber baru'}]
 const loading=liveMonitoringEntries(emptyEntries,[],[],{connected:true,ready:false,population})
 assert.equal(displayInterviewStatus(loading[otherNik]),'Belum dimuat')
 const loaded=liveMonitoringEntries(emptyEntries,[],[],{connected:true,ready:true,population})
 assert.equal(displayInterviewStatus(loaded[otherNik]),'Belum terhubung')
 assert.equal(loaded[otherNik].live.available,false);assert.deepEqual(emptyEntries,{})
 assert.equal(liveMonitoringEntries(emptyEntries,[],[],{connected:false,population}),emptyEntries)
})

test('opening BAP is visible for ninety seconds without inventing an actual interview start',()=>{
 const activity={nik,opened_at:'2026-10-26T01:34:30Z',last_seen_at:'2026-10-26T01:34:30Z',obstacle_status:'none'}
 const opened=project([scheduled],[activity])[nik]
 assert.equal(displayInterviewStatus(opened),'BAP dibuka');assert.equal(opened.startedAt,'');assert.equal(isProtectedInterview(opened),false)
 assert.equal(liveProgressCounts({[nik]:opened}).opened,1)
 assert.equal(displayInterviewStatus(project([scheduled],[activity],{now:Date.parse(activity.last_seen_at)+PRESENCE_WINDOW_MS})[nik]),'Terjadwal')
 assert.equal(displayInterviewStatus(project([scheduled],[{...activity,last_seen_at:'2099-01-01T00:00:00Z'}])[nik]),'Terjadwal')
})

test('actual start, saved answers and completion propagate through the same projection and dominate presence',()=>{
 const activity=[{nik,last_seen_at:'2026-10-26T01:34:30Z'}]
 const started={...scheduled,status:'Dalam wawancara',started_at:'2026-10-26T01:30:00Z',revision:2}
 const ongoing=project([started],activity)[nik]
 assert.equal(displayInterviewStatus(ongoing),'Dalam wawancara');assert.equal(isProtectedInterview(ongoing),true)
 const answers=Object.fromEntries(Array.from({length:22},(_,i)=>[i+1,`Jawaban ${i+1}`]))
 const draft=project([{...started,status:'Draf',answers,revision:3}],activity)[nik]
 assert.equal(displayInterviewStatus(draft),'Draf');assert.equal(draft.live.answered,22);assert.equal(draft.live.progress,100)
 const finished=project([{...started,status:'Selesai',answers,finished_at:'2026-10-26T02:00:00Z',revision:4}],activity)[nik]
 assert.equal(displayInterviewStatus(finished),'Selesai');assert.equal(finished.finishedAt,'2026-10-26T02:00:00Z')
 assert.equal(liveProgressCounts({[nik]:finished}).completed,1);assert.equal(liveProgressCounts({[nik]:finished}).opened,0)
})

test('explicit deferral overrides a fresh opening signal before or after start and retains saved progress without becoming active',()=>{
 const activity=[{nik,last_seen_at:'2026-10-26T01:34:30Z',obstacle_status:'open',obstacle_note:'Koneksi terputus'}]
 for(const started_at of [null,'2026-10-26T01:30:00Z']){
  const row={...scheduled,status:'Tertunda',started_at,answers:{1:'Jawaban tersimpan'},deferred_reason:'Peserta menunggu sambungan kembali',deferred_at:'2026-10-26T01:34:00Z',deferred_by:'petugas-1'}
  const before=structuredClone({row,activity,local}),entry=project([row],activity)[nik]
  assert.equal(displayInterviewStatus(entry),'Tertunda');assert.equal(isDeferredInterview(entry),true)
  assert.equal(isLiveInterview(entry),false);assert.equal(isOpenedBap(entry),false);assert.equal(entry.live.present,false)
  assert.equal(isProtectedInterview(entry),true);assert.equal(entry.live.answered,1)
  assert.equal(entry.live.deferredReason,row.deferred_reason);assert.equal(entry.live.deferredAt,row.deferred_at);assert.equal(entry.live.deferredBy,row.deferred_by)
  assert.deepEqual(liveProgressCounts({[nik]:entry}),{opened:0,ongoing:0,draft:0,deferred:1,completed:0,obstacles:1,scheduled:0})
  assert.deepEqual({row,activity,local},before)
 }
})

test('resuming a deferred case restores ongoing status while keeping the last reason available for history and export',()=>{
 const row={...scheduled,status:'Dalam wawancara',started_at:'2026-10-26T01:30:00Z',answers:{1:'Jawaban awal',2:'Jawaban lanjutan'},deferred_reason:'Peserta sempat kehilangan koneksi',deferred_at:'2026-10-26T01:33:00Z'}
 const entry=project([row])[nik]
 assert.equal(displayInterviewStatus(entry),'Dalam wawancara');assert.equal(isLiveInterview(entry),true);assert.equal(isDeferredInterview(entry),false)
 assert.equal(entry.live.deferredReason,row.deferred_reason);assert.equal(entry.live.answered,2)
 assert.equal(liveProgressCounts({[nik]:entry}).deferred,0);assert.equal(liveProgressCounts({[nik]:entry}).ongoing,1)
 const offline={[nik]:{status:'Terkendala',notes:'Catatan lokal lama'}}
 assert.equal(liveMonitoringEntries(offline,[],[],{connected:false}),offline)
 assert.equal(displayInterviewStatus(offline[nik]),'Terkendala');assert.equal(isDeferredInterview(offline[nik]),false)
})

test('progress includes only saved nonempty answers to the twenty two BAP questions',()=>{
 const entry=project([{...scheduled,status:'Draf',started_at:'2026-10-26T01:30:00Z',answers:{1:' Ya ',2:' ',3:3,23:'Di luar BAP',injected:'Tidak dihitung'}}])[nik]
 assert.equal(entry.live.answered,1);assert.equal(entry.live.total,22);assert.equal(entry.live.progress,5)
})

test('obstacles remain visible during an ongoing interview and resolving them never changes the BAP status or answers',()=>{
 const row={...scheduled,status:'Draf',started_at:'2026-10-26T01:30:00Z',answers:{1:'Jawaban tersimpan'},revision:3}
 const activity={nik,obstacle_status:'open',obstacle_note:'Suara peserta terputus',obstacle_reported_at:'2026-10-26T01:34:30Z',revision:1}
 const entry=project([row],[activity])[nik]
 assert.equal(entry.live.obstacleNote,'Suara peserta terputus');assert.equal(liveProgressCounts({[nik]:entry}).obstacles,1)
 const resolved=project([row],[{...activity,obstacle_status:'resolved',obstacle_resolution_note:'Peserta bergabung kembali',revision:2}])[nik]
 assert.equal(resolved.live.obstacleResolutionNote,'Peserta bergabung kembali');assert.equal(liveProgressCounts({[nik]:resolved}).obstacles,0)
 assert.equal(displayInterviewStatus(resolved),'Draf');assert.equal(resolved.live.answered,1);assert.equal(resolved.live.revision,3)
})

test('database schedule and actual timestamps override local status while preserving local notes without mutating either source',()=>{
 const rows=[scheduled],activity=[{nik,obstacle_status:'open',obstacle_note:'Kendala jaringan'}]
 const before=structuredClone({local,rows,activity}),entries=project(rows,activity)
 assert.equal(entries[nik].date,'2026-10-26');assert.equal(entries[nik].roomId,'room-1');assert.equal(entries[nik].time,'08:30')
 assert.equal(entries[nik].notes,'Koordinasi Zoom lokal');assert.equal(entries[nik].zoomName,'Nama Zoom lokal')
 assert.equal(entries[nik].startedAt,'');assert.equal(entries[nik].finishedAt,'')
 assert.deepEqual({local,rows,activity},before)
})

test('remote interview cases outside the active local population are still available for leadership monitoring',()=>{
 const rows=[scheduled,{...scheduled,nik:otherNik,person:{nama:'Peserta sumber lain'}}]
 const population=[{nik,nama:'Nama dari sumber aktif',notes:'Catatan sumber'}]
 const result=liveMonitoringPopulation(population,rows)
 assert.equal(result.length,2);assert.equal(result[0],population[0]);assert.equal(result[1].nama,'Peserta sumber lain')
 const entries=project(rows)
 assert.equal(entries[otherNik].live.available,true);assert.equal(entries[otherNik].live.person.nama,'Peserta sumber lain')
})
