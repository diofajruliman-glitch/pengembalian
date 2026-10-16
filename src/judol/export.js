import {getTransactionAvailability, TRANSACTION_AVAILABILITY_LABELS, MISSING_DETAILS_LABEL, hasPairingCategoryReference, PAIRING_CATEGORY_REFERENCE_STATUS} from './availability.js'

const reference = 'Nodin Sekjen Nomor 3513 — bobot frekuensi 60%, nominal deposit 30%, aktivitas transaksi 10%'
const periods = [['historical', 'Pairing Sekjen asli'], ['before', 'Sebelum ASN'], ['after', 'Sesudah ASN']]
const metrics = [
  ['status', 'Status perhitungan'], ['frekuensi', 'Frekuensi'], ['nominal', 'Nominal deposit (Rp)'], ['dalam', 'Dalam jam kerja'], ['luar', 'Luar jam kerja'],
  ['unknown', 'Jam belum terselesaikan'], ['timeFromPairing', 'Jam memakai asumsi Hasil Pairing'],
  ['timeFromPairingInside', 'Asumsi Hasil Pairing: dalam jam'], ['timeFromPairingOutside', 'Asumsi Hasil Pairing: luar jam'],
  ['categoryFrequency', 'Kategori frekuensi'], ['categoryDeposit', 'Kategori deposit'], ['categoryTime', 'Kategori aktivitas'],
  ['scoreFrequency', 'Nilai frekuensi'], ['scoreDeposit', 'Nilai deposit'], ['scoreTime', 'Nilai aktivitas'], ['total', 'Total nilai'], ['kategori', 'Kategori']
]

function versionLabel(version) {
  const value = typeof version === 'object' && version !== null ? version.number ?? version.version : version
  return String(value ?? 1)
}

function flatten(value, prefix = '', result = []) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, item] of Object.entries(value)) flatten(item, prefix ? `${prefix}.${key}` : key, result)
  } else result.push([prefix, Array.isArray(value) ? JSON.stringify(value) : value])
  return result
}

function cell(value, header = false) {
  return {value: typeof value === 'number' ? value : String(value ?? ''), type: typeof value === 'number' ? Number : String, ...(header ? {fontWeight: 'bold', backgroundColor: '#E7F0FF', wrap: true, height: 42} : {})}
}

function sheet(name, rows) {
  const widths = name === 'Dasar dan parameter' ? [32, 100] : name === 'Audit data' ? [22, 30, 22, 28, 85, 16] : rows[0].map((_, index) => index === 1 ? 30 : index === 5 ? 40 : index === 7 ? 55 : index === 4 || index === rows[0].length - 1 ? 45 : 23)
  return {sheet: name, columns: widths.map(width => ({width})), stickyRowsCount: 1, ...(name === 'Kategorisasi SDM' ? {stickyColumnsCount: 2, orientation: 'landscape'} : {}), data: rows.map((row, index) => row.map(value => cell(value, index === 0)))}
}

function auditText(audit) {
  if (typeof audit === 'string') return audit
  return audit?.message ?? audit?.detail ?? audit?.note ?? JSON.stringify(audit)
}

function categoryReferenceLabel(row) {
  if (hasPairingCategoryReference(row)) return 'Ya — kategori keseluruhan Hasil pairing'
  if (row.categoryFromPairing === true) return 'Tidak digunakan — kategori sumber tidak valid'
  return row.categoryFromPairing === false ? 'Tidak' : 'Tidak dicatat pada versi ini'
}

function periodValue(row, period, key) {
  if (period === 'historical' && key === 'unknown') return null
  if (period !== 'historical' && getTransactionAvailability(row) === 'missing') {
    if (hasPairingCategoryReference(row)) return key === 'kategori' ? row.historical.kategori : key === 'status' ? PAIRING_CATEGORY_REFERENCE_STATUS : null
    return key === 'kategori' || key === 'status' ? MISSING_DETAILS_LABEL : null
  }
  return row[period]?.[key] ?? null
}

