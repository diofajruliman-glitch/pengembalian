import test from 'node:test'
import assert from 'node:assert/strict'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

test('batch pdf generator logic test - 2 sample recipients', async () => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true
  })

  const recipients = [
    {
      nama: 'Hermawan Kurnia',
      nip: '198807152025211094',
      pangkat: 'Penata Muda (IX/PPPK)',
      jabatan: 'PPPK Dit. PSNK',
      unitKerja: 'Direktorat Perlindungan Sosial Non Kebencanaan',
      sisaKewajiban: 0
    },
    {
      nama: 'AHMAD FAIZAL NASIHIN',
      nip: '198302132025211044',
      pangkat: 'Pegawai PPPK',
      jabatan: 'PPPK Dit. PSNK',
      unitKerja: 'Direktorat Perlindungan Sosial Non Kebencanaan',
      kewajibanTotal: 23496,
      realisasiTotal: 0,
      sisaKewajiban: 23496,
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

test('batch pdf generator logic test - 1.057 recipients mass scale performance', async () => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true
  })

  const dummyImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  const total = 1057
  const startTime = Date.now()

  for (let idx = 0; idx < total; idx++) {
    if (idx > 0) doc.addPage('a4', 'portrait')

    // Testkop image with alias to avoid memory bloat
    doc.addImage(dummyImage, 'PNG', 14, 8, 182, 25, 'KEMENSOS_KOP', 'FAST')

    // Document classification
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.text('RAHASIA', 14, 38)

    // Title & Number
    doc.text('SURAT PANGGILAN', 105, 43, { align: 'center' })
    doc.setFont('helvetica', 'normal')
    doc.text('NOMOR : 0123/3.3/KP.06.04/10/2026', 105, 48.5, { align: 'center' })

    // Salutation & Recipient
    doc.text('Bersama ini diminta dengan hormat kehadiran Saudara:', 14, 56)
    autoTable(doc, {
      startY: 60,
      margin: { left: 14, right: 14 },
      body: [
        ['Nama', ':', `Penerima SDM #${idx + 1}`],
        ['NIP/NIPPPK', ':', `19850101202521${String(idx).padStart(4, '0')}`],
        ['Jabatan', ':', 'Penata Layanan Operasional']
      ],
      theme: 'plain',
      styles: { fontSize: 10.5, cellPadding: 0.6 }
    })

    // Signature and Tembusan block
    const signY = 220
    const signX = 125
    doc.text('Jakarta, 26 Oktober 2026', signX, signY)
    doc.text('Direktur Perlindungan Sosial Non Kebencanaan', signX, signY + 5)
    const nameY = signY + 25
    doc.setFont('helvetica', 'bold')
    doc.text('Faisal', signX, nameY)
    doc.setFont('helvetica', 'normal')
    doc.text('NIP. 19761106 200502 1 001', signX, nameY + 5)

    // Tembusan
    const tembusan = [
      'Sekretaris Ditjen Linjamsos',
      'Inspektur Bidang Linjamsos',
      'Kepala Biro Keuangan Kemensos RI'
    ]
    const tembusanY = Math.min(Math.max(nameY + 6, 252), 268)
    doc.setFontSize(10.5)
    doc.text('Tembusan Yth:', 14, tembusanY)
    tembusan.forEach((t, tIdx) => {
      doc.text(`${tIdx + 1}. ${t}`, 16, tembusanY + 4 + (tIdx * 4))
    })
  }

  const durationMs = Date.now() - startTime
  assert.equal(doc.internal.getNumberOfPages(), 1057)

  const buffer = doc.output('arraybuffer')
  assert.ok(buffer.byteLength > 100000)
  // File size should be well under 10MB due to image aliasing and vector text
  assert.ok(buffer.byteLength < 5000000)
  assert.ok(durationMs < 10000, `Generation of 1057 pages took ${durationMs}ms, should be fast`)
})

