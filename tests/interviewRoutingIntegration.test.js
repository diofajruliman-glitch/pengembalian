import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_ROOMS, createSchedule, monitoringCsv, updateEntry } from '../src/interviews/model.js'
import { interviewerPackages, prepareBulkDistribution, prepareScheduleImport } from '../src/interviews/distribution.js'

const settings = { startDate: '2026-10-19', startTime: '08:00', duration: 40, gap: 5, perDay: 11, skipWeekends: true }
const at = '2026-10-19T01:05:00.000Z'
const person = (index, category = 'Berat', afterCategory = 'Ringan') => ({
 nik: String(index).padStart(16, '0'), nip: String(index).padStart(18, '0'), nama: `Peserta ${index}`, hasilPenilaian: 'Terbukti',
 historical: { kategori: category }, after: { kategori: afterCategory }, notes: 'Catatan sumber dipertahankan'
})
const appointment = (nik, patch = {}) => ({ nik, date: '2026-10-19', time: '08:00', session: 1, duration: 40, roomId: 'room-1', status: 'Terjadwal', ...patch })
const importRow = (member, patch = {}) => ({ nik: member.nik, date: '2026-10-19', time: '08:00', session: 1, duration: 40, room: 'Room 1', ...patch })
const bulk = (population, extra = {}) => prepareBulkDistribution({ population, selectedIds: population.map(member => member.nik), roomIds: DEFAULT_ROOMS.map(room => room.id), settings, ...extra })
const groupCounts = (values, keyOf) => {
 const counts = new Map()
 for (const value of values) { const key = keyOf(value); counts.set(key, (counts.get(key) || 0) + 1) }
 return counts
}

test('45 heavy participants use four specialist rooms at eleven per room per day without changing source data', () => {
 const population = Array.from({ length: 45 }, (_, index) => person(index + 1)), before = structuredClone(population)
 const result = createSchedule(population, {}, DEFAULT_ROOMS, settings)
 assert.equal(result.length, 45)
 assert.equal(new Set(result.map(entry => entry.nik)).size, 45)
 assert.deepEqual([...groupCounts(result, entry => entry.date)], [['2026-10-19', 44], ['2026-10-20', 1]])
 assert.deepEqual([...groupCounts(result.filter(entry => entry.date === '2026-10-19'), entry => entry.roomId)], [['room-1', 11], ['room-2', 11], ['room-3', 11], ['room-4', 11]])
 assert.ok(result.every(entry => ['room-1', 'room-2', 'room-3', 'room-4'].includes(entry.roomId)))
 assert.deepEqual(population, before)
})

test('mixed source order reserves specialist capacity for heavy while other rooms continue scheduling regular participants', () => {
 const regular = Array.from({ length: 100 }, (_, index) => person(index + 1, 'Sedang', 'Berat'))
 const heavy = Array.from({ length: 45 }, (_, index) => person(index + 101))
 const heavyIds = new Set(heavy.map(member => member.nik))
 const result = createSchedule([...regular, ...heavy], {}, DEFAULT_ROOMS, settings)
 assert.equal(result.length, 145)
 assert.equal(result.filter(entry => heavyIds.has(entry.nik) && entry.date === '2026-10-19').length, 44)
 assert.equal(result.filter(entry => !heavyIds.has(entry.nik) && entry.date === '2026-10-19').length, 100)
 assert.ok(result.filter(entry => heavyIds.has(entry.nik)).every(entry => ['room-1', 'room-2', 'room-3', 'room-4'].includes(entry.roomId)))
})

test('the confirmed original Pairing Sekjen category controls routing despite a different after-ASN category', () => {
 const historicalHeavy = person(1, 'Berat', 'Ringan'), historicalRegular = person(2, 'Ringan', 'Berat')
 const regularRooms = DEFAULT_ROOMS.slice(4, 5)
 assert.throws(() => createSchedule([historicalHeavy], {}, regularRooms, settings), /Pairing Sekjen asli.*Itjen atau OSDM/)
 assert.equal(createSchedule([historicalRegular], {}, regularRooms, settings)[0].roomId, 'room-5')
 assert.throws(() => updateEntry(historicalHeavy.nik, appointment(historicalHeavy.nik, { roomId: 'room-5' }), {}, DEFAULT_ROOMS, at, historicalHeavy), /Berat.*Itjen atau OSDM/)
 assert.equal(updateEntry(historicalRegular.nik, appointment(historicalRegular.nik, { roomId: 'room-5' }), {}, DEFAULT_ROOMS, at, historicalRegular)[historicalRegular.nik].roomId, 'room-5')
})

