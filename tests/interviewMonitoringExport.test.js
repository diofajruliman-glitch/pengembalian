import test from 'node:test'
import assert from 'node:assert/strict'
import {monitoringCsv} from '../src/interviews/model.js'
import {sharedMonitoringCsv,liveMonitoringEntries,liveMonitoringRooms,initialLiveProgressState,receivedLiveProgress,failedLiveProgress} from '../src/interviews/liveProgress.js'
import {OFFICIAL_ROOMS_19} from '../src/interviews/officialSchedule1057.js'

const person={nik:'0011111111111111',nip:'001234567890123456',nama:'Nama; "Peserta"',historical:{kategori:'Ringan'}}
const local={[person.nik]:{date:'2026-10-27',time:'08:30',session:1,duration:45,roomId:'room-2',status:'Di room',notes:'=HYPERLINK("url")\r\nCatatan; baris kedua',leader:'Catatan lokal pimpinan',startedAt:'2026-10-27T01:30:00Z'}}
const row={nik:person.nik,person,room_id:'room-19',scheduled_date:'2026-10-29',scheduled_time:'13:30:00',started_at:'2026-10-29T06:31:00Z',status:'Draf',answers:{1:'Jawaban satu',2:'Jawaban dua'},revision:2,updated_at:'2026-10-29T06:35:00Z'}
const activity={nik:person.nik,last_seen_at:'2026-10-29T06:35:00Z',obstacle_status:'resolved',obstacle_note:'@Suara; "terputus"\nPeserta menunggu',obstacle_reported_at:'2026-10-29T06:32:00Z',obstacle_resolved_at:'2026-10-29T06:34:00Z',obstacle_resolution_note:'+Jaringan diganti'}
function parseCsv(text){
 const rows=[],record=[];let field='',quoted=false
 for(let i=0;i<text.length;i++){
  const c=text[i]
  if(c==='\uFEFF'&&i===0)continue
  if(c==='"'){
   if(quoted&&text[i+1]==='"'){field+='"';i++}else quoted=!quoted
  }else if(c===';'&&!quoted){record.push(field);field=''}
  else if(c==='\r'&&text[i+1]==='\n'&&!quoted){record.push(field);rows.push([...record]);record.length=0;field='';i++}
  else field+=c
 }
 return rows
}

test('offline CSV stays byte for byte identical and export never modifies local storage data',()=>{
 const before=structuredClone(local)
 assert.equal(sharedMonitoringCsv([person],local,OFFICIAL_ROOMS_19),monitoringCsv([person],local,OFFICIAL_ROOMS_19))
 assert.deepEqual(local,before)
})

test('shared CSV exports actual BAP status, progress, obstacles and timestamps with safely separated local notes',()=>{
 const before=structuredClone({local,row,activity})
 const entries=liveMonitoringEntries(local,[row],[activity],{connected:true,ready:true,now:Date.parse('2026-10-29T06:36:00Z')})
 const [headers,record]=parseCsv(sharedMonitoringCsv([person],entries,OFFICIAL_ROOMS_19,{connected:true,updatedAt:'2026-10-29T06:36:00Z'}))
 assert.equal(headers.length,record.length)
 const cells=Object.fromEntries(headers.map((header,index)=>[header,record[index]]))
 assert.equal(cells['Status portal BAP'],'Draf');assert.equal(cells['Room'],'Room 19')
 assert.equal(cells['Tanggal'],'2026-10-29');assert.equal(cells['Jadwal'],'13:30');assert.equal(cells['Sesi'],'9');assert.equal(cells['Durasi (menit)'],'30')
 assert.equal(cells['Jawaban BAP tersimpan'],'2');assert.equal(cells['Jumlah pertanyaan BAP'],'22');assert.equal(cells['Progres BAP (%)'],'9')
 assert.equal(cells['Status kendala bersama'],'Selesai ditangani')
 assert.equal(cells['Laporan kendala bersama'],"'"+activity.obstacle_note)
 assert.equal(cells['Catatan penyelesaian kendala'],"'"+activity.obstacle_resolution_note)
 assert.equal(cells['Kendala dilaporkan'],activity.obstacle_reported_at);assert.equal(cells['Kendala diselesaikan'],activity.obstacle_resolved_at)
 assert.equal(cells['BAP terakhir dibuka'],activity.last_seen_at);assert.equal(cells['Pembaruan BAP'],row.updated_at)
 assert.equal(cells['Catatan lokal Zoom'],"'"+local[person.nik].notes);assert.equal(cells['Catatan pimpinan lokal'],'Catatan lokal pimpinan')
 assert.equal(cells['NIP'],"'"+person.nip);assert.equal(cells['NIK'],"'"+person.nik)
 assert.equal(cells['Kesegaran monitoring'],'Terhubung');assert.equal(cells['Pembaruan monitoring bersama'],'2026-10-29T06:36:00Z')
 assert.deepEqual({local,row,activity},before)
})

