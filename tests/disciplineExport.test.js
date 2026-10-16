import test from 'node:test'
import assert from 'node:assert/strict'
import write from 'write-excel-file/node'
import {unzipSync, strFromU8} from 'fflate'
import {buildDisciplineSheets} from '../src/judol/export.js'

const metric = (extra = {}) => ({frekuensi: 2, nominal: 123400, dalam: 0, luar: 2, scoreFrequency: 12, scoreDeposit: 6, scoreTime: 3, total: 21, kategori: 'Ringan', ...extra})
const person = (extra = {}) => ({nik: '0012345678901234', nip: '001234567890123456', nama: 'Uji Ekspor', hasilPenilaian: 'Tidak Terbukti', keterangan: 'Keputusan sumber', historical: metric({total: 34, kategori: 'Sedang'}), before: metric(), after: metric({frekuensi: 0, nominal: 0, luar: 0, scoreFrequency: null, scoreDeposit: null, scoreTime: null, total: null, kategori: 'Tidak ada transaksi'}), audits: ['Periode sumber perlu diperiksa'], ...extra})
const values = row => row.map(cell => cell.value)

test('export keeps original Sekjen and both periods independent while preserving negative assessment, text IDs and missing scores', () => {
  const sheets = buildDisciplineSheets({rows: [person()], version: 2, filename: 'Final.xlsx', rules: {weights: {frequency: 60}, ties: 'inside'}})
  const headers = values(sheets[0].data[0]), row = sheets[0].data[1], get = title => row[headers.indexOf(title)]
  assert.equal(row[0].value, '0012345678901234'); assert.equal(row[0].type, String)
  assert.equal(row[2].value, '001234567890123456'); assert.equal(row[2].type, String)
  assert.equal(row[3].value, 'Tidak Terbukti')
  assert.equal(get('Pairing Sekjen asli — Total nilai').value, 34)
  assert.equal(get('Sebelum ASN — Total nilai').value, 21)
  assert.equal(get('Sesudah ASN — Total nilai').value, '')
  assert.equal(get('Sesudah ASN — Frekuensi').value, 0); assert.equal(get('Sesudah ASN — Frekuensi').type, Number)
  assert.equal(get('Sebelum ASN — Nominal deposit (Rp)').type, Number)
  const context = Object.fromEntries(sheets[1].data.slice(1).map(values))
  assert.equal(context['Workbook sumber'], 'Final.xlsx'); assert.equal(context['Versi parameter'], '2')
  assert.equal(context['Parameter: weights.frequency'], 60)
  assert.match(context['Dasar pembobotan'], /3513/)
  assert.equal(sheets[2].data[1][0].value, '0012345678901234')
})

test('generated workbook stores text identifiers and numeric values without turning blank scores into zero', async () => {
  const tables = buildDisciplineSheets({rows: [person()], rules: {periods: ['before', 'after']}, version: 3})
  const zip = unzipSync(await write(tables).toBuffer())
  const xml = Object.entries(zip).filter(([name]) => name.endsWith('.xml')).map(([, data]) => strFromU8(data)).join('\n')
  assert.match(xml, /0012345678901234/); assert.match(xml, /001234567890123456/)
  assert.match(strFromU8(zip['xl/worksheets/sheet1.xml']), /<v>123400<\/v>/)
  assert.equal(Object.keys(zip).filter(name => /^xl\/worksheets\/sheet\d+\.xml$/.test(name)).length, 3)
  assert.deepEqual(buildDisciplineSheets({rows: [person({audits: []})]}).map(s => s.sheet), ['Kategorisasi SDM', 'Dasar dan parameter'])
})

