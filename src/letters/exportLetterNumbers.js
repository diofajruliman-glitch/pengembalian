// src/letters/exportLetterNumbers.js

/**
 * Menyusun struktur sheet data rekap nomor surat untuk ekspor ke Excel
 * @param {Array} recipients - Daftar penerima surat yang aktif
 * @param {Object} options - Opsi tambahan (templateName, letterDate, official, dll)
 * @returns {Array} Struktur sheets untuk write-excel-file
 */
export function buildLetterNumbersExportSheets(recipients, options = {}) {
  const templateName = options.templateName || 'Surat Pemanggilan Disiplin ASN'
  const letterDate = options.letterDate || '15 Oktober 2026'
  const officialName = options.official?.nama || 'Faisal'
  const officialNip = options.official?.nip || '19761106 200502 1 001'
  const officialJabatan = options.official?.jabatan || 'Direktur Perlindungan Sosial Non Kebencanaan'

  const headers = [
    'No.',
    'Nomor Surat',
    'NIP / NIPPPK',
    'Nama SDM',
    'Pangkat / Golongan',
    'Jabatan',
    'Unit Kerja',
    'Perihal Surat',
    'Tanggal Surat',
    'Hari Pelaksanaan',
    'Tanggal Pelaksanaan',
    'Jam Pelaksanaan / Sesi',
    'Ruang / Breakout',
    'Petugas Pewawancara',
    'Tautan Zoom',
    'Pejabat Penandatangan',
    'NIP Penandatangan'
  ]

  const headerRow = headers.map(h => ({
    value: h,
    type: String,
    fontWeight: 'bold',
    backgroundColor: '#0284C7',
    color: '#FFFFFF',
    align: 'center',
    wrap: true
  }))

  const dataRows = (recipients || []).map((r, idx) => {
    const rawNo = idx + 1
    const rawNum = String(r.letterNumber || '')
    const rawNip = String(r.nip || r.nik || '')
    const rawNama = String(r.nama || '')
    const rawPangkat = String(r.pangkat || '')
    const rawJabatan = String(r.jabatan || '')
    const rawUnit = String(r.unitKerja || 'Direktorat Perlindungan Sosial Non Kebencanaan')
    const rawPerihal = String(templateName)
    const rawTglSurat = String(r.letterDate || letterDate)
    const rawHari = String(r.sessionHari || r.hari || 'Senin')
    const rawTgl = String(r.sessionTanggal || r.tanggal || '26 Oktober 2026')
    const rawJam = String(r.sessionJam || r.jam || '08.30–12.00 WIB')
    const rawRoom = String(r.sessionRoom || r.room || '')
    const rawPetugas = String(r.sessionPetugas || r.petugas || '')
    const rawZoom = String(r.sessionLinkZoom || r.linkZoom || '')

    return [
      { value: rawNo, type: Number, align: 'center' },
      { value: rawNum, type: String, fontWeight: 'bold' },
      { value: rawNip, type: String },
      { value: rawNama, type: String },
      { value: rawPangkat, type: String },
      { value: rawJabatan, type: String },
      { value: rawUnit, type: String },
      { value: rawPerihal, type: String },
      { value: rawTglSurat, type: String, align: 'center' },
      { value: rawHari, type: String, align: 'center' },
      { value: rawTgl, type: String, align: 'center' },
      { value: rawJam, type: String },
      { value: rawRoom, type: String, align: 'center' },
      { value: rawPetugas, type: String },
      { value: rawZoom, type: String },
      { value: officialName, type: String },
      { value: officialNip, type: String }
    ]
  })

  const columns = [
    { width: 6 },  // No
    { width: 34 }, // Nomor Surat
    { width: 24 }, // NIP
    { width: 30 }, // Nama SDM
    { width: 24 }, // Pangkat
    { width: 28 }, // Jabatan
    { width: 38 }, // Unit Kerja
    { width: 42 }, // Perihal
    { width: 18 }, // Tanggal Surat
    { width: 14 }, // Hari
    { width: 20 }, // Tanggal
    { width: 36 }, // Jam Pelaksanaan / Sesi
    { width: 16 }, // Ruang
    { width: 24 }, // Petugas
    { width: 45 }, // Zoom
    { width: 28 }, // Pejabat
    { width: 24 }  // NIP Pejabat
  ]

  // Sheet 2: Ringkasan & Parameter
  const summaryRows = [
    [
      { value: 'PARAMETER EKSPOR REKAP NOMOR SURAT', type: String, fontWeight: 'bold', backgroundColor: '#E2E8F0', color: '#0F172A' },
      { value: '', type: String, backgroundColor: '#E2E8F0' }
    ],
    [{ value: 'Perihal Naskah Dinas', type: String, fontWeight: 'bold' }, { value: templateName, type: String }],
    [{ value: 'Jumlah SDM Penerima', type: String, fontWeight: 'bold' }, { value: Number(recipients?.length || 0), type: Number }],
    [{ value: 'Rentang Nomor Surat', type: String, fontWeight: 'bold' }, { value: recipients?.length ? `${recipients[0]?.letterNumber || '-'} s.d. ${recipients[recipients.length - 1]?.letterNumber || '-'}` : '-', type: String }],
    [{ value: 'Tanggal Naskah Surat', type: String, fontWeight: 'bold' }, { value: letterDate, type: String }],
    [{ value: 'Pejabat Penandatangan', type: String, fontWeight: 'bold' }, { value: `${officialName} (${officialJabatan})`, type: String }],
    [{ value: 'NIP Penandatangan', type: String, fontWeight: 'bold' }, { value: officialNip, type: String }],
    [{ value: 'Waktu Ekspor', type: String, fontWeight: 'bold' }, { value: new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) + ' WIB', type: String }]
  ]

  return [
    {
      sheet: 'Rekap Nomor Surat',
      columns,
      stickyRowsCount: 1,
      stickyColumnsCount: 4,
      data: [headerRow, ...dataRows]
    },
    {
      sheet: 'Ringkasan & Dasar',
      columns: [{ width: 28 }, { width: 60 }],
      stickyRowsCount: 1,
      data: summaryRows
    }
  ]
}

/**
 * Mengunduh file Excel rekap nomor surat secara langsung di browser
 */
export async function exportLetterNumbersToExcel(recipients, options = {}) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser')
  const sheets = buildLetterNumbersExportSheets(recipients, options)
  const count = recipients?.length || 0
  const fileName = options.fileName || `Rekap_Nomor_Surat_Kemensos_${count}_SDM.xlsx`

  await writeXlsxFile(sheets).toFile(fileName)
  return fileName
}
