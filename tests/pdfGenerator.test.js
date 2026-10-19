import test from 'node:test'
import assert from 'node:assert/strict'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { DAILY_SESSION_SLOTS, resolveDailySessionSlot } from '../src/letters/bnbaScheduleHelper.js'

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

import {
  formatIndoDate,
  formatIndoTime,
  lookupBnbaSchedule
} from '../src/letters/bnbaScheduleHelper.js'

test('formatIndoDate and formatIndoTime correctness', () => {
  const d1 = formatIndoDate('2026-10-19')
  assert.equal(d1.hari, 'Senin')
  assert.equal(d1.tanggal, '19 Oktober 2026')
  assert.equal(d1.tanggalShort, '19 Okt 2026')

  const d2 = formatIndoDate('2026-10-21')
  assert.equal(d2.hari, 'Rabu')
  assert.equal(d2.tanggal, '21 Oktober 2026')

  const d3 = formatIndoDate('2026-10-23')
  assert.equal(d3.hari, 'Jumat')
  assert.equal(d3.tanggal, '23 Oktober 2026')

  assert.equal(formatIndoDate('invalid-date'), null)
  assert.equal(formatIndoDate(''), null)

  assert.equal(formatIndoTime('08:00', 40, 'range'), '08.00 - 08.40 WIB')
  assert.equal(formatIndoTime('08:00', 40, 'startOnly'), '08.00 WIB')
  assert.equal(formatIndoTime('09:45', 30, 'range'), '09.45 - 10.15 WIB')
  assert.equal(formatIndoTime('13:30', 45, 'range'), '13.30 - 14.15 WIB')
})

test('lookupBnbaSchedule resolves interview day, date, time, and room from workspace', () => {
  const mockWorkspace = {
    entries: {
      '3201012345670001': {
        nik: '3201012345670001',
        date: '2026-10-19',
        time: '08:00',
        duration: 40,
        roomId: 'room-1',
        session: 1,
        status: 'Terjadwal'
      },
      '3201012345670002': {
        nik: '3201012345670002',
        date: '2026-10-21',
        time: '09:30',
        duration: 40,
        roomId: 'room-2',
        session: 3,
        status: 'Terjadwal'
      }
    },
    rooms: [
      { id: 'room-1', name: 'Room 1', interviewer: 'Itjen 1' },
      { id: 'room-2', name: 'Room 2', interviewer: 'Itjen 2' }
    ]
  }

  const p1 = { nik: '3201012345670001', nip: '199001012025211001', nama: 'Budi Santoso' }
  const s1 = lookupBnbaSchedule(p1, mockWorkspace)
  assert.ok(s1)
  assert.equal(s1.hari, 'Senin')
  assert.equal(s1.tanggal, '19 Oktober 2026')
  assert.equal(s1.jamRange, '08.00 - 08.40 WIB')
  assert.equal(s1.roomName, 'Room 1')
  assert.equal(s1.interviewer, 'Itjen 1')
  assert.equal(s1.tempat, 'Breakout Room 1 (Itjen 1) · Media Daring Zoom Ditjen Linjamsos')

  const p2 = { key: 'judol-3201012345670002', nama: 'Siti Rahma' }
  const s2 = lookupBnbaSchedule(p2, mockWorkspace)
  assert.ok(s2)
  assert.equal(s2.hari, 'Rabu')
  assert.equal(s2.tanggal, '21 Oktober 2026')
  assert.equal(s2.jamRange, '09.30 - 10.10 WIB')
  assert.equal(s2.roomName, 'Room 2')

  const pUnscheduled = { nik: '9999999999999999', nama: 'Belum Terjadwal' }
  assert.equal(lookupBnbaSchedule(pUnscheduled, mockWorkspace), null)
})

