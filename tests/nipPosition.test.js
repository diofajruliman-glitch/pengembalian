import test from 'node:test'
import assert from 'node:assert/strict'
import { lookupNipPosition, NIP_POSITION_REFERENCE } from '../src/letters/nipPositionReference.js'
import { LETTER_TYPES } from '../src/letters/templates.js'

test('lookupNipPosition returns exact jabatan and pangkat from reference dataset', () => {
  // Test Hermawan Kurnia
  const p1 = lookupNipPosition('198807152025211094')
  assert.ok(p1)
  assert.equal(p1.nama, 'Hermawan Kurnia')
  assert.equal(p1.jabatan, 'Penata Layanan Operasional')
  assert.equal(p1.pangkat, 'Golongan IX')
  assert.equal(p1.golongan, 'IX')

  // Test with spaces in NIP
  const p1WithSpaces = lookupNipPosition('19880715 202521 1 094')
  assert.deepEqual(p1WithSpaces, p1)

  // Test Ramadhan Syah (Pengelola Layanan Operasional - Golongan VII)
  const p2 = lookupNipPosition('199004252025211054')
  assert.ok(p2)
  assert.equal(p2.nama, 'Ramadhan Syah')
  assert.equal(p2.jabatan, 'Pengelola Layanan Operasional')
  assert.equal(p2.pangkat, 'Golongan VII')

  // Total records mapped
  const totalKeys = Object.keys(NIP_POSITION_REFERENCE).length
  assert.ok(totalKeys >= 1056, `Expected at least 1056 records, got ${totalKeys}`)
})

test('Summons templates have showRank enabled by default', () => {
  const summons = LETTER_TYPES.filter(t => t.id.startsWith('panggilan'))
  assert.ok(summons.length >= 3)
  for (const t of summons) {
    assert.equal(t.showRank, true, `Template ${t.id} should have showRank: true`)
  }
})
