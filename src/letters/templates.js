export const DEFAULT_OFFICIAL = {
  nama: 'Faisal',
  nip: '19761106 200502 1 001',
  pangkat: 'Pembina Tingkat I (IV/c)',
  pangkatSingkat: 'IV/c',
  jabatan: 'Direktur Perlindungan Sosial Non Kebencanaan',
  unitKerja: 'Direktorat Perlindungan Sosial Non Kebencanaan',
  kota: 'Jakarta'
}

export const LETTER_TYPES = [
  {
    id: 'panggilan-1',
    category: 'disiplin',
    name: 'Surat Panggilan I (Disiplin Kinerja)',
    code: 'KP.06.04',
    classification: 'RAHASIA',
    title: 'SURAT PANGGILAN',
    agendaDefault: 'Untuk diperiksa/dimintai keterangan sehubungan dengan dugaan pelanggaran disiplin kinerja.',
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
    agendaDefault: 'Untuk diperiksa/dimintai keterangan dan klarifikasi sehubungan dengan dugaan pelanggaran disiplin indikasi aktivitas transaksi judi online berdasarkan Nota Dinas Sekretaris Jenderal Nomor 3513/I/KP.06.08/09/2026.',
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
    agendaDefault: 'Untuk diperiksa/dimintai keterangan sehubungan dengan dugaan pelanggaran disiplin kinerja (Panggilan Kedua sehubungan Saudara tidak memenuhi Panggilan Pertama tanpa keterangan yang sah).',
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
    agendaDefault: 'Penagihan penyetoran pengembalian kelebihan pembayaran Tunjangan Kinerja dan Uang Makan PPPK TA 2025 ke Kas Negara.',
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
    agendaDefault: 'Peringatan dan penagihan kedua atas sisa kewajiban pengembalian ke Kas Negara yang belum diselesaikan sesuai tenggat waktu yang disepakati.',
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
    agendaDefault: 'Pemeriksaan dan permintaan keterangan terkait tindak lanjut hasil evaluasi kepatuhan dan disiplin pegawai.',
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
    agendaDefault: 'Kesepakatan jadwal penyetoran dan komitmen penyelesaian sisa kewajiban kelebihan pembayaran ke Kas Negara.',
    tembusan: [
      'Inspektur Jenderal Kementerian Sosial RI;',
      'Kepala Biro Keuangan Kementerian Sosial RI; dan',
      'Arsip Pokja SDM Tim TLHP.'
    ]
  }
]

export const DEFAULT_VENUE = {
  tempat: 'Kementerian Sosial Gedung A Lantai 3 Dit. Jamsos',
  alamatLuring: 'Jl. Salemba Raya No. 28 Jakarta Pusat',
  linkZoom: 'https://zoom.us/j/kemsos-psnk-tlhp (Passcode: PSNK2026)',
  jam: '10.00 WIB',
  hari: 'Senin',
  tanggal: '26 Oktober 2026'
}
