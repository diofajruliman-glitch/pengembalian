import React, {useEffect, useMemo, useRef, useState} from 'react'
import {createPortal} from 'react-dom'
import {Download, FileUp} from 'lucide-react'
import {interviewerPackages, prepareBulkDistribution, prepareScheduleImport, scheduleImportTemplateCsv} from './distribution.js'
import {readScheduleFile} from './scheduleImport.js'

const number = value => Number(value || 0).toLocaleString('id-ID')
const dateText = value => value ? new Date(`${value}T12:00:00+07:00`).toLocaleDateString('id-ID', {timeZone:'Asia/Jakarta', dateStyle:'medium'}) : 'Belum dijadwalkan'
const roomText = room => `${room.name} / ${room.interviewer || 'Pewawancara belum diisi'}`

function downloadBlob(content, filename, type) {
 const blob = content instanceof Blob ? content : new Blob([content], {type})
 const url = URL.createObjectURL(blob)
 const link = document.createElement('a')
 link.href = url
 link.download = filename
 link.click()
 setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function Modal({title, onClose, children}) {
 const dialog = useRef(null)
 useEffect(() => {
  const element = dialog.current
  const opener = document.activeElement
  element.showModal()
  return () => {
   element.close()
   if (opener?.isConnected) opener.focus()
  }
 }, [])
 return createPortal(<dialog ref={dialog} role="dialog" className="interview-dialog interview-distribution-dialog" aria-label={title} onCancel={event => {event.preventDefault(); onClose()}}>
  <div className="interview-dialog-heading"><h2>{title}</h2><button className="btn secondary" type="button" onClick={onClose}>Tutup</button></div>
  {children}
 </dialog>, document.body)
}

function ErrorList({items, warning=false}) {
 if (!items?.length) return null
 return <div className={`notice ${warning ? 'amber-notice' : 'red-notice'} interview-distribution-errors`} role={warning ? 'status' : 'alert'}>
  <div><b>{number(items.length)} {warning ? 'catatan impor' : 'masalah yang perlu diperbaiki'}</b>
   <ul>{items.slice(0, 50).map((item, index) => <li key={index}>{typeof item === 'string' ? item : `${item.rowNumber ? `Baris ${item.rowNumber}` : 'Berkas'}: ${item.message}`}</li>)}</ul>
   {items.length > 50 && <p>Menampilkan 50 masalah pertama dari {number(items.length)}. Perbaiki berkas sumber, lalu impor kembali.</p>}
  </div>
 </div>
}

function PlanPreview({plan, population, rooms}) {
 const people = useMemo(() => new Map(population.map(person => [person.nik, person])), [population])
 const roomById = useMemo(() => new Map(rooms.map(room => [room.id, room])), [rooms])
 const summary = plan.summary
 function assignmentText(entry) {
  if (!entry?.date || !entry?.roomId) return <span className="interview-muted">Belum dijadwalkan</span>
  const room = roomById.get(entry.roomId)
  return <><span>{dateText(entry.date)} · {entry.time} WIB · sesi {entry.session}</span><small>{room ? roomText(room) : entry.roomId} · {entry.duration} menit</small></>
 }
 return <section className="interview-distribution-preview" aria-label="Pratinjau perubahan distribusi">
  <h3>Pratinjau distribusi</h3>
  <p><b>{number(summary.selected)} SDM</b> · {number(summary.changed)} berubah · {number(summary.unchanged)} tetap · {number(summary.rooms)} room · {number(summary.days)} hari kegiatan.</p>
  {Boolean(summary.byDate?.length) && <p className="interview-muted">{dateText(summary.byDate[0].date)}{summary.byDate.length > 1 ? ` sampai ${dateText(summary.byDate.at(-1).date)}` : ''}. Jadwal belum disimpan.</p>}
  {Boolean(summary.byRoom?.length) && <div className="interview-distribution-room-summary">{summary.byRoom.map(group => <span key={group.roomId}>{roomById.has(group.roomId) ? roomText(roomById.get(group.roomId)) : group.roomId}: <b>{number(group.count)} SDM</b></span>)}</div>}
  {plan.changes.length ? <><div className="table-scroll" tabIndex={0} role="region" aria-label="Perbandingan jadwal sebelum dan sesudah distribusi"><table><thead><tr><th>SDM</th><th>Sebelum</th><th>Sesudah</th></tr></thead><tbody>{plan.changes.slice(0, 20).map(change => <tr key={change.nik}><td><b>{people.get(change.nik)?.nama || 'Peserta'}</b>{(change.before?.notes || '') !== (change.after?.notes || '') && <details><summary>Catatan diubah</summary><p>Sebelum: {change.before?.notes || 'Kosong'}</p><p>Sesudah: {change.after?.notes || 'Kosong'}</p></details>}</td><td>{assignmentText(change.before)}</td><td>{assignmentText(change.after)}</td></tr>)}</tbody></table></div><p className="interview-muted">Menampilkan {Math.min(20, plan.changes.length)} dari {number(plan.changes.length)} perubahan. Seluruh hasil tersedia di BNBA setelah diterapkan.</p></> : <p>Seluruh penempatan sudah sesuai; tidak ada perubahan yang perlu diterapkan.</p>}
 </section>
}

export function BulkDistributionDialog({population, entries, rooms, settings, selectedIds, revision, onApply, onClose}) {
 const ids = useMemo(() => Array.from(selectedIds), [selectedIds])
 const activeRooms = rooms.filter(room => room.enabled !== false)
 const completeSchedule = ids.length > 0 && ids.every(id => {
  const entry = entries[id]
  return entry?.date && entry.time && entry.roomId && entry.session && entry.duration
 })
 const [mode, setMode] = useState(completeSchedule ? 'keepSchedule' : 'reschedule')
 const [roomIds, setRoomIds] = useState(() => activeRooms.map(room => room.id))
 const [targetRoomId, setTargetRoomId] = useState(() => activeRooms.find(room => room.id === entries[ids[0]]?.roomId)?.id || activeRooms[0]?.id || '')
 const [form, setForm] = useState(() => ({startDate:settings.startDate || '', startTime:settings.startTime || '08:00', duration:settings.duration ?? 40, gap:settings.gap ?? 5, perDay:settings.perDay ?? 11, skipWeekends:settings.skipWeekends !== false}))
 const [preview, setPreview] = useState(null)
 const [error, setError] = useState('')
 const protectedCount = ids.filter(id => ['Di room', 'Selesai'].includes(entries[id]?.status)).length
 const stale = preview && revision !== preview.expectedRevision
 function clearPreview() {setPreview(null); setError('')}
 function change(key, value) {setForm(current => ({...current, [key]:value})); clearPreview()}
 function toggleRoom(id) {setRoomIds(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]); clearPreview()}
 function previewDistribution(event) {
  event.preventDefault()
  try {
   const plan = prepareBulkDistribution({population, entries, rooms, selectedIds:ids, mode, roomIds:mode === 'keepSchedule' ? [targetRoomId] : roomIds, settings:form})
   setPreview({plan, expectedRevision:revision})
   setError('')
  } catch (err) {setPreview(null); setError(err.message)}
 }
 function apply() {
  if (!preview || stale || !preview.plan.summary.changed) return
  try {
   const outcome = onApply(preview.plan.entries, preview.expectedRevision, `${number(preview.plan.summary.changed)} penempatan SDM diperbarui dalam draft browser.`)
   if (outcome === true) onClose()
   else setError(outcome || 'Distribusi belum disimpan. Susun pratinjau kembali.')
  } catch (err) {setError(err.message)}
 }
 return <Modal title="Distribusikan SDM ke pewawancara" onClose={onClose}>
  <p><b>{number(ids.length)} SDM dipilih.</b> Penempatan mengikuti pewawancara utama setiap room. Tinjau perubahan sebelum menyimpan.</p>
  <p className="interview-muted">Jadwal atau room yang berubah akan mengembalikan status SDM ke Terjadwal; identitas perlu diverifikasi kembali saat pelaksanaan.</p>
  {protectedCount > 0 && <p className="notice amber-notice">{number(protectedCount)} SDM sudah mulai atau selesai wawancara. Keluarkan mereka dari pilihan agar catatan pelaksanaan tetap terjaga.</p>}
  {error && <p className="notice red-notice" role="alert">{error}</p>}
  <form onSubmit={previewDistribution} className="interview-distribution-form">
   <label>Cara distribusi<select value={mode} onChange={event => {setMode(event.target.value); clearPreview()}}><option value="reschedule">Susun jadwal ke pewawancara terpilih</option><option value="keepSchedule">Ganti pewawancara, pertahankan jadwal</option></select></label>
   {mode === 'keepSchedule' ? <><label>Room / pewawancara tujuan<select required value={targetRoomId} onChange={event => {setTargetRoomId(event.target.value); clearPreview()}}><option value="">Pilih pewawancara</option>{activeRooms.map(room => <option key={room.id} value={room.id}>{roomText(room)}</option>)}</select></label><p className="interview-muted">Tanggal, jam, sesi, dan durasi tetap mengikuti jadwal masing-masing SDM. Penempatan yang berbenturan akan ditolak.</p></> : <>
    <fieldset className="interview-distribution-rooms"><legend>Pilih room / pewawancara tujuan ({roomIds.length})</legend><div className="interview-distribution-room-actions"><button type="button" className="btn secondary" onClick={() => {setRoomIds(activeRooms.map(room => room.id)); clearPreview()}}>Pilih semua room aktif</button><button type="button" className="btn secondary" onClick={() => {setRoomIds([]); clearPreview()}}>Kosongkan pilihan</button></div><div className="interview-distribution-room-options">{activeRooms.map(room => <label className="interview-checkbox" key={room.id}><input type="checkbox" checked={roomIds.includes(room.id)} onChange={() => toggleRoom(room.id)}/>{roomText(room)}</label>)}</div></fieldset>
    <div className="interview-settings"><label>Tanggal mulai<input type="date" required value={form.startDate} onChange={event => change('startDate', event.target.value)}/></label><label>Mulai pukul (WIB)<input type="time" required value={form.startTime} onChange={event => change('startTime', event.target.value)}/></label><label>Durasi wawancara (menit)<input type="number" min="1" max="480" required value={form.duration} onChange={event => change('duration', Number(event.target.value))}/></label><label>Jeda pergantian (menit)<input type="number" min="0" max="240" required value={form.gap} onChange={event => change('gap', Number(event.target.value))}/></label><label>SDM / room / hari<input type="number" min="1" max="500" required value={form.perDay} onChange={event => change('perDay', Number(event.target.value))}/></label><label className="interview-checkbox"><input type="checkbox" checked={form.skipWeekends} onChange={event => change('skipWeekends', event.target.checked)}/>Lewati Sabtu & Minggu</label></div>
    <p className="interview-muted">Hanya SDM terpilih yang disusun ulang. Jadwal SDM lain tetap diperhitungkan untuk mencegah bentrok room dan pewawancara.</p>
   </>}
   <div className="interview-form-actions"><button className="btn secondary" type="button" onClick={onClose}>Batal</button><button className="btn primary" disabled={!ids.length || protectedCount > 0}>Pratinjau distribusi</button></div>
  </form>
  {preview && <><PlanPreview plan={preview.plan} population={population} rooms={rooms}/>{stale && <p className="notice amber-notice" role="alert">Catatan berubah setelah pratinjau. Klik Pratinjau distribusi kembali sebelum menerapkan.</p>}<div className="interview-form-actions"><button className="btn primary" type="button" disabled={Boolean(stale) || !preview.plan.summary.changed} onClick={apply}>Terapkan {number(preview.plan.summary.changed)} perubahan</button></div></>}
 </Modal>
}

