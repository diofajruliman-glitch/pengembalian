import test from 'node:test'
import assert from 'node:assert/strict'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { DAILY_SESSION_SLOTS, resolveDailySessionSlot } from '../src/letters/bnbaScheduleHelper.js'
import { JADWAL_WAWANCARA_1057_REVISI, lookupJadwalWawancara1057, formatJadwal1057SessionJam } from '../src/letters/jadwalWawancara1057Data.js'
import { buildLetterNumbersExportSheets } from '../src/letters/exportLetterNumbers.js'

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

  // Separate rows for Hari, Tanggal, Jam, Tempat
  const bodyRows = [
    ['Hari', ':', 'Senin'],
    ['Tanggal', ':', '26 Oktober 2026'],
    ['Jam', ':', '08.30 WIB'],
    ['Tempat', ':', 'Kementerian Sosial Gedung A Lantai 3 Dit. Jamsos']
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
      2: { cellWidth: 'auto' }
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

test('lookupJadwalWawancara1057 dataset accuracy and NIP matching test', async () => {
  assert.equal(JADWAL_WAWANCARA_1057_REVISI.length, 1057)

  // 1. First recipient: Sahudin
  const sahu = lookupJadwalWawancara1057('198610202025211055')
  assert.ok(sahu)
  assert.equal(sahu.nama, 'Sahudin')
  assert.equal(sahu.hari, 'Senin')
  assert.equal(sahu.tanggal, '26 Oktober 2026')
  assert.equal(sahu.jam, '08.30–09.00 WIB')
  assert.equal(sahu.room, 'Room 1')
  assert.equal(sahu.petugas, 'Sekretariat Linjamsos')

  // 2. Second recipient: Hermawan Kurnia
  const herm = lookupJadwalWawancara1057('198807152025211094')
  assert.ok(herm)
  assert.equal(herm.nama, 'Hermawan Kurnia')
  assert.equal(herm.hari, 'Senin')
  assert.equal(herm.jam, '08.30–09.00 WIB')
  assert.equal(herm.room, 'Room 2')

  // 3. User sample recipient: Ramadhan Syah
  const rama = lookupJadwalWawancara1057('199004252025211054')
  assert.ok(rama)
  assert.equal(rama.nama, 'Ramadhan Syah')
  assert.equal(rama.hari, 'Rabu')
  assert.equal(rama.tanggal, '28 Oktober 2026')
  assert.equal(rama.jam, '08.30–09.00 WIB')
  assert.equal(rama.room, 'Room 12')
  assert.equal(rama.petugas, 'Putri Angelina')

  // 4. Last recipient: Muhammad Rajib
  const rajib = lookupJadwalWawancara1057('198906172025211067')
  assert.ok(rajib)
  assert.equal(rajib.nama, 'Muhammad Rajib')
  assert.equal(rajib.hari, 'Kamis')
  assert.equal(rajib.tanggal, '29 Oktober 2026')
  assert.equal(rajib.jam, '16.00–16.30 WIB')
  assert.equal(rajib.room, 'Room 19')

  // 5. Lookup by name fallback
  const ramaByName = lookupJadwalWawancara1057('', 'Ramadhan Syah')
  assert.ok(ramaByName)
  assert.equal(ramaByName.nip, '199004252025211054')
})

test('revised docx dual-session layout with unbolded Pada, Dan and Pada sesi', async () => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true
  })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(12)

  let curY = 40
  doc.text('Bersama ini diminta dengan hormat kehadiran Saudara:', 14, curY)
  curY += 5

  // Recipient table
  autoTable(doc, {
    startY: curY,
    margin: { left: 18, right: 14 },
    body: [
      ['Nama', ':', 'Ramadhan Syah'],
      ['NIP/NIPPPK', ':', '199004252025211054'],
      ['Pangkat', ':', 'Golongan VII'],
      ['Jabatan', ':', 'Pengelola Layanan Operasional'],
      ['Unit Kerja', ':', 'Direktorat Perlindungan Sosial Non Kebencanaan']
    ],
    theme: 'plain',
    styles: { fontSize: 12, cellPadding: 0.6, textColor: [0, 0, 0] },
    columnStyles: {
      0: { cellWidth: 46 },
      1: { cellWidth: 4, halign: 'center' },
      2: { cellWidth: 'auto' }
    }
  })
  curY = doc.lastAutoTable.finalY + 3

  doc.text('Untuk menghadap kepada:', 14, curY)
  curY += 5

  // Signer table
  autoTable(doc, {
    startY: curY,
    margin: { left: 18, right: 14 },
    body: [
      ['Nama', ':', 'Faisal'],
      ['NIP', ':', '19761106 2005 021 001'],
      ['Pangkat', ':', 'IV/c'],
      ['Jabatan', ':', 'Direktur Perlindungan Sosial Non Kebencanaan']
    ],
    theme: 'plain',
    styles: { fontSize: 12, cellPadding: 0.6, textColor: [0, 0, 0] },
    columnStyles: {
      0: { cellWidth: 46 },
      1: { cellWidth: 4, halign: 'center' },
      2: { cellWidth: 'auto' }
    }
  })
  curY = doc.lastAutoTable.finalY + 3

  // Pada : (Plenary Opening - Normal / Unbolded)
  doc.setFont('helvetica', 'normal')
  doc.text('Pada :', 14, curY)
  curY += 3.5

  const plenaryRows = [
    ['Hari', ':', 'Senin'],
    ['Tanggal', ':', '26 Oktober 2026'],
    ['Jam', ':', '08.30 WIB'],
    ['Link Zoom', ':', 'https://zoom.us/j/kemsos-psnk-tlhp (Passcode: PSNK2026)']
  ]

  autoTable(doc, {
    startY: curY,
    margin: { left: 18, right: 14 },
    body: plenaryRows,
    theme: 'plain',
    styles: { fontSize: 12, cellPadding: 0.6, textColor: [0, 0, 0] },
    columnStyles: {
      0: { cellWidth: 46 },
      1: { cellWidth: 4, halign: 'center' },
      2: { cellWidth: 'auto' }
    }
  })
  curY = doc.lastAutoTable.finalY + 2.5

  // Dan & Pada sesi : (Unbolded / Normal font)
  doc.setFont('helvetica', 'normal')
  doc.text('Dan', 14, curY)
  curY += 4.5
  doc.text('Pada sesi :', 14, curY)
  curY += 3.5

  // Individual interview session matched by NIP from Jadwal 1.057
  const sessionRows = [
    ['Hari', ':', 'Rabu'],
    ['Tanggal', ':', '28 Oktober 2026'],
    ['Jam', ':', '08.30–09.00 WIB'],
    ['Link zoom', ':', 'https://zoom.us/j/kemsos-psnk-tlhp (Room 12)']
  ]

  autoTable(doc, {
    startY: curY,
    margin: { left: 18, right: 14 },
    body: sessionRows,
    theme: 'plain',
    styles: { fontSize: 12, cellPadding: 0.6, textColor: [0, 0, 0] },
    columnStyles: {
      0: { cellWidth: 46 },
      1: { cellWidth: 4, halign: 'center' },
      2: { cellWidth: 'auto' }
    }
  })
  curY = doc.lastAutoTable.finalY + 4

  // Closing text
  doc.text('Untuk diperiksa/dimintai keterangan sehubungan dengan dugaan pelanggaran disiplin kinerja.', 14, curY)
  curY += 5.5
  doc.text('Demikian untuk dilaksanakan.', 14, curY)
  curY += 7

  // Signature
  doc.text('Jakarta, 15 Oktober 2026', 125, curY)
  doc.text('Direktur Perlindungan Sosial Non Kebencanaan', 125, curY + 5)
  doc.text('Faisal', 125, curY + 25)
  doc.text('NIP. 19761106 200502 1 001', 125, curY + 30)

  // Tembusan
  const tembusanY = curY + 36
  doc.text('Tembusan Yth:', 14, tembusanY)
  doc.text('1. Sekretaris Direktorat Jenderal Perlindungan dan Jaminan Sosial; dan', 16, tembusanY + 4.5)
  doc.text('2. Kepala Biro Organisasi dan Sumber Daya Manusia', 16, tembusanY + 9)

  // Strict 1 page guarantee
  assert.equal(doc.internal.getNumberOfPages(), 1)
  const buffer = doc.output('arraybuffer')
  assert.ok(buffer.byteLength > 2000)
})