test('explicit global audits include source anomalies beyond filters without duplicating row audits', async () => {
  const audits = [{type: 'unmatched', nik: '0099999999999999', row: 12, message: 'NIK di luar Data Olah'}]
  const tables = buildDisciplineSheets({rows: [person()], audits, source: {sha256: 'source-hash'}, rules: {enabled: true}})
  const metadata = Object.fromEntries(tables[1].data.slice(1).map(values))
  assert.equal(metadata['SHA-256 sumber'], 'source-hash')
  assert.match(metadata['Cakupan audit'], /Seluruh workbook sumber/)
  assert.equal(tables[2].data.length, 2)
  assert.equal(tables[2].data[1][0].value, audits[0].nik)
  assert.equal(tables[2].data[1][4].value, audits[0].message)
  await write(tables).toBuffer()
})

test('pairing time assumptions export distinct counts, unresolved times, policy and unchanged provenance', async () => {
  const row = person({
    historical: metric({total: 34, kategori: 'Sedang', unknown: 0}),
    before: metric({dalam: 2, luar: 0, unknown: 0, timeFromPairing: 1, timeFromPairingInside: 1, timeFromPairingOutside: 0, categoryTime: 'Dalam Jam Kerja', scoreTime: 14, total: 32}),
    after: metric({frekuensi: 3, dalam: 0, luar: 2, unknown: 1, timeFromPairing: 1, timeFromPairingInside: 0, timeFromPairingOutside: 1, total: null, kategori: 'Perlu validasi'}),
    audits: [{type: 'assumed-time', nik: '0012345678901234', message: "Jam '-' menggunakan kategori aktivitas Hasil Pairing sebagai asumsi.", row: 8}]
  })
  const rules = {missingTimePolicy: 'pairing', weightTime: 20, provenance: ['Asumsi jam disetujui; bukan jam terverifikasi.']}
  const source = {filename: 'Final.xlsx', sha256: 'original-source-hash', reference: 'Nodin Sekjen Nomor 3513'}
  const original = structuredClone({row, rules, source})
  const tables = buildDisciplineSheets({rows: [row], rules, source, version: 4})
  const headers = values(tables[0].data[0]), data = tables[0].data[1], get = title => data[headers.indexOf(title)]
  assert.equal(get('Sebelum ASN — Dalam jam kerja').value, 2)
  assert.equal(get('Sebelum ASN — Jam memakai asumsi Hasil Pairing').value, 1)
  assert.equal(get('Sebelum ASN — Asumsi Hasil Pairing: dalam jam').value, 1)
  assert.equal(get('Sebelum ASN — Asumsi Hasil Pairing: luar jam').value, 0)
  assert.equal(get('Sebelum ASN — Jam belum terselesaikan').value, 0)
  assert.equal(get('Sesudah ASN — Jam belum terselesaikan').value, 1)
  assert.equal(get('Sesudah ASN — Asumsi Hasil Pairing: luar jam').value, 1)
  assert.equal(get('Sesudah ASN — Total nilai').value, '')
  assert.equal(get('Pairing Sekjen asli — Jam memakai asumsi Hasil Pairing').value, '')
  assert.equal(get('Pairing Sekjen asli — Jam belum terselesaikan').value, '')
  assert.equal(get('Pairing Sekjen asli — Dalam jam kerja').value, row.historical.dalam)
  assert.equal(get('Pairing Sekjen asli — Luar jam kerja').value, row.historical.luar)
  assert.equal(get('Pairing Sekjen asli — Total nilai').value, 34)
  assert.equal(get('Sebelum ASN — Total nilai').value, 32)
  assert.equal(get('Sebelum ASN — Asumsi Hasil Pairing: luar jam').type, Number)
  const metadata = Object.fromEntries(tables[1].data.slice(1).map(values))
  assert.equal(metadata['Kebijakan jam tidak tersedia'], 'pairing')
  assert.equal(metadata['Parameter: missingTimePolicy'], 'pairing')
  assert.match(metadata['Asumsi jam dari Hasil Pairing'], /'-'.*dipertahankan.*per NIK/)
  assert.match(metadata['Perhitungan dengan asumsi jam'], /dihitung ulang dengan parameter versi ini/)
  assert.match(metadata['Jam belum terselesaikan historis'], /tidak memiliki kolom.*dibiarkan kosong/)
  assert.deepEqual(JSON.parse(metadata['Parameter lengkap (JSON)']), rules)
  assert.equal(metadata['SHA-256 sumber'], source.sha256)
  assert.equal(tables[2].data[1][4].value, row.audits[0].message)
  assert.equal(tables[2].data[1][5].value, 8)
  assert.deepEqual({row, rules, source}, original)
  await write(tables).toBuffer()
})