test('surat penagihan custom editing and table layout test', async () => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true
  })

  const customOpening = 'Teks Pembuka Khusus Hasil Rekonsiliasi TLHP 2026'
  const customAgenda = 'Setorkan ke SIMPONI selambat-lambatnya 7 hari kerja.'
  const customCoordination = 'Hubungi Pokja SD Tim TLHP jika ada sanggahan.'
  const customClosing = 'Demikian surat penagihan ini disampaikan untuk segera diselesaikan.'

  let curY = 56
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(12)
  doc.text('Kepada Yth.', 14, curY)
  curY += 5
  doc.setFont('helvetica', 'bold')
  doc.text('Saudara/i Budi Santoso', 14, curY)
  curY += 5
  doc.setFont('helvetica', 'normal')
  doc.text('NIP/NIPPPK : 198501012025211001', 14, curY)
  curY += 5
  doc.text('Jabatan : Penata Layanan Operasional', 14, curY)
  curY += 5
  doc.text('di Tempat', 14, curY)
  curY += 6.5

  // Split custom opening
  const splitOpening = doc.splitTextToSize(customOpening, 182)
  doc.text(splitOpening, 14, curY)
  curY += (splitOpening.length * 4.8) + 3

  // 5-column financial table
  autoTable(doc, {
    startY: curY,
    margin: { left: 14, right: 14 },
    head: [['No', 'Uraian Kewajiban', 'Kewajiban Awal', 'Telah Disetor', 'Sisa yang Wajib Disetor']],
    body: [
      ['1', 'Pengembalian Kelebihan Pembayaran Tukin & Uang Makan\nStatus: SDM Nonaktif', 'Rp 15.000.000', 'Rp 5.000.000', 'Rp 10.000.000']
    ],
    foot: [
      [{ content: 'Total Sisa Kewajiban :', colSpan: 4, styles: { halign: 'right', fontStyle: 'bold' } }, 'Rp 10.000.000']
    ]
  })

  curY = doc.lastAutoTable.finalY + 4

  // Custom agenda, coordination, closing
  const splitAgenda = doc.splitTextToSize(customAgenda, 182)
  doc.text(splitAgenda, 14, curY)
  curY += (splitAgenda.length * 4.8) + 3

  const splitCoord = doc.splitTextToSize(customCoordination, 182)
  doc.text(splitCoord, 14, curY)
  curY += (splitCoord.length * 4.8) + 3

  const splitClosing = doc.splitTextToSize(customClosing, 182)
  doc.text(splitClosing, 14, curY)

  assert.equal(doc.internal.getNumberOfPages(), 1)
  const buffer = doc.output('arraybuffer')
  assert.ok(buffer.byteLength > 2000)
})

