import test from 'node:test'
import assert from 'node:assert/strict'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

test('batch pdf generator logic test', async () => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true
  })

  const recipients = [
    {
      nama: 'Pegawai Test 1',
      nip: '198501012024211001',
      pangkat: 'Penata Muda (IX/PPPK)',
      jabatan: 'PPPK Dit. PSNK',
      unitKerja: 'Direktorat Perlindungan Sosial Non Kebencanaan',
      sisaKewajiban: 0
    },
    {
      nama: 'Alm. Bambang Sutrisno, S.E.',
      nip: '198504122023211003',
      pangkat: 'Pegawai PPPK',
      jabatan: 'PPPK Dit. PSNK',
      unitKerja: 'Direktorat Perlindungan Sosial Non Kebencanaan',
      kewajibanTotal: 18500000,
      realisasiTotal: 5000000,
      sisaKewajiban: 13500000,
      kategori: 'Meninggal dunia'
    }
  ]

  for (let i = 0; i < recipients.length; i++) {
    if (i > 0) doc.addPage('a4', 'portrait')
    const r = recipients[i]
    doc.text('SURAT PANGGILAN', 105, 43, { align: 'center' })
    doc.text(`Nama: ${r.nama}`, 14, 55)

    if (r.sisaKewajiban > 0) {
      autoTable(doc, {
        startY: 65,
        head: [['No', 'Uraian Kewajiban', 'Kewajiban Awal', 'Telah Disetor', 'Sisa yang Wajib Disetor']],
        body: [['1', 'Pengembalian Kelebihan Pembayaran Tukin & Uang Makan', 'Rp 18.500.000', 'Rp 5.000.000', 'Rp 13.500.000']],
        foot: [['', 'Total Sisa Kewajiban :', '', '', 'Rp 13.500.000']]
      })
    }
  }

  assert.equal(doc.internal.getNumberOfPages(), 2)
  const buffer = doc.output('arraybuffer')
  assert.ok(buffer.byteLength > 1000)
})