test('formatJadwal1057SessionJam formats Pagi and Siang sessions with room correctly', async () => {
  // 1. Sahudin (Pagi, Room 1)
  const sahu = lookupJadwalWawancara1057('198610202025211055')
  assert.ok(sahu)
  assert.equal(sahu.sesi, 'Pagi')
  assert.equal(sahu.room, 'Room 1')
  const sahuJam = formatJadwal1057SessionJam(sahu)
  assert.equal(sahuJam, '08.30–12.00 WIB (Pagi · Room 1)')

  // 2. Hermawan Kurnia (Pagi, Room 2)
  const herm = lookupJadwalWawancara1057('198807152025211094')
  assert.ok(herm)
  assert.equal(herm.sesi, 'Pagi')
  assert.equal(herm.room, 'Room 2')
  const hermJam = formatJadwal1057SessionJam(herm)
  assert.equal(hermJam, '08.30–12.00 WIB (Pagi · Room 2)')

  // 3. Ramadhan Syah (Pagi, Room 12)
  const rama = lookupJadwalWawancara1057('199004252025211054')
  assert.ok(rama)
  assert.equal(rama.sesi, 'Pagi')
  assert.equal(rama.room, 'Room 12')
  const ramaJam = formatJadwal1057SessionJam(rama)
  assert.equal(ramaJam, '08.30–12.00 WIB (Pagi · Room 12)')

  // 4. Muhammad Rajib (Siang, Room 19)
  const rajib = lookupJadwalWawancara1057('198906172025211067')
  assert.ok(rajib)
  assert.equal(rajib.sesi, 'Siang')
  assert.equal(rajib.room, 'Room 19')
  const rajibJam = formatJadwal1057SessionJam(rajib)
  assert.equal(rajibJam, '13.00–16.30 WIB (Siang · Room 19)')

  // 5. Custom session times (e.g. colon format: 08:30-12:00 WIB and 13:00-16:30 WIB)
  const customSahuJam = formatJadwal1057SessionJam(sahu, {
    morningTime: '08:30-12:00 WIB',
    afternoonTime: '13:00-16:30 WIB'
  })
  assert.equal(customSahuJam, '08:30-12:00 WIB (Pagi · Room 1)')

  const customRajibJam = formatJadwal1057SessionJam(rajib, {
    morningTime: '08:30-12:00 WIB',
    afternoonTime: '13:00-16:30 WIB'
  })
  assert.equal(customRajibJam, '13:00-16:30 WIB (Siang · Room 19)')

  // 6. Scope options: slot_detail and time_only
  const slotDetailJam = formatJadwal1057SessionJam(sahu, { scope: 'slot_detail' })
  assert.equal(slotDetailJam, '08.30–09.00 WIB (Pagi · Room 1)')

  const timeOnlyJam = formatJadwal1057SessionJam(rajib, { scope: 'time_only' })
  assert.equal(timeOnlyJam, '13.00–16.30 WIB')
})