test('pending heavy with no active specialist fails explicitly, including misleading room names and cross interviewers', () => {
 const member = person(1)
 const rooms = [
  { ...DEFAULT_ROOMS[0], enabled: false },
  { ...DEFAULT_ROOMS[4], name: 'Itjen OSDM', interviewer: 'Tim OSDM', crossInterviewer: 'Itjen 1' },
  { ...DEFAULT_ROOMS[5], interviewer: 'Pendamping Itjen', crossInterviewer: 'OSDM 1' }
 ]
 assert.throws(() => createSchedule([member], {}, rooms, settings), /Pairing Sekjen asli.*Itjen atau OSDM/)
 assert.throws(() => bulk([member], { roomIds: ['room-5'], rooms }), /Pairing Sekjen asli.*Itjen atau OSDM/)
 const imported = prepareScheduleImport({ population: [member], rows: [importRow(member, { room: 'Itjen OSDM' })], rooms })
 assert.equal(imported.entries, null)
 assert.match(imported.errors[0].message, /Berat.*Itjen atau OSDM/)
})

test('disabled specialists are excluded and existing primary-interviewer conflicts still constrain heavy scheduling', () => {
 const members = [person(1), person(2), person(3)]
 const rooms = DEFAULT_ROOMS.map(room => ['room-1', 'room-3'].includes(room.id) ? { ...room, enabled: false } : room)
 const result = createSchedule(members, {}, rooms, { ...settings, perDay: 1 })
 assert.deepEqual(result.map(entry => [entry.date, entry.roomId]), [['2026-10-19', 'room-2'], ['2026-10-19', 'room-4'], ['2026-10-20', 'room-2']])
 const sharedRooms = [DEFAULT_ROOMS[0], { ...DEFAULT_ROOMS[1], interviewer: ' Itjen 1 ', enabled: false }]
 const existing = { other: appointment('other', { roomId: 'room-2' }) }
 assert.equal(createSchedule([members[0]], existing, sharedRooms, { ...settings, perDay: 2 })[0].time, '08:45')
})

test('preserved heavy records do not block new regular scheduling when all specialist rooms are unavailable', () => {
 const heavy = person(1), regular = person(2, 'Ringan'), existing = { [heavy.nik]: appointment(heavy.nik, { roomId: 'room-5', status: 'Di room', notes: 'Riwayat pelaksanaan' }) }
 const before = structuredClone(existing)
 const generated = createSchedule([heavy, regular], existing, DEFAULT_ROOMS.slice(4, 6), settings)
 assert.deepEqual(generated.map(entry => entry.nik), [regular.nik])
 assert.equal(generated[0].roomId, 'room-6')
 assert.deepEqual(existing, before)
})

test('manual new appointments, moving rooms, changing schedule details, and fresh interview starts enforce heavy routing', () => {
 const member = person(1)
 assert.throws(() => updateEntry(member.nik, appointment(member.nik, { roomId: 'room-5' }), {}, DEFAULT_ROOMS, at, member), /Berat.*Itjen atau OSDM/)
 const correct = { [member.nik]: appointment(member.nik) }
 assert.throws(() => updateEntry(member.nik, { roomId: 'room-5' }, correct, DEFAULT_ROOMS, at, member), /Berat.*Itjen atau OSDM/)
 const wrong = { [member.nik]: appointment(member.nik, { roomId: 'room-5', verified: true, notes: 'Catatan lama' }) }, before = structuredClone(wrong)
 for (const patch of [{ date: '2026-10-20' }, { time: '08:45' }, { session: 2 }, { duration: 45 }, { status: 'Di room' }]) {
  assert.throws(() => updateEntry(member.nik, patch, wrong, DEFAULT_ROOMS, at, member), /Berat.*Itjen atau OSDM/)
 }
 const corrected = updateEntry(member.nik, { roomId: 'room-3', status: 'Di room' }, wrong, DEFAULT_ROOMS, at, member)
 assert.equal(corrected[member.nik].roomId, 'room-3')
 assert.equal(corrected[member.nik].startedAt, at)
 assert.deepEqual(wrong, before)
})

