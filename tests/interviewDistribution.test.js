import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_ROOMS, createSchedule } from '../src/interviews/model.js'
import { prepareBulkDistribution, prepareScheduleImport, scheduleImportTemplateCsv, interviewerPackages } from '../src/interviews/distribution.js'

const people = count => Array.from({ length: count }, (_, index) => ({ nik: String(index + 1).padStart(16, '0'), nip: String(index + 1).padStart(18, '0'), nama: `Peserta ${index + 1}`, hasilPenilaian: 'Terbukti' }))
const settings = { startDate: '2026-10-19', startTime: '08:00', duration: 40, gap: 5, perDay: 11, skipWeekends: true }
const appointment = (nik, patch = {}) => ({ nik, date: '2026-10-19', time: '08:00', session: 1, duration: 40, roomId: 'room-1', status: 'Terjadwal', ...patch })
const importRow = (person, patch = {}) => ({ nik: person.nik, date: '2026-10-19', time: '08:00', session: 1, duration: 40, room: 'Room 1', ...patch })
const asEntries = values => Object.fromEntries(values.map(value => [value.nik, value]))
const bulk = (population, extra = {}) => prepareBulkDistribution({ population, selectedIds: population.map(person => person.nik), roomIds: ['room-1'], settings, ...extra })
const imported = (population, rows, extra = {}) => prepareScheduleImport({ population, rows, ...extra })

test('bulk scheduling distributes only the selected SDM among selected rooms at eleven per room per day', () => {
 const population = people(1057), selected = population.slice(0, 47), original = { population, rooms: DEFAULT_ROOMS, settings }
 const before = JSON.stringify(original)
 const result = bulk(population, { selectedIds: selected.map(person => person.nik), roomIds: ['room-2', 'room-4'] })
 assert.equal(result.assignments.length, 47)
 assert.equal(Object.keys(result.entries).length, 47)
 assert.deepEqual(result.summary.byDate, [{ date: '2026-10-19', count: 22 }, { date: '2026-10-20', count: 22 }, { date: '2026-10-21', count: 3 }])
 assert.equal(result.summary.rooms, 2)
 assert.equal(result.summary.days, 3)
 assert.equal(result.changes.length, 47)
 assert.ok(result.assignments.every(row => ['room-2', 'room-4'].includes(row.roomId) && row.status === 'Terjadwal' && row.verified === false && row.startedAt === '' && row.finishedAt === ''))
 assert.equal(JSON.stringify(original), before)
})

test('rescheduling preserves untouched records and operational notes while resetting changed assignments', () => {
 const population = people(3)
 const first = appointment(population[0].nik, { status: 'Menunggu', verified: true, notes: 'Perlu pendamping', leader: 'Pimpinan A', zoomName: 'Zoom satu', startedAt: '2026-10-19T01:00:00Z', finishedAt: '2026-10-19T01:40:00Z' })
 const untouched = appointment(population[1].nik, { roomId: 'room-3', status: 'Di room', verified: true, notes: 'Jangan ubah' })
 const entries = asEntries([first, untouched]), before = JSON.stringify(entries)
 const result = bulk(population, { selectedIds: [first.nik], entries, roomIds: ['room-2'] })
 assert.equal(result.entries[untouched.nik], untouched)
 assert.equal(result.entries[first.nik].notes, first.notes)
 assert.equal(result.entries[first.nik].leader, first.leader)
 assert.equal(result.entries[first.nik].zoomName, first.zoomName)
 assert.equal(result.entries[first.nik].verified, false)
 assert.equal(result.entries[first.nik].startedAt, '')
 assert.equal(result.entries[first.nik].finishedAt, '')
 assert.equal(result.changes[0].before, first)
 assert.equal(result.changes[0].after, result.entries[first.nik])
 assert.equal(JSON.stringify(entries), before)
})