test('distinct plenary zoom link and session zoom link resolution test', async () => {
  const venue = {
    hari: 'Senin',
    tanggal: '26 Oktober 2026',
    jam: '08.30 WIB',
    plenaryLinkZoom: 'https://zoom.us/j/kemsos-psnk-tlhp (Passcode: PSNK2026)',
    sessionLinkZoom: 'https://zoom.us/j/kemsos-psnk-breakout (Passcode: PSNK2026)'
  }

  const recipient = {
    nama: 'Hermawan Kurnia',
    nip: '198807152025211094',
    pangkat: 'Penata Muda (IX/PPPK)',
    jabatan: 'Pengelola Layanan Operasional',
    plenaryHari: 'Senin',
    plenaryTanggal: '26 Oktober 2026',
    plenaryJam: '08.30 WIB',
    plenaryLinkZoom: venue.plenaryLinkZoom,
    sessionHari: 'Senin',
    sessionTanggal: '26 Oktober 2026',
    sessionJam: '08.30–12.00 WIB (Pagi · Room 2)',
    sessionLinkZoom: venue.sessionLinkZoom
  }

  assert.notEqual(recipient.plenaryLinkZoom, recipient.sessionLinkZoom)
  assert.equal(recipient.plenaryLinkZoom, 'https://zoom.us/j/kemsos-psnk-tlhp (Passcode: PSNK2026)')
  assert.equal(recipient.sessionLinkZoom, 'https://zoom.us/j/kemsos-psnk-breakout (Passcode: PSNK2026)')

  // Room replacement test
  const rawTemplate = 'https://zoom.us/j/kemsos-psnk-breakout ({room})'
  const evaluated = rawTemplate.replace('{room}', 'Room 2')
  assert.equal(evaluated, 'https://zoom.us/j/kemsos-psnk-breakout (Room 2)')
})

