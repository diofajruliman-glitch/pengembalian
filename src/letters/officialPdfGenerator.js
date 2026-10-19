import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import kopImage from '../assets/kop-kemensos.png'

const fmtRp = n => 'Rp ' + Number(n || 0).toLocaleString('id-ID', { maximumFractionDigits: 0 })

let cachedKopDataUrl = null

/**
 * Mendapatkan base64 Data URL dari Kop Surat Resmi Kemensos
 */
export async function getKopDataUrl() {
  if (cachedKopDataUrl) return cachedKopDataUrl

  // Bila berjalan di environment browser
  if (typeof window !== 'undefined' && typeof Image !== 'undefined') {
    return new Promise((resolve) => {
      const img = new Image()
      img.crossOrigin = 'Anonymous'
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas')
          canvas.width = img.naturalWidth || img.width
          canvas.height = img.naturalHeight || img.height
          const ctx = canvas.getContext('2d')
          ctx.drawImage(img, 0, 0)
          cachedKopDataUrl = canvas.toDataURL('image/png')
          resolve(cachedKopDataUrl)
        } catch {
          resolve(kopImage)
        }
      }
      img.onerror = () => resolve(kopImage)
      img.src = kopImage
    })
  }
  return kopImage
}

/**
 * Generator Naskah Dinas Resmi Kemensos Berkecepatan Tinggi (Vector jsPDF)
 * Mampu merender ribuan lembar dokumen dalam hitungan detik tanpa konsumsi memori berlebih.
 */