test('unchanged bulk assignments keep verification, status, and existing record object', () => {
 const population = people(1), entry = appointment(population[0].nik, { status: 'Menunggu', verified: true, notes: 'Tetap', startedAt: '', finishedAt: '' })
 const result = bulk(population, { entries: { [entry.nik]: entry } })
 assert.equal(result.entries[entry.nik], entry)
 assert.equal(result.assignments[0], entry)
 assert.equal(result.summary.changed, 0)
 assert.equal(result.summary.unchanged, 1)
 assert.deepEqual(result.changes, [])
})

test('keepSchedule moves multiple appointments to one interviewer without shifting their date or time', () => {
 const population = people(2), entries = asEntries(population.map((person, index) => appointment(person.nik, { time: index ? '08:45' : '08:00', session: index + 1, notes: `catatan-${index}` })))
 const result = bulk(population, { entries, roomIds: ['room-2'], mode: 'keepSchedule' })
 assert.deepEqual(result.assignments.map(row => [row.date, row.time, row.session, row.duration, row.roomId]), [['2026-10-19', '08:00', 1, 40, 'room-2'], ['2026-10-19', '08:45', 2, 40, 'room-2']])
 assert.equal(result.summary.changed, 2)
 assert.equal(result.entries[population[1].nik].notes, 'catatan-1')
 assert.throws(() => bulk(population, { entries, roomIds: ['room-1', 'room-2'], mode: 'keepSchedule' }), /tepat satu/)
 assert.throws(() => bulk(population, { entries: {}, mode: 'keepSchedule' }), /memiliki jadwal/)
})

test('keepSchedule rejects overlapping selected appointments and existing room or primary interviewer conflicts atomically', () => {
 const population = people(3), selectedIds = population.slice(0, 2).map(person => person.nik)
 const entries = asEntries(population.map((person, index) => appointment(person.nik, { roomId: `room-${index + 1}` }))), before = JSON.stringify(entries)
 assert.throws(() => bulk(population, { entries, selectedIds, roomIds: ['room-4'], mode: 'keepSchedule' }), /beririsan/)
 assert.throws(() => bulk(population, { entries, selectedIds: [population[0].nik], roomIds: ['room-3'], mode: 'keepSchedule' }), /beririsan/)
 const rooms = DEFAULT_ROOMS.map(room => room.id === 'room-4' ? { ...room, interviewer: DEFAULT_ROOMS[2].interviewer } : room)
 assert.throws(() => bulk(population, { entries, rooms, selectedIds: [population[0].nik], roomIds: ['room-4'], mode: 'keepSchedule' }), /Pewawancara utama/)
 assert.equal(JSON.stringify(entries), before)
})

test('rescheduling detects an interviewer already occupied in a room outside the selected subset', () => {
 const population = people(2), rooms = DEFAULT_ROOMS.map(room => room.id === 'room-2' ? { ...room, interviewer: DEFAULT_ROOMS[0].interviewer } : room)
 const entries = { [population[1].nik]: appointment(population[1].nik, { roomId: 'room-2' }) }
 const result = bulk(population, { rooms, entries, selectedIds: [population[0].nik] })
 assert.equal(result.assignments[0].time, '08:45')
 assert.equal(result.entries[population[1].nik], entries[population[1].nik])
})

test('protected participants, duplicate selection, unknown identities, nonTerbukti, and inactive rooms reject the whole bulk change', () => {
 const population = people(2), selectedIds = population.map(person => person.nik)
 for (const status of ['Di room', 'Selesai']) {
  const entries = { [population[1].nik]: appointment(population[1].nik, { status }) }, before = JSON.stringify(entries)
  assert.throws(() => bulk(population, { entries, selectedIds }), /Di room atau Selesai/)
  assert.equal(JSON.stringify(entries), before)
 }
 assert.throws(() => bulk(population, { selectedIds: [population[0].nik, population[0].nik] }), /lebih dari sekali/)
 assert.throws(() => bulk(population, { selectedIds: ['9999999999999999'] }), /tidak ditemukan/)
 assert.throws(() => bulk([{ ...population[0], hasilPenilaian: 'Tidak Terbukti' }]), /Terbukti/)
 assert.throws(() => bulk(population, { roomIds: ['missing'] }), /room aktif/)
 assert.throws(() => bulk(population, { rooms: DEFAULT_ROOMS.map(room => ({ ...room, enabled: false })) }), /room aktif/)
 assert.throws(() => bulk(population, { selectedIds: [] }), /setidaknya satu SDM/)
 assert.throws(() => bulk(population, { roomIds: ['room-1', 'room-1'] }), /unik/)
})