test('validate policy remains explicit and old snapshots do not acquire invented assumption counts', () => {
  const tables = buildDisciplineSheets({rows: [person()], rules: {missingTimePolicy: 'validate'}})
  const headers = values(tables[0].data[0]), data = tables[0].data[1]
  for (const period of ['Pairing Sekjen asli', 'Sebelum ASN', 'Sesudah ASN']) {
    for (const label of ['Jam belum terselesaikan', 'Jam memakai asumsi Hasil Pairing', 'Asumsi Hasil Pairing: dalam jam', 'Asumsi Hasil Pairing: luar jam']) {
      assert.equal(data[headers.indexOf(`${period} — ${label}`)].value, '')
    }
  }
  assert.equal(Object.fromEntries(tables[1].data.slice(1).map(values))['Kebijakan jam tidak tersedia'], 'validate')
  const old = buildDisciplineSheets({rows: [person()]})
  assert.equal(Object.fromEntries(old[1].data.slice(1).map(values))['Kebijakan jam tidak tersedia'], 'Tidak dicatat pada versi ini')
})

test('missing transaction detail never exports stale period zeros or scores and retains positive historical totals', async () => {
  const stale = metric({frekuensi: 0, nominal: 0, dalam: 0, luar: 0, unknown: 0, timeFromPairing: 0, timeFromPairingInside: 0, timeFromPairingOutside: 0, total: 21, kategori: 'Ringan', status: 'Simulasi berdasarkan parameter', categoryFrequency: 'Rendah', categoryDeposit: 'Rendah', categoryTime: 'Luar Jam Kerja'})
  const row = person({missingTransactionDetails: true, sourceTransactionCount: 0, historical: metric({frekuensi: 20, nominal: 3000000, total: 46, kategori: 'Berat'}), before: stale, after: {...stale}})
  const original = structuredClone(row)
  const tables = buildDisciplineSheets({rows: [row]})
  const headers = values(tables[0].data[0]), data = tables[0].data[1], get = title => data[headers.indexOf(title)]
  assert.equal(get('Kelengkapan data').value, 'Rincian transaksi belum tersedia')
  assert.equal(get('Baris transaksi pada master').value, 0)
  assert.equal(get('Baris transaksi pada master').type, Number)
  for (const period of ['Sebelum ASN', 'Sesudah ASN']) {
    assert.equal(get(`${period} — Kategori`).value, 'Rincian transaksi belum tersedia')
    assert.equal(get(`${period} — Status perhitungan`).value, 'Rincian transaksi belum tersedia')
    for (const field of ['Frekuensi', 'Nominal deposit (Rp)', 'Dalam jam kerja', 'Luar jam kerja', 'Jam belum terselesaikan', 'Jam memakai asumsi Hasil Pairing', 'Asumsi Hasil Pairing: dalam jam', 'Asumsi Hasil Pairing: luar jam', 'Nilai frekuensi', 'Nilai deposit', 'Nilai aktivitas', 'Total nilai', 'Kategori frekuensi', 'Kategori deposit', 'Kategori aktivitas']) {
      assert.equal(get(`${period} — ${field}`).value, '')
    }
  }
  assert.equal(get('Pairing Sekjen asli — Frekuensi').value, 20)
  assert.equal(get('Pairing Sekjen asli — Nominal deposit (Rp)').value, 3000000)
  assert.equal(get('Pairing Sekjen asli — Total nilai').value, 46)
  assert.equal(get('Pairing Sekjen asli — Kategori').value, 'Berat')
  const metadata = Object.fromEntries(tables[1].data.slice(1).map(values))
  assert.match(metadata['Kelengkapan data transaksi'], /belum dapat ditentukan.*bukan.*0/)
  assert.match(metadata['Arti baris transaksi pada master'], /seluruh baris.*di luar rentang tanggal.*bukan jumlah transaksi/)
  assert.deepEqual(row, original)
  const canonical = buildDisciplineSheets({rows: [person({before: {...stale, kategori: 'Rincian transaksi belum tersedia'}, after: stale})]})
  const canonicalData = canonical[0].data[1]
  assert.equal(canonicalData[headers.indexOf('Sebelum ASN — Frekuensi')].value, '')
  assert.equal(canonicalData[headers.indexOf('Sesudah ASN — Total nilai')].value, '')
  assert.equal(canonicalData[headers.indexOf('Sesudah ASN — Kategori')].value, 'Rincian transaksi belum tersedia')
  await write(tables).toBuffer()
})