export function ScheduleImportDialog({population, entries, rooms, settings, revision, onApply, onClose}) {
 const fileInput = useRef(null)
 const request = useRef(0)
 const [loading, setLoading] = useState(false)
 const [filename, setFilename] = useState('')
 const [preview, setPreview] = useState(null)
 const [errors, setErrors] = useState([])
 const [warnings, setWarnings] = useState([])
 const [applyError, setApplyError] = useState('')
 const stale = preview && revision !== preview.expectedRevision
 useEffect(() => () => {request.current += 1}, [])
 async function readFile(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  const currentRequest = ++request.current
  const expectedRevision = revision
  setFilename(file.name); setLoading(true); setPreview(null); setErrors([]); setWarnings([]); setApplyError('')
  try {
   const parsed = await readScheduleFile(file)
   if (currentRequest !== request.current) return
   setWarnings(parsed.warnings || [])
   if (parsed.errors?.length) {setErrors(parsed.errors); return}
   const plan = prepareScheduleImport({population, entries, rooms, rows:parsed.rows, settings})
   if (plan.errors?.length) {setErrors(plan.errors); return}
   if (!plan.entries) throw Error('Berkas belum menghasilkan jadwal yang valid. Periksa isian dan impor kembali.')
   setPreview({plan, expectedRevision})
  } catch (err) {if (currentRequest === request.current) setErrors([{rowNumber:0, message:err.message}])}
  finally {if (currentRequest === request.current) setLoading(false)}
 }
 function apply() {
  if (!preview || stale || errors.length || !preview.plan.summary.changed) return
  try {
   const outcome = onApply(preview.plan.entries, preview.expectedRevision, `${number(preview.plan.summary.changed)} jadwal SDM dari impor disimpan dalam draft browser.`)
   if (outcome === true) onClose()
   else setApplyError(outcome || 'Jadwal belum disimpan. Impor kembali untuk membuat pratinjau baru.')
  } catch (err) {setApplyError(err.message)}
 }
 return <Modal title="Impor jadwal SDM" onClose={onClose}>
  <p>Unggah jadwal yang sudah disiapkan dalam CSV atau Excel (.xlsx). NIK atau NIP harus cocok dengan BNBA ASN Terbukti pada sumber aktif.</p>
  <div className="interview-distribution-help"><p><b>Gunakan template:</b> isi NIK atau NIP, Tanggal (YYYY-MM-DD), Jadwal (HH:MM WIB), Sesi, Room atau Pewawancara Utama, dan Durasi (menit).</p><p>Simpan NIK/NIP sebagai <b>teks</b> agar seluruh digit tetap utuh. Nama saja tidak cukup untuk mencocokkan SDM. Berkas Excel dibaca dari lembar pertama.</p><p>Nama room dan pewawancara mengikuti Penugasan & parameter. Pratinjau memeriksa identitas, bentrok jadwal, dan catatan wawancara yang telah berjalan.{settings?.perDay ? ` Batas harian: ${number(settings.perDay)} SDM per room.` : ''}</p></div>
  <div className="interview-form-actions"><button className="btn secondary" type="button" onClick={() => downloadBlob(scheduleImportTemplateCsv(), 'template-jadwal-sdm.csv', 'text/csv;charset=utf-8')}><Download size={14}/>Unduh template CSV</button><button className="btn primary" type="button" disabled={loading} onClick={() => fileInput.current.click()}><FileUp size={14}/>{loading ? 'Membaca jadwal…' : 'Pilih berkas jadwal'}</button><input ref={fileInput} type="file" hidden disabled={loading} accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={readFile}/></div>
  {filename && <p className="interview-muted" role="status">{filename}{loading ? ' · sedang dibaca' : ''}</p>}
  <ErrorList items={warnings} warning/>
  <ErrorList items={errors}/>
  {errors.length > 0 && <p>Belum ada jadwal yang disimpan. Perbaiki seluruh masalah pada berkas, lalu pilih berkas kembali.</p>}
  {preview && <><PlanPreview plan={preview.plan} population={population} rooms={rooms}/>{stale && <p className="notice amber-notice" role="alert">Catatan berubah saat pratinjau dibuat. Pilih berkas kembali agar jadwal diperiksa dengan catatan terbaru.</p>}{applyError && <p className="notice red-notice" role="alert">{applyError}</p>}<div className="interview-form-actions"><button className="btn secondary" type="button" onClick={onClose}>Batal</button><button className="btn primary" type="button" disabled={loading || Boolean(stale) || Boolean(errors.length) || !preview.plan.summary.changed} onClick={apply}>Terapkan {number(preview.plan.summary.changed)} jadwal</button></div></>}
 </Modal>
}