test('optional daily cap is per room across existing and imported assignments', () => {
 const population = people(3), entries = { [population[2].nik]: appointment(population[2].nik, { time: '10:00', session: 3 }) }
 const rows = [importRow(population[0]), importRow(population[1], { time: '08:45', session: 2 })]
 const result = imported(population, rows, { entries, settings: { perDay: 2 } })
 assert.equal(result.entries, null)
 assert.match(result.errors[0].message, /batas 2 responden per room per hari/)
 assert.equal(imported(population, rows, { entries }).errors.length, 0)
 assert.throws(() => bulk(population, { entries, selectedIds: population.slice(0, 2).map(person => person.nik), mode: 'keepSchedule', settings: { perDay: 0 } }), /bilangan bulat|memiliki jadwal/)
})

test('import matches exact textual NIK/NIP, validates optional names, and accepts normalized room references', () => {
 const population = people(3)
 const rows = [
  importRow(population[0], { nik: undefined, nip: population[0].nip, nama: '  PESERTA   1 ', room: '  ROOM   1 ', interviewer: ' itjen 1 ' }),
  importRow(population[1], { nip: population[1].nip, room: undefined, roomId: 'ROOM-2', interviewer: 'ITJEN 2' }),
  importRow(population[2], { room: undefined, interviewer: 'OSDM 1', duration: '45', session: '2' })
 ]
 const result = imported(population, rows)
 assert.deepEqual(result.errors, [])
 assert.deepEqual(result.assignments.map(row => row.roomId), ['room-1', 'room-2', 'room-3'])
 assert.equal(result.assignments[2].duration, 45)
 assert.equal(result.assignments[2].session, 2)
 assert.equal(result.summary.changed, 3)
 assert.ok(result.assignments.every(row => !Object.hasOwn(row, 'nama') && !Object.hasOwn(row, 'nip')))
})

test('import permits atomic swaps by vacating all selected old appointments first', () => {
 const population = people(3), original = asEntries([appointment(population[0].nik, { notes: 'Satu', verified: true }), appointment(population[1].nik, { roomId: 'room-2', notes: 'Dua' }), appointment(population[2].nik, { roomId: 'room-3', status: 'Di room', verified: true })])
 const before = JSON.stringify(original)
 const result = imported(population, [importRow(population[0], { room: 'Room 2' }), importRow(population[1], { room: 'Room 1' })], { entries: original })
 assert.deepEqual(result.errors, [])
 assert.equal(result.entries[population[0].nik].roomId, 'room-2')
 assert.equal(result.entries[population[1].nik].roomId, 'room-1')
 assert.equal(result.entries[population[0].nik].notes, 'Satu')
 assert.equal(result.entries[population[0].nik].verified, false)
 assert.equal(result.entries[population[2].nik], original[population[2].nik])
 assert.equal(JSON.stringify(original), before)
})

test('an identical imported assignment preserves operational state; notes alone do not reset verification', () => {
 const population = people(1), entry = appointment(population[0].nik, { status: 'Menunggu', verified: true, notes: 'Lama', zoomName: 'Nama Zoom', startedAt: '', finishedAt: '' }), entries = { [entry.nik]: entry }
 const unchanged = imported(population, [importRow(population[0])], { entries })
 assert.equal(unchanged.entries[entry.nik], entry)
 assert.equal(unchanged.summary.changed, 0)
 const edited = imported(population, [importRow(population[0], { notes: 'Baru' })], { entries })
 assert.equal(edited.entries[entry.nik].notes, 'Baru')
 assert.equal(edited.entries[entry.nik].status, 'Menunggu')
 assert.equal(edited.entries[entry.nik].verified, true)
 assert.equal(edited.entries[entry.nik].zoomName, 'Nama Zoom')
 assert.equal(edited.summary.changed, 1)
})