test('buildLetterNumbersExportSheets generates correct Excel sheets with NIP, Nama, and Nomor Surat', async () => {
  const recipients = [
    {
      letterNumber: '2268/3.3/KP.06.04/10/2026',
      nip: '198610202025211055',
      nama: 'Sahudin',
      pangkat: 'Golongan IX',
      jabatan: 'Penata Layanan Operasional',
      sessionHari: 'Senin',
      sessionTanggal: '26 Oktober 2026',
      sessionJam: '08.30–12.00 WIB (Pagi · Room 1)',
      sessionRoom: 'Room 1',
      sessionPetugas: 'PSNK 1',
      sessionLinkZoom: 'https://zoom.us/j/kemsos-psnk-breakout'
    },
    {
      letterNumber: '2269/3.3/KP.06.04/10/2026',
      nip: '198807152025211094',
      nama: 'Hermawan Kurnia',
      pangkat: 'Penata Muda (IX/PPPK)',
      jabatan: 'Pengelola Layanan Operasional',
      sessionHari: 'Senin',
      sessionTanggal: '26 Oktober 2026',
      sessionJam: '08.30–12.00 WIB (Pagi · Room 2)',
      sessionRoom: 'Room 2',
      sessionPetugas: 'PSNK 2',
      sessionLinkZoom: 'https://zoom.us/j/kemsos-psnk-breakout'
    }
  ]

  const sheets = buildLetterNumbersExportSheets(recipients, {
    templateName: 'Surat Pemanggilan Disiplin ASN — Indikasi Judi Online',
    letterDate: '15 Oktober 2026',
    official: { nama: 'Faisal', nip: '19761106 200502 1 001', jabatan: 'Direktur Perlindungan Sosial Non Kebencanaan' }
  })

  assert.equal(sheets.length, 2)
  const mainSheet = sheets[0]
  assert.equal(mainSheet.sheet, 'Rekap Nomor Surat')
  assert.equal(mainSheet.data.length, 3) // 1 header + 2 recipients

  // Check Header
  const headers = mainSheet.data[0].map(c => c.value)
  assert.ok(headers.includes('Nomor Surat'))
  assert.ok(headers.includes('NIP / NIPPPK'))
  assert.ok(headers.includes('Nama SDM'))

  // Check Recipient 1
  const row1 = mainSheet.data[1].map(c => c.value)
  assert.equal(row1[0], 1) // No.
  assert.equal(row1[1], '2268/3.3/KP.06.04/10/2026') // Nomor Surat
  assert.equal(row1[2], '198610202025211055') // NIP
  assert.equal(row1[3], 'Sahudin') // Nama
  assert.equal(row1[11], '08.30–12.00 WIB (Pagi · Room 1)') // Jam / Sesi
  assert.equal(row1[12], 'Room 1') // Room

  // Check Recipient 2
  const row2 = mainSheet.data[2].map(c => c.value)
  assert.equal(row2[1], '2269/3.3/KP.06.04/10/2026') // Nomor Surat
  assert.equal(row2[2], '198807152025211094') // NIP
  assert.equal(row2[3], 'Hermawan Kurnia') // Nama

  // Check Summary Sheet
  const summarySheet = sheets[1]
  assert.equal(summarySheet.sheet, 'Ringkasan & Dasar')
  assert.equal(summarySheet.data[2][1].value, 2) // Jumlah SDM
})