export async function generateOfficialPdfBatch({
  template,
  official,
  venue,
  letterNumber = '       /3.3/KP.06.04/10/2026',
  letterDate = '15 Oktober 2026',
  customAgenda = '',
  customOpening = '',
  customCoordination = '',
  customClosing = '',
  recipients = [],
  onProgress = null,
  showClassification = true,
  classificationPosition = 'left',
  classificationText = '',
  showRank = true
}) {
  if (!recipients || recipients.length === 0) {
    throw new Error('Daftar penerima naskah dinas kosong.')
  }

  const kopData = await getKopDataUrl()
  const isTagihan = template.category === 'keuangan' && !template.id?.startsWith('panggilan')
  const isBeritaAcara = template.category === 'berita-acara'
  const effectiveShowClassification = showClassification ?? template.showClassification ?? true
  const effectivePosition = classificationPosition || template.classificationPosition || 'left'
  const effectiveClassification = classificationText || template.classification || 'RAHASIA'
  const effectiveShowRank = showRank ?? template.showRank ?? true

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true
  })

  const total = recipients.length

  for (let idx = 0; idx < total; idx++) {
    const recipient = recipients[idx]
    if (idx > 0) {
      doc.addPage('a4', 'portrait')
    }

    // Laporkan progres berkala
    if (onProgress && (idx % 25 === 0 || idx === total - 1)) {
      onProgress(idx + 1, total, `Menyusun lembar ${idx + 1} dari ${total}...`)
      // Beri kesempatan browser merender UI progress
      await new Promise(r => setTimeout(r, 0))
    }

    // 1. KOP SURAT RESMI KEMENSOS
    // A4 width: 210mm. Margin kiri 14mm -> lebar kop 182mm, tinggi 25mm
    try {
      doc.addImage(kopData, 'PNG', 14, 8, 182, 25, 'KEMENSOS_KOP', 'FAST')
    } catch (e) {
      // Fallback text jika gambar kop gagal
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.text('KEMENTERIAN SOSIAL REPUBLIK INDONESIA', 105, 14, { align: 'center' })
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.text('DIREKTORAT PERLINDUNGAN SOSIAL NON KEBENCANAAN', 105, 19, { align: 'center' })
      doc.setLineWidth(0.4)
      doc.line(14, 25, 196, 25)
    }

    // 2. KLASIFIKASI DOKUMEN / DERAJAT KEAMANAN (BISA DIATUR POSISI ATAU DINONAKTIFKAN)
    if (effectiveShowClassification) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(12)
      doc.setTextColor(30, 41, 59)
      if (effectivePosition === 'center') {
        doc.text(effectiveClassification, 105, 38, { align: 'center' })
      } else if (effectivePosition === 'right') {
        doc.text(effectiveClassification, 196, 38, { align: 'right' })
      } else {
        doc.text(effectiveClassification, 14, 38)
      }
    }

    // 3. JUDUL DAN NOMOR SURAT (FONT ARIAL 12 PT STANDAR TATA NASKAH DINAS)
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text(template.title || 'SURAT PANGGILAN', 105, 43, { align: 'center' })
    doc.setFontSize(12)
    doc.setFont('helvetica', 'normal')
    const currentLetterNum = recipient?.letterNumber || letterNumber
    doc.text(`NOMOR : ${currentLetterNum}`, 105, 48.5, { align: 'center' })

    let curY = 56

    if (isTagihan) {
      // ================= KONTEN SURAT PENAGIHAN =================
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(12)
      doc.text('Kepada Yth.', 14, curY)
      curY += 5
      doc.setFont('helvetica', 'bold')
      doc.text(`Saudara/i ${recipient.nama || '—'}`, 14, curY)
      curY += 5
      doc.setFont('helvetica', 'normal')
      doc.text(`NIP/NIPPPK : ${recipient.nip || '—'}`, 14, curY)
      curY += 5
      doc.text(`Jabatan : ${recipient.jabatan || 'PPPK Direktorat PSNK'}`, 14, curY)
      curY += 5
      doc.text('di Tempat', 14, curY)
      curY += 6.5

      // Paragraf Pembuka
      const opening = customOpening || template.openingText || 'Sehubungan dengan Hasil Pemeriksaan dan Rekonsiliasi Tindak Lanjut Pengembalian Kelebihan Pembayaran Tunjangan Kinerja dan Uang Makan PPPK TA 2025 pada Direktorat Perlindungan Sosial Non Kebencanaan, bersama ini kami sampaikan rincian kewajiban pengembalian yang masih tercatat sebagai berikut:'
      const splitOpening = doc.splitTextToSize(opening, 182)
      doc.text(splitOpening, 14, curY)
      curY += (splitOpening.length * 4.8) + 3

      // Tabel 5 Kolom Presisi
      const catDesc = recipient.kategori ? `Status/Kategori: ${recipient.kategori}` : 'PPPK Dit. PSNK'
      const bankDesc = recipient.bank ? ` · Payroll Bank ${recipient.bank}` : ''
      const uraianText = `Pengembalian Kelebihan Pembayaran Tukin & Uang Makan\n${catDesc}${bankDesc}`

      autoTable(doc, {
        startY: curY,
        margin: { left: 14, right: 14 },
        head: [['No', 'Uraian Kewajiban', 'Kewajiban Awal', 'Telah Disetor', 'Sisa yang Wajib Disetor']],
        body: [
          [
            '1',
            uraianText,
            fmtRp(recipient.kewajibanTotal || 0),
            fmtRp(recipient.realisasiTotal || 0),
            fmtRp(recipient.sisaKewajiban || 0)
          ]
        ],
        foot: [
          [
            { content: 'Total Sisa Kewajiban :', colSpan: 4, styles: { halign: 'right', fontStyle: 'bold' } },
            fmtRp(recipient.sisaKewajiban || 0)
          ]
        ],
        theme: 'grid',
        headStyles: {
          fillColor: [241, 245, 249],
          textColor: [15, 23, 42],
          fontStyle: 'bold',
          halign: 'center',
          valign: 'middle',
          lineWidth: 0.2,
          lineColor: [203, 213, 225],
          fontSize: 8.5
        },
        bodyStyles: {
          textColor: [30, 41, 59],
          lineWidth: 0.2,
          lineColor: [203, 213, 225],
          fontSize: 8.5
        },
        footStyles: {
          fillColor: [254, 242, 242],
          textColor: [185, 28, 28],
          fontStyle: 'bold',
          lineWidth: 0.2,
          lineColor: [203, 213, 225],
          fontSize: 9
        },
        columnStyles: {
          0: { cellWidth: 8, halign: 'center' },
          1: { cellWidth: 'auto' },
          2: { cellWidth: 28, halign: 'right' },
          3: { cellWidth: 28, halign: 'right' },
          4: { cellWidth: 48, halign: 'right', fontStyle: 'bold', textColor: [185, 28, 28] }
        },
        didParseCell: (data) => {
          if (data.section === 'head') {
            data.cell.styles.halign = 'center'
            data.cell.styles.valign = 'middle'
            data.cell.styles.textColor = [15, 23, 42]
            data.cell.styles.fontStyle = 'bold'
          }
        }
      })

      curY = doc.lastAutoTable.finalY + 4

      // Paragraf Agenda / Penyetoran SIMPONI
      const agenda = customAgenda || template.agendaDefault
      if (agenda) {
        const splitAgenda = doc.splitTextToSize(agenda, 182)
        doc.text(splitAgenda, 14, curY)
        curY += (splitAgenda.length * 4.8) + 3
      }

      // Koordinasi & Penutup
      const coordText = customCoordination || template.coordinationText || 'Apabila terdapat ketidaksesuaian perhitungan data atau telah memiliki bukti setor yang belum terverifikasi, Saudara dapat segera berkoordinasi langsung dengan Pokja SD Tim TLHP Direktorat PSNK.'
      if (coordText) {
        const splitCoord = doc.splitTextToSize(coordText, 182)
        doc.text(splitCoord, 14, curY)
        curY += (splitCoord.length * 4.8) + 3
      }

      const closing = customClosing || template.closingText || 'Demikian surat penagihan ini disampaikan untuk menjadi perhatian dan dilaksanakan sebagaimana mestinya.'
      const splitClosing = doc.splitTextToSize(closing, 182)
      doc.text(splitClosing, 14, curY)
      curY += (splitClosing.length * 4.8) + 4

    } else if (isBeritaAcara) {
      // ================= KONTEN BERITA ACARA (FONT ARIAL 12 PT) =================
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(12)
      const openBA = `Pada hari ini ${venue.hari || 'Senin'}, tanggal ${venue.tanggal || '26 Oktober 2026'}, bertempat di ${venue.tempat || 'Kementerian Sosial RI'}, kami yang bertanda tangan di bawah ini:`
      const splitOpenBA = doc.splitTextToSize(openBA, 182)
      doc.text(splitOpenBA, 14, curY)
      curY += (splitOpenBA.length * 4.8) + 2

      // Tabel Pemeriksa
      const officialRows = [
        ['1. Nama', ':', { content: official.nama, styles: { fontStyle: 'bold' } }],
        ['   NIP', ':', official.nip]
      ]
      if (effectiveShowRank) {
        officialRows.push(['   Pangkat/Gol', ':', official.pangkat || official.pangkatSingkat || 'IV/c'])
      }
      officialRows.push(['   Jabatan', ':', official.jabatan])

      autoTable(doc, {
        startY: curY,
        margin: { left: 18, right: 14 },
        body: officialRows,
        theme: 'plain',
        styles: { fontSize: 12, cellPadding: { top: 0.8, bottom: 0.8, left: 0, right: 0 }, textColor: [30, 41, 59] },
        columnStyles: { 0: { cellWidth: 46 }, 1: { cellWidth: 4, halign: 'center' }, 2: { cellWidth: 'auto' } }
      })
      curY = doc.lastAutoTable.finalY + 2.5

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(12)
      doc.text('Selaku Pemeriksa, telah melakukan pemeriksaan/permintaan keterangan terhadap:', 18, curY)
      curY += 4.5

      // Tabel Yang Diperiksa
      const subjectRows = [
        ['2. Nama', ':', { content: recipient.nama || '—', styles: { fontStyle: 'bold' } }],
        ['   NIP/NIPPPK', ':', recipient.nip || '—']
      ]
      if (effectiveShowRank) {
        subjectRows.push(['   Pangkat / Golongan', ':', recipient.pangkat || 'Golongan IX'])
      }
      subjectRows.push(
        ['   Jabatan', ':', recipient.jabatan || 'Penata Layanan Operasional'],
        ['   Unit Kerja', ':', recipient.unitKerja || official.unitKerja]
      )

      autoTable(doc, {
        startY: curY,
        margin: { left: 18, right: 14 },
        body: subjectRows,
        theme: 'plain',
        styles: { fontSize: 12, cellPadding: { top: 0.8, bottom: 0.8, left: 0, right: 0 }, textColor: [30, 41, 59] },
        columnStyles: { 0: { cellWidth: 46 }, 1: { cellWidth: 4, halign: 'center' }, 2: { cellWidth: 'auto' } }
      })
      curY = doc.lastAutoTable.finalY + 3.5

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(12)
      const agendaBA = `Pemeriksaan/permintaan keterangan dilakukan sehubungan dengan: ${customAgenda || template.agendaDefault}. Seluruh keterangan dan pernyataan yang diberikan telah dicatat secara benar, tanpa ada paksaan dari pihak manapun.`
      const splitAgendaBA = doc.splitTextToSize(agendaBA, 182)
      doc.text(splitAgendaBA, 14, curY)
      curY += (splitAgendaBA.length * 4.8) + 3

      const closeBA = customClosing || template.closingText || 'Demikian Berita Acara ini dibuat dengan sebenarnya dalam rangkap 2 (dua) untuk dipergunakan sebagaimana mestinya.'
      const splitCloseBA = doc.splitTextToSize(closeBA, 182)
      doc.text(splitCloseBA, 14, curY)
      curY += (splitCloseBA.length * 4.8) + 4

    } else {
      // ================= KONTEN SURAT PEMANGGILAN (FONT ARIAL 12 PT) =================
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(12)
      const opening = customOpening || template.openingText || 'Bersama ini diminta dengan hormat kehadiran Saudara:'
      const splitOpening = doc.splitTextToSize(opening, 182)
      doc.text(splitOpening, 14, curY)
      curY += (splitOpening.length * 4.8) + 2

      // Tabel Data Penerima
      const recipientRows = [
        ['Nama', ':', { content: recipient.nama || '—', styles: { fontStyle: 'bold' } }],
        ['NIP/NIPPPK', ':', recipient.nip || '—']
      ]
      if (effectiveShowRank) {
        recipientRows.push(['Pangkat / Golongan', ':', recipient.pangkat || 'Golongan IX'])
      }
      recipientRows.push(
        ['Jabatan', ':', recipient.jabatan || 'Penata Layanan Operasional'],
        ['Unit Kerja', ':', recipient.unitKerja || official.unitKerja]
      )

      if (Number(recipient.sisaKewajiban || 0) > 0) {
        recipientRows.push(['Sisa yang Wajib Disetor', ':', { content: fmtRp(recipient.sisaKewajiban), styles: { fontStyle: 'bold', textColor: [185, 28, 28] } }])
      }

      autoTable(doc, {
        startY: curY,
        margin: { left: 18, right: 14 },
        body: recipientRows,
        theme: 'plain',
        styles: { fontSize: 12, cellPadding: { top: 0.8, bottom: 0.8, left: 0, right: 0 }, textColor: [30, 41, 59] },
        columnStyles: {
          0: { cellWidth: 46 },
          1: { cellWidth: 4, halign: 'center' },
          2: { cellWidth: 'auto' }
        }
      })
      curY = doc.lastAutoTable.finalY + 3.5

      // Jika ada kewajiban pengembalian, tampilkan tabel 5 kolom presisi
      if (Number(recipient.sisaKewajiban || 0) > 0) {
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(11)
        doc.text('Rincian Kewajiban Pengembalian yang Masih Tercatat :', 14, curY)
        curY += 3.5

        const catDesc = recipient.kategori ? `Status/Kategori: ${recipient.kategori}` : 'PPPK Dit. PSNK'
        const bankDesc = recipient.bank ? ` · Payroll Bank ${recipient.bank}` : ''
        const uraianText = `Pengembalian Kelebihan Pembayaran Tukin & Uang Makan\n${catDesc}${bankDesc}`

        autoTable(doc, {
          startY: curY,
          margin: { left: 14, right: 14 },
          head: [['No', 'Uraian Kewajiban', 'Kewajiban Awal', 'Telah Disetor', 'Sisa yang Wajib Disetor']],
          body: [
            [
              '1',
              uraianText,
              fmtRp(recipient.kewajibanTotal || 0),
              fmtRp(recipient.realisasiTotal || 0),
              fmtRp(recipient.sisaKewajiban || 0)
            ]
          ],
          foot: [
            [
              { content: 'Total Sisa Kewajiban :', colSpan: 4, styles: { halign: 'right', fontStyle: 'bold' } },
              fmtRp(recipient.sisaKewajiban || 0)
            ]
          ],
          theme: 'grid',
          headStyles: {
            fillColor: [241, 245, 249],
            textColor: [15, 23, 42],
            fontStyle: 'bold',
            halign: 'center',
            valign: 'middle',
            lineWidth: 0.2,
            lineColor: [203, 213, 225],
            fontSize: 8.5
          },
          bodyStyles: {
            textColor: [30, 41, 59],
            lineWidth: 0.2,
            lineColor: [203, 213, 225],
            fontSize: 8.5
          },
          footStyles: {
            fillColor: [254, 242, 242],
            textColor: [185, 28, 28],
            fontStyle: 'bold',
            lineWidth: 0.2,
            lineColor: [203, 213, 225],
            fontSize: 9
          },
          columnStyles: {
            0: { cellWidth: 8, halign: 'center' },
            1: { cellWidth: 'auto' },
            2: { cellWidth: 28, halign: 'right' },
            3: { cellWidth: 28, halign: 'right' },
            4: { cellWidth: 48, halign: 'right', fontStyle: 'bold', textColor: [185, 28, 28] }
          },
          didParseCell: (data) => {
            if (data.section === 'head') {
              data.cell.styles.halign = 'center'
              data.cell.styles.valign = 'middle'
              data.cell.styles.textColor = [15, 23, 42]
              data.cell.styles.fontStyle = 'bold'
            }
          }
        })
        curY = doc.lastAutoTable.finalY + 3.5
      }

      // Untuk Menghadap Kepada
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(12)
      doc.text('Untuk menghadap kepada:', 14, curY)
      curY += 3.5

      const faceRows = [
        ['Nama', ':', { content: official.nama, styles: { fontStyle: 'bold' } }],
        ['NIP', ':', official.nip]
      ]
      if (effectiveShowRank) {
        faceRows.push(['Pangkat', ':', official.pangkatSingkat || official.pangkat || 'IV/c'])
      }
      faceRows.push(['Jabatan', ':', official.jabatan])

      autoTable(doc, {
        startY: curY,
        margin: { left: 18, right: 14 },
        body: faceRows,
        theme: 'plain',
        styles: { fontSize: 12, cellPadding: { top: 0.8, bottom: 0.8, left: 0, right: 0 }, textColor: [30, 41, 59] },
        columnStyles: {
          0: { cellWidth: 46 },
          1: { cellWidth: 4, halign: 'center' },
          2: { cellWidth: 'auto' }
        }
      })
      curY = doc.lastAutoTable.finalY + 3.5

      // Jadwal / Pada :
      const isDualSession = Boolean(
        recipient.isDualSession ||
        template.id === 'panggilan-judol' ||
        recipient.sessionHari
      )

      if (isDualSession) {
        const plenaryHari = recipient.plenaryHari || venue.plenaryHari || 'Senin'
        const plenaryTanggal = recipient.plenaryTanggal || venue.plenaryTanggal || '26 Oktober 2026'
        const plenaryJam = recipient.plenaryJam || venue.plenaryJam || '08.30 WIB'
        const plenaryLinkZoom = recipient.plenaryLinkZoom || venue.plenaryLinkZoom || venue.linkZoom || recipient.linkZoom || ''

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(12)
        doc.text('Pada :', 14, curY)
        curY += 3.5

        const plenaryRows = [
          ['Hari', ':', plenaryHari],
          ['Tanggal', ':', plenaryTanggal],
          ['Jam', ':', plenaryJam],
          ['Link Zoom', ':', plenaryLinkZoom]
        ]

        autoTable(doc, {
          startY: curY,
          margin: { left: 18, right: 14 },
          body: plenaryRows,
          theme: 'plain',
          styles: { fontSize: 12, cellPadding: { top: 0.8, bottom: 0.8, left: 0, right: 0 }, textColor: [30, 41, 59] },
          columnStyles: {
            0: { cellWidth: 46 },
            1: { cellWidth: 4, halign: 'center' },
            2: { cellWidth: 'auto' }
          }
        })
        curY = doc.lastAutoTable.finalY + 2.5

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(12)
        doc.text('Dan', 14, curY)
        curY += 4.5
        doc.text('Pada sesi :', 14, curY)
        curY += 3.5

        const sessionHari = recipient.sessionHari || recipient.hari || 'Senin'
        const sessionTanggal = recipient.sessionTanggal || recipient.tanggal || '26 Oktober 2026'
        const sessionJam = recipient.sessionJam || recipient.jam || '08.30–09.00 WIB'
        const sessionLinkZoom = recipient.sessionLinkZoom || recipient.linkZoom || venue.linkZoom || ''

        const sessionRows = [
          ['Hari', ':', sessionHari],
          ['Tanggal', ':', sessionTanggal],
          ['Jam', ':', sessionJam],
          ['Link zoom', ':', sessionLinkZoom]
        ]

        autoTable(doc, {
          startY: curY,
          margin: { left: 18, right: 14 },
          body: sessionRows,
          theme: 'plain',
          styles: { fontSize: 12, cellPadding: { top: 0.8, bottom: 0.8, left: 0, right: 0 }, textColor: [30, 41, 59] },
          columnStyles: {
            0: { cellWidth: 46 },
            1: { cellWidth: 4, halign: 'center' },
            2: { cellWidth: 'auto' }
          }
        })
        curY = doc.lastAutoTable.finalY + 4
      } else {
        const linkZoom = recipient.linkZoom || venue.linkZoom
        const effectiveHari = recipient.hari || venue.hari || 'Senin'
        const effectiveTanggal = recipient.tanggal || venue.tanggal || '26 Oktober 2026'
        const effectiveJam = recipient.jam || venue.jam || '08.30 WIB'
        const effectiveTempat = recipient.tempat || venue.tempat || 'Kementerian Sosial Gedung A Lantai 3 Dit. Jamsos'

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(12)
        doc.text('Pada :', 14, curY)
        curY += 3.5

        const scheduleRows = [
          ['Hari', ':', effectiveHari],
          ['Tanggal', ':', effectiveTanggal],
          ['Jam', ':', effectiveJam],
          ['Tempat', ':', effectiveTempat]
        ]
        if (linkZoom) {
          scheduleRows.push(['Link Zoom', ':', linkZoom])
        }

        autoTable(doc, {
          startY: curY,
          margin: { left: 18, right: 14 },
          body: scheduleRows,
          theme: 'plain',
          styles: { fontSize: 12, cellPadding: { top: 0.8, bottom: 0.8, left: 0, right: 0 }, textColor: [30, 41, 59] },
          columnStyles: {
            0: { cellWidth: 46 },
            1: { cellWidth: 4, halign: 'center' },
            2: { cellWidth: 'auto' }
          }
        })
        curY = doc.lastAutoTable.finalY + 4
      }

      // Paragraf Agenda
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(12)
      const agenda = customAgenda || template.agendaDefault
      if (agenda) {
        const splitAgenda = doc.splitTextToSize(agenda, 182)
        doc.text(splitAgenda, 14, curY)
        curY += (splitAgenda.length * 4.8) + 3
      }

      // Paragraf Koordinasi (Jika ada, misal untuk Panggilan Pengembalian Tukin / Finansial)
      const coordText = customCoordination || template.coordinationText
      if (coordText) {
        const splitCoord = doc.splitTextToSize(coordText, 182)
        doc.text(splitCoord, 14, curY)
        curY += (splitCoord.length * 4.8) + 3
      }

      // Paragraf Penutup
      const closing = customClosing || template.closingText || 'Demikian untuk dilaksanakan.'
      const splitClosing = doc.splitTextToSize(closing, 182)
      doc.text(splitClosing, 14, curY)
      curY += (splitClosing.length * 4.8) + 3
    }

    // 4. TITIMANGSA & BLOK TANDA TANGAN (FONT ARIAL 12 PT)
    let nameY = 245
    if (isBeritaAcara) {
      // Blok tanda tangan ganda untuk Berita Acara
      const signY = Math.max(curY + 4, 222)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(12)

      // Kiri: Yang Diperiksa
      doc.text('Yang Diperiksa,', 18, signY)
      doc.setFont('helvetica', 'bold')
      doc.text(recipient.nama || '—', 18, signY + 20)
      doc.setFont('helvetica', 'normal')
      doc.text(`NIP. ${recipient.nip || '—'}`, 18, signY + 25)

      // Kanan: Pemeriksa
      const rightX = 125
      doc.text(`${official.kota || 'Jakarta'}, ${letterDate}`, rightX, signY)
      doc.text('Pemeriksa,', rightX, signY + 5)
      doc.setFont('helvetica', 'bold')
      doc.text(official.nama, rightX, signY + 20)
      doc.setFont('helvetica', 'normal')
      doc.text(`NIP. ${official.nip}`, rightX, signY + 25)
      nameY = signY + 25
    } else {
      // Blok tanda tangan tunggal resmi (Kanan Bawah)
      const signY = Math.max(curY + 3, 218)
      const signX = 125
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(12)
      doc.text(`${official.kota || 'Jakarta'}, ${letterDate}`, signX, signY)

      const splitRole = doc.splitTextToSize(official.jabatan, 72)
      doc.text(splitRole, signX, signY + 4.8)

      nameY = signY + 4.8 + (splitRole.length * 4.5) + 15
      doc.setFont('helvetica', 'bold')
      doc.text(official.nama, signX, nameY)
      doc.setFont('helvetica', 'normal')
      doc.text(`NIP. ${official.nip}`, signX, nameY + 4.8)
    }

    // 5. TEMBUSAN RESMI
    if (template.tembusan && template.tembusan.length > 0) {
      const tembusanY = Math.min(Math.max(nameY + 6, 252), 268)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10.5)
      doc.text('Tembusan Yth:', 14, tembusanY)

      template.tembusan.forEach((t, tIdx) => {
        const itemY = tembusanY + 4 + (tIdx * 4)
        if (itemY < 288) {
          doc.text(`${tIdx + 1}. ${t}`, 16, itemY)
        }
      })
    }
  }

  // Bangun Nama File Unduhan
  const rawTitle = template.title || 'Naskah_Dinas_Kemensos'
  const sanitizedTitle = rawTitle.replace(/[^a-zA-Z0-9_-]/g, '_')
  let filename = ''

  if (total === 1) {
    const namePart = (recipients[0]?.nama || 'Penerima').replace(/[^a-zA-Z0-9_-]/g, '_')
    filename = `${sanitizedTitle}_${namePart}.pdf`
  } else {
    filename = `${sanitizedTitle}_Batch_${total}_SDM.pdf`
  }

  // Laporkan progres selesai 100%
  if (onProgress) {
    onProgress(total, total, `Menyelesaikan dan mengunduh berkas PDF (${total.toLocaleString('id-ID')} Lembar)...`)
    await new Promise(r => setTimeout(r, 0))
  }

  // Simpan berkas PDF
  doc.save(filename)
  return { filename, total }
}