test('export preserves known period zero, leaves old master counts unrecorded, and records exact supplied filters without filtering rows', () => {
  const available = person({missingTransactionDetails: false, sourceTransactionCount: 2})
  const old = person({nik: '0022345678901234', before: metric({frekuensi: 0, nominal: 0, dalam: 0, luar: 0, total: null, kategori: 'Tidak ada transaksi'})})
  const filters = {assessment: 'Terbukti', search: 'Nama uji', period: 'after', category: 'Ringan', availability: 'available'}
  const tables = buildDisciplineSheets({rows: [available, old], filters, source: {sha256: 'source-unchanged'}})
  const headers = values(tables[0].data[0]), first = tables[0].data[1], second = tables[0].data[2]
  const get = (row, title) => row[headers.indexOf(title)]
  assert.equal(tables[0].data.length, 3)
  assert.equal(get(first, 'Hasil penilaian Data Olah').value, 'Tidak Terbukti')
  assert.equal(get(first, 'Baris transaksi pada master').value, 2)
  assert.equal(get(first, 'Sesudah ASN — Frekuensi').value, 0)
  assert.equal(get(first, 'Sesudah ASN — Frekuensi').type, Number)
  assert.equal(get(first, 'Sesudah ASN — Nominal deposit (Rp)').value, 0)
  assert.equal(get(second, 'Baris transaksi pada master').value, '')
  assert.equal(get(second, 'Sesudah ASN — Frekuensi').value, 0)
  assert.equal(get(second, 'Kelengkapan data').value, 'Kelengkapan belum dicatat pada versi ini')
  const noSource = buildDisciplineSheets({rows: [{...old, sourceTransactionCount: 0, missingTransactionDetails: false}]})
  assert.equal(get(noSource[0].data[1], 'Kelengkapan data').value, 'Tidak ada transaksi pada sumber')
  assert.equal(get(noSource[0].data[1], 'Baris transaksi pada master').value, 0)
  assert.equal(get(noSource[0].data[1], 'Sesudah ASN — Frekuensi').value, 0)
  const metadata = Object.fromEntries(tables[1].data.slice(1).map(values))
  assert.deepEqual(JSON.parse(metadata['Filter aktif (JSON)']), filters)
  assert.equal(metadata['Filter: assessment'], 'Terbukti')
  assert.equal(metadata['Filter: search'], filters.search)
  assert.equal(metadata['Filter: availability'], 'available')
  assert.equal(metadata['SHA-256 sumber'], 'source-unchanged')
})

