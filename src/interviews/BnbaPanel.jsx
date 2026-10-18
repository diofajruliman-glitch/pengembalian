import React,{useEffect,useMemo,useRef} from 'react'
import {STATUSES} from './model.js'
import {getRoutingCategory} from './routing.js'

const number=value=>Number(value||0).toLocaleString('id-ID')
const statusOf=entry=>entry?.status||'Belum dijadwalkan'
const protectedEntry=entry=>['Di room','Selesai'].includes(entry?.status)
const displayDate=value=>value?new Date(`${value}T12:00:00+07:00`).toLocaleDateString('id-ID',{timeZone:'Asia/Jakarta',dateStyle:'medium'}):'Belum dijadwalkan'
const maskNik=value=>value?`${value.slice(0,4)}••••••••${value.slice(-4)}`:'—'

export default function BnbaPanel({filtered,entries,rooms,editable,query,statusFilter,roomFilter,categoryFilter,heavyStats,onHeavy,currentPage,onFilters,onPage,onManage,onExportFiltered,selectedIds,onSelectionChange,onBulk,onImport,onPackages}){
 const pageRows=filtered.slice(currentPage*25,currentPage*25+25)
 const eligible=useMemo(()=>filtered.filter(person=>!protectedEntry(entries[person.nik])),[filtered,entries])
 const pageEligible=pageRows.filter(person=>!protectedEntry(entries[person.nik]))
 const picked=useMemo(()=>new Set(selectedIds),[selectedIds])
 const selectedOnPage=pageEligible.filter(person=>picked.has(person.nik)).length
 const allPageSelected=pageEligible.length>0&&selectedOnPage===pageEligible.length
 const pageCheckbox=useRef(null)
 useEffect(()=>{if(pageCheckbox.current)pageCheckbox.current.indeterminate=selectedOnPage>0&&!allPageSelected},[selectedOnPage,allPageSelected])
 const visibleIds=useMemo(()=>new Set(filtered.map(person=>person.nik)),[filtered])
 const hiddenSelected=selectedIds.filter(nik=>!visibleIds.has(nik)).length
 function toggle(nik){onSelectionChange(current=>current.includes(nik)?current.filter(id=>id!==nik):[...current,nik])}
 function selectPage(){onSelectionChange(current=>allPageSelected?current.filter(nik=>!pageEligible.some(person=>person.nik===nik)):[...new Set([...current,...pageEligible.map(person=>person.nik)])])}
 return <section className="panel interview-bnba-panel">
  <div className="panel-heading"><h2>BNBA & kertas kerja pelaksanaan</h2><div className="interview-toolbar"><button className="btn secondary" disabled={!filtered.length} onClick={onExportFiltered}>Ekspor sesuai filter</button><button className="btn secondary" onClick={onPackages}>Jadwal per pewawancara</button></div></div>
  <div className="interview-distribution-intro"><div><b>Distribusi BNBA ke pewawancara</b><p>Pilih SDM satu per satu, satu halaman, atau seluruh hasil filter. Pilihan tetap tersimpan saat berpindah halaman dan filter. Pewawancara mengikuti room tujuan.</p></div><button className="btn secondary" disabled={!editable} onClick={onImport}>Impor jadwal Excel / CSV</button></div>
  <section className="interview-heavy-policy" aria-label="Aturan distribusi kategori Berat"><div><b>Berat → Itjen & OSDM</b><p>Acuan: Pairing Sekjen asli · {number(heavyStats.total)} SDM Berat · {number(heavyStats.pending)} perlu penempatan. {heavyStats.rooms} room aktif, kapasitas {number(heavyStats.rooms*heavyStats.perDay)} SDM Berat / hari.</p>{heavyStats.conflicts>0&&<p className="interview-warning">{number(heavyStats.conflicts)} SDM Berat masih tercatat di room lain.{heavyStats.locked>0&&` Sebanyak ${number(heavyStats.locked)} sedang berjalan/sudah selesai dan tetap dipertahankan.`}</p>}</div><button className="btn primary" disabled={!editable||!heavyStats.pending} onClick={onHeavy}>Distribusikan Berat ({number(heavyStats.pending)})</button></section>
  <div className="interview-filters">
   <label>Cari nama / NIP / NIK / nama Zoom<input type="search" value={query} onChange={event=>onFilters({query:event.target.value})} placeholder="Cari peserta…"/></label>
   <label>Kategori Pairing Sekjen<select value={categoryFilter} onChange={event=>onFilters({category:event.target.value})}><option value="">Semua kategori</option>{['Ringan','Sedang','Berat','Belum tersedia'].map(category=><option key={category}>{category}</option>)}</select></label>
   <label>Status<select value={statusFilter} onChange={event=>onFilters({status:event.target.value})}><option value="">Semua status</option>{STATUSES.map(status=><option key={status}>{status}</option>)}</select></label>
   <label>Pewawancara / room<select value={roomFilter} onChange={event=>onFilters({room:event.target.value})}><option value="">Semua pewawancara / room</option>{rooms.map(room=><option key={room.id} value={room.id}>{room.interviewer||'Belum ditetapkan'} · {room.name}</option>)}</select></label>
  </div>
  <div className="interview-selection-bar" role="group" aria-label="Pilihan distribusi BNBA">
   <div><strong>{number(selectedIds.length)} SDM terpilih</strong>{hiddenSelected>0&&<small>{number(hiddenSelected)} pilihan di luar filter saat ini</small>}</div>
   <button className="btn secondary" disabled={!editable||!eligible.length} onClick={()=>onSelectionChange(current=>[...new Set([...current,...eligible.map(person=>person.nik)])])}>Pilih semua hasil filter ({number(eligible.length)})</button>
   <button className="btn secondary" disabled={!selectedIds.length} onClick={()=>onSelectionChange([])}>Kosongkan pilihan</button>
   <button className="btn primary" disabled={!editable||!selectedIds.length} onClick={onBulk}>Distribusikan / ubah pilihan</button>
  </div>
  <p className="interview-muted">SDM dengan status Di room atau Selesai dikunci dari distribusi massal dan impor jadwal. Gunakan rincian untuk melihat catatan pelaksanaannya.</p>
  <div className="table-scroll" tabIndex={0} role="region" aria-label="Daftar responden wawancara"><table>
   <thead><tr><th scope="col"><input ref={pageCheckbox} type="checkbox" aria-label="Pilih SDM pada halaman ini" checked={allPageSelected} disabled={!editable||!pageEligible.length} onChange={selectPage}/></th>{['Responden','Jadwal / sesi','Room / pewawancara','Kehadiran','Status / catatan','Tindakan'].map(label=><th scope="col" key={label}>{label}</th>)}</tr></thead>
   <tbody>{pageRows.map(person=>{
    const entry=entries[person.nik],room=rooms.find(room=>room.id===entry?.roomId),locked=protectedEntry(entry)
    return <tr key={person.nik} className={picked.has(person.nik)?'interview-selected-row':undefined}>
     <td><input type="checkbox" aria-label={`Pilih ${person.nama}`} checked={picked.has(person.nik)} disabled={!editable||locked} onChange={()=>toggle(person.nik)} title={locked?'Wawancara aktif atau selesai tidak dapat didistribusikan ulang.':undefined}/></td>
     <td><b>{person.nama}</b><span className={'interview-category '+(getRoutingCategory(person).category==='Berat'?'is-heavy':'')} title={getRoutingCategory(person).sourceLabel}>{getRoutingCategory(person).category} · {getRoutingCategory(person).sourceLabel}</span><small>NIP {person.nip||'—'}</small><small>NIK {maskNik(person.nik)}</small></td>
     <td>{displayDate(entry?.date)}<small>{entry?.time?`${entry.time} WIB · ${entry.duration} menit`:''}</small><small>{entry?.session?`Sesi ${entry.session}`:''}</small></td>
     <td><b>{room?.name||'—'}</b><small>{room?.interviewer||'—'}</small></td>
     <td>{entry?.verified?'Identitas sesuai':'Belum diverifikasi'}<small>{entry?.zoomName||''}</small></td>
     <td><span className={'interview-status status-'+STATUSES.indexOf(statusOf(entry))}>{statusOf(entry)}</span><small>{entry?.notes||''}</small></td>
     <td><button className="btn secondary" aria-label={`Kelola ${person.nama}`} onClick={()=>onManage(person.nik)}>Kelola</button></td>
    </tr>
   })}</tbody>
  </table></div>
  {!filtered.length&&<p role="status">Tidak ada peserta sesuai filter.</p>}
  <div className="interview-pagination"><span>{number(filtered.length)} peserta · halaman {currentPage+1} / {Math.max(1,Math.ceil(filtered.length/25))}</span><button className="btn secondary" disabled={!currentPage} onClick={()=>onPage(currentPage-1)}>Sebelumnya</button><button className="btn secondary" disabled={(currentPage+1)*25>=filtered.length} onClick={()=>onPage(currentPage+1)}>Berikutnya</button></div>
 </section>
}