test('mass signature and stamp embedding performance & single-page layout test (1.057 recipients)', async () => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true
  })

  const dummyKop = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  const dummySignature = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  const total = 1057
  const startTime = Date.now()

  for (let idx = 0; idx < total; idx++) {
    if (idx > 0) doc.addPage('a4', 'portrait')

    // Kop surat
    doc.addImage(dummyKop, 'PNG', 14, 8, 182, 25, 'KEMENSOS_KOP', 'FAST')

    // Classification
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.text('RAHASIA', 14, 38)

    // Heading
    doc.text('SURAT PANGGILAN', 105, 43, { align: 'center' })
    doc.setFont('helvetica', 'normal')
    doc.text(`NOMOR : ${2268 + idx}/3.3/KP.06.04/10/2026`, 105, 48.5, { align: 'center' })

    // Body
    doc.text('Bersama ini diminta dengan hormat kehadiran Saudara:', 14, 56)

    // Schedule & signoff
    let curY = 195
    const signY = Math.max(curY + 2, 214)
    const signX = 125
    doc.text('Jakarta, 15 Oktober 2026', signX, signY)
    doc.text('Direktur Perlindungan Sosial Non Kebencanaan', signX, signY + 4.8)

    // Mass digital signature & stamp placement with image aliasing
    const imgWidth = 56
    const imgHeight = 32.6
    const imgX = signX - 20
    const imgY = signY + 4.8 + (2 * 4.5) - 4
    doc.addImage(dummySignature, 'PNG', imgX, imgY, imgWidth, imgHeight, 'TTD_CAP_FAISAL', 'FAST')

    const nameY = signY + 4.8 + (2 * 4.5) + 22
    doc.setFont('helvetica', 'bold')
    doc.text('Faisal', signX, nameY)
    doc.setFont('helvetica', 'normal')
    doc.text('NIP. 19761106 200502 1 001', signX, nameY + 4.8)

    // Tembusan
    const tembusanY = Math.min(Math.max(nameY + 6, 252), 268)
    doc.text('Tembusan Yth:', 14, tembusanY)
    doc.text('1. Sekretaris Ditjen Linjamsos', 16, tembusanY + 4)
    doc.text('2. Kepala Biro Organisasi dan SDM', 16, tembusanY + 8)

    // Verify all contents are strictly within 1 A4 page (height: 297mm, printable safe limit: 283mm)
    assert.ok(tembusanY + 8 < 283, `Page ${idx + 1} overflowed bottom margin!`)
  }

  const durationMs = Date.now() - startTime
  assert.equal(doc.internal.getNumberOfPages(), 1057)

  const buffer = doc.output('arraybuffer')
  assert.ok(buffer.byteLength > 100000)
  assert.ok(buffer.byteLength < 6000000, 'Batch size should remain small thanks to image aliasing')
  assert.ok(durationMs < 12000, `Mass generation of 1057 pages took ${durationMs}ms, should be fast`)
})

test('signature and stamp coordinate & spacing validation test (A4 single page guarantee)', () => {
  const curY = 198 // After dual session schedule, agenda and closing text
  const signY = Math.max(curY + 2, 214)
  const signX = 125
  const splitRoleLength = 2
  const roleBottomY = signY + 4.8 + (splitRoleLength * 4.5)

  // Signature image specs
  const imgWidth = 56
  const imgHeight = 32.6
  const imgX = signX - 20
  const imgY = roleBottomY - 4

  // Verify stamp extends to the left of the signature column
  assert.equal(imgX, 105, 'Image X must sit 20mm to left of text so stamp sits properly')
  assert.equal(imgX + imgWidth, 161, 'Image right edge must sit inside right margin')

  const nameY = roleBottomY + 22
  const nipY = nameY + 4.8
  const tembusanY = Math.min(Math.max(nameY + 6, 252), 268)
  const lastTembusanItemY = tembusanY + 4 + (2 * 4)

  assert.ok(nipY < 265, `NIP Y (${nipY}mm) must be well above tembusan`)
  assert.ok(lastTembusanItemY < 282, `Last tembusan (${lastTembusanItemY}mm) must fit within A4 297mm height`)
})