export function InterviewerPackagesDialog({population, entries, rooms, onClose}) {
 const result = useMemo(() => {
  try {return {packages:interviewerPackages({population, entries, rooms})}}
  catch (error) {return {packages:[], error:error.message}}
 }, [population, entries, rooms])
 const [error, setError] = useState('')
 const [packing, setPacking] = useState(false)
 const [message, setMessage] = useState('')
 async function downloadAll() {
  setPacking(true); setError(''); setMessage('')
  try {
   const {zipSync, strToU8} = await import('fflate')
   const files = {}
   for (const [index, item] of result.packages.entries()) {
    const name = Object.hasOwn(files, item.filename) ? `${index + 1}-${item.filename}` : item.filename
    files[name] = strToU8(item.rowsCsv)
   }
   downloadBlob(zipSync(files), 'paket-bnba-pewawancara.zip', 'application/zip')
   setMessage('ZIP paket pewawancara telah disiapkan untuk diunduh.')
  } catch (err) {setError(err.message || 'Paket ZIP belum dapat dibuat. Unduh CSV per pewawancara.')}
  finally {setPacking(false)}
 }
 return <Modal title="Paket BNBA per pewawancara" onClose={onClose}>
  <p>Unduh BNBA dan jadwal setiap pewawancara untuk dibagikan kepada tim. Paket mengikuti penempatan yang sudah disimpan pada draft saat ini.</p>
  {(error || result.error) && <p className="notice red-notice" role="alert">{error || result.error}</p>}
  {message && <p className="interview-message" role="status">{message}</p>}
  {result.packages.length ? <><p><b>{number(result.packages.length)} pewawancara</b> · {number(result.packages.reduce((sum, item) => sum + item.count, 0))} SDM terjadwal.</p><div className="interview-form-actions"><button className="btn primary" type="button" disabled={packing} onClick={downloadAll}><Download size={14}/>{packing ? 'Membuat ZIP…' : 'Unduh semua paket (.zip)'}</button></div><div className="table-scroll" tabIndex={0} role="region" aria-label="Paket BNBA setiap pewawancara"><table><thead><tr><th>Pewawancara</th><th>Room</th><th>SDM</th><th>Paket jadwal</th></tr></thead><tbody>{result.packages.map(item => <tr key={item.filename}><td><b>{item.interviewer}</b></td><td>{item.roomNames.join(', ')}</td><td>{number(item.count)}</td><td><button className="btn secondary" type="button" onClick={() => downloadBlob(item.rowsCsv, item.filename, 'text/csv;charset=utf-8')} aria-label={`Unduh CSV BNBA ${item.interviewer}`}><Download size={14}/>Unduh CSV</button></td></tr>)}</tbody></table></div><p className="interview-muted">Berkas dibuat di perangkat ini. Kirimkan paket yang sesuai kepada masing-masing pewawancara melalui kanal kerja Anda.</p></> : !result.error && <p>Belum ada jadwal yang dapat dibagikan. Distribusikan SDM atau impor jadwal terlebih dahulu.</p>}
 </Modal>
}