test('explicit historical category reference exports the original final category with no invented period metrics', async () => {
  const row = person({
    missingTransactionDetails: true, sourceTransactionCount: 0, categoryFromPairing: true,
    historical: metric({frekuensi: 20, nominal: 3000000, total: 46, kategori: 'Berat', status: 'Sumber asli Sekjen'}),
    before: metric({frekuensi: 0, nominal: 0, dalam: 0, luar: 0, unknown: 0, timeFromPairing: 0, timeFromPairingInside: 0, timeFromPairingOutside: 0}),
    after: metric({frekuensi: 0, nominal: 0, dalam: 0, luar: 0, unknown: 0, timeFromPairing: 0, timeFromPairingInside: 0, timeFromPairingOutside: 0})
  })
  const original = structuredClone(row)
  const tables = buildDisciplineSheets({rows: [row], filters: {category: 'Berat', availability: 'missing'}})
  const headers = values(tables[0].data[0]), data = tables[0].data[1], get = title => data[headers.indexOf(title)]
  assert.equal(get('Kategori acuan Hasil pairing').value, 'Ya — kategori keseluruhan Hasil pairing')
  assert.equal(get('Kelengkapan data').value, 'Rincian transaksi belum tersedia')
  assert.equal(get('Baris transaksi pada master').value, 0)
  assert.equal(get('Pairing Sekjen asli — Kategori').value, 'Berat')
  assert.equal(get('Pairing Sekjen asli — Total nilai').value, 46)
  assert.equal(get('Pairing Sekjen asli — Frekuensi').value, 20)
  assert.equal(get('Pairing Sekjen asli — Nominal deposit (Rp)').value, 3000000)
  for (const period of ['Sebelum ASN', 'Sesudah ASN']) {
    assert.equal(get(`${period} — Kategori`).value, 'Berat')
    assert.equal(get(`${period} — Status perhitungan`).value, 'Kategori acuan Hasil pairing; rincian periode belum tersedia')
    for (const field of ['Frekuensi', 'Nominal deposit (Rp)', 'Dalam jam kerja', 'Luar jam kerja', 'Jam belum terselesaikan', 'Jam memakai asumsi Hasil Pairing', 'Asumsi Hasil Pairing: dalam jam', 'Asumsi Hasil Pairing: luar jam', 'Nilai frekuensi', 'Nilai deposit', 'Nilai aktivitas', 'Total nilai', 'Kategori frekuensi', 'Kategori deposit', 'Kategori aktivitas']) {
      assert.equal(get(`${period} — ${field}`).value, '')
    }
  }
  const metadata = Object.fromEntries(tables[1].data.slice(1).map(values))
  assert.match(metadata['Kategori acuan Hasil pairing'], /keseluruhan.*hanya sebagai acuan.*bukan hasil perhitungan.*skor periode tetap belum tersedia/)
  assert.equal(metadata['Filter: category'], 'Berat')
  assert.equal(metadata['Filter: availability'], 'missing')
  assert.deepEqual(row, original)
  await write(tables).toBuffer()
})

test('category reference requires an explicit flag and a valid historical category and status', () => {
  const row = person({missingTransactionDetails: true, sourceTransactionCount: 0, historical: metric({kategori: 'Sedang', status: 'Sumber asli Sekjen'})})
  const variants = [
    row,
    {...row, categoryFromPairing: false},
    {...row, categoryFromPairing: true, historical: {...row.historical, kategori: 'Tidak dikenal'}},
    {...row, categoryFromPairing: true, historical: {...row.historical, status: 'Perlu validasi'}}
  ]
  for (const value of variants) {
    const tables = buildDisciplineSheets({rows: [value]})
    const headers = values(tables[0].data[0]), data = tables[0].data[1], get = title => data[headers.indexOf(title)].value
    assert.equal(get('Sebelum ASN — Kategori'), 'Rincian transaksi belum tersedia')
    assert.equal(get('Sesudah ASN — Kategori'), 'Rincian transaksi belum tersedia')
    assert.equal(get('Sebelum ASN — Total nilai'), '')
    assert.equal(get('Sesudah ASN — Frekuensi'), '')
    assert.doesNotMatch(get('Kategori acuan Hasil pairing'), /^Ya/)
  }
})
