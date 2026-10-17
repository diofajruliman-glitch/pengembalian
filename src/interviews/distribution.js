import { DEFAULT_ROOMS, createSchedule, monitoringCsv, validateAssignment } from './model.js'

const text = value => String(value ?? '').trim()
const normalized = value => text(value).replace(/\s+/g, ' ').toLocaleLowerCase('id-ID')
const ownEntry = (entries, nik) => Object.hasOwn(entries, nik) ? entries[nik] : undefined
const protectedStatuses = new Set(['Di room', 'Selesai'])
const scheduleFields = ['date', 'time', 'session', 'roomId', 'duration']
const hasValue = value => value !== undefined && value !== null && text(value) !== ''

function populationIndex(population) {
 if (!Array.isArray(population) || population.length > 100000) throw Error('Populasi wawancara tidak valid atau melebihi 100.000 peserta.')
 const byNik = new Map(), byNip = new Map()
 for (const person of population) {
  if (person?.hasilPenilaian !== 'Terbukti') continue
  const nik = typeof person.nik === 'string' ? person.nik.trim() : ''
  if (!/^\d{16}$/.test(nik)) continue
  if (!byNik.has(nik)) byNik.set(nik, [])
  byNik.get(nik).push(person)
  const nip = typeof person.nip === 'string' ? person.nip.trim() : ''
  if (/^\d{18}$/.test(nip)) {
   if (!byNip.has(nip)) byNip.set(nip, [])
   byNip.get(nip).push(person)
  }
 }
 return { byNik, byNip }
}

function validateInputs(entries, rooms) {
 if (!entries || typeof entries !== 'object' || Array.isArray(entries)) throw Error('Catatan monitoring tidak valid.')
 if (!Array.isArray(rooms) || rooms.length > 200) throw Error('Daftar room tidak valid (maksimal 200 room).')
 const ids = new Set()
 for (const room of rooms) {
  if (!room || typeof room.id !== 'string' || !text(room.id) || ids.has(room.id)) throw Error('ID room harus terisi dan unik.')
  ids.add(room.id)
 }
}

function personByNik(nik, index) {
 if (typeof nik !== 'string' || !/^\d{16}$/.test(nik.trim())) throw Error('NIK harus berupa teks 16 digit agar identitas tetap utuh.')
 const matches = index.byNik.get(nik.trim()) || []
 if (!matches.length) throw Error('NIK tidak ditemukan dalam populasi ASN Terbukti yang aktif.')
 if (matches.length !== 1) throw Error('NIK ganda dalam populasi; perbaiki data sebelum mendistribusikan.')
 return matches[0]
}

function ensureEditable(nik, entries) {
 if (protectedStatuses.has(ownEntry(entries, nik)?.status)) throw Error('Peserta berstatus Di room atau Selesai tidak dapat didistribusikan ulang.')
}

function sameSchedule(before, after) {
 return Boolean(before) && scheduleFields.every(field => String(before[field] ?? '') === String(after[field] ?? ''))
}

function finalEntry(assignment, previous, notes) {
 const unchanged = sameSchedule(previous, assignment)
 const notesChanged = notes !== undefined && notes !== (previous?.notes ?? '')
 if (unchanged && !notesChanged) return previous
 const next = { ...(previous || {}), ...assignment }
 if (unchanged) {
  // Editing an imported note does not restart an appointment or erase verification.
  if (previous?.status !== undefined) next.status = previous.status
 } else {
  next.status = 'Terjadwal'
  next.verified = false
  next.startedAt = ''
  next.finishedAt = ''
 }
 if (notes !== undefined) next.notes = notes
 return next
}

function summaryFor(assignments, changes) {
 const dates = new Map(), rooms = new Map()
 for (const entry of assignments) {
  if (entry.date) dates.set(entry.date, (dates.get(entry.date) || 0) + 1)
  if (entry.roomId) rooms.set(entry.roomId, (rooms.get(entry.roomId) || 0) + 1)
 }
 return {
  selected: assignments.length,
  changed: changes.length,
  unchanged: assignments.length - changes.length,
  days: dates.size,
  rooms: rooms.size,
  byDate: [...dates].sort(([first], [second]) => first.localeCompare(second)).map(([date, count]) => ({ date, count })),
  byRoom: [...rooms].map(([roomId, count]) => ({ roomId, count }))
 }
}