export function buildDisciplineSheets({rows = [], rules = {}, version = 1, filename = '', audits, source = {}, filters = {}} = {}) {
  const result = [
    ['NIK', 'Nama SDM', 'NIP', 'Hasil penilaian Data Olah', 'Keterangan Data Olah', 'Kelengkapan data', 'Baris transaksi pada master', 'Kategori acuan Hasil pairing', ...periods.flatMap(([, label]) => metrics.map(([, title]) => `${label} — ${title}`)), 'Catatan audit'],
    ...rows.map(row => [String(row.nik ?? ''), row.nama ?? '', String(row.nip ?? ''), row.hasilPenilaian ?? '', row.keterangan ?? '',
      TRANSACTION_AVAILABILITY_LABELS[getTransactionAvailability(row)], row.sourceTransactionCount ?? null, categoryReferenceLabel(row),
      ...periods.flatMap(([period]) => metrics.map(([key]) => periodValue(row, period, key))), (row.audits ?? []).map(auditText).join('; ')])
  ]
  const metadata = [
    ['Keterangan', 'Nilai'], ['Aplikasi', 'Pokja SD Tim TLHP — Monitoring Tindak Lanjut'], ['Modul', 'Kategorisasi Disiplin ASN'],
    ['Workbook sumber', filename || source.filename || source.name || ''], ['SHA-256 sumber', source.sha256 || 'Tidak dicatat'],
    ['Dasar pembobotan', reference], ['Referensi sumber tambahan', source.reference || ''], ['Versi parameter', versionLabel(version)], ['Jumlah SDM diekspor', rows.length],
    ['Cakupan', 'Seluruh baris yang diberikan melalui filter aktif, bukan hanya halaman tabel'],
    ['Filter aktif (JSON)', JSON.stringify(filters)], ...flatten(filters).map(([key, value]) => [`Filter: ${key}`, value]),
    ['Hasil Sekjen', 'Hasil asli workbook; tidak dihitung ulang atau ditimpa'],
    ['Kelengkapan data transaksi', 'Rincian transaksi belum tersedia berarti Hasil Pairing mencatat frekuensi atau nominal positif tetapi tidak ada baris transaksi untuk NIK tersebut pada master. Frekuensi, nominal, aktivitas, dan skor sebelum/sesudah ASN belum dapat ditentukan dan dibiarkan kosong; bukan transaksi atau nominal 0.'],
    ['Kategori acuan Hasil pairing', 'Jika ditandai Ya, kategori Ringan/Sedang/Berat asli dari Hasil pairing keseluruhan ditampilkan pada kedua periode hanya sebagai acuan. Ini bukan hasil perhitungan sebelum/sesudah ASN; rincian dan skor periode tetap belum tersedia. Kategori historis asli tidak diubah.'],
    ['Arti baris transaksi pada master', 'Jumlah seluruh baris transaksi untuk NIK pada master sumber, termasuk di luar rentang tanggal parameter dan tanggal tidak valid. Nilai 0 berarti tidak ada baris sumber; bukan jumlah transaksi pada salah satu periode.'],
    ['Kelengkapan versi lama', 'Jika snapshot lama belum mencatat jumlah baris sumber, kolom jumlah dibiarkan kosong. Kelengkapan ditandai belum dicatat bila snapshot juga tidak menunjukkan rincian transaksi; nilai periode 0 saja tidak digunakan untuk menyimpulkan tidak ada transaksi pada sumber. Hasil historis asli tetap dipertahankan.'],
    ['Status penilaian', 'Terbukti/Tidak Terbukti mengikuti Data Olah; kategori per periode tidak mengubah status ini'],
    ['Kebijakan jam tidak tersedia', rules.missingTimePolicy ?? 'Tidak dicatat pada versi ini'],
    ['Asumsi jam dari Hasil Pairing', "Pada kebijakan pairing, tanda '-' tetap dipertahankan dalam sumber. Kategori aktivitas Hasil Pairing per NIK digunakan sebagai asumsi jam dalam/luar untuk transaksi tanpa jam yang memenuhi ketentuan; ini bukan jam transaksi yang terverifikasi."],
    ['Arti hitungan aktivitas', 'Jumlah dalam/luar jam periode sudah mencakup asumsi Hasil Pairing. Kolom jam memakai asumsi merinci jumlah total serta bagian dalam/luar; jam belum terselesaikan hanya menghitung jam tidak valid yang masih belum dapat ditentukan.'],
    ['Perhitungan dengan asumsi jam', 'Jika rincian transaksi tersedia, skor aktivitas dan kategori akhir sebelum/sesudah ASN dihitung ulang dengan parameter versi ini. Jika rincian tidak tersedia, kategori historis dapat ditampilkan sebagai acuan dengan penanda khusus; ini bukan hasil hitung periode. Kategori akhir historis Sekjen tidak diubah.'],
    ['Nilai kosong', 'Sel kosong berarti data/skor belum tersedia; angka 0 tetap ditampilkan sebagai 0'],
    ['Hitungan versi lama', 'Hitungan asal jam yang tidak tercatat pada snapshot lama atau hasil Sekjen dibiarkan kosong; tidak dianggap 0.'],
    ['Jam belum terselesaikan historis', 'Hasil pairing asli tidak memiliki kolom jumlah jam belum terselesaikan. Kolom historis ini dibiarkan kosong meskipun parser menyimpan nilai internal 0; jumlah dalam/luar jam asli tetap ditampilkan.'],
    ['Penggunaan', 'Bahan pertimbangan awal proses disiplin; bukan penetapan hukuman'],
    ['Cakupan audit', audits ? 'Seluruh workbook sumber; dapat mencakup NIK di luar filter ekspor' : 'Catatan audit pada baris hasil ekspor'],
    ['Parameter lengkap (JSON)', JSON.stringify(rules)], ...flatten(rules).map(([key, value]) => [`Parameter: ${key}`, value])
  ]
  const people = new Map(rows.map(row => [row.nik, row]))
  const auditRows = audits ? audits.map(audit => {
    const person = people.get(audit?.nik)
    return [String(audit?.nik ?? ''), person?.nama ?? '', person?.hasilPenilaian ?? '', audit?.code ?? audit?.type ?? '', auditText(audit), audit?.row ?? null]
  }) : rows.flatMap(row => (row.audits ?? []).map(audit => [String(row.nik ?? ''), row.nama ?? '', row.hasilPenilaian ?? '', typeof audit === 'object' ? audit?.code ?? audit?.type ?? '' : '', auditText(audit), audit?.row ?? null]))
  const sheets = [sheet('Kategorisasi SDM', result), sheet('Dasar dan parameter', metadata)]
  if (auditRows.length) sheets.push(sheet('Audit data', [['NIK', 'Nama SDM', 'Hasil penilaian', 'Kode audit', 'Catatan', 'Baris sumber'], ...auditRows]))
  return sheets
}

export async function exportDiscipline(options) {
  const {default: write} = await import('write-excel-file/browser')
  const version = versionLabel(options?.version).replace(/[^a-zA-Z0-9._-]/g, '-')
  await write(buildDisciplineSheets(options)).toFile(`kategorisasi-disiplin-asn-v${version}.xlsx`)
}