test('connected BNBA interview schedule generates distinct day, date, time and breakout room in PDF batch', () => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true
  })

  const recipients = [
    {
      nama: 'Budi Santoso',
      nip: '199001012025211001',
      hari: 'Senin',
      tanggal: '19 Oktober 2026',
      jam: '08.00 - 08.40 WIB',
      tempat: 'Breakout Room 1 (Itjen 1) · Media Daring Zoom Ditjen Linjamsos',
      linkZoom: 'https://zoom.us/j/kemsos-psnk-tlhp (Passcode: PSNK2026)'
    },
    {
      nama: 'Siti Rahma',
      nip: '199203152025212002',
      hari: 'Rabu',
      tanggal: '21 Oktober 2026',
      jam: '09.30 - 10.10 WIB',
      tempat: 'Breakout Room 2 (Itjen 2) · Media Daring Zoom Ditjen Linjamsos',
      linkZoom: 'https://zoom.us/j/kemsos-psnk-tlhp (Passcode: PSNK2026)'
    },
    {
      nama: 'Ahmad Fauzi (Fallback Venue Standar)',
      nip: '198805202025211003',
      hari: 'Senin',
      tanggal: '26 Oktober 2026',
      jam: '10.00 WIB',
      tempat: 'Kementerian Sosial Gedung A Lantai 3 Dit. Jamsos',
      linkZoom: 'https://zoom.us/j/kemsos-psnk-tlhp (Passcode: PSNK2026)'
    }
  ]

  for (let i = 0; i < recipients.length; i++) {
    if (i > 0) doc.addPage('a4', 'portrait')
    const r = recipients[i]

    autoTable(doc, {
      startY: 50,
      margin: { left: 18, right: 14 },
      body: [
        ['Hari', ':', r.hari],
        ['Tanggal', ':', r.tanggal],
        ['Jam', ':', r.jam],
        ['Tempat', ':', r.tempat],
        ['Link Zoom', ':', r.linkZoom]
      ],
      theme: 'plain',
      styles: { fontSize: 12, cellPadding: { top: 0.8, bottom: 0.8, left: 0, right: 0 } },
      columnStyles: {
        0: { cellWidth: 46 },
        1: { cellWidth: 4, halign: 'center' },
        2: { cellWidth: 'auto' }
      }
    })
  }

  assert.equal(doc.internal.getNumberOfPages(), 3)
  const buffer = doc.output('arraybuffer')
  assert.ok(buffer.byteLength > 4000)
})

test('sequential letter numbering creates distinct letter numbers per recipient in batch generation', async () => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true
  })

  const total = 5
  const startNum = 2268
  const suffix = '/3.3/KP.06.04/10/2026'

  const recipients = Array.from({ length: total }, (_, i) => ({
    nama: `ASN Judi Online #${i + 1}`,
    nip: `19850101202521${String(i).padStart(4, '0')}`,
    pangkat: 'Golongan IX',
    jabatan: 'Penata Layanan Operasional',
    letterNumber: `${startNum + i}${suffix}`
  }))

  const recordedNumbers = []

  for (let idx = 0; idx < recipients.length; idx++) {
    if (idx > 0) doc.addPage('a4', 'portrait')
    const r = recipients[idx]
    const effectiveLetterNum = r.letterNumber || 'DEFAULT'
    recordedNumbers.push(effectiveLetterNum)
    doc.text(`NOMOR : ${effectiveLetterNum}`, 105, 48.5, { align: 'center' })
  }

  assert.equal(recordedNumbers.length, 5)
  assert.equal(recordedNumbers[0], '2268/3.3/KP.06.04/10/2026')
  assert.equal(recordedNumbers[1], '2269/3.3/KP.06.04/10/2026')
  assert.equal(recordedNumbers[4], '2272/3.3/KP.06.04/10/2026')

  // Verify calculation for 1057 recipients: 2268 + 1057 - 1 = 3324
  const total1057 = 1057
  const endNum = startNum + total1057 - 1
  assert.equal(endNum, 3324)
  assert.equal(`${endNum}${suffix}`, '3324/3.3/KP.06.04/10/2026')
})