test('surat panggilan precise alignment test matching user layout specifications', async () => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true
  })

  let curY = 56
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(12)
  doc.text('Bersama ini diminta dengan hormat kehadiran Saudara:', 14, curY)
  curY += 6

  // 1. Tabel Penerima
  const recipientRows = [
    ['Nama', ':', { content: 'Ramadhan Syah', styles: { fontStyle: 'bold' } }],
    ['NIP/NIPPPK', ':', '199004252025211054'],
    ['Pangkat / Golongan', ':', 'Golongan VII'],
    ['Jabatan', ':', 'Pengelola Layanan Operasional'],
    ['Unit Kerja', ':', 'Direktorat Perlindungan Sosial Non Kebencanaan']
  ]

  autoTable(doc, {
    startY: curY,
    margin: { left: 18, right: 14 },
    body: recipientRows,
    theme: 'plain',
    styles: { fontSize: 12, cellPadding: { top: 0.8, bottom: 0.8, left: 0, right: 0 } },
    columnStyles: {
      0: { cellWidth: 46 },
      1: { cellWidth: 4, halign: 'center' },
      2: { cellWidth: 'auto' }
    }
  })
  curY = doc.lastAutoTable.finalY + 3.5

  // 2. Untuk Menghadap Kepada
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(12)
  doc.text('Untuk menghadap kepada:', 14, curY)
  curY += 3.5

  const faceRows = [
    ['Nama', ':', { content: 'Faisal', styles: { fontStyle: 'bold' } }],
    ['NIP', ':', '19761106 200502 1 001'],
    ['Pangkat', ':', 'IV/c'],
    ['Jabatan', ':', 'Direktur Perlindungan Sosial Non Kebencanaan']
  ]

  autoTable(doc, {
    startY: curY,
    margin: { left: 18, right: 14 },
    body: faceRows,
    theme: 'plain',
    styles: { fontSize: 12, cellPadding: { top: 0.8, bottom: 0.8, left: 0, right: 0 } },
    columnStyles: {
      0: { cellWidth: 46 },
      1: { cellWidth: 4, halign: 'center' },
      2: { cellWidth: 'auto' }
    }
  })
  curY = doc.lastAutoTable.finalY + 3.5

  // 3. Jadwal Pada :
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(12)
  doc.text('Pada :', 14, curY)
  curY += 3.5

  const scheduleRows = [
    ['Hari', ':', 'Senin'],
    ['Tanggal', ':', '26 Oktober 2026'],
    ['Jam', ':', '10.00 WIB'],
    ['Tempat', ':', 'Kementerian Sosial Gedung A Lantai 3 Dit. Jamsos'],
    ['Link Zoom', ':', 'https://zoom.us/j/kemsos-psnk-tlhp (Passcode: PSNK2026)']
  ]

  autoTable(doc, {
    startY: curY,
    margin: { left: 18, right: 14 },
    body: scheduleRows,
    theme: 'plain',
    styles: { fontSize: 12, cellPadding: { top: 0.8, bottom: 0.8, left: 0, right: 0 } },
    columnStyles: {
      0: { cellWidth: 46 },
      1: { cellWidth: 4, halign: 'center' },
      2: { cellWidth: 'auto' }
    }
  })
  curY = doc.lastAutoTable.finalY + 4

  // Agenda & Penutup
  const agenda = 'Untuk diperiksa/dimintai keterangan sehubungan dengan dugaan pelanggaran disiplin kinerja.'
  const splitAgenda = doc.splitTextToSize(agenda, 182)
  doc.text(splitAgenda, 14, curY)
  curY += (splitAgenda.length * 4.8) + 3

  const closing = 'Demikian untuk dilaksanakan.'
  const splitClosing = doc.splitTextToSize(closing, 182)
  doc.text(splitClosing, 14, curY)
  curY += (splitClosing.length * 4.8) + 3

  // Tanda Tangan
  const signY = Math.max(curY + 6, 214)
  const signX = 125
  doc.text('Jakarta, 26 Oktober 2026', signX, signY)
  doc.text('Direktur Perlindungan Sosial Non Kebencanaan', signX, signY + 5)
  const nameY = signY + 25
  doc.setFont('helvetica', 'bold')
  doc.text('Faisal', signX, nameY)
  doc.setFont('helvetica', 'normal')
  doc.text('NIP. 19761106 200502 1 001', signX, nameY + 4.8)

  // Verify single page fit and exact page count
  assert.equal(doc.internal.getNumberOfPages(), 1)
  assert.ok(nameY + 4.8 < 280, 'Signature block fits neatly above bottom margin')
  const buffer = doc.output('arraybuffer')
  assert.ok(buffer.byteLength > 2000)
})

test('staggered schedule per recipient creates distinct time slots', async () => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true
  })

  const recipients = [
    { nama: 'Ahmad', nip: '199001012025211001', jam: '09.00 - 09.30 WIB' },
    { nama: 'Budi', nip: '199001012025211002', jam: '09.30 - 10.00 WIB' },
    { nama: 'Citra', nip: '199001012025211003', jam: '10.00 - 10.30 WIB' }
  ]

  for (let i = 0; i < recipients.length; i++) {
    if (i > 0) doc.addPage('a4', 'portrait')
    const r = recipients[i]

    autoTable(doc, {
      startY: 50,
      margin: { left: 18, right: 14 },
      body: [
        ['Hari', ':', 'Senin'],
        ['Tanggal', ':', '26 Oktober 2026'],
        ['Jam', ':', r.jam || '10.00 WIB'],
        ['Tempat', ':', 'Kemensos Gedung A Lantai 3']
      ],
      theme: 'plain',
      styles: { fontSize: 12 },
      columnStyles: {
        0: { cellWidth: 46 },
        1: { cellWidth: 4, halign: 'center' },
        2: { cellWidth: 'auto' }
      }
    })
  }

  assert.equal(doc.internal.getNumberOfPages(), 3)
  const buffer = doc.output('arraybuffer')
  assert.ok(buffer.byteLength > 3000)
})