function resultFor(assignments, entries, notesByNik = new Map()) {
 const nextEntries = { ...entries }, finalAssignments = [], changes = []
 for (const assignment of assignments) {
  const before = ownEntry(entries, assignment.nik)
  const after = finalEntry(assignment, before, notesByNik.get(assignment.nik))
  nextEntries[assignment.nik] = after
  finalAssignments.push(after.nik === assignment.nik ? after : { ...after, nik: assignment.nik })
  if (after !== before) changes.push({ nik: assignment.nik, before: before || null, after })
 }
 return { entries: nextEntries, assignments: finalAssignments, changes, summary: summaryFor(finalAssignments, changes) }
}

function withoutSelected(entries, ids) {
 return Object.fromEntries(Object.entries(entries).filter(([nik]) => !ids.has(nik)))
}

function dailyLimit(settings) {
 if (settings.perDay === undefined) return null
 const value = settings.perDay
 if (!['string', 'number'].includes(typeof value) || !text(value) || !Number.isInteger(Number(value)) || Number(value) < 1 || Number(value) > 500) throw Error('Peserta per room per hari harus bilangan bulat 1–500.')
 return Number(value)
}

function capacityError(assignments, otherEntries, limit) {
 if (limit === null) return null
 const counts = new Map()
 for (const entry of [...Object.values(otherEntries), ...assignments]) {
  if (!entry?.date || !entry.roomId || entry.status === 'Belum dijadwalkan' || entry.status === 'Jadwal ulang') continue
  const key = `${entry.date}/${entry.roomId}`
  counts.set(key, (counts.get(key) || 0) + 1)
 }
 for (const assignment of assignments) {
  if ((counts.get(`${assignment.date}/${assignment.roomId}`) || 0) > limit) return { nik: assignment.nik, message: `Distribusi melebihi batas ${limit} responden per room per hari pada ${assignment.date}.` }
 }
 return null
}

/** Prepare an atomic bulk edit without changing population, entries, or rooms. */
export function prepareBulkDistribution({ population, entries = {}, rooms = DEFAULT_ROOMS, selectedIds, mode = 'reschedule', roomIds, settings = {} }) {
 validateInputs(entries, rooms)
 const index = populationIndex(population)
 if (!Array.isArray(selectedIds) || !selectedIds.length) throw Error('Pilih setidaknya satu SDM untuk didistribusikan.')
 if (!['keepSchedule', 'reschedule'].includes(mode)) throw Error('Mode distribusi tidak dikenal.')
 const selected = [], ids = new Set()
 for (const value of selectedIds) {
  const person = personByNik(value, index), nik = person.nik.trim()
  if (ids.has(nik)) throw Error('SDM yang sama dipilih lebih dari sekali.')
  ensureEditable(nik, entries)
  ids.add(nik)
  selected.push(person)
 }
 if (!Array.isArray(roomIds) || !roomIds.length) throw Error('Pilih setidaknya satu room tujuan.')
 const targetIds = new Set()
 for (const id of roomIds) {
  if (typeof id !== 'string' || targetIds.has(id)) throw Error('Room tujuan harus terisi dan unik.')
  const room = rooms.find(candidate => candidate.id === id)
  if (!room || room.enabled === false) throw Error('Pilih room aktif yang dikenal untuk distribusi.')
  if (!text(room.interviewer)) throw Error('Isi pewawancara utama pada setiap room tujuan.')
  targetIds.add(id)
 }
 const otherEntries = withoutSelected(entries, ids)
 let assignments
 if (mode === 'keepSchedule') {
  if (targetIds.size !== 1) throw Error('Pindah pewawancara tanpa mengubah jadwal membutuhkan tepat satu room tujuan.')
  const roomId = [...targetIds][0]
  assignments = selected.map(person => {
   const previous = ownEntry(entries, person.nik.trim())
   if (!previous) throw Error('Seluruh SDM terpilih harus memiliki jadwal sebelum dipindah tanpa mengubah jadwal.')
   return { nik: person.nik.trim(), date: previous.date, time: previous.time, session: previous.session, duration: previous.duration, roomId, status: 'Terjadwal' }
  })
 } else {
  // Keep all rooms available to conflict detection, including rooms outside the
  // chosen subset whose primary interviewer may also serve a selected room.
  const schedulingRooms = rooms.map(room => ({ ...room, enabled: targetIds.has(room.id) }))
  assignments = createSchedule(selected, otherEntries, schedulingRooms, settings)
 }
 const checkedEntries = { ...otherEntries }
 for (const assignment of assignments) {
  validateAssignment(assignment, checkedEntries, rooms)
  checkedEntries[assignment.nik] = assignment
 }
 if (assignments.length !== selected.length) throw Error('Tidak semua SDM mendapatkan jadwal. Distribusi belum diterapkan.')
 const overCapacity = capacityError(assignments, otherEntries, dailyLimit(settings))
 if (overCapacity) throw Error(overCapacity.message)
 return resultFor(assignments, entries)
}

