export const DEFAULT_OFFICIAL = {
  nama: 'Faisal',
  nip: '19761106 200502 1 001',
  pangkat: 'Pembina Tingkat I (IV/c)',
  pangkatSingkat: 'IV/c',
  jabatan: 'Direktur Perlindungan Sosial Non Kebencanaan',
  unitKerja: 'Direktorat Perlindungan Sosial Non Kebencanaan',
  kota: 'Jakarta'
}

export const DEFAULT_VENUE = {
  tempat: 'Kementerian Sosial Gedung A Lantai 3 Dit. Jamsos',
  alamatLuring: 'Jl. Salemba Raya No. 28 Jakarta Pusat',
  linkZoom: 'https://zoom.us/j/kemsos-psnk-tlhp (Passcode: PSNK2026)',
  jam: '10.00 WIB',
  hari: 'Senin',
  tanggal: '26 Oktober 2026'
}

export const LETTER_TYPES = [
  {
    id: 'panggilan-1',
    category: 'disiplin',
    name: 'Surat Panggilan I (Disiplin Kinerja)',
    code: 'KP.06.04',
    classification: 'RAHASIA',
    title: 'SURAT PANGGILAN',
    openingText: 'Bersama ini diminta dengan hormat kehadiran Saudara:',
    agendaDefault: 'Untuk diperiksa/dimintai keterangan sehubungan dengan dugaan pelanggaran disiplin kinerja.',
    closingText: 'Demikian untuk dilaksanakan.',
    tembusan: [
      'Sekretaris Direktorat Jenderal Perlindungan dan Jaminan Sosial; dan',
      'Kepala Biro Organisasi dan Sumber Daya Manusia.'
    ]
  },
  {
    id: 'panggilan-judol',
    category: 'disiplin',
    name: 'Surat Panggilan Klarifikasi (Indikasi Judi Online)',
    code: 'KP.06.04',
    classification: 'RAHASIA',
    title: 'SURAT PANGGILAN',
    openingText: 'Bersama ini diminta dengan hormat kehadiran Saudara:',
    agendaDefault: 'Untuk diperiksa/dimintai keterangan dan klarifikasi sehubungan dengan dugaan pelanggaran disiplin indikasi aktivitas transaksi judi online berdasarkan Nota Dinas Sekretaris Jenderal Nomor 3513/I/KP.06.08/09/2026.',
    closingText: 'Demikian untuk dilaksanakan.',
    tembusan: [
      'Sekretaris Direktorat Jenderal Perlindungan dan Jaminan Sosial; dan',
      'Kepala Biro Organisasi dan Sumber Daya Manusia.'
    ]
  },
  {
    id: 'panggilan-2',
    category: 'disiplin',
    name: 'Surat Panggilan II (Peringatan Ketidakhadiran)',
    code: 'KP.06.04',
    classification: 'RAHASIA',
    title: 'SURAT PANGGILAN II',
    openingText: 'Bersama ini diminta dengan hormat kehadiran Saudara:',
    agendaDefault: 'Untuk diperiksa/dimintai keterangan sehubungan dengan dugaan pelanggaran disiplin kinerja (Panggilan Kedua sehubungan Saudara tidak memenuhi Panggilan Pertama tanpa keterangan yang sah).',
    closingText: 'Demikian untuk dilaksanakan.',
    tembusan: [
      'Sekretaris Direktorat Jenderal Perlindungan dan Jaminan Sosial;',
      'Inspektur Bidang Perlindungan dan Jaminan Sosial (Itjen Kemensos); dan',
      'Kepala Biro Organisasi dan Sumber Daya Manusia.'
    ]
  },
  {
    id: 'tagihan-1',
    category: 'keuangan',
    name: 'Surat Penagihan I (Kelebihan Tukin / Uang Makan)',
    code: 'KU.03.01',
    classification: 'SEGERA',
    title: 'SURAT PENAGIHAN PENGEMBALIAN I',
    openingText: 'Sehubungan dengan Hasil Pemeriksaan dan Rekonsiliasi Tindak Lanjut Pengembalian Kelebihan Pembayaran Tunjangan Kinerja dan Uang Makan PPPK TA 2025 pada Direktorat Perlindungan Sosial Non Kebencanaan, bersama ini kami sampaikan rincian kewajiban pengembalian yang masih tercatat sebagai berikut:',
    agendaDefault: 'Diminta kepada Saudara untuk segera melakukan penyetoran sisa kewajiban tersebut ke Kas Negara melalui Kode Billing SIMPONI (Akun Penerimaan Pengembalian Belanja Pegawai TA Yang Lalu) selambat-lambatnya dalam jangka waktu 14 (empat belas) hari kalender sejak surat ini diterima, dan segera menyampaikan bukti setor sah (NTPN/BPN) kepada Tim TLHP Direktorat PSNK.',
    closingText: 'Demikian surat penagihan ini disampaikan untuk menjadi perhatian dan dilaksanakan sebagaimana mestinya.',
    tembusan: [
      'Direktur Jenderal Perlindungan dan Jaminan Sosial;',
      'Inspektur Jenderal Kementerian Sosial RI; dan',
      'Kepala Biro Keuangan Kementerian Sosial RI.'
    ]
  },
  {
    id: 'tagihan-2',
    category: 'keuangan',
    name: 'Surat Penagihan II (Teguran Tunggakan Pengembalian)',
    code: 'KU.03.01',
    classification: 'SEGERA',
    title: 'SURAT PENAGIHAN PENGEMBALIAN II (SURAT TEGURAN)',
    openingText: 'Menindaklanjuti Surat Penagihan Pengembalian I dan Hasil Rekonsiliasi Tindak Lanjut Pengembalian Kelebihan Pembayaran Tunjangan Kinerja dan Uang Makan PPPK TA 2025 yang hingga saat ini belum diselesaikan:',
    agendaDefault: 'Ditegaskan kembali kepada Saudara untuk segera melunasi seluruh sisa kewajiban pengembalian ke Kas Negara dalam jangka waktu selambat-lambatnya 7 (tujuh) hari kerja sejak surat teguran ini diterima. Keterlambatan pelunasan akan ditindaklanjuti sesuai ketentuan penuntutan ganti rugi negara dan penegakan disiplin kepegawaian.',
    closingText: 'Demikian surat teguran ini disampaikan untuk segera ditindaklanjuti.',
    tembusan: [
      'Direktur Jenderal Perlindungan dan Jaminan Sosial;',
      'Inspektur Jenderal Kementerian Sosial RI; dan',
      'Kepala Biro Keuangan Kementerian Sosial RI.'
    ]
  },
  {
    id: 'berita-acara-pemeriksaan',
    category: 'berita-acara',
    name: 'Berita Acara Pemeriksaan / Klarifikasi (BAP)',
    code: 'KP.06.04',
    classification: 'RAHASIA',
    title: 'BERITA ACARA PEMERIKSAAN / KLARIFIKASI',
    openingText: 'Pada hari ini, kami yang bertanda tangan di bawah ini telah melakukan pemeriksaan dan permintaan keterangan terhadap pegawai ASN/PPPK terkait tindak lanjut evaluasi kinerja dan kepatuhan.',
    agendaDefault: 'Pemeriksaan dan permintaan keterangan terkait tindak lanjut hasil evaluasi kepatuhan dan disiplin pegawai.',
    closingText: 'Demikian Berita Acara ini dibuat dengan sebenarnya dalam rangkap 2 (dua) untuk dipergunakan sebagaimana mestinya.',
    tembusan: [
      'Sekretaris Direktorat Jenderal Perlindungan dan Jaminan Sosial;',
      'Kepala Biro Organisasi dan Sumber Daya Manusia; dan',
      'Arsip Bagian Tata Usaha.'
    ]
  },
  {
    id: 'berita-acara-kesepakatan',
    category: 'berita-acara',
    name: 'Berita Acara Kesepakatan Pelunasan / SKTJM',
    code: 'KU.03.01',
    classification: 'BIASA',
    title: 'BERITA ACARA KESEPAKATAN PELUNASAN KEWAJIBAN',
    openingText: 'Pada hari ini, telah dilakukan rekonsiliasi dan kesepakatan komitmen penyelesaian sisa kewajiban pengembalian kelebihan pembayaran ke Kas Negara:',
    agendaDefault: 'Pihak kedua bersedia dan berkomitmen menyelesaikan sisa kewajiban pengembalian ke Kas Negara melalui mekanisme setoran langsung SIMPONI sesuai jadwal yang telah disepakati bersama.',
    closingText: 'Demikian Berita Acara Kesepakatan ini ditandatangani oleh kedua belah pihak secara sadar tanpa paksaan.',
    tembusan: [
      'Inspektur Jenderal Kementerian Sosial RI;',
      'Kepala Biro Keuangan Kementerian Sosial RI; dan',
      'Arsip Pokja SDM Tim TLHP.'
    ]
  }
]