test('import rejects identifiers that lost precision and mismatched or unknown identity without name-only matching', () => {
 const population = people(2)
 const cases = [
  { nik: 1 }, { nik: '1' }, { nik: '9999999999999999' },
  { nik: undefined, nip: 1 }, { nik: undefined, nip: '1' }, { nik: undefined, nip: '999999999999999999' },
  { nip: population[1].nip }, { nama: 'Nama berbeda' }, { nik: undefined, nama: population[0].nama }
 ]
 for (const patch of cases) {
  const result = imported(population, [importRow(population[0], { ...patch, rowNumber: 12 })])
  assert.equal(result.entries, null, JSON.stringify(patch))
  assert.equal(result.assignments.length, 0)
  assert.equal(result.errors[0].rowNumber, 12)
 }
 const nonTerbukti = [{ ...population[0], hasilPenilaian: 'Tidak Terbukti' }]
 assert.equal(imported(nonTerbukti, [importRow(nonTerbukti[0])]).entries, null)
})

test('import rejects duplicate NIK/NIP population references and repeated participant rows', () => {
 const population = people(2)
 const duplicateRows = imported(population, [importRow(population[0]), importRow(population[0], { time: '08:45' })])
 assert.equal(duplicateRows.entries, null)
 assert.match(duplicateRows.errors[0].message, /lebih dari sekali/)
 assert.match(imported([population[0], { ...population[0] }], [importRow(population[0])]).errors[0].message, /NIK ganda/)
 const duplicateNip = [population[0], { ...population[1], nip: population[0].nip }]
 assert.match(imported(duplicateNip, [importRow(population[0], { nik: undefined, nip: population[0].nip })]).errors[0].message, /NIP ganda/)
})

test('room/interviewer mismatches, ambiguous rooms, and disabled destinations are import row errors', () => {
 const population = people(1)
 for (const patch of [{ room: 'Room tidak ada' }, { room: 'Room 1', roomId: 'room-2' }, { interviewer: 'Itjen 2' }, { room: undefined, interviewer: 'Tidak dikenal' }, { room: undefined }]) {
  const result = imported(population, [importRow(population[0], patch)])
  assert.equal(result.entries, null)
  assert.equal(result.errors.length, 1)
 }
 const disabled = DEFAULT_ROOMS.map(room => room.id === 'room-1' ? { ...room, enabled: false } : room)
 assert.match(imported(population, [importRow(population[0])], { rooms: disabled }).errors[0].message, /tidak aktif/)
 const samePrimary = DEFAULT_ROOMS.map(room => room.id === 'room-2' ? { ...room, interviewer: 'Itjen 1' } : room)
 assert.match(imported(population, [importRow(population[0], { room: undefined, interviewer: 'Itjen 1' })], { rooms: samePrimary }).errors[0].message, /beberapa room/)
 assert.deepEqual(imported(population, [importRow(population[0], { interviewer: 'Itjen 1' })], { rooms: samePrimary }).errors, [])
 const sameName = DEFAULT_ROOMS.map(room => room.id === 'room-2' ? { ...room, name: 'Room 1' } : room)
 assert.match(imported(population, [importRow(population[0])], { rooms: sameName }).errors[0].message, /ambigu/)
})

test('invalid dates/times, midnight overflow, protected records, and existing clashes block all imported changes', () => {
 const population = people(3), untouched = appointment(population[2].nik), entries = { [untouched.nik]: untouched }, before = JSON.stringify(entries)
 const rows = [importRow(population[0], { room: 'Room 2' }), importRow(population[1], { rowNumber: 8 })]
 const conflict = imported(population, rows, { entries })
 assert.equal(conflict.entries, null)
 assert.equal(conflict.changes.length, 0)
 assert.ok(conflict.errors.some(error => error.rowNumber === 8 && /beririsan/.test(error.message)))
 assert.equal(JSON.stringify(entries), before)
 for (const patch of [{ date: '2026-02-30' }, { time: '25:00' }, { time: '23:40', duration: 40 }, { duration: -5 }, { session: 0 }, { notes: 'x'.repeat(10001) }]) assert.equal(imported(population, [importRow(population[0], patch)]).entries, null)
 for (const status of ['Di room', 'Selesai']) assert.match(imported(population, [importRow(population[0])], { entries: { [population[0].nik]: appointment(population[0].nik, { status }) } }).errors[0].message, /Di room atau Selesai/)
})