test('manual notes and completion remain available for an existing active or completed heavy assignment in a wrong room', () => {
 const member = person(1), entry = appointment(member.nik, { roomId: 'room-5', status: 'Di room', verified: true, startedAt: '2026-10-19T01:00:00.000Z' })
 const original = { [member.nik]: entry }, before = structuredClone(original)
 const noted = updateEntry(member.nik, { notes: 'Perlu koreksi distribusi' }, original, DEFAULT_ROOMS, at, member)
 assert.equal(noted[member.nik].notes, 'Perlu koreksi distribusi')
 assert.equal(noted[member.nik].startedAt, entry.startedAt)
 const completed = updateEntry(member.nik, { status: 'Selesai' }, noted, DEFAULT_ROOMS, at, member)
 assert.equal(completed[member.nik].finishedAt, at)
 assert.equal(completed[member.nik].roomId, 'room-5')
 assert.equal(updateEntry(member.nik, { notes: 'Selesai dicatat' }, completed, DEFAULT_ROOMS, at, member)[member.nik].status, 'Selesai')
 assert.throws(() => updateEntry(member.nik, { status: 'Di room' }, completed, DEFAULT_ROOMS, at, member), /Berat.*Itjen atau OSDM/)
 assert.deepEqual(original, before)
})

test('manual entry refuses a different source identity even for a notes-only edit', () => {
 const member = person(1), other = person(2)
 assert.throws(() => updateEntry(member.nik, { notes: 'Catatan' }, {}, DEFAULT_ROOMS, at, other), /Identitas SDM sumber.*NIK/)
 assert.throws(() => updateEntry(member.nik, { notes: 'Catatan' }, {}, DEFAULT_ROOMS, at, {}), /Identitas SDM sumber.*NIK/)
 assert.equal(updateEntry(member.nik, { notes: 'Catatan' }, {}, DEFAULT_ROOMS, at, member)[member.nik].notes, 'Catatan')
})

test('an existing interview can finish in its now-disabled room while preserving the recorded appointment and actual start', () => {
 const member = person(1), entry = appointment(member.nik, { status: 'Di room', verified: true, startedAt: '2026-10-19T01:00:00.000Z', notes: 'Catatan awal' })
 const entries = { [member.nik]: entry }, rooms = DEFAULT_ROOMS.map(room => room.id === entry.roomId ? { ...room, enabled: false } : room)
 const before = structuredClone({ entries, rooms })
 const result = updateEntry(member.nik, { status: 'Selesai', notes: 'Selesai; room dinonaktifkan' }, entries, rooms, at, member)
 assert.equal(result[member.nik].status, 'Selesai')
 assert.equal(result[member.nik].finishedAt, at)
 assert.equal(result[member.nik].startedAt, entry.startedAt)
 assert.equal(result[member.nik].roomId, entry.roomId)
 assert.equal(result[member.nik].date, entry.date)
 assert.equal(result[member.nik].time, entry.time)
 assert.equal(result[member.nik].notes, 'Selesai; room dinonaktifkan')
 assert.deepEqual({ entries, rooms }, before)
})

test('disabled-room completion exception does not permit schedule changes, fresh starts, new assignments, or missing actual start', () => {
 const member = person(1), rooms = DEFAULT_ROOMS.map(room => room.id === 'room-1' ? { ...room, enabled: false } : room)
 const active = { [member.nik]: appointment(member.nik, { status: 'Di room', verified: true, startedAt: '2026-10-19T01:00:00.000Z' }) }
 for (const patch of [{ date: '2026-10-20' }, { time: '08:45' }, { session: 2 }, { duration: 45 }]) {
  assert.throws(() => updateEntry(member.nik, { status: 'Selesai', ...patch }, active, rooms, at, member), /room aktif/)
 }
 const scheduled = { [member.nik]: appointment(member.nik, { verified: true }) }
 assert.throws(() => updateEntry(member.nik, { status: 'Di room' }, scheduled, rooms, at, member), /room aktif/)
 assert.throws(() => updateEntry(member.nik, appointment(member.nik), {}, rooms, at, member), /room aktif/)
 assert.throws(() => updateEntry(member.nik, { roomId: 'room-1', status: 'Selesai' }, { [member.nik]: { ...active[member.nik], roomId: 'room-2' } }, rooms, at, member), /room aktif/)
 for (const startedAt of ['', 'invalid-time']) {
  assert.throws(() => updateEntry(member.nik, { status: 'Selesai' }, { [member.nik]: { ...active[member.nik], startedAt } }, rooms, at, member), /Mulai wawancara/)
 }
})

