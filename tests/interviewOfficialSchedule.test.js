import test from 'node:test'
import assert from 'node:assert/strict'
import {
  OFFICIAL_POPULATION_1057,
  OFFICIAL_INTERVIEWERS_19,
  OFFICIAL_ROOMS_19,
  OFFICIAL_SETTINGS_2026,
  buildOfficialEntries,
  createOfficialWorkspace
} from '../src/interviews/officialSchedule1057.js'
import { validateWorkspace } from '../src/interviews/storage.js'
import { validateAssignment, monitoringCsv } from '../src/interviews/model.js'

test('official schedule loads exactly 1057 participants and 19 breakout rooms', () => {
  assert.equal(OFFICIAL_POPULATION_1057.length, 1057)
  assert.equal(OFFICIAL_ROOMS_19.length, 19)
  assert.equal(OFFICIAL_INTERVIEWERS_19.length, 19)

  // Verify room interviewers match user prompt
  assert.equal(OFFICIAL_ROOMS_19[0].interviewer, 'Sekretariat Linjamsos')
  assert.equal(OFFICIAL_ROOMS_19[1].interviewer, 'Sekretariat Linjamsos 2')
  assert.equal(OFFICIAL_ROOMS_19[2].interviewer, 'TU 1')
  assert.equal(OFFICIAL_ROOMS_19[3].interviewer, 'TU 2')
  assert.equal(OFFICIAL_ROOMS_19[4].interviewer, 'Leo Suta')
  assert.equal(OFFICIAL_ROOMS_19[5].interviewer, 'Indra Maulana')
  assert.equal(OFFICIAL_ROOMS_19[15].interviewer, 'Astri')
  assert.equal(OFFICIAL_ROOMS_19[16].interviewer, 'Novie')
  assert.equal(OFFICIAL_ROOMS_19[17].interviewer, 'Dede Soleh')
  assert.equal(OFFICIAL_ROOMS_19[18].interviewer, 'Abi Setiadi Halim')
  assert.equal(OFFICIAL_ROOMS_19[0].trafficOfficer, 'Dio Fajrul Iman')
})

test('official settings conform to 26–29 October 2026 execution window', () => {
  assert.equal(OFFICIAL_SETTINGS_2026.startDate, '2026-10-26')
  assert.equal(OFFICIAL_SETTINGS_2026.startTime, '08:30')
  assert.equal(OFFICIAL_SETTINGS_2026.duration, 30)
  assert.equal(OFFICIAL_SETTINGS_2026.perDay, 14)
})

test('createOfficialWorkspace generates valid, conflict-free workspace for all 1057 participants', () => {
  const ws = createOfficialWorkspace()
  assert.equal(Object.keys(ws.entries).length, 1057)
  assert.equal(ws.rooms.length, 19)

  // Validate workspace structure
  const validated = validateWorkspace(ws)
  assert.equal(Object.keys(validated.entries).length, 1057)

  // Verify breakdown across the 4 dates
  const countByDate = {}
  for (const entry of Object.values(ws.entries)) {
    countByDate[entry.date] = (countByDate[entry.date] || 0) + 1
  }
  assert.deepEqual(countByDate, {
    '2026-10-26': 265,
    '2026-10-27': 264,
    '2026-10-28': 264,
    '2026-10-29': 264
  })

  // Validate every assignment has no conflicts
  const checked = {}
  for (const entry of Object.values(ws.entries)) {
    validateAssignment(entry, checked, ws.rooms)
    checked[entry.nik] = entry
  }
  assert.equal(Object.keys(checked).length, 1057)

  // Export monitoring CSV successfully
  const csv = monitoringCsv(OFFICIAL_POPULATION_1057, ws.entries, ws.rooms)
  assert.ok(csv.startsWith('\uFEFF"Tanggal";"Sesi"'))
  const lines = csv.trim().split('\r\n')
  assert.equal(lines.length, 1058) // 1 header + 1057 rows
})