function identifier(value, length, label) {
 if (typeof value !== 'string' || !new RegExp(`^\\d{${length}}$`).test(value.trim())) throw Error(`${label} harus berupa teks ${length} digit; jangan ubah menjadi angka.`)
 return value.trim()
}

function importedPerson(row, index) {
 let person
 if (hasValue(row.nik)) person = personByNik(identifier(row.nik, 16, 'NIK'), index)
 if (hasValue(row.nip)) {
  const nip = identifier(row.nip, 18, 'NIP'), matches = index.byNip.get(nip) || []
  if (!matches.length) throw Error('NIP tidak ditemukan dalam populasi ASN Terbukti yang aktif.')
  if (matches.length !== 1) throw Error('NIP ganda dalam populasi; gunakan data identitas yang telah diperbaiki.')
  if (person && person.nik.trim() !== matches[0].nik.trim()) throw Error('NIK dan NIP mengarah ke SDM yang berbeda.')
  person = matches[0]
 }
 if (!person) throw Error('Isi NIK 16 digit atau NIP 18 digit. Pencocokan nama saja tidak diperbolehkan.')
 // A source can have a duplicate NIK even when this row was matched by NIP.
 personByNik(person.nik, index)
 if (hasValue(row.nama) && normalized(row.nama) !== normalized(person.nama)) throw Error('Nama pada jadwal tidak cocok dengan identitas SDM pada populasi aktif.')
 return person
}

function importedRoom(row, rooms) {
 let selected
 for (const reference of [row.roomId, row.room]) {
  if (!hasValue(reference)) continue
  const key = normalized(reference)
  const matches = rooms.filter(room => normalized(room.id) === key || normalized(room.name) === key)
  if (matches.length !== 1) throw Error(matches.length ? 'Nama atau ID room ambigu; gunakan ID room yang unik.' : 'Room pada jadwal tidak ditemukan.')
  if (selected && selected.id !== matches[0].id) throw Error('ID room dan nama room mengarah ke room yang berbeda.')
  selected = matches[0]
 }
 if (hasValue(row.interviewer)) {
  const key = normalized(row.interviewer)
  if (selected) {
   if (normalized(selected.interviewer) !== key) throw Error('Pewawancara utama tidak sesuai dengan room yang dipilih.')
  } else {
   const matches = rooms.filter(room => room.enabled !== false && normalized(room.interviewer) === key)
   if (matches.length !== 1) throw Error(matches.length ? 'Pewawancara utama bertugas di beberapa room; isi room tujuan secara eksplisit.' : 'Pewawancara utama pada jadwal tidak ditemukan di room aktif.')
   selected = matches[0]
  }
 }
 if (!selected) throw Error('Isi room atau pewawancara utama pada jadwal.')
 if (selected.enabled === false) throw Error('Room pada jadwal sedang tidak aktif.')
 return selected
}

function failedImport(rows, errors) {
 return { entries: null, assignments: [], changes: [], summary: { ...summaryFor([], []), selected: Array.isArray(rows) ? rows.length : 0 }, errors }
}