test('simultaneous imported appointments cannot share a room or primary interviewer', () => {
 const population = people(2), roomConflict = imported(population, population.map(person => importRow(person)))
 assert.equal(roomConflict.entries, null)
 assert.match(roomConflict.errors[0].message, /Room sudah terpakai/)
 const rooms = DEFAULT_ROOMS.map(room => room.id === 'room-2' ? { ...room, interviewer: 'ITJEN 1' } : room)
 const primaryConflict = imported(population, [importRow(population[0]), importRow(population[1], { room: 'Room 2' })], { rooms })
 assert.equal(primaryConflict.entries, null)
 assert.match(primaryConflict.errors[0].message, /Pewawancara utama/)
})

test('exports give each primary interviewer only their assigned BNBA with safe identifiers and spreadsheet formulas', () => {
 const population = people(5)
 population[0].nama = '=FORMULA'
 const rooms = DEFAULT_ROOMS.map(room => room.id === 'room-2' ? { ...room, interviewer: ' itjen   1 ' } : room)
 const entries = asEntries([appointment(population[0].nik, { notes: '@formula', roomId: 'room-1' }), appointment(population[1].nik, { time: '08:45', roomId: 'room-2' }), appointment(population[2].nik, { roomId: 'room-3' }), appointment(population[3].nik, { roomId: 'room-3', status: 'Jadwal ulang' })])
 const before = JSON.stringify({ population, entries, rooms }), packages = interviewerPackages({ population, entries, rooms })
 assert.equal(packages.length, 2)
 const itjen = packages.find(group => group.interviewer === 'Itjen 1')
 assert.equal(itjen.count, 2)
 assert.deepEqual(itjen.roomNames, ['Room 1', 'Room 2'])
 assert.ok(itjen.rowsCsv.includes(`"'${population[0].nik}"`))
 assert.ok(itjen.rowsCsv.includes(`"'${population[0].nip}"`))
 assert.ok(itjen.rowsCsv.includes('"\'=FORMULA"'))
 assert.ok(itjen.rowsCsv.includes('"\'@formula"'))
 assert.ok(!itjen.rowsCsv.includes(population[2].nik))
 assert.ok(!itjen.rowsCsv.includes(population[3].nik))
 assert.ok(!itjen.rowsCsv.includes(population[4].nik))
 assert.ok(packages.every(group => /^BNBA-\d{2}-[\p{L}\p{N}._-]+\.csv$/u.test(group.filename)))
 assert.equal(new Set(packages.map(group => group.filename)).size, 2)
 assert.equal(JSON.stringify({ population, entries, rooms }), before)
})

test('import template uses documented headers without embedding simulated identities', () => {
 const template = scheduleImportTemplateCsv()
 assert.ok(template.startsWith('\uFEFF"NIK";"NIP";"Nama";"Tanggal";"Jadwal";"Sesi";"Room";"Pewawancara Utama";"Durasi (menit)";"Catatan"'))
 assert.equal(template.split('\r\n').filter(Boolean).length, 1)
})

test('existing daily capacity and weekends are respected during bulk rescheduling', () => {
 const population = people(13), previous = asEntries(createSchedule(population.slice(0, 11), {}, DEFAULT_ROOMS.slice(0, 1), { ...settings, startDate: '2026-10-23' }))
 const result = bulk(population, { selectedIds: population.slice(11).map(person => person.nik), entries: previous, settings: { ...settings, startDate: '2026-10-23' } })
 assert.ok(result.assignments.every(row => row.date === '2026-10-26'))
 assert.ok(Object.keys(previous).every(nik => result.entries[nik] === previous[nik]))
})