test('shared CSV carries the last deferral reason and timestamp while offline Terkendala remains unchanged',()=>{
 const deferred={...row,status:'Tertunda',deferred_reason:'=Tunda; "peserta"\nKoneksi tidak tersedia',deferred_at:'2026-10-29T06:35:00Z'}
 for(const status of ['Tertunda','Dalam wawancara','Selesai']){
  const entries=liveMonitoringEntries(local,[{...deferred,status}],[activity],{connected:true,ready:true})
  const [headers,record]=parseCsv(sharedMonitoringCsv([person],entries,OFFICIAL_ROOMS_19,{connected:true}))
  assert.equal(record[headers.indexOf('Status portal BAP')],status)
  assert.equal(record[headers.indexOf('Alasan penundaan terakhir')],"'"+deferred.deferred_reason)
  assert.equal(record[headers.indexOf('Waktu penundaan terakhir')],deferred.deferred_at)
  assert.equal(record[headers.indexOf('Jawaban BAP tersimpan')],'2')
 }
 const legacy={[person.nik]:{...local[person.nik],status:'Terkendala'}}
 assert.equal(sharedMonitoringCsv([person],legacy,OFFICIAL_ROOMS_19),monitoringCsv([person],legacy,OFFICIAL_ROOMS_19))
})

test('activity outage is exported as unavailable or stale, never as a successfully empty obstacle list',()=>{
 const firstFailure=failedLiveProgress(initialLiveProgressState(),Object.assign(new Error('Aktivitas belum tersedia'),{phase:'activity',rows:[row]}))
 assert.equal(firstFailure.ready,true);assert.equal(firstFailure.activityReady,false);assert.equal(firstFailure.updatedAt,'')
 const entries=liveMonitoringEntries(local,firstFailure.rows,firstFailure.activity,{connected:true,ready:firstFailure.ready,activityReady:firstFailure.activityReady,stale:true})
 assert.equal(entries[person.nik].live.obstacleStatus,'unknown');assert.equal(entries[person.nik].live.stale,true)
 const [headers,record]=parseCsv(sharedMonitoringCsv([person],entries,OFFICIAL_ROOMS_19,{connected:true,error:firstFailure.error}))
 assert.equal(record[headers.indexOf('Status kendala bersama')],'Belum tersedia')
 assert.equal(record[headers.indexOf('Kesegaran monitoring')],'Data terakhir; koneksi terganggu')
 const loaded=receivedLiveProgress({rows:[row],activity:[activity],updatedAt:'2026-10-29T06:36:00Z'})
 const nextRow={...row,revision:3,answers:{...row.answers,3:'Jawaban ketiga'}}
 const partial=failedLiveProgress(loaded,Object.assign(new Error('Aktivitas terputus'),{phase:'activity',rows:[nextRow]}))
 assert.equal(partial.rows[0].revision,3);assert.equal(partial.activity[0],activity);assert.equal(partial.updatedAt,loaded.updatedAt);assert.equal(partial.activityReady,true)
 const recovered=receivedLiveProgress({rows:[nextRow],activity:[activity],updatedAt:'2026-10-29T06:37:00Z'})
 assert.equal(recovered.error,'');assert.equal(recovered.activityReady,true)
})

test('remote room nineteen and any database assignment stay visible without modifying the official room list',()=>{
 const before=structuredClone(OFFICIAL_ROOMS_19)
 const rooms=liveMonitoringRooms(OFFICIAL_ROOMS_19,[row,{...row,room_id:'room-20'}])
 assert.equal(rooms.length,20);assert.equal(rooms.find(room=>room.id==='room-19').name,'Room 19')
 assert.equal(rooms.find(room=>room.id==='room-20').name,'Room 20');assert.deepEqual(OFFICIAL_ROOMS_19,before)
})
