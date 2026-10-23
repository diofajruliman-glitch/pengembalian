import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {createServer} from 'vite'
import {fileURLToPath} from 'node:url'
import {liveMonitoringEntries} from '../src/interviews/liveProgress.js'
import {OFFICIAL_POPULATION_1057} from '../src/interviews/officialSchedule1057.js'

test('BNBA and Portal render the same shared draft progress and obstacle for a read-only leader',async()=>{
 const server=await createServer({root:fileURLToPath(new URL('../',import.meta.url)),configFile:false,logLevel:'silent',server:{middlewareMode:true,hmr:false,watch:null}})
 try{
  const [{default:Portal},{default:Bnba},{default:SharedProgress},{ConnectedRoomProgress}]=await Promise.all([server.ssrLoadModule('/src/interviews/PortalWawancara.jsx'),server.ssrLoadModule('/src/interviews/BnbaPanel.jsx'),server.ssrLoadModule('/src/bap/SharedProgress.jsx'),server.ssrLoadModule('/src/interviews/InterviewMonitor.jsx')])
  const person=OFFICIAL_POPULATION_1057.find(person=>person.nip==='198610202025211055')
  assert.ok(person)
  const row={nik:person.nik,person,scheduled_date:'2026-10-26',scheduled_time:'08:30:00',room_id:'room-1',started_at:'2026-10-26T01:30:00Z',status:'Draf',answers:{1:'Jawaban pertama',2:'Jawaban kedua'},revision:3}
  const activity={nik:person.nik,obstacle_status:'open',obstacle_note:'Audio peserta terputus',obstacle_reported_at:'2026-10-26T01:34:00Z'}
  const entries=liveMonitoringEntries({},[row],[activity],{connected:true,ready:true,now:Date.parse('2026-10-26T01:35:00Z')})
  const state={rows:[row],activity:[activity],ready:true,error:'',updatedAt:'2026-10-26T01:35:00Z'}
  const portalHtml=renderToStaticMarkup(React.createElement(Portal,{client:{},liveEntries:entries,liveState:state,onOpenBap:()=>{}}))
  const bnbaHtml=renderToStaticMarkup(React.createElement(Bnba,{connected:true,filtered:[person],entries,rooms:[{id:'room-1',name:'Room 1',interviewer:'Petugas'}],editable:false,query:'',statusFilter:'',roomFilter:'',categoryFilter:'',heavyStats:{rooms:0},currentPage:0,selectedIds:[],onOpenBap:()=>{}}))
  for(const html of [portalHtml,bnbaHtml]){
   assert.match(html,/2\/22 jawaban tersimpan/);assert.match(html,/Audio peserta terputus/)
   assert.match(html,/Draf/);assert.match(html,/Kendala berlangsung/);assert.match(html,/<progress/)
  }
  assert.match(bnbaHtml,/disabled=""/)
  const summary=renderToStaticMarkup(React.createElement(SharedProgress,{client:{},liveEntries:entries,localEntries:{},liveState:state,onOpenBap:()=>{}}))
  assert.match(summary,/1 draf/);assert.match(summary,/1 kendala terbuka/)
  assert.doesNotMatch(summary,/Ambil jadwal dari portal/)
  const failed=renderToStaticMarkup(React.createElement(SharedProgress,{client:{},liveEntries:{},localEntries:{[person.nik]:{status:'Selesai'}},liveState:{rows:[],ready:false,error:'Database tidak terjangkau'}}))
  assert.match(failed,/Status lokal tidak digunakan sebagai status wawancara bersama/)
  assert.doesNotMatch(failed,/1 selesai/)
  const partialEntries=liveMonitoringEntries({},[row],[],{connected:true,ready:true,activityReady:false,stale:true})
  const partialState={rows:[row],activity:[],ready:true,activityReady:false,error:'Laporan kendala belum tersedia',updatedAt:''}
  const partialSummary=renderToStaticMarkup(React.createElement(SharedProgress,{client:{},liveEntries:partialEntries,localEntries:{},liveState:partialState}))
  assert.match(partialSummary,/Kendala belum tersedia/);assert.doesNotMatch(partialSummary,/0 kendala terbuka/)
  const movedRow={...row,room_id:'room-19',scheduled_date:'2026-11-02',scheduled_time:'13:30:00'}
  const movedEntries=liveMonitoringEntries({},[movedRow],[],{connected:true,ready:true,activityReady:false,stale:true})
  const movedPortal=renderToStaticMarkup(React.createElement(Portal,{client:{},liveEntries:movedEntries,liveState:{...partialState,rows:[movedRow]}}))
  const participantRow=movedPortal.match(/<tr[^>]*>[\s\S]*?<\/tr>/g).find(text=>text.includes(`<b>${person.nama}</b>`))
  assert.match(participantRow,/2 November 2026/);assert.match(participantRow,/13:30–14:00 WIB/);assert.match(participantRow,/Room 19/)
  assert.match(participantRow,/koneksi monitoring terganggu/);assert.match(participantRow,/Aktivitas pembukaan dan kendala belum tersedia/)
  assert.match(movedPortal,/option value="2 November 2026"/)
  assert.match(movedPortal,/Belum terhubung/);assert.doesNotMatch(movedPortal,/Belum dijadwalkan/)
  const pausedRow={...row,status:'Tertunda',started_at:null,answers:{},deferred_reason:'Peserta menunggu sambungan kembali',deferred_at:'2026-10-26T01:34:00Z'}
  const pausedEntries=liveMonitoringEntries({},[pausedRow],[{...activity,last_seen_at:'2026-10-26T01:34:30Z'}],{connected:true,ready:true,now:Date.parse('2026-10-26T01:35:00Z')})
  const pausedState={...state,rows:[pausedRow]}
  const pausedSummary=renderToStaticMarkup(React.createElement(SharedProgress,{client:{},liveEntries:pausedEntries,localEntries:{[person.nik]:{date:'2026-10-27',time:'09:00',roomId:'room-2'}},isAdmin:true,liveState:pausedState}))
  assert.match(pausedSummary,/1 tertunda/);assert.match(pausedSummary,/0 dalam wawancara/);assert.match(pausedSummary,/0 BAP dibuka/)
  assert.match(pausedSummary,/disabled="">Kirim 0 perubahan jadwal lokal/)
  const roomHtml=renderToStaticMarkup(React.createElement(ConnectedRoomProgress,{population:[person],entries:pausedEntries,rooms:[{id:'room-1',name:'Room 1'}],dateFilter:'2026-10-27',now:Date.parse('2026-10-26T01:35:00Z'),ready:true,onOpenBap:()=>{}}))
  assert.match(roomHtml,/class="interview-room has-deferred"/);assert.doesNotMatch(roomHtml,/is-active|Sejak mulai|aktivitas BAP/)
  assert.match(roomHtml,/Wawancara tertunda Room 1/);assert.match(roomHtml,/Tertunda \(1\)/);assert.match(roomHtml,/Peserta menunggu sambungan kembali/)
  const pausedPortal=renderToStaticMarkup(React.createElement(Portal,{client:{},liveEntries:pausedEntries,liveState:pausedState}))
  assert.match(pausedPortal,/1 tertunda/);assert.match(pausedPortal,/Peserta menunggu sambungan kembali/)
  assert.match(pausedPortal,/<option value="Tertunda">Tertunda<\/option>/)
  const resumedEntries=liveMonitoringEntries({},[{...pausedRow,status:'Dalam wawancara',started_at:'2026-10-26T01:30:00Z'}],[],{connected:true,ready:true})
  const resumedPortal=renderToStaticMarkup(React.createElement(Portal,{client:{},liveEntries:resumedEntries,liveState:{...state,rows:[{...pausedRow,status:'Dalam wawancara'}]}}))
  assert.doesNotMatch(resumedPortal,/Peserta menunggu sambungan kembali|Wawancara tertunda/)
 }finally{await server.close()}
})