test('bulk keep-schedule rejects a wrong heavy destination atomically even when the old assignment is identical', () => {
 const heavy = person(1), regular = person(2, 'Sedang'), population = [regular, heavy]
 const entries = { [regular.nik]: appointment(regular.nik, { roomId: 'room-6', time: '08:45', session: 2, notes: 'Tetap' }), [heavy.nik]: appointment(heavy.nik, { roomId: 'room-5', verified: true, notes: 'Jangan dihapus' }) }
 const before = structuredClone({ population, entries })
 assert.throws(() => bulk(population, { entries, roomIds: ['room-5'], mode: 'keepSchedule' }), /Berat.*Itjen atau OSDM/)
 assert.throws(() => bulk([heavy], { entries, roomIds: ['room-5'], mode: 'keepSchedule' }), /Berat.*Itjen atau OSDM/)
 const corrected = bulk([heavy], { entries, roomIds: ['room-2'], mode: 'keepSchedule' })
 assert.equal(corrected.entries[heavy.nik].roomId, 'room-2')
 assert.equal(corrected.entries[heavy.nik].notes, 'Jangan dihapus')
 assert.equal(corrected.entries[regular.nik], entries[regular.nik])
 assert.deepEqual({ population, entries }, before)
})

test('bulk rescheduling applies the same heavy routing and retains operational notes', () => {
 const heavy = person(1), regular = person(2, 'Ringan', 'Berat'), entries = { [heavy.nik]: appointment(heavy.nik, { roomId: 'room-5', notes: 'Pendamping diperlukan' }) }
 const result = bulk([regular, heavy], { entries, roomIds: ['room-3', 'room-5'] })
 assert.equal(result.entries[heavy.nik].roomId, 'room-3')
 assert.equal(result.entries[heavy.nik].notes, 'Pendamping diperlukan')
 assert.equal(result.entries[regular.nik].roomId, 'room-5')
 assert.throws(() => bulk([heavy], { entries, roomIds: ['room-5'] }), /Pairing Sekjen asli.*Itjen atau OSDM/)
})

test('import returns a row-specific heavy routing error and atomically preserves all entries and source categories', () => {
 const heavy = person(1), regular = person(2, 'Ringan', 'Berat'), population = [heavy, regular]
 const entries = { [heavy.nik]: appointment(heavy.nik, { roomId: 'room-5', notes: 'Riwayat', verified: true }) }, before = structuredClone({ population, entries })
 const result = prepareScheduleImport({ population, entries, rows: [importRow(regular, { room: 'Room 6' }), importRow(heavy, { rowNumber: 17, room: 'Room 5' })] })
 assert.equal(result.entries, null)
 assert.deepEqual(result.changes, [])
 assert.deepEqual(result.assignments, [])
 assert.ok(result.errors.some(error => error.rowNumber === 17 && /Berat.*Itjen atau OSDM/.test(error.message)))
 const corrected = prepareScheduleImport({ population, entries, rows: [importRow(heavy, { nik: undefined, nip: heavy.nip, room: undefined, interviewer: 'OSDM 2' }), importRow(regular, { room: 'Room 5' })] })
 assert.deepEqual(corrected.errors, [])
 assert.equal(corrected.entries[heavy.nik].roomId, 'room-4')
 assert.equal(corrected.entries[heavy.nik].notes, 'Riwayat')
 assert.equal(corrected.entries[regular.nik].roomId, 'room-5')
 assert.deepEqual({ population, entries }, before)
})

test('BNBA exports append the original category and its validation source while preserving identifier columns', () => {
 const member = person(1, 'Berat', 'Ringan')
 member.historical.status = 'Perlu validasi'
 const entries = { [member.nik]: appointment(member.nik) }, before = structuredClone(member)
 const csv = monitoringCsv([member], entries, DEFAULT_ROOMS), lines = csv.trimEnd().split('\r\n')
 assert.ok(lines[0].endsWith(';"Kategori Pairing Sekjen asli";"Acuan kategori"'))
 assert.ok(lines[1].endsWith(';"Berat";"Pairing Sekjen asli — perlu validasi"'))
 assert.equal(lines[1].split(';')[4], `"'${member.nip}"`)
 assert.equal(lines[1].split(';')[5], `"'${member.nik}"`)
 assert.equal(interviewerPackages({ population: [member], entries })[0].rowsCsv, csv)
 assert.deepEqual(member, before)
})