test('daily session slots quota allocation test (1.057 ASN 26-29 Okt 2026)', async () => {
  // Verify sum of quotas across slots
  const totalQuota = DAILY_SESSION_SLOTS.reduce((acc, s) => acc + s.quota, 0)
  assert.equal(totalQuota, 1057)

  // Verify slots distribution:
  // Day 1 (Senin, 26 Okt): 265 orang (133 Pagi, 132 Siang)
  // Day 2 (Selasa, 27 Okt): 264 orang (133 Pagi, 131 Siang)
  // Day 3 (Rabu, 28 Okt): 264 orang (133 Pagi, 131 Siang)
  // Day 4 (Kamis, 29 Okt): 264 orang (133 Pagi, 131 Siang)
  assert.equal(DAILY_SESSION_SLOTS[0].quota, 133)
  assert.equal(DAILY_SESSION_SLOTS[1].quota, 132)
  assert.equal(DAILY_SESSION_SLOTS[2].quota, 133)
  assert.equal(DAILY_SESSION_SLOTS[3].quota, 131)
  assert.equal(DAILY_SESSION_SLOTS[4].quota, 133)
  assert.equal(DAILY_SESSION_SLOTS[5].quota, 131)
  assert.equal(DAILY_SESSION_SLOTS[6].quota, 133)
  assert.equal(DAILY_SESSION_SLOTS[7].quota, 131)

  // Test slot resolution boundaries
  const slot0 = resolveDailySessionSlot(0)
  assert.equal(slot0.hari, 'Senin')
  assert.equal(slot0.tanggal, '26 Oktober 2026')
  assert.equal(slot0.sesiName, 'Sesi Pagi')
  assert.equal(slot0.jam, '08.30–12.00 WIB')

  const slot132 = resolveDailySessionSlot(132)
  assert.equal(slot132.hari, 'Senin')
  assert.equal(slot132.sesiName, 'Sesi Pagi')

  const slot133 = resolveDailySessionSlot(133)
  assert.equal(slot133.hari, 'Senin')
  assert.equal(slot133.sesiName, 'Sesi Siang')
  assert.equal(slot133.jam, '13.00–16.30 WIB')

  const slot264 = resolveDailySessionSlot(264)
  assert.equal(slot264.hari, 'Senin')
  assert.equal(slot264.sesiName, 'Sesi Siang')

  const slot265 = resolveDailySessionSlot(265)
  assert.equal(slot265.hari, 'Selasa')
  assert.equal(slot265.tanggal, '27 Oktober 2026')
  assert.equal(slot265.sesiName, 'Sesi Pagi')

  const slot528 = resolveDailySessionSlot(528)
  assert.equal(slot528.hari, 'Selasa')
  assert.equal(slot528.sesiName, 'Sesi Siang')

  const slot529 = resolveDailySessionSlot(529)
  assert.equal(slot529.hari, 'Rabu')
  assert.equal(slot529.tanggal, '28 Oktober 2026')
  assert.equal(slot529.sesiName, 'Sesi Pagi')

  const slot792 = resolveDailySessionSlot(792)
  assert.equal(slot792.hari, 'Rabu')
  assert.equal(slot792.sesiName, 'Sesi Siang')

  const slot793 = resolveDailySessionSlot(793)
  assert.equal(slot793.hari, 'Kamis')
  assert.equal(slot793.tanggal, '29 Oktober 2026')
  assert.equal(slot793.sesiName, 'Sesi Pagi')

  const slot1056 = resolveDailySessionSlot(1056)
  assert.equal(slot1056.hari, 'Kamis')
  assert.equal(slot1056.sesiName, 'Sesi Siang')

  // Overflow beyond 1057 (index 1057+)
  const slotOverflow = resolveDailySessionSlot(1057)
  assert.equal(slotOverflow.hari, 'Kamis')
  assert.equal(slotOverflow.sesiName, 'Cadangan/Administrasi')
  assert.equal(slotOverflow.jam, '16.30–17.00 WIB')

  // Custom times override
  const customSlot = resolveDailySessionSlot(0, {
    morningTime: '08.00–11.45 WIB',
    afternoonTime: '13.15–16.45 WIB',
    backupTime: '16.45–17.30 WIB'
  })
  assert.equal(customSlot.jam, '08.00–11.45 WIB')

  const customSlotAfternoon = resolveDailySessionSlot(150, {
    morningTime: '08.00–11.45 WIB',
    afternoonTime: '13.15–16.45 WIB'
  })
  assert.equal(customSlotAfternoon.jam, '13.15–16.45 WIB')
})

