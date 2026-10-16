import test from 'node:test'
import assert from 'node:assert/strict'
import {DEFAULT_RULES, analyzeDiscipline} from '../src/judol/analysis.js'

const nik = '1234567890123456'
const person = {nik, nama: 'ASN Uji Validasi', nip: '123456789012345678', hasilPenilaian: 'Terbukti', hasilAsli: 'Terbukti', keterangan: '', baris: 2}

test('anomalous transaction causes Perlu validasi until corrected with reason and evidence', () => {
  // Raw transaction with invalid date and invalid time on row 5
  const rawTx = {
    nik,
    date: null, // invalid date
    time: null, // invalid time
    timeRaw: '??',
    amount: null, // invalid amount
    row: 5,
    duplicate: false,
    identityConflict: false
  }

  const sourceData = {
    people: [person],
    history: {[nik]: {frekuensi: 10, nominal: 1000000, kategori: 'Sedang', total: 35, sourceRow: 2}},
    transactions: [rawTx],
    audits: [
      {type: 'invalid-date', nik, message: 'Tanggal transaksi tidak valid; kedua periode perlu validasi.', row: 5},
      {type: 'invalid-amount', nik, message: 'Nominal transaksi tidak valid; total nominal hanya mencakup nilai yang terbaca.', row: 5}
    ],
    metadata: {transactionCount: 1}
  }

  // 1. Initial analysis without corrections
  const initial = analyzeDiscipline(sourceData)
  const initialRow = initial.rows[0]
  assert.equal(initialRow.after.kategori, 'Perlu validasi')
  assert.equal(initialRow.hasilPenilaian, 'Terbukti') // Unchanged!
  assert.equal(initial.stats.pendingAudits > 0, true)

  // 2. Apply corrections with reason, evidenceRef, and resolvedBy
  const correction = {
    id: 'corr-5',
    row: 5,
    nik,
    type: 'invalid-time',
    field: 'all',
    correctedDate: '2025-10-15',
    correctedTime: '08:30:00',
    correctedAmount: 150000,
    reason: 'Konfirmasi mutasi rekening koran dan BAP pemeriksa tanggal 16 Oktober',
    evidenceRef: 'BAP No. 45/KP.06/2026',
    resolved: true,
    resolvedBy: 'Tim Pemeriksa PSNK',
    resolvedAt: '2026-10-16T20:00:00Z',
    history: [
      {
        updatedAt: '2026-10-16T20:00:00Z',
        updatedBy: 'Tim Pemeriksa PSNK',
        previousValue: 'date: null, time: ??, amount: null',
        newValue: 'date: 2025-10-15, time: 08:30:00, amount: 150000',
        reason: 'Konfirmasi mutasi rekening koran dan BAP pemeriksa tanggal 16 Oktober',
        evidenceRef: 'BAP No. 45/KP.06/2026'
      }
    ]
  }

  const correctedSource = {
    ...sourceData,
    corrections: [correction]
  }

  const correctedResult = analyzeDiscipline(correctedSource)
  const correctedRow = correctedResult.rows[0]

  // Period after cutoff is now valid and categorized cleanly!
  assert.equal(correctedRow.after.frekuensi, 1)
  assert.equal(correctedRow.after.nominal, 150000)
  assert.equal(correctedRow.after.kategori, 'Ringan')
  assert.equal(typeof correctedRow.after.total, 'number')
  // CRITICAL: Terbukti remains Terbukti!
  assert.equal(correctedRow.hasilPenilaian, 'Terbukti')

  // Audits are marked as resolved
  const resolvedAudits = correctedResult.audits.filter(a => a.resolved)
  assert.equal(resolvedAudits.length > 0, true)
  assert.equal(resolvedAudits[0].resolution.reason, correction.reason)
  assert.equal(resolvedAudits[0].resolution.evidenceRef, correction.evidenceRef)
  assert.equal(resolvedAudits[0].resolution.resolvedBy, correction.resolvedBy)
})

test('handling duplicate and identity conflict overrides restores valid category without touching hasilPenilaian', () => {
  const nikConflict = '1122334455667788'
  const personConflict = {nik: nikConflict, nama: 'Pegawai Konflik Identitas', nip: '198001012010011001', hasilPenilaian: 'Tidak Terbukti', hasilAsli: 'Tidak Terbukti', keterangan: '', baris: 3}
  const rawTx = {
    nik: nikConflict,
    date: '2025-10-15',
    time: '10:00:00',
    timeRaw: '10:00:00',
    amount: 500000,
    row: 10,
    duplicate: true,
    identityConflict: true
  }

  const sourceData = {
    people: [personConflict],
    history: {[nikConflict]: {frekuensi: 1, nominal: 500000, kategori: 'Ringan', total: 10, sourceRow: 3}},
    transactions: [rawTx],
    audits: [
      {type: 'duplicate-transaction', nik: nikConflict, message: 'Nomor transaksi sumber berulang', row: 10},
      {type: 'identity-conflict', nik: nikConflict, message: 'NIK kolom B berbeda dari NIK_PEMAIN', row: 10}
    ],
    metadata: {transactionCount: 1}
  }

  const initial = analyzeDiscipline(sourceData)
  assert.equal(initial.rows[0].after.kategori, 'Perlu validasi')
  assert.equal(initial.rows[0].hasilPenilaian, 'Tidak Terbukti') // Unchanged!

  // Apply ignoreDuplicate & ignoreIdentityConflict correction
  const correction = {
    id: 'corr-10',
    row: 10,
    nik: nikConflict,
    type: 'identity-conflict',
    ignoreDuplicate: true,
    ignoreIdentityConflict: true,
    reason: 'Verifikasi bank mengonfirmasi NIK_PEMAIN adalah rekening tabungan sah ybs dan bukan mutasi ganda',
    evidenceRef: 'Surat Keterangan Bank No. SK/098/2026',
    resolved: true,
    resolvedBy: 'Auditor Disiplin',
    resolvedAt: '2026-10-16T21:00:00Z',
    history: [{updatedAt: '2026-10-16T21:00:00Z', updatedBy: 'Auditor Disiplin', reason: 'Koreksi terverifikasi'}]
  }

  const corrected = analyzeDiscipline({...sourceData, corrections: [correction]})
  assert.equal(corrected.rows[0].after.kategori, 'Ringan')
  assert.equal(corrected.rows[0].hasilPenilaian, 'Tidak Terbukti') // Still unchanged!
  assert.equal(corrected.metadata.corrections.length, 1)
})