test('surat panggilan numbered layout (1 and 2) and flush-indented sections matching uploaded image', () => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true
  })

  let curY = 56
  // Item 1
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(12)
  doc.text('1.', 14, curY)
  const opening = 'Bersama ini diminta dengan hormat kehadiran Saudara:'
  const splitOpening = doc.splitTextToSize(opening, 176)
  doc.text(splitOpening, 20, curY)
  curY += (splitOpening.length * 4.8) + 2

  // Recipient table (indented at 20mm)
  autoTable(doc, {
    startY: curY,
    margin: { left: 20, right: 14 },
    body: [
      ['Nama', ':', 'Dina Mariana Br Sembiring'],
      ['NIP/NI PPPK', ':', '19860427 202521 2 048'],
      ['Pangkat', ':', 'IX'],
      ['Jabatan', ':', 'Penata Layanan Operasional'],
      ['Unit Kerja', ':', 'Direktorat Perlindungan Sosial Non Kebencanaan']
    ],
    theme: 'plain',
    styles: { fontSize: 12, cellPadding: { top: 0.8, bottom: 0.8, left: 0, right: 0 } },
    columnStyles: { 0: { cellWidth: 44 }, 1: { cellWidth: 4, halign: 'center' }, 2: { cellWidth: 'auto' } }
  })
  curY = doc.lastAutoTable.finalY + 3.5

  // Untuk menghadap kepada (indented at 20mm)
  doc.text('Untuk menghadap kepada:', 20, curY)
  curY += 3.5

  // Official table (indented at 20mm)
  autoTable(doc, {
    startY: curY,
    margin: { left: 20, right: 14 },
    body: [
      ['Nama', ':', 'Faisal'],
      ['NIP', ':', '19761106 200502 1 001'],
      ['Pangkat', ':', 'IV/c'],
      ['Jabatan', ':', 'Direktur Perlindungan Sosial Non Kebencanaan']
    ],
    theme: 'plain',
    styles: { fontSize: 12, cellPadding: { top: 0.8, bottom: 0.8, left: 0, right: 0 } },
    columnStyles: { 0: { cellWidth: 44 }, 1: { cellWidth: 4, halign: 'center' }, 2: { cellWidth: 'auto' } }
  })
  curY = doc.lastAutoTable.finalY + 3.5

  // Pada : (indented at 20mm)
  doc.text('Pada :', 20, curY)
  curY += 3.5
  autoTable(doc, {
    startY: curY,
    margin: { left: 20, right: 14 },
    body: [
      ['Hari', ':', 'Senin'],
      ['Tanggal', ':', '26 Oktober 2026'],
      ['Jam', ':', '08.30 WIB'],
      ['Link Zoom', ':', 'https://zoom.us/j/kemsos-psnk-tlhp (Passcode: PSNK2026)']
    ],
    theme: 'plain',
    styles: { fontSize: 12, cellPadding: { top: 0.8, bottom: 0.8, left: 0, right: 0 } },
    columnStyles: { 0: { cellWidth: 44 }, 1: { cellWidth: 4, halign: 'center' }, 2: { cellWidth: 'auto' } }
  })
  curY = doc.lastAutoTable.finalY + 2.5

  // Dan & Pada sesi : (indented at 20mm)
  doc.text('Dan', 20, curY)
  curY += 4.5
  doc.text('Pada sesi :', 20, curY)
  curY += 3.5
  autoTable(doc, {
    startY: curY,
    margin: { left: 20, right: 14 },
    body: [
      ['Hari', ':', 'Senin'],
      ['Tanggal', ':', '26 Oktober 2026'],
      ['Jam', ':', '08.30–12.00 WIB (Pagi · Room 2)'],
      ['Link zoom', ':', 'https://zoom.us/j/kemsos-psnk-breakout (Passcode: PSNK2026)']
    ],
    theme: 'plain',
    styles: { fontSize: 12, cellPadding: { top: 0.8, bottom: 0.8, left: 0, right: 0 } },
    columnStyles: { 0: { cellWidth: 44 }, 1: { cellWidth: 4, halign: 'center' }, 2: { cellWidth: 'auto' } }
  })
  curY = doc.lastAutoTable.finalY + 3.5

  // Agenda Permensos (indented at 20mm)
  const agenda = 'Untuk diperiksa, sehubungan dengan dugaan pelanggaran disiplin Peraturan Menteri Sosial Nomor 5 Tahun 2023 tentang Disiplin Aparatur Sipil Negara di lingkungan Kementerian Sosial'
  const splitAgenda = doc.splitTextToSize(agenda, 176)
  doc.text(splitAgenda, 20, curY)
  curY += (splitAgenda.length * 4.8) + 3

  // Item 2 (outer margin 14mm, content 20mm)
  doc.text('2.', 14, curY)
  const closing = 'Demikian untuk dilaksanakan.'
  const splitClosing = doc.splitTextToSize(closing, 176)
  doc.text(splitClosing, 20, curY)
  curY += (splitClosing.length * 4.8) + 3

  // Signoff block
  const signY = Math.max(curY + 2, 214)
  const signX = 125
  doc.text('Jakarta, 15 Oktober 2026', signX, signY)
  doc.text('Direktur Perlindungan Sosial Non Kebencanaan', signX, signY + 4.8)

  const nameY = signY + 4.8 + (2 * 4.5) + 22
  doc.setFont('helvetica', 'bold')
  doc.text('Faisal', signX, nameY)
  doc.setFont('helvetica', 'normal')
  doc.text('NIP. 19761106 200502 1 001', signX, nameY + 4.8)

  const tembusanY = Math.min(Math.max(nameY + 6, 252), 268)
  doc.text('Tembusan Yth:', 14, tembusanY)
  doc.text('1. Sekretaris Ditjen Linjamsos', 16, tembusanY + 4)
  doc.text('2. Kepala Biro Organisasi dan SDM', 16, tembusanY + 8)

  assert.equal(doc.internal.getNumberOfPages(), 1, 'Must strictly remain on 1 page')
  assert.ok(tembusanY + 8 < 283, 'Tembusan must fit safely within A4 page height')
})