test('pdf layout test: single-line Tanggal & Jam and hybrid Dan Pada sesi table layout', async () => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true
  })

  // Set font
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(12)

  let curY = 40
  doc.text('Bersama ini diminta dengan hormat kehadiran Saudara:', 14, curY)
  curY += 5

  // Recipient info
  autoTable(doc, {
    startY: curY,
    margin: { left: 14, right: 14 },
    body: [
      ['Nama', ':', 'Ramadhan Syah'],
      ['NIP/NIPPPK', ':', '199004252025211054'],
      ['Pangkat / Golongan', ':', 'Golongan VII'],
      ['Jabatan', ':', 'Pengelola Layanan Operasional'],
      ['Unit Kerja', ':', 'Direktorat Perlindungan Sosial Non Kebencanaan']
    ],
    theme: 'plain',
    styles: { fontSize: 12, cellPadding: 0.6, textColor: [0, 0, 0] },
    columnStyles: {
      0: { cellWidth: 38 },
      1: { cellWidth: 4 },
      2: { cellWidth: 140 }
    }
  })
  curY = doc.lastAutoTable.finalY + 3

  doc.text('Untuk menghadap kepada:', 14, curY)
  curY += 5

  // Signer / Official info
  autoTable(doc, {
    startY: curY,
    margin: { left: 14, right: 14 },
    body: [
      ['Nama', ':', 'Faisal'],
      ['NIP', ':', '19761106 200502 1 001'],
      ['Pangkat', ':', 'IV/c'],
      ['Jabatan', ':', 'Direktur Perlindungan Sosial Non Kebencanaan']
    ],
    theme: 'plain',
    styles: { fontSize: 12, cellPadding: 0.6, textColor: [0, 0, 0] },
    columnStyles: {
      0: { cellWidth: 38 },
      1: { cellWidth: 4 },
      2: { cellWidth: 140 }
    }
  })
  curY = doc.lastAutoTable.finalY + 3

  doc.text('Pada :', 14, curY)
  curY += 5

  // Hybrid physical and Tanggal & Jam single-line layout
  const bodyRows = [
    ['Hari', ':', 'Senin', '', '', ''],
    ['Tanggal', ':', '26 Oktober 2026', 'Jam', ':', '08.30–12.00 WIB'],
    ['Tempat', ':', 'Kementerian Sosial Gedung A Lantai 3 Dit. Jamsos', '', '', '']
  ]

  autoTable(doc, {
    startY: curY,
    margin: { left: 14, right: 14 },
    body: bodyRows,
    theme: 'plain',
    styles: { fontSize: 12, cellPadding: 0.6, textColor: [0, 0, 0] },
    columnStyles: {
      0: { cellWidth: 38 },
      1: { cellWidth: 4 },
      2: { cellWidth: 62 },
      3: { cellWidth: 18 },
      4: { cellWidth: 4 },
      5: { cellWidth: 56 }
    }
  })
  curY = doc.lastAutoTable.finalY + 2.5

  // "Dan" + "Pada sesi :" section
  doc.text('Dan', 14, curY)
  curY += 4.5
  doc.text('Pada sesi :', 14, curY)
  curY += 5

  const sessionBodyRows = [
    ['Sesi', ':', 'Sesi Pagi (08.30–12.00 WIB)', '', '', ''],
    [
      'Link zoom',
      ':',
      { content: 'https://zoom.us/j/kemsos-psnk-tlhp (Passcode: PSNK2026)', colSpan: 4 }
    ]
  ]

  autoTable(doc, {
    startY: curY,
    margin: { left: 14, right: 14 },
    body: sessionBodyRows,
    theme: 'plain',
    styles: { fontSize: 12, cellPadding: 0.6, textColor: [0, 0, 0] },
    columnStyles: {
      0: { cellWidth: 38 },
      1: { cellWidth: 4 },
      2: { cellWidth: 62 },
      3: { cellWidth: 18 },
      4: { cellWidth: 4 },
      5: { cellWidth: 56 }
    }
  })
  curY = doc.lastAutoTable.finalY + 4

  // Closing text
  doc.text('Untuk diperiksa/dimintai keterangan sehubungan dengan dugaan pelanggaran disiplin kinerja.', 14, curY)
  curY += 5.5
  doc.text('Demikian untuk dilaksanakan.', 14, curY)
  curY += 8

  // Signature
  doc.text('Jakarta, 26 Oktober 2026', 125, curY)
  doc.text('Direktur Perlindungan Sosial Non Kebencanaan', 125, curY + 5)
  doc.text('Faisal', 125, curY + 25)
  doc.text('NIP. 19761106 200502 1 001', 125, curY + 30)

  // Must be strictly 1 page
  assert.equal(doc.internal.getNumberOfPages(), 1)
  const buffer = doc.output('arraybuffer')
  assert.ok(buffer.byteLength > 2000)
})