/** Import already parsed/normalized rows; all errors leave the current entries intact. */
export function prepareScheduleImport({ population, entries = {}, rooms = DEFAULT_ROOMS, rows, settings = {} }) {
 let index, limit
 try {
  validateInputs(entries, rooms)
  index = populationIndex(population)
  limit = dailyLimit(settings)
  if (!Array.isArray(rows) || !rows.length || rows.length > 100000) throw Error('Jadwal impor harus berisi 1–100.000 baris data.')
 } catch (error) {
  return failedImport(rows, [{ rowNumber: 0, message: error.message }])
 }
 const errors = [], assignments = [], notesByNik = new Map(), ids = new Set(), sourceRows = new Map()
 rows.forEach((row, offset) => {
  const rowNumber = Number.isInteger(row?.rowNumber) && row.rowNumber > 0 ? row.rowNumber : offset + 2
  try {
   if (!row || typeof row !== 'object' || Array.isArray(row)) throw Error('Baris jadwal tidak valid.')
   const person = importedPerson(row, index), nik = person.nik.trim()
   if (ids.has(nik)) throw Error('SDM muncul lebih dari sekali dalam jadwal impor.')
   ids.add(nik)
   ensureEditable(nik, entries)
   const room = importedRoom(row, rooms)
   const assignment = { nik, date: text(row.date), time: text(row.time), session: hasValue(row.session) ? row.session : 1, roomId: room.id, duration: hasValue(row.duration) ? row.duration : 40, status: 'Terjadwal' }
   validateAssignment(assignment, {}, rooms)
   assignment.session = Number(assignment.session)
   assignment.duration = Number(assignment.duration)
   if (Object.hasOwn(row, 'notes') && row.notes !== undefined) {
    if (typeof row.notes !== 'string' || row.notes.length > 10000) throw Error('Catatan impor harus berupa teks maksimal 10.000 karakter.')
    notesByNik.set(nik, row.notes)
   }
   sourceRows.set(nik, rowNumber)
   assignments.push(assignment)
  } catch (error) {
   errors.push({ rowNumber, message: error.message })
  }
 })
 // Vacate every selected appointment before validating: this allows deliberate
 // swaps of occupied slots without order-dependent conflicts.
 const otherEntries = withoutSelected(entries, ids), checkedEntries = { ...otherEntries }
 for (const assignment of assignments) {
  try {
   validateAssignment(assignment, checkedEntries, rooms)
   checkedEntries[assignment.nik] = assignment
  } catch (error) {
   errors.push({ rowNumber: sourceRows.get(assignment.nik), message: error.message })
  }
 }
 const overCapacity = capacityError(assignments, otherEntries, limit)
 if (overCapacity) errors.push({ rowNumber: sourceRows.get(overCapacity.nik), message: overCapacity.message })
 if (errors.length) return failedImport(rows, errors.sort((first, second) => first.rowNumber - second.rowNumber))
 return { ...resultFor(assignments, entries, notesByNik), errors: [] }
}

export function scheduleImportTemplateCsv() {
 const headers = ['NIK', 'NIP', 'Nama', 'Tanggal', 'Jadwal', 'Sesi', 'Room', 'Pewawancara Utama', 'Durasi (menit)', 'Catatan']
 return '\uFEFF' + headers.map(header => `"${header}"`).join(';') + '\r\n'
}

/** Only the assigned primary interviewer's own BNBA is included in each package. */
export function interviewerPackages({ population, entries = {}, rooms = DEFAULT_ROOMS }) {
 validateInputs(entries, rooms)
 const index = populationIndex(population), groups = new Map()
 for (const [nik, matches] of index.byNik) {
  if (matches.length !== 1) continue
  const entry = ownEntry(entries, nik)
  if (!entry?.date || !entry.time || !entry.roomId || entry.status === 'Belum dijadwalkan' || entry.status === 'Jadwal ulang') continue
  const room = rooms.find(candidate => candidate.id === entry.roomId)
  if (!room || !text(room.interviewer)) continue
  const key = normalized(room.interviewer)
  if (!groups.has(key)) groups.set(key, { interviewer: text(room.interviewer), people: [], roomNames: new Set() })
  const group = groups.get(key)
  group.people.push(matches[0])
  group.roomNames.add(text(room.name) || room.id)
 }
 return [...groups.values()].sort((first, second) => first.interviewer.localeCompare(second.interviewer, 'id-ID')).map((group, offset) => {
  group.people.sort((first, second) => {
   const firstEntry = ownEntry(entries, first.nik.trim()), secondEntry = ownEntry(entries, second.nik.trim())
   return firstEntry.date.localeCompare(secondEntry.date) || firstEntry.time.localeCompare(secondEntry.time) || first.nik.localeCompare(second.nik)
  })
  const slug = group.interviewer.normalize('NFKC').replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^[._-]+|[._-]+$/g, '').slice(0, 80) || 'pewawancara'
  return { filename: `BNBA-${String(offset + 1).padStart(2, '0')}-${slug}.csv`, interviewer: group.interviewer, roomNames: [...group.roomNames], rowsCsv: monitoringCsv(group.people, entries, rooms), count: group.people.length }
 })
}
