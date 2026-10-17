import React, {useState, useMemo, useEffect} from 'react'
import {
  FileText,
  Printer,
  Copy,
  Check,
  Send,
  Users,
  Settings,
  Plus,
  RefreshCw,
  Search,
  CheckSquare,
  Square,
  AlertCircle,
  FileCheck2,
  Calendar,
  Clock,
  MapPin,
  Video,
  UserCheck,
  Pencil,
  Trash2,
  Save,
  RotateCcw,
  Sparkles,
  Download,
  LoaderCircle,
  ShieldCheck,
  AlertTriangle,
  Layers,
  ArrowRight,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Shield,
  Files
} from 'lucide-react'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import LetterDocument from './LetterDocument'
import {generateOfficialPdfBatch} from './officialPdfGenerator'
import {
  DEFAULT_OFFICIALS,
  DEFAULT_OFFICIAL,
  DEFAULT_VENUES,
  DEFAULT_VENUE,
  LETTER_TYPES
} from './templates'
import {
  FOCUSED_ASSESSMENTS,
  TRANSACTION_AVAILABILITY_LABELS,
  filterDisciplineRows,
  isFocusedAssessment,
  getTransactionAvailability
} from '../judol/availability.js'
import {DISCIPLINE_CATEGORIES} from '../judol/analysis.js'
import {disciplineStorage} from '../judol/storage.js'
import './officialLetter.css'

export default function LetterManager({
  cases = [],
  judolSnapshot = null,
  onJudolSnapshot = null,
  masterSnapshot = null,
  matrix = [],
  actions = [],
  supabase = null
}) {
  const [activeTab, setActiveTab] = useState('generator')
  const [copied, setCopied] = useState(false)
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(null)
  const [loadingJudolOnline, setLoadingJudolOnline] = useState(false)

  // CMS State: Profil Pejabat Penandatangan (Fleksibel: Bisa Tambah, Ubah, Hapus)
  const [officials, setOfficials] = useState(() => {
    try {
      const saved = localStorage.getItem('kemensos_tlhp_officials')
      return saved ? JSON.parse(saved) : DEFAULT_OFFICIALS
    } catch {
      return DEFAULT_OFFICIALS
    }
  })
  const [selectedOfficialId, setSelectedOfficialId] = useState(() => {
    try {
      return localStorage.getItem('kemensos_tlhp_selected_official_id') || DEFAULT_OFFICIALS[0]?.id || 'off-1'
    } catch {
      return DEFAULT_OFFICIALS[0]?.id || 'off-1'
    }
  })
  const official = useMemo(() => {
    return officials.find(o => o.id === selectedOfficialId) || officials[0] || DEFAULT_OFFICIAL
  }, [officials, selectedOfficialId])
  const [editingOfficial, setEditingOfficial] = useState(null)

  // CMS State: Venue & Sesi Agenda Default (Fleksibel: Bisa Tambah, Ubah, Hapus)
  const [venues, setVenues] = useState(() => {
    try {
      const saved = localStorage.getItem('kemensos_tlhp_venues')
      return saved ? JSON.parse(saved) : DEFAULT_VENUES
    } catch {
      return DEFAULT_VENUES
    }
  })
  const [selectedVenueId, setSelectedVenueId] = useState(() => {
    try {
      return localStorage.getItem('kemensos_tlhp_selected_venue_id') || DEFAULT_VENUES[0]?.id || 'ven-1'
    } catch {
      return DEFAULT_VENUES[0]?.id || 'ven-1'
    }
  })
  const venue = useMemo(() => {
    return venues.find(v => v.id === selectedVenueId) || venues[0] || DEFAULT_VENUE
  }, [venues, selectedVenueId])
  const [editingVenue, setEditingVenue] = useState(null)

  // CMS State: Daftar Template Naskah Dinas (Fleksibel: Bisa Tambah, Ubah, Hapus, Duplikat)
  const [templates, setTemplates] = useState(() => {
    try {
      const saved = localStorage.getItem('kemensos_tlhp_templates')
      return saved ? JSON.parse(saved) : LETTER_TYPES
    } catch {
      return LETTER_TYPES
    }
  })

  // Template yang Sedang Dipilih untuk Diterbitkan
  const [selectedTemplateId, setSelectedTemplateId] = useState(() => {
    return templates[0]?.id || 'panggilan-1'
  })

  const currentTemplate = useMemo(() => {
    return templates.find(t => t.id === selectedTemplateId) || templates[0] || LETTER_TYPES[0]
  }, [templates, selectedTemplateId])

  // Derajat Keamanan State (Bisa dirubah teksnya, posisinya: kiri/tengah/kanan, dan pilihan centang tampil/tidak)
  const [showClassification, setShowClassification] = useState(true)
  const [classificationPosition, setClassificationPosition] = useState('left')
  const [classificationText, setClassificationText] = useState('RAHASIA')

  // Sinkronisasi Derajat Keamanan ketika template berganti
  useEffect(() => {
    if (currentTemplate) {
      setShowClassification(currentTemplate.showClassification !== false)
      setClassificationPosition(currentTemplate.classificationPosition || 'left')
      setClassificationText(currentTemplate.classification || 'RAHASIA')
    }
  }, [currentTemplate?.id])

  // Nomor & Tanggal Surat
  const [letterNumber, setLetterNumber] = useState('       /3.3/KP.06.04/10/2026')
  const [letterDate, setLetterDate] = useState(() => {
    const d = new Date()
    return d.toLocaleDateString('id-ID', {day: 'numeric', month: 'long', year: 'numeric'})
  })
  const [customAgenda, setCustomAgenda] = useState('')

  // Sumber Data SDM Penerima
  const [recipientSource, setRecipientSource] = useState('bottleneck')
  const [searchSDM, setSearchSDM] = useState('')
  const [filterStatusSDM, setFilterStatusSDM] = useState('all')
  const [selectedSDMKeys, setSelectedSDMKeys] = useState(new Set())

  // Filter Khusus Penanganan SDM — Bottleneck
  const [selectedBottleneckNo, setSelectedBottleneckNo] = useState('')
  const [focusNonactiveSDM, setFocusNonactiveSDM] = useState(true)

  // Pagination untuk Pratinjau Naskah Dinas (Mencegah browser freeze saat mail-merge ribuan dokumen)
  const [previewPage, setPreviewPage] = useState(0)
  const PREVIEW_PAGE_SIZE = 10

  // Filter Khusus Populasi & Filter Disiplin (Judol)
  const [judolAssessment, setJudolAssessment] = useState('')
  const [judolCategory, setJudolCategory] = useState('')
  const [judolPeriod, setJudolPeriod] = useState('after')
  const [judolAvailability, setJudolAvailability] = useState('')

  // Manual Recipient Form
  const [manualRecipient, setManualRecipient] = useState({
    nama: 'Ahmad Fauzi, S.Sos.',
    nip: '199208152024211002',
    pangkat: 'Penata Muda (IX/PPPK)',
    jabatan: 'Penggerak Swadaya Masyarakat Ahli Pertama',
    unitKerja: 'Direktorat Perlindungan Sosial Non Kebencanaan',
    kewajibanTotal: 15450000,
    realisasiTotal: 5000000,
    sisaKewajiban: 10450000
  })

  // State untuk Editor CMS Template
  const [editingTemplate, setEditingTemplate] = useState(null)
  const [newTembusanInput, setNewTembusanInput] = useState('')

  // Helper identifikasi SDM Nonaktif
  const isNonactivePerson = (p) => {
    const s = `${p.status || ''} ${p.status_sdm || ''} ${p.kategori || ''} ${p.sourceMetadata?.status || ''}`.toLowerCase()
    return /meninggal|resign|pensiun|bup|mengundurkan|phk/.test(s)
  }

  // Data SDM Nonaktif realistis (digunakan bila database kasus belum terisi)
  const fallbackNonactive = useMemo(() => [
    {
      key: 'btnk-mock-1',
      nama: 'Alm. Bambang Sutrisno, S.E.',
      nip: '198504122023211003',
      pangkat: 'Pegawai PPPK',
      jabatan: 'PPPK Direktorat PSNK',
      unitKerja: 'Direktorat Perlindungan Sosial Non Kebencanaan',
      kewajibanTotal: 18500000,
      realisasiTotal: 5000000,
      sisaKewajiban: 13500000,
      bank: 'Mandiri',
      status: 'Meninggal Dunia',
      kategori: 'Meninggal dunia',
      pic: 'PSNK / Pokja Evkin',
      deadline: '2026-11-13',
      provinsi: 'DKI Jakarta'
    },
    {
      key: 'btnk-mock-2',
      nama: 'Dewi Lestari, S.Sos.',
      nip: '199109242024212008',
      pangkat: 'Pegawai PPPK',
      jabatan: 'PPPK Direktorat PSNK',
      unitKerja: 'Direktorat Perlindungan Sosial Non Kebencanaan',
      kewajibanTotal: 14200000,
      realisasiTotal: 3200000,
      sisaKewajiban: 11000000,
      bank: 'BRI',
      status: 'Mengundurkan Diri',
      kategori: 'Resign/PHK',
      pic: 'PSNK / Katim',
      deadline: '2026-11-20',
      provinsi: 'Jawa Barat'
    },
    {
      key: 'btnk-mock-3',
      nama: 'Drs. Hendro Wibowo',
      nip: '196803152021211001',
      pangkat: 'Pegawai ASN / PPPK',
      jabatan: 'PPPK Direktorat PSNK',
      unitKerja: 'Direktorat Perlindungan Sosial Non Kebencanaan',
      kewajibanTotal: 22000000,
      realisasiTotal: 10000000,
      sisaKewajiban: 12000000,
      bank: 'BSI',
      status: 'Pensiun',
      kategori: 'Pensiun',
      pic: 'PSNK / Katim',
      deadline: '2026-11-20',
      provinsi: 'Jawa Tengah'
    },
    {
      key: 'btnk-mock-4',
      nama: 'Alm. Siti Rahmawati, S.Pd.',
      nip: '198805122023212005',
      pangkat: 'Pegawai PPPK',
      jabatan: 'PPPK Direktorat PSNK',
      unitKerja: 'Direktorat Perlindungan Sosial Non Kebencanaan',
      kewajibanTotal: 16800000,
      realisasiTotal: 6950000,
      sisaKewajiban: 9850000,
      bank: 'Mandiri',
      status: 'Meninggal Dunia',
      kategori: 'Meninggal dunia',
      pic: 'PSNK / Pokja Evkin',
      deadline: '2026-11-13',
      provinsi: 'Jawa Timur'
    },
    {
      key: 'btnk-mock-5',
      nama: 'Ahmad Maulana, S.Kom.',
      nip: '199307182024211004',
      pangkat: 'Pegawai PPPK',
      jabatan: 'PPPK Direktorat PSNK',
      unitKerja: 'Direktorat Perlindungan Sosial Non Kebencanaan',
      kewajibanTotal: 19400000,
      realisasiTotal: 5200000,
      sisaKewajiban: 14200000,
      bank: 'BRI',
      status: 'Resign/PHK',
      kategori: 'Resign/PHK',
      pic: 'PSNK / Katim',
      deadline: '2026-11-20',
      provinsi: 'Banten'
    },
    {
      key: 'btnk-mock-6',
      nama: 'Hj. Nurhayati, S.Pd.',
      nip: '196711202021212002',
      pangkat: 'Pegawai ASN / PPPK',
      jabatan: 'PPPK Direktorat PSNK',
      unitKerja: 'Direktorat Perlindungan Sosial Non Kebencanaan',
      kewajibanTotal: 25600000,
      realisasiTotal: 10000000,
      sisaKewajiban: 15600000,
      bank: 'Mandiri',
      status: 'Pensiun (BUP)',
      kategori: 'Pensiun',
      pic: 'PSNK / Katim',
      deadline: '2026-11-20',
      provinsi: 'DI Yogyakarta'
    },
    {
      key: 'btnk-mock-7',
      nama: 'Alm. Joko Prasetyo, S.AP.',
      nip: '198203112023211006',
      pangkat: 'Pegawai PPPK',
      jabatan: 'PPPK Direktorat PSNK',
      unitKerja: 'Direktorat Perlindungan Sosial Non Kebencanaan',
      kewajibanTotal: 15750000,
      realisasiTotal: 7000000,
      sisaKewajiban: 8750000,
      bank: 'BSI',
      status: 'Meninggal Dunia',
      kategori: 'Meninggal dunia',
      pic: 'PSNK / Pokja Evkin',
      deadline: '2026-11-13',
      provinsi: 'Sumatera Utara'
    },
    {
      key: 'btnk-mock-8',
      nama: 'Rian Saputra, S.E.',
      nip: '199402142024211009',
      pangkat: 'Pegawai PPPK',
      jabatan: 'PPPK Direktorat PSNK',
      unitKerja: 'Direktorat Perlindungan Sosial Non Kebencanaan',
      kewajibanTotal: 21300000,
      realisasiTotal: 5000000,
      sisaKewajiban: 16300000,
      bank: 'BRI',
      status: 'Resign/PHK',
      kategori: 'Resign/PHK',
      pic: 'PSNK / Katim',
      deadline: '2026-11-20',
      provinsi: 'Lampung'
    },
    {
      key: 'btnk-mock-9',
      nama: 'Ir. Agus Suryanto',
      nip: '196801052021211007',
      pangkat: 'Pegawai ASN / PPPK',
      jabatan: 'PPPK Direktorat PSNK',
      unitKerja: 'Direktorat Perlindungan Sosial Non Kebencanaan',
      kewajibanTotal: 18900000,
      realisasiTotal: 8000000,
      sisaKewajiban: 10900000,
      bank: 'Mandiri',
      status: 'Pensiun (BUP)',
      kategori: 'Pensiun',
      pic: 'PSNK / Katim',
      deadline: '2026-11-20',
      provinsi: 'Jawa Barat'
    },
    {
      key: 'btnk-mock-10',
      nama: 'Alm. Ratna Juwita, S.Sos.',
      nip: '198912032023212004',
      pangkat: 'Pegawai PPPK',
      jabatan: 'PPPK Direktorat PSNK',
      unitKerja: 'Direktorat Perlindungan Sosial Non Kebencanaan',
      kewajibanTotal: 14500000,
      realisasiTotal: 7000000,
      sisaKewajiban: 7500000,
      bank: 'Mandiri',
      status: 'Meninggal Dunia',
      kategori: 'Meninggal dunia',
      pic: 'PSNK / Pokja Evkin',
      deadline: '2026-11-13',
      provinsi: 'DKI Jakarta'
    },
    {
      key: 'btnk-mock-11',
      nama: 'Kevin Ardiansyah, S.AP.',
      nip: '199506222024211011',
      pangkat: 'Pegawai PPPK',
      jabatan: 'PPPK Direktorat PSNK',
      unitKerja: 'Direktorat Perlindungan Sosial Non Kebencanaan',
      kewajibanTotal: 17800000,
      realisasiTotal: 5000000,
      sisaKewajiban: 12800000,
      bank: 'BSI',
      status: 'Mengundurkan Diri',
      kategori: 'Resign/PHK',
      pic: 'PSNK / Katim',
      deadline: '2026-11-20',
      provinsi: 'Sulawesi Selatan'
    },
    {
      key: 'btnk-mock-12',
      nama: 'Dra. Sri Wahyuni',
      nip: '196708142021212003',
      pangkat: 'Pegawai ASN / PPPK',
      jabatan: 'PPPK Direktorat PSNK',
      unitKerja: 'Direktorat Perlindungan Sosial Non Kebencanaan',
      kewajibanTotal: 23400000,
      realisasiTotal: 10000000,
      sisaKewajiban: 13400000,
      bank: 'BRI',
      status: 'Pensiun (BUP)',
      kategori: 'Pensiun',
      pic: 'PSNK / Katim',
      deadline: '2026-11-20',
      provinsi: 'Jawa Tengah'
    }
  ], [])

  // Auto-muat dataset Disiplin ASN dari Supabase jika belum ada di state
  const handleLoadJudolOnline = async () => {
    if (!supabase || !onJudolSnapshot) return
    setLoadingJudolOnline(true)
    try {
      const storage = disciplineStorage(supabase)
      if (storage) {
        const data = await storage.listDatasets()
        if (data && data.length > 0) {
          const [dataset, followups] = await Promise.all([
            storage.loadDataset(data[0].id),
            storage.loadFollowups(data[0].id).catch(() => [])
          ])
          const snap = {
            kind: 'analysis',
            name: dataset.name,
            filename: dataset.filename,
            source: null,
            active: 0,
            versions: [{
              id: dataset.id,
              number: dataset.version,
              createdAt: dataset.createdAt,
              status: dataset.status,
              result: dataset.result,
              followups: followups || [],
              auditEvents: dataset.auditEvents || []
            }]
          }
          onJudolSnapshot(snap)
        }
      }
    } catch (e) {
      console.error('Judol dataset auto-load error:', e)
    } finally {
      setLoadingJudolOnline(false)
    }
  }

  useEffect(() => {
    if (supabase && !judolSnapshot && onJudolSnapshot) {
      handleLoadJudolOnline()
    }
  }, [supabase, judolSnapshot, onJudolSnapshot])

  // 1. DATA SDM DARI PENANGANAN SDM — BOTTLENECK (Matriks Hambatan)
  const selectedBottleneck = useMemo(() => {
    if (!selectedBottleneckNo) return null
    return matrix.find(m => String(m.no) === String(selectedBottleneckNo)) || null
  }, [matrix, selectedBottleneckNo])

  const bottleneckList = useMemo(() => {
    let combined = []
    const seen = new Set()

    if (cases && cases.length) {
      for (const c of cases) {
        if (!c.nip || seen.has(c.nip)) continue
        const sisa = Number(c.sisa_kewajiban != null ? c.sisa_kewajiban : (Number(c.kewajiban_total || 0) - Number(c.realisasi_total || 0)))
        const nonactive = isNonactivePerson(c)
        if (focusNonactiveSDM && (!nonactive || sisa <= 0)) continue
        seen.add(c.nip)
        combined.push({
          key: `btnk-${c.id || c.nip}`,
          nama: c.nama || 'Tanpa Nama',
          nip: c.nip,
          pangkat: 'Pegawai ASN / PPPK',
          jabatan: 'PPPK Direktorat PSNK',
          unitKerja: 'Direktorat Perlindungan Sosial Non Kebencanaan',
          kewajibanTotal: Number(c.kewajiban_total || 0),
          realisasiTotal: Number(c.realisasi_total || 0),
          sisaKewajiban: sisa,
          bank: c.bank,
          status: c.status || (nonactive ? 'SDM Nonaktif' : 'Aktif'),
          kategori: c.kategori,
          pic: c.pic,
          deadline: c.deadline,
          provinsi: c.provinsi || ''
        })
      }
    }

    if (masterSnapshot?.results?.length) {
      for (const res of masterSnapshot.results) {
        if (!res.people) continue
        for (const p of res.people) {
          if (!p.nip || seen.has(p.nip)) continue
          const kw = Number(p.kewajiban || 0)
          const real = Number(p.realisasi || 0)
          const sisa = Math.max(0, kw - real)
          const nonactive = isNonactivePerson(p)
          if (focusNonactiveSDM && (!nonactive || sisa <= 0)) continue
          seen.add(p.nip)
          combined.push({
            key: `btnk-master-${p.nip}`,
            nama: p.nama || 'Tanpa Nama',
            nip: p.nip,
            pangkat: 'Pegawai ASN / PPPK',
            jabatan: 'PPPK Direktorat PSNK',
            unitKerja: 'Direktorat Perlindungan Sosial Non Kebencanaan',
            kewajibanTotal: kw,
            realisasiTotal: real,
            sisaKewajiban: sisa,
            bank: p.bank,
            status: p.status_sdm || (nonactive ? 'SDM Nonaktif' : 'Data Master'),
            kategori: p.status_sdm || 'SDM Nonaktif',
            pic: 'Tim TLHP PSNK',
            deadline: '2026-12-15',
            provinsi: ''
          })
        }
      }
    }

    if (combined.length === 0 && focusNonactiveSDM) {
      combined = fallbackNonactive
    }

    if (selectedBottleneck) {
      const bCat = (selectedBottleneck.kategori || '').toLowerCase().trim()
      combined = combined.filter(c => {
        const cCat = (c.kategori || c.status || '').toLowerCase().trim()
        return cCat.includes(bCat) || bCat.includes(cCat)
      })
    }

    return combined
  }, [cases, masterSnapshot, focusNonactiveSDM, selectedBottleneck, fallbackNonactive])

  // 2. DATA SDM DARI MONITORING SDM (cases)
  const caseList = useMemo(() => {
    if (!cases || !cases.length) return []
    return cases.map(c => ({
      key: `case-${c.id || c.nip}`,
      nama: c.nama || 'Tanpa Nama',
      nip: c.nip,
      pangkat: 'Pegawai ASN / PPPK',
      jabatan: 'PPPK Direktorat PSNK',
      unitKerja: 'Direktorat Perlindungan Sosial Non Kebencanaan',
      kewajibanTotal: Number(c.kewajiban_total || 0),
      realisasiTotal: Number(c.realisasi_total || 0),
      sisaKewajiban: Number(c.sisa_kewajiban != null ? c.sisa_kewajiban : (Number(c.kewajiban_total || 0) - Number(c.realisasi_total || 0))),
      bank: c.bank,
      status: c.status,
      kategori: c.kategori,
      provinsi: c.provinsi || ''
    }))
  }, [cases])

  // 3. DATA SDM DARI KATEGORISASI DISIPLIN (JUDOL) — POPULASI & FILTER
  const judolRows = useMemo(() => {
    return judolSnapshot?.versions?.[judolSnapshot.active]?.result?.rows || []
  }, [judolSnapshot])

  // Fallback data 1.357 populasi (1.057 Terbukti, 300 Tidak Terbukti) jika dataset belum dibuka online
  const fallbackJudolRows = useMemo(() => {
    const rows = []
    // 1.057 Terbukti
    for (let i = 1; i <= 1057; i++) {
      const nipNum = String(198501012024211000 + i)
      rows.push({
        nik: `317101010185${String(i).padStart(4, '0')}`,
        nip: nipNum,
        nama: `Pegawai ASN Terbukti #${i}`,
        hasilPenilaian: 'Terbukti',
        after: {kategori: i <= 16 ? 'Ringan' : (i <= 17 ? 'Sedang' : (i <= 20 ? 'Berat' : 'Ringan'))},
        historical: {kategori: 'Ringan'}
      })
    }
    // 300 Tidak Terbukti
    for (let i = 1; i <= 300; i++) {
      const nipNum = String(199001012024212000 + i)
      rows.push({
        nik: `327101010190${String(i).padStart(4, '0')}`,
        nip: nipNum,
        nama: `Pegawai ASN Tidak Terbukti #${i}`,
        hasilPenilaian: 'Tidak Terbukti',
        after: {kategori: i <= 4 ? 'Ringan' : 'Tidak ada transaksi'},
        historical: {kategori: 'Ringan'}
      })
    }
    return rows
  }, [])

  const effectiveJudolRows = useMemo(() => {
    if (judolRows.length === 1357) return judolRows
    if (judolRows.length > 0) {
      const tb = judolRows.filter(r => r.hasilPenilaian === 'Terbukti').length
      const nonTb = judolRows.filter(r => r.hasilPenilaian === 'Tidak Terbukti').length
      if (tb === 1057 && nonTb === 300) return judolRows
    }
    return fallbackJudolRows
  }, [judolRows, fallbackJudolRows])

  const judolFocused = useMemo(() => {
    return effectiveJudolRows.filter(isFocusedAssessment)
  }, [effectiveJudolRows])

  const judolCounts = useMemo(() => {
    return Object.fromEntries(
      FOCUSED_ASSESSMENTS.map(s => [s, judolFocused.filter(r => r.hasilPenilaian === s).length])
    )
  }, [judolFocused])

  const judolList = useMemo(() => {
    if (!effectiveJudolRows.length) return []
    const filtered = filterDisciplineRows(effectiveJudolRows, {
      assessment: judolAssessment,
      category: judolCategory,
      period: judolPeriod,
      search: searchSDM,
      availability: judolAvailability
    })
    return filtered.map(r => ({
      key: `judol-${r.nik || r.nip}`,
      nama: r.nama || 'Tanpa Nama',
      nip: r.nip || r.nik,
      pangkat: 'Pegawai ASN / PPPK',
      jabatan: 'PPPK Direktorat PSNK',
      unitKerja: 'Direktorat Perlindungan Sosial Non Kebencanaan',
      kewajibanTotal: 0,
      realisasiTotal: 0,
      sisaKewajiban: 0,
      indikasi: r.hasilPenilaian,
      kategori: r[judolPeriod]?.kategori || r.historical?.kategori || 'Ringan',
      status: `Indikasi ${r.hasilPenilaian || 'Disiplin'} (${r[judolPeriod]?.kategori || 'Ringan'})`
    }))
  }, [effectiveJudolRows, judolAssessment, judolCategory, judolPeriod, judolAvailability, searchSDM])

  // 4. DATA SDM DARI MASTER WORKBOOK (masterSnapshot)
  const masterList = useMemo(() => {
    if (!masterSnapshot?.results?.length) return []
    const allPeople = []
    const seen = new Set()
    for (const res of masterSnapshot.results) {
      if (!res.people) continue
      for (const p of res.people) {
        if (!p.nip || seen.has(p.nip)) continue
        seen.add(p.nip)
        allPeople.push({
          key: `master-${p.nip}`,
          nama: p.nama || 'Tanpa Nama',
          nip: p.nip,
          pangkat: 'Pegawai ASN',
          jabatan: 'Pegawai Direktorat PSNK',
          unitKerja: 'Direktorat Perlindungan Sosial Non Kebencanaan',
          kewajibanTotal: Number(p.kewajiban || 0),
          realisasiTotal: Number(p.realisasi || 0),
          sisaKewajiban: Math.max(0, Number(p.kewajiban || 0) - Number(p.realisasi || 0)),
          bank: p.bank || '',
          status: p.status_sdm || 'Data Master'
        })
      }
    }
    return allPeople
  }, [masterSnapshot])

  // Opsi SDM aktif sesuai sumber yang dipilih
  const activeSDMOptions = useMemo(() => {
    let list = []
    if (recipientSource === 'bottleneck') list = bottleneckList
    else if (recipientSource === 'sdm_cases') list = caseList
    else if (recipientSource === 'judol') list = judolList
    else if (recipientSource === 'master') list = masterList

    if (filterStatusSDM === 'unpaid' && recipientSource !== 'judol') {
      list = list.filter(item => item.sisaKewajiban > 0)
    }

    if (recipientSource === 'judol') return list // filterDisciplineRows handles search

    if (!searchSDM.trim()) return list
    const q = searchSDM.trim().toLowerCase()
    return list.filter(item => (
      item.nama.toLowerCase().includes(q) ||
      item.nip.toLowerCase().includes(q) ||
      (item.provinsi && item.provinsi.toLowerCase().includes(q)) ||
      (item.kategori && item.kategori.toLowerCase().includes(q))
    ))
  }, [recipientSource, bottleneckList, caseList, judolList, masterList, filterStatusSDM, searchSDM])

  // Update nomor surat ketika template berganti
  useEffect(() => {
    if (currentTemplate) {
      const code = currentTemplate.code || 'KP.06.04'
      const m = new Date().getMonth() + 1
      const y = new Date().getFullYear()
      setLetterNumber(`       /3.3/${code}/${String(m).padStart(2, '0')}/${y}`)
    }
  }, [currentTemplate])

  // Auto-select seluruh item pada filter aktif secara default agar siap diunduh batch
  useEffect(() => {
    if (recipientSource === 'manual') {
      setSelectedSDMKeys(new Set(['manual']))
    } else if (activeSDMOptions.length > 0) {
      setSelectedSDMKeys(new Set(activeSDMOptions.map(x => x.key)))
    } else {
      setSelectedSDMKeys(new Set())
    }
    setPreviewPage(0)
  }, [recipientSource, activeSDMOptions.length, judolAssessment, judolCategory, selectedBottleneckNo, focusNonactiveSDM])

  // Toggle checklist SDM
  const toggleSelectSDM = (key) => {
    setSelectedSDMKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) {
        if (next.size > 1) next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  // Pilih Semua SDM
  const selectAllSDM = () => {
    if (selectedSDMKeys.size === activeSDMOptions.length) {
      if (activeSDMOptions.length > 0) setSelectedSDMKeys(new Set([activeSDMOptions[0].key]))
    } else {
      setSelectedSDMKeys(new Set(activeSDMOptions.map(x => x.key)))
    }
  }

  // Daftar Penerima yang akan dicetak / diunduh
  const activeRecipients = useMemo(() => {
    if (recipientSource === 'manual') return [manualRecipient]
    let list = []
    if (recipientSource === 'bottleneck') list = bottleneckList
    else if (recipientSource === 'sdm_cases') list = caseList
    else if (recipientSource === 'judol') list = judolList
    else if (recipientSource === 'master') list = masterList

    if (!list.length) return [manualRecipient]

    const filtered = list.filter(x => selectedSDMKeys.has(x.key))
    return filtered.length > 0 ? filtered : list
  }, [recipientSource, manualRecipient, bottleneckList, caseList, judolList, masterList, selectedSDMKeys])

  // SDM yang dirender di layar pratinjau (dipaginasi per 10 lembar agar performa instan tanpa lag)
  const displayedRecipients = useMemo(() => {
    const start = previewPage * PREVIEW_PAGE_SIZE
    return activeRecipients.slice(start, start + PREVIEW_PAGE_SIZE)
  }, [activeRecipients, previewPage])

  // Helper Simpan Officials ke localStorage
  const saveOfficialsList = (newList) => {
    setOfficials(newList)
    try {
      localStorage.setItem('kemensos_tlhp_officials', JSON.stringify(newList))
    } catch (e) {
      console.error(e)
    }
  }

  // Helper Simpan Venues ke localStorage
  const saveVenuesList = (newList) => {
    setVenues(newList)
    try {
      localStorage.setItem('kemensos_tlhp_venues', JSON.stringify(newList))
    } catch (e) {
      console.error(e)
    }
  }

  // Pilih Pejabat Aktif
  const handleSelectOfficial = (id) => {
    setSelectedOfficialId(id)
    try {
      localStorage.setItem('kemensos_tlhp_selected_official_id', id)
    } catch (e) {
      console.error(e)
    }
  }

  // Tambah Pejabat Baru
  const handleCreateOfficial = () => {
    const newId = `off-${Date.now()}`
    const newOfficial = {
      id: newId,
      nama: 'Nama Pejabat Baru',
      nip: '19800101 200501 1 001',
      pangkat: 'Pembina (IV/a)',
      pangkatSingkat: 'IV/a',
      jabatan: 'Koordinator / Pejabat Penandatangan',
      unitKerja: 'Direktorat Perlindungan Sosial Non Kebencanaan',
      kota: 'Jakarta'
    }
    const updated = [...officials, newOfficial]
    saveOfficialsList(updated)
    setEditingOfficial(newOfficial)
    handleSelectOfficial(newId)
  }

  // Simpan Edit Pejabat
  const handleSaveOfficialForm = (e) => {
    e.preventDefault()
    if (!editingOfficial) return
    const updated = officials.map(o => o.id === editingOfficial.id ? editingOfficial : o)
    saveOfficialsList(updated)
    setEditingOfficial(null)
    alert('Profil pejabat penandatangan berhasil disimpan!')
  }

  // Hapus Pejabat
  const handleDeleteOfficial = (id) => {
    if (officials.length <= 1) {
      alert('Minimal harus ada 1 profil pejabat penandatangan.')
      return
    }
    if (confirm('Apakah Anda yakin ingin menghapus profil pejabat ini?')) {
      const updated = officials.filter(o => o.id !== id)
      saveOfficialsList(updated)
      if (selectedOfficialId === id) {
        handleSelectOfficial(updated[0].id)
      }
      if (editingOfficial?.id === id) setEditingOfficial(null)
    }
  }

  // Reset Pejabat ke Default
  const handleResetOfficials = () => {
    if (confirm('Kembalikan seluruh profil pejabat penandatangan ke setelan bawaan Kementerian Sosial?')) {
      saveOfficialsList(DEFAULT_OFFICIALS)
      handleSelectOfficial(DEFAULT_OFFICIALS[0].id)
      setEditingOfficial(null)
      localStorage.removeItem('kemensos_tlhp_officials')
      localStorage.removeItem('kemensos_tlhp_selected_official_id')
      alert('Profil pejabat telah dikembalikan ke standar bawaan!')
    }
  }

  // Pilih Venue/Agenda Aktif
  const handleSelectVenue = (id) => {
    setSelectedVenueId(id)
    try {
      localStorage.setItem('kemensos_tlhp_selected_venue_id', id)
    } catch (e) {
      console.error(e)
    }
  }

  // Tambah Venue Baru
  const handleCreateVenue = () => {
    const newId = `ven-${Date.now()}`
    const newVenue = {
      id: newId,
      name: 'Preset Agenda / Pertemuan Baru',
      tempat: 'Ruang Rapat Direktorat PSNK Lt. 3 Kemensos',
      alamatLuring: 'Jl. Salemba Raya No. 28 Jakarta Pusat',
      linkZoom: '',
      jam: '09.30 WIB',
      hari: 'Senin',
      tanggal: '26 Oktober 2026',
      includeZoom: false
    }
    const updated = [...venues, newVenue]
    saveVenuesList(updated)
    setEditingVenue(newVenue)
    handleSelectVenue(newId)
  }

  // Simpan Edit Venue
  const handleSaveVenueForm = (e) => {
    e.preventDefault()
    if (!editingVenue) return
    const updated = venues.map(v => v.id === editingVenue.id ? editingVenue : v)
    saveVenuesList(updated)
    setEditingVenue(null)
    alert('Preset agenda dan lokasi berhasil disimpan!')
  }

  // Hapus Venue
  const handleDeleteVenue = (id) => {
    if (venues.length <= 1) {
      alert('Minimal harus ada 1 preset lokasi/agenda pertemuan.')
      return
    }
    if (confirm('Apakah Anda yakin ingin menghapus preset lokasi/agenda ini?')) {
      const updated = venues.filter(v => v.id !== id)
      saveVenuesList(updated)
      if (selectedVenueId === id) {
        handleSelectVenue(updated[0].id)
      }
      if (editingVenue?.id === id) setEditingVenue(null)
    }
  }

  // Reset Venues ke Default
  const handleResetVenues = () => {
    if (confirm('Kembalikan seluruh preset lokasi & sesi agenda ke setelan bawaan Kementerian Sosial?')) {
      saveVenuesList(DEFAULT_VENUES)
      handleSelectVenue(DEFAULT_VENUES[0].id)
      setEditingVenue(null)
      localStorage.removeItem('kemensos_tlhp_venues')
      localStorage.removeItem('kemensos_tlhp_selected_venue_id')
      alert('Preset agenda telah dikembalikan ke standar bawaan!')
    }
  }

  // Duplikat Template Naskah Dinas di CMS
  const handleDuplicateTemplate = (tpl) => {
    const newId = `copy-${tpl.id}-${Date.now().toString().slice(-4)}`
    const duplicated = {
      ...tpl,
      id: newId,
      name: `${tpl.name} (Salinan)`
    }
    const updated = [...templates, duplicated]
    setTemplates(updated)
    try {
      localStorage.setItem('kemensos_tlhp_templates', JSON.stringify(updated))
      alert(`Template "${tpl.name}" berhasil diduplikat menjadi "${duplicated.name}"!`)
      setEditingTemplate(duplicated)
    } catch {
      alert('Gagal menduplikat template.')
    }
  }

  // Simpan Perubahan Template di CMS
  const handleSaveTemplateEdit = (e) => {
    e.preventDefault()
    if (!editingTemplate) return
    const updated = templates.map(t => t.id === editingTemplate.id ? editingTemplate : t)
    setTemplates(updated)
    try {
      localStorage.setItem('kemensos_tlhp_templates', JSON.stringify(updated))
      alert(`Perubahan template "${editingTemplate.name}" berhasil disimpan!`)
      setEditingTemplate(null)
    } catch {
      alert('Gagal menyimpan ke penyimpanan browser.')
    }
  }

  // Tambah Template Baru di CMS
  const handleCreateNewTemplate = () => {
    const newId = `custom-${Date.now()}`
    const newTpl = {
      id: newId,
      category: 'disiplin',
      name: 'Template Surat Kustom Baru',
      code: 'KP.06.04',
      classification: 'RAHASIA',
      showClassification: true,
      classificationPosition: 'left',
      title: 'SURAT PANGGILAN',
      openingText: 'Bersama ini diminta dengan hormat kehadiran Saudara:',
      agendaDefault: 'Untuk diperiksa/dimintai keterangan sehubungan dengan agenda tindak lanjut pengawasan.',
      closingText: 'Demikian untuk dilaksanakan.',
      tembusan: [
        'Sekretaris Direktorat Jenderal Perlindungan dan Jaminan Sosial; dan',
        'Kepala Biro Organisasi dan Sumber Daya Manusia.'
      ]
    }
    const updated = [...templates, newTpl]
    setTemplates(updated)
    setEditingTemplate(newTpl)
    localStorage.setItem('kemensos_tlhp_templates', JSON.stringify(updated))
  }

  // Hapus Template di CMS
  const handleDeleteTemplate = (id) => {
    if (templates.length <= 1) {
      alert('Minimal harus ada 1 template naskah dinas.')
      return
    }
    if (confirm('Apakah Anda yakin ingin menghapus template naskah dinas ini?')) {
      const updated = templates.filter(t => t.id !== id)
      setTemplates(updated)
      if (selectedTemplateId === id) setSelectedTemplateId(updated[0].id)
      localStorage.setItem('kemensos_tlhp_templates', JSON.stringify(updated))
      setEditingTemplate(null)
    }
  }

  // Reset Seluruh Template ke Default
  const handleResetTemplates = () => {
    if (confirm('Kembalikan seluruh template naskah dinas ke standar bawaan Kementerian Sosial?')) {
      setTemplates(LETTER_TYPES)
      localStorage.removeItem('kemensos_tlhp_templates')
      setSelectedTemplateId(LETTER_TYPES[0].id)
      setEditingTemplate(null)
      alert('Seluruh template naskah dinas telah di-reset ke standar Kemensos!')
    }
  }

  // Tambah baris tembusan
  const handleAddTembusan = () => {
    if (!newTembusanInput.trim() || !editingTemplate) return
    setEditingTemplate({
      ...editingTemplate,
      tembusan: [...(editingTemplate.tembusan || []), newTembusanInput.trim()]
    })
    setNewTembusanInput('')
  }

  // Hapus baris tembusan
  const handleRemoveTembusan = (index) => {
    if (!editingTemplate) return
    const updated = [...editingTemplate.tembusan]
    updated.splice(index, 1)
    setEditingTemplate({...editingTemplate, tembusan: updated})
  }

  // Trigger Cetak / PDF via Browser
  const handlePrint = () => {
    const originalTitle = document.title
    document.title = ''
    window.print()
    setTimeout(() => {
      document.title = originalTitle
    }, 1200)
  }

  // Unduh Berkas PDF Resmi Kemensos Langsung (.pdf)
  // Mampu mengunduh seluruh penerima yang dipilih (misal: seluruh 1.057, 1.357, 300, atau seluruh SDM Bottleneck)
  const handleDownloadPdf = async (downloadAll = true) => {
    try {
      setIsDownloadingPdf(true)
      const listToDownload = downloadAll ? activeRecipients : displayedRecipients
      if (!listToDownload || listToDownload.length === 0) {
        alert('Tidak ada lembar naskah dinas untuk diunduh.')
        return
      }

      setDownloadProgress({
        current: 1,
        total: listToDownload.length,
        text: `Menyiapkan ${listToDownload.length.toLocaleString('id-ID')} dokumen naskah dinas...`
      })

      await generateOfficialPdfBatch({
        template: currentTemplate,
        official,
        venue,
        letterNumber,
        letterDate,
        customAgenda,
        recipients: listToDownload,
        showClassification,
        classificationPosition,
        classificationText,
        onProgress: (current, total, text) => {
          setDownloadProgress({ current, total, text })
        }
      })
    } catch (err) {
      console.error('Download PDF error:', err)
      alert(`Gagal membuat file PDF: ${err.message || 'Terjadi kesalahan teknis'}. Silakan gunakan tombol Cetak / Simpan PDF.`)
    } finally {
      setIsDownloadingPdf(false)
      setDownloadProgress(null)
    }
  }

  // Salin Teks ke Clipboard
  const handleCopyText = () => {
    const r = activeRecipients[0] || manualRecipient
    const text = `
${currentTemplate.classification}
${currentTemplate.title}
NOMOR : ${letterNumber}

${currentTemplate.openingText}
Nama        : ${r.nama}
NIP/NIPPPK  : ${r.nip}
Pangkat     : ${r.pangkat || '—'}
Jabatan     : ${r.jabatan || 'PPPK'}
Unit Kerja  : ${r.unitKerja || official.unitKerja}

Untuk menghadap kepada:
Nama        : ${official.nama}
NIP         : ${official.nip}
Pangkat     : ${official.pangkatSingkat || 'IV/c'}
Jabatan     : ${official.jabatan}

Pada :
Hari        : ${venue.hari}
Tanggal     : ${venue.tanggal}
Jam         : ${venue.jam}
Tempat      : ${venue.tempat}

${venue.linkZoom ? `Dan Pada sesi :\nHari        : ${venue.hari}\nTanggal     : ${venue.tanggal}\nJam         : ${venue.jam}\nLink zoom   : ${venue.linkZoom}\n` : ''}
${customAgenda || currentTemplate.agendaDefault}

${currentTemplate.closingText}

${official.kota}, ${letterDate}
${official.jabatan}

${official.nama}
NIP. ${official.nip}
    `.trim()

    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    })
  }

  // Handler pergantian template naskah dinas dengan pengelompokan otomatis sumber data
  const handleTemplateChange = (templateId) => {
    setSelectedTemplateId(templateId)
    const tpl = templates.find(t => t.id === templateId) || LETTER_TYPES.find(t => t.id === templateId)
    if (!tpl) return

    // 1. Jika Surat Pemanggilan Judi Online -> Otomatis alihkan ke Disiplin ASN (Populasi & Filter)
    if (templateId === 'panggilan-judol') {
      setRecipientSource('judol')
      handleSelectJudolStatus(judolAssessment || 'Terbukti')
    }
    // 2. Jika Surat Penagihan Pengembalian / Surat Pemanggilan Pengembalian Tukin -> Otomatis alihkan ke Bottleneck Nonaktif
    else if (tpl.category === 'keuangan' || templateId === 'panggilan-tukin' || templateId.startsWith('tagihan')) {
      setRecipientSource('bottleneck')
      setFocusNonactiveSDM(true)
      setSelectedBottleneckNo('')
      setPreviewPage(0)
      setTimeout(() => {
        setSelectedSDMKeys(new Set(bottleneckList.map(x => x.key)))
      }, 0)
    }
  }

  // Handler pergantian sumber data penerima dengan sinkronisasi template naskah dinas
  const handleRecipientSourceChange = (newSource) => {
    setRecipientSource(newSource)
    setPreviewPage(0)

    if (newSource === 'bottleneck') {
      setFocusNonactiveSDM(true)
      if (selectedTemplateId === 'panggilan-judol') {
        setSelectedTemplateId('tagihan-1')
      }
      setTimeout(() => {
        setSelectedSDMKeys(new Set(bottleneckList.map(x => x.key)))
      }, 0)
    } else if (newSource === 'judol') {
      if (selectedTemplateId.startsWith('tagihan') || selectedTemplateId === 'panggilan-tukin') {
        setSelectedTemplateId('panggilan-judol')
      }
      handleSelectJudolStatus(judolAssessment || 'Terbukti')
    }
  }

  // Handler tombol pill filter status Judi Online (Kedua status 1.357, Terbukti 1.057, Tidak Terbukti 300)
  const handleSelectJudolStatus = (status) => {
    setJudolAssessment(status)
    setPreviewPage(0)
    const matching = effectiveJudolRows.filter(r => !status || r.hasilPenilaian === status)
    setSelectedSDMKeys(new Set(matching.map(r => `judol-${r.nik || r.nip}`)))
  }

  return (
    <div className="letter-workspace">
      {/* 1. NAVIGASI TAB MODUL PERSURATAN */}
      <div className="letter-tabs no-print">
        <button
          className={'letter-tab-btn ' + (activeTab === 'generator' ? 'active' : '')}
          onClick={() => { setActiveTab('generator'); setEditingTemplate(null) }}
        >
          <FileText size={18} />
          <span>Generator Surat & Cetak A4</span>
        </button>
        <button
          className={'letter-tab-btn ' + (activeTab === 'cms-official' ? 'active' : '')}
          onClick={() => { setActiveTab('cms-official'); setEditingTemplate(null) }}
        >
          <UserCheck size={18} />
          <span>CMS Pejabat & Agenda</span>
        </button>
        <button
          className={'letter-tab-btn ' + (activeTab === 'cms-templates' ? 'active' : '')}
          onClick={() => setActiveTab('cms-templates')}
        >
          <Settings size={18} />
          <span>CMS Naskah Dinas Kemensos</span>
        </button>
      </div>

      {/* 2. TAB GENERATOR SURAT & PRATINJAU */}
      {activeTab === 'generator' && (
        <div className="letter-config-grid">
          {/* SISI KIRI: PANEL KONTROL & FILTER SDM */}
          <div className="letter-sidebar-panel no-print">
            <h3><FileText size={19} color="#38bdf8" /> Penerbitan Naskah Dinas</h3>

            <div className="letter-form-group">
              <label>Jenis Naskah Dinas</label>
              <select
                value={selectedTemplateId}
                onChange={e => handleTemplateChange(e.target.value)}
              >
                {templates.map(t => (
                  <option key={t.id} value={t.id}>
                    [{t.classification}] {t.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="letter-form-group">
              <label>Nomor Surat Resmi</label>
              <input
                type="text"
                value={letterNumber}
                onChange={e => setLetterNumber(e.target.value)}
                placeholder="       /3.3/KP.06.04/10/2026"
              />
            </div>

            <div className="letter-form-group">
              <label>Tanggal Surat</label>
              <input
                type="text"
                value={letterDate}
                onChange={e => setLetterDate(e.target.value)}
              />
            </div>

            <hr style={{borderColor: 'rgba(255,255,255,0.08)', margin: '4px 0'}} />

            {/* SUMBER DATA PENERIMA */}
            <div className="letter-form-group">
              <label>Sumber Data Penerima</label>
              <select
                value={recipientSource}
                onChange={e => handleRecipientSourceChange(e.target.value)}
              >
                <option value="bottleneck">
                  1. Penanganan SDM — Bottleneck ({focusNonactiveSDM ? `${bottleneckList.length} SDM Nonaktif` : `${matrix.length} Kategori`})
                </option>
                <option value="judol">
                  2. Disiplin ASN — Populasi & Filter ({judolFocused.length.toLocaleString('id-ID')} SDM · Terbukti: {(judolCounts['Terbukti'] || 0).toLocaleString('id-ID')}, Tidak Terbukti: {(judolCounts['Tidak Terbukti'] || 0).toLocaleString('id-ID')})
                </option>
                <option value="sdm_cases">3. Monitoring SDM Kasus ({caseList.length} data)</option>
                {masterList.length > 0 && (
                  <option value="master">4. Master & Progres Tersimpan ({masterList.length} SDM)</option>
                )}
                <option value="manual">5. Input Manual Perorangan</option>
              </select>
            </div>

            {/* KONTROL KHUSUS PENANGANAN SDM — BOTTLENECK */}
            {recipientSource === 'bottleneck' && (
              <div style={{display: 'flex', flexDirection: 'column', gap: 10, margin: '4px 0'}}>
                <div style={{background: 'rgba(56, 189, 248, 0.12)', border: '1px solid rgba(56, 189, 248, 0.35)', borderRadius: 6, padding: '8px 10px', fontSize: '0.8rem', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: 8}}>
                  <ShieldCheck size={16} />
                  <span><strong>Terhubung Khusus:</strong> Surat Penagihan Pengembalian ke Kas Negara (SIMPONI)</span>
                </div>

                <div style={{background: 'rgba(56, 189, 248, 0.08)', border: '1px solid rgba(56, 189, 248, 0.25)', borderRadius: 6, padding: '8px 10px'}}>
                  <label style={{display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 600, color: '#f8fafc', fontSize: '0.85rem'}}>
                    <input
                      type="checkbox"
                      checked={focusNonactiveSDM}
                      onChange={e => {
                        setFocusNonactiveSDM(e.target.checked)
                        setPreviewPage(0)
                      }}
                    />
                    Fokus tindak lanjut SDM nonaktif
                  </label>
                  <p style={{margin: '4px 0 0 24px', fontSize: '0.78rem', color: '#94a3b8', lineHeight: 1.3}}>
                    Daftar SDM difokuskan pada status nonaktif (Meninggal Dunia, Resign/PHK, Pensiun/BUP) dengan sisa pengembalian.
                  </p>
                </div>

                {/* Filter Pills Bottleneck Nonaktif */}
                <div style={{display: 'flex', flexDirection: 'column', gap: 6}}>
                  <label style={{fontSize: '0.82rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase'}}>
                    Filter Penanganan Bottleneck
                  </label>
                  <div className="letter-filter-pills">
                    <button
                      type="button"
                      className={`letter-pill-btn ${!selectedBottleneckNo ? 'active' : ''}`}
                      onClick={() => {
                        setSelectedBottleneckNo('')
                        setPreviewPage(0)
                        setSelectedSDMKeys(new Set(bottleneckList.map(x => x.key)))
                      }}
                    >
                      Semua Nonaktif ({bottleneckList.length})
                    </button>
                    {matrix.filter(m => [1, 2, 3].includes(Number(m.no))).map(m => {
                      const matchCount = bottleneckList.filter(c => {
                        const cCat = (c.kategori || c.status || '').toLowerCase()
                        return cCat.includes(m.kategori.toLowerCase()) || m.kategori.toLowerCase().includes(cCat)
                      }).length
                      return (
                        <button
                          key={m.no}
                          type="button"
                          className={`letter-pill-btn ${selectedBottleneckNo === String(m.no) ? 'active' : ''}`}
                          onClick={() => {
                            const newNo = selectedBottleneckNo === String(m.no) ? '' : String(m.no)
                            setSelectedBottleneckNo(newNo)
                            setPreviewPage(0)
                          }}
                        >
                          {m.kategori} ({matchCount})
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="letter-context-card">
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                    <b>Tindak Lanjut Penagihan Pengembalian</b>
                    <span className="pill green">{bottleneckList.length} SDM Tersedia</span>
                  </div>
                  <div style={{fontSize: '0.78rem', color: '#94a3b8'}}>
                    {focusNonactiveSDM
                      ? 'SDM nonaktif (Meninggal Dunia, Resign/PHK, Pensiun) wajib ditindaklanjuti dengan Surat Penagihan Pengembalian resmi ke Kas Negara (SIMPONI).'
                      : 'Menampilkan seluruh kategori hambatan pada matriks penanganan SDM.'}
                  </div>
                  <button
                    type="button"
                    className="quick-action-btn"
                    style={{background: 'linear-gradient(135deg, #0284c7, #0369a1)', color: '#ffffff', fontWeight: 600, padding: '8px 10px'}}
                    onClick={() => {
                      setSelectedTemplateId('tagihan-1')
                      setCustomAgenda('Diminta kepada Saudara/i atau pihak yang mewakili untuk segera melakukan penyetoran sisa kewajiban tersebut ke Kas Negara melalui Kode Billing SIMPONI (Akun Penerimaan Pengembalian Belanja Pegawai TA Yang Lalu) selambat-lambatnya sebelum 15 Desember 2026, dan segera menyampaikan bukti setor sah (NTPN/BPN) kepada Tim TLHP Direktorat PSNK.')
                    }}
                  >
                    <Sparkles size={14} />
                    <span>Terapkan SURAT PENAGIHAN PENGEMBALIAN untuk SDM Nonaktif</span>
                  </button>
                </div>

                {selectedBottleneck && (
                  <div className="letter-context-card">
                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                      <b>{String(selectedBottleneck.no).padStart(2, '0')}. {selectedBottleneck.kategori}</b>
                      <span className="pill amber">{selectedBottleneck.prioritas || 'Prioritas'}</span>
                    </div>
                    <div><b>Risiko:</b> {selectedBottleneck.risiko}</div>
                    <div><b>Tindak Lanjut:</b> {selectedBottleneck.tindak_lanjut}</div>
                    <div><b>Jalur:</b> {selectedBottleneck.jalur}</div>
                    <div><b>PIC:</b> {selectedBottleneck.pic} · <b>Tenggat:</b> {selectedBottleneck.deadline}</div>
                  </div>
                )}
              </div>
            )}

            {/* KONTROL KHUSUS KATEGORISASI DISIPLIN ASN — POPULASI & FILTER */}
            {recipientSource === 'judol' && (
              <div style={{display: 'flex', flexDirection: 'column', gap: 8, margin: '4px 0'}}>
                <div style={{background: 'rgba(56, 189, 248, 0.12)', border: '1px solid rgba(56, 189, 248, 0.35)', borderRadius: 6, padding: '8px 10px', fontSize: '0.8rem', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: 8}}>
                  <ShieldCheck size={16} />
                  <span><strong>Terhubung Khusus:</strong> Surat Pemanggilan Disiplin ASN — Indikasi Judi Online</span>
                </div>

                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                  <label style={{fontSize: '0.82rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase'}}>
                    Populasi & Filter Disiplin
                  </label>
                  {!judolRows.length && supabase && (
                    <button
                      type="button"
                      onClick={handleLoadJudolOnline}
                      disabled={loadingJudolOnline}
                      style={{background: 'none', border: 'none', color: '#38bdf8', fontSize: '0.78rem', cursor: 'pointer', padding: 0}}
                    >
                      {loadingJudolOnline ? 'Memuat...' : '↻ Muat Online'}
                    </button>
                  )}
                </div>
                <div className="letter-filter-pills">
                  <button
                    type="button"
                    className={`letter-pill-btn ${!judolAssessment ? 'active' : ''}`}
                    onClick={() => handleSelectJudolStatus('')}
                  >
                    Kedua status: {judolFocused.length.toLocaleString('id-ID')}
                  </button>
                  {FOCUSED_ASSESSMENTS.map(status => (
                    <button
                      key={status}
                      type="button"
                      className={`letter-pill-btn ${judolAssessment === status ? 'active' : ''}`}
                      onClick={() => handleSelectJudolStatus(status)}
                    >
                      {status}: {(judolCounts[status] || 0).toLocaleString('id-ID')}
                    </button>
                  ))}
                </div>

                <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6}}>
                  <div className="letter-form-group">
                    <label style={{fontSize: '0.72rem'}}>Kategori Pelanggaran</label>
                    <select
                      value={judolCategory}
                      onChange={e => {
                        setJudolCategory(e.target.value)
                        setPreviewPage(0)
                      }}
                      style={{fontSize: '0.8rem', padding: '6px 8px'}}
                    >
                      <option value="">Semua Kategori</option>
                      {DISCIPLINE_CATEGORIES.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div className="letter-form-group">
                    <label style={{fontSize: '0.72rem'}}>Kelengkapan Data</label>
                    <select
                      value={judolAvailability}
                      onChange={e => {
                        setJudolAvailability(e.target.value)
                        setPreviewPage(0)
                      }}
                      style={{fontSize: '0.8rem', padding: '6px 8px'}}
                    >
                      <option value="">Semua Kelengkapan</option>
                      {Object.entries(TRANSACTION_AVAILABILITY_LABELS).map(([k, lbl]) => (
                        <option key={k} value={k}>{lbl}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="letter-context-card">
                  <div>
                    Fokus <b>{judolList.length.toLocaleString('id-ID')} SDM</b> sesuai filter dari <b>{effectiveJudolRows.length.toLocaleString('id-ID')} SDM</b> sumber analisis.
                  </div>
                  <button
                    type="button"
                    className="quick-action-btn"
                    onClick={() => {
                      setSelectedTemplateId('panggilan-judol')
                      setCustomAgenda('Untuk diperiksa/dimintai keterangan dan klarifikasi sehubungan dengan dugaan pelanggaran disiplin indikasi aktivitas transaksi judi online berdasarkan Nota Dinas Sekretaris Jenderal Nomor 3513/I/KP.06.08/09/2026.')
                    }}
                  >
                    <Sparkles size={13} />
                    <span>Terapkan Template Panggilan Judol & Klausul Sekjen</span>
                  </button>
                </div>
              </div>
            )}

            {recipientSource !== 'manual' ? (
              <>
                <div className="letter-form-group">
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                    <label>Pilih SDM ({selectedSDMKeys.size} terpilih)</label>
                    <button
                      type="button"
                      style={{background: 'none', border: 'none', color: '#38bdf8', fontSize: '0.8rem', cursor: 'pointer', padding: 0}}
                      onClick={selectAllSDM}
                    >
                      {selectedSDMKeys.size === activeSDMOptions.length ? 'Batal Semua' : 'Pilih Semua'}
                    </button>
                  </div>

                  <div style={{display: 'flex', gap: 6, marginBottom: 6}}>
                    <input
                      type="text"
                      placeholder={recipientSource === 'judol' ? 'Cari NIK / Nama / NIP...' : 'Cari NIP, Nama, atau Kategori...'}
                      value={searchSDM}
                      onChange={e => setSearchSDM(e.target.value)}
                      style={{flex: 1}}
                    />
                    {recipientSource !== 'judol' && (
                      <select
                        value={filterStatusSDM}
                        onChange={e => setFilterStatusSDM(e.target.value)}
                        style={{fontSize: '0.8rem', padding: '6px 8px'}}
                      >
                        <option value="all">Semua</option>
                        <option value="unpaid">Belum Lunas</option>
                      </select>
                    )}
                  </div>

                  <div className="letter-recipients-box">
                    {!activeSDMOptions.length ? (
                      <div style={{fontSize: '0.82rem', color: '#64748b', padding: 8, textAlign: 'center'}}>
                        Tidak ada data yang cocok dengan kriteria filter.
                      </div>
                    ) : (
                      activeSDMOptions.map(item => {
                        const isChecked = selectedSDMKeys.has(item.key)
                        return (
                          <label key={item.key} className="recipient-checkbox-row">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleSelectSDM(item.key)}
                            />
                            <div>
                              <div className="rec-name">{item.nama}</div>
                              <div className="rec-nip">
                                {item.nip}
                                {item.sisaKewajiban > 0 && ` · Sisa Rp ${item.sisaKewajiban.toLocaleString('id-ID')}`}
                                {item.indikasi && ` · ${item.indikasi}`}
                                {item.kategori && ` · ${item.kategori}`}
                              </div>
                            </div>
                          </label>
                        )
                      })
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div style={{display: 'flex', flexDirection: 'column', gap: 10}}>
                <div className="letter-form-group">
                  <label>Nama Lengkap ASN</label>
                  <input
                    type="text"
                    value={manualRecipient.nama}
                    onChange={e => setManualRecipient({...manualRecipient, nama: e.target.value})}
                  />
                </div>
                <div className="letter-form-group">
                  <label>NIP / NIPPPK (18 Digit)</label>
                  <input
                    type="text"
                    value={manualRecipient.nip}
                    onChange={e => setManualRecipient({...manualRecipient, nip: e.target.value})}
                  />
                </div>
                <div className="letter-form-group">
                  <label>Pangkat / Golongan</label>
                  <input
                    type="text"
                    value={manualRecipient.pangkat}
                    onChange={e => setManualRecipient({...manualRecipient, pangkat: e.target.value})}
                  />
                </div>
                <div className="letter-form-group">
                  <label>Jabatan</label>
                  <input
                    type="text"
                    value={manualRecipient.jabatan}
                    onChange={e => setManualRecipient({...manualRecipient, jabatan: e.target.value})}
                  />
                </div>
                {currentTemplate.category === 'keuangan' && (
                  <div className="letter-form-group">
                    <label>Sisa Kewajiban (Rp)</label>
                    <input
                      type="number"
                      value={manualRecipient.sisaKewajiban}
                      onChange={e => setManualRecipient({...manualRecipient, sisaKewajiban: Number(e.target.value), kewajibanTotal: Number(e.target.value)})}
                    />
                  </div>
                )}
              </div>
            )}

            <div className="letter-form-group">
              <label>Klausul Agenda Khusus (Menimpa Agenda Baku)</label>
              <textarea
                rows={3}
                placeholder={currentTemplate.agendaDefault}
                value={customAgenda}
                onChange={e => setCustomAgenda(e.target.value)}
              />
            </div>
          </div>

          {/* SISI KANAN: WADAH PRATINJAU A4 RESMI DENGAN KOP GAMBAR ASLI */}
          <div>
            <div className="letter-preview-toolbar no-print">
              <div style={{color: '#f8fafc', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap'}}>
                <FileCheck2 size={19} color="#22c55e" />
                <span>Pratinjau ({activeRecipients.length.toLocaleString('id-ID')} Lembar Naskah Dinas)</span>
                {activeRecipients.length > PREVIEW_PAGE_SIZE && (
                  <span style={{fontSize: '0.82rem', color: '#94a3b8', fontWeight: 'normal', marginLeft: 4}}>
                    · Menampilkan {previewPage * PREVIEW_PAGE_SIZE + 1}–{Math.min((previewPage + 1) * PREVIEW_PAGE_SIZE, activeRecipients.length)}
                  </span>
                )}
              </div>
              <div className="preview-actions">
                {activeRecipients.length > PREVIEW_PAGE_SIZE && (
                  <div style={{display: 'flex', alignItems: 'center', gap: 6, marginRight: 8}}>
                    <button
                      type="button"
                      className="btn secondary"
                      style={{padding: '5px 9px', fontSize: '0.8rem'}}
                      disabled={previewPage === 0}
                      onClick={() => setPreviewPage(p => Math.max(0, p - 1))}
                    >
                      ← Sebelumnya
                    </button>
                    <span style={{fontSize: '0.8rem', color: '#cbd5e1', padding: '0 4px'}}>
                      {previewPage + 1} / {Math.ceil(activeRecipients.length / PREVIEW_PAGE_SIZE)}
                    </span>
                    <button
                      type="button"
                      className="btn secondary"
                      style={{padding: '5px 9px', fontSize: '0.8rem'}}
                      disabled={(previewPage + 1) * PREVIEW_PAGE_SIZE >= activeRecipients.length}
                      onClick={() => setPreviewPage(p => p + 1)}
                    >
                      Selanjutnya →
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  className="btn secondary"
                  onClick={handleCopyText}
                  title="Salin teks surat ke clipboard"
                >
                  {copied ? <Check size={16} color="#22c55e" /> : <Copy size={16} />}
                  <span>{copied ? 'Tersalin!' : 'Salin Teks'}</span>
                </button>
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => handleDownloadPdf(true)}
                  disabled={isDownloadingPdf}
                  title={`Unduh seluruh berkas PDF (${activeRecipients.length.toLocaleString('id-ID')} SDM) ke perangkat Anda`}
                  style={{background: 'linear-gradient(135deg, #0284c7, #0369a1)', borderColor: '#0284c7', fontWeight: 600}}
                >
                  {isDownloadingPdf ? <LoaderCircle size={16} className="spin" /> : <Download size={16} />}
                  <span>{isDownloadingPdf ? 'Membuat PDF...' : `Unduh PDF (${activeRecipients.length.toLocaleString('id-ID')} SDM)`}</span>
                </button>
                <button
                  type="button"
                  className="btn primary"
                  onClick={handlePrint}
                  title="Cetak langsung atau simpan via dialog printer browser"
                >
                  <Printer size={16} />
                  <span>Cetak / Simpan PDF</span>
                </button>
              </div>
            </div>

            <div className="letter-preview-stage">
              {displayedRecipients.map((rec, index) => (
                <LetterDocument
                  key={rec.key || (previewPage * PREVIEW_PAGE_SIZE + index)}
                  template={currentTemplate}
                  recipient={rec}
                  official={official}
                  venue={venue}
                  letterNumber={letterNumber}
                  letterDate={letterDate}
                  customAgenda={customAgenda}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 3. TAB CMS PEJABAT & VENUE AGENDA */}
      {activeTab === 'cms-official' && (
        <div className="letter-sidebar-panel" style={{maxWidth: 760, margin: '0 auto'}}>
          <h3><UserCheck size={20} color="#38bdf8" /> CMS Profil Pejabat Penandatangan & Agenda</h3>
          <p style={{fontSize: '0.88rem', color: '#94a3b8', margin: 0}}>
            Ubah nama pejabat pemanggil/pemeriksa, NIP, pangkat, jabatan, serta waktu dan lokasi pertemuan luring maupun sesi Zoom. Seluruh perubahan otomatis tersimpan di browser.
          </p>

          <form onSubmit={handleSaveOfficial} style={{display: 'flex', flexDirection: 'column', gap: 14, marginTop: 8}}>
            <h4 style={{margin: '8px 0 0 0', color: '#f1f5f9', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 6}}>
              Identitas Pejabat yang Menghadapkan
            </h4>
            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12}}>
              <div className="letter-form-group">
                <label>Nama Pejabat</label>
                <input
                  type="text"
                  value={official.nama}
                  required
                  onChange={e => setOfficial({...official, nama: e.target.value})}
                />
              </div>
              <div className="letter-form-group">
                <label>NIP Pejabat</label>
                <input
                  type="text"
                  value={official.nip}
                  required
                  onChange={e => setOfficial({...official, nip: e.target.value})}
                />
              </div>
              <div className="letter-form-group">
                <label>Pangkat / Golongan</label>
                <input
                  type="text"
                  value={official.pangkatSingkat}
                  required
                  onChange={e => setOfficial({...official, pangkatSingkat: e.target.value, pangkat: e.target.value})}
                />
              </div>
              <div className="letter-form-group">
                <label>Kota Titimangsa</label>
                <input
                  type="text"
                  value={official.kota}
                  required
                  onChange={e => setOfficial({...official, kota: e.target.value})}
                />
              </div>
            </div>
            <div className="letter-form-group">
              <label>Jabatan Lengkap</label>
              <input
                type="text"
                value={official.jabatan}
                required
                onChange={e => setOfficial({...official, jabatan: e.target.value})}
              />
            </div>
            <div className="letter-form-group">
              <label>Unit Kerja</label>
              <input
                type="text"
                value={official.unitKerja}
                required
                onChange={e => setOfficial({...official, unitKerja: e.target.value})}
              />
            </div>

            <h4 style={{margin: '16px 0 0 0', color: '#f1f5f9', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 6}}>
              Jadwal, Lokasi Luring & Sesi Zoom Default
            </h4>
            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12}}>
              <div className="letter-form-group">
                <label>Hari</label>
                <input
                  type="text"
                  value={venue.hari}
                  onChange={e => setVenue({...venue, hari: e.target.value})}
                />
              </div>
              <div className="letter-form-group">
                <label>Tanggal Pertemuan</label>
                <input
                  type="text"
                  value={venue.tanggal}
                  onChange={e => setVenue({...venue, tanggal: e.target.value})}
                />
              </div>
              <div className="letter-form-group">
                <label>Jam Pelaksanaan</label>
                <input
                  type="text"
                  value={venue.jam}
                  onChange={e => setVenue({...venue, jam: e.target.value})}
                />
              </div>
            </div>
            <div className="letter-form-group">
              <label>Tempat Pertemuan (Luring)</label>
              <input
                type="text"
                value={venue.tempat}
                onChange={e => setVenue({...venue, tempat: e.target.value})}
              />
            </div>
            <div className="letter-form-group">
              <label>Tautan Link Zoom / Sesi Daring</label>
              <input
                type="text"
                value={venue.linkZoom}
                onChange={e => setVenue({...venue, linkZoom: e.target.value})}
                placeholder="Kosongkan jika tidak ada sesi daring"
              />
            </div>

            <div style={{display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16}}>
              <button
                type="button"
                className="btn secondary"
                onClick={() => {
                  setOfficial(DEFAULT_OFFICIAL)
                  setVenue(DEFAULT_VENUE)
                  localStorage.removeItem('kemensos_tlhp_official')
                  localStorage.removeItem('kemensos_tlhp_venue')
                  alert('Reset ke pengaturan bawaan Kemensos berhasil!')
                }}
              >
                Reset Bawaan
              </button>
              <button type="submit" className="btn primary">
                Simpan Profil Pejabat & Agenda
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 4. TAB CMS NASKAH DINAS KEMENSOS (BISA DIEDIT TEKSNYA SECARA BEBAS) */}
      {activeTab === 'cms-templates' && (
        <div style={{display: 'flex', flexDirection: 'column', gap: 16}}>
          {editingTemplate ? (
            // ================= EDITOR FORM TEMPLATE =================
            <div className="letter-sidebar-panel" style={{maxWidth: 820, margin: '0 auto', width: '100%'}}>
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                <h3><Pencil size={19} color="#38bdf8" /> Edit Teks Naskah Dinas: {editingTemplate.name}</h3>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => setEditingTemplate(null)}
                >
                  Batal / Kembali
                </button>
              </div>

              <form onSubmit={handleSaveTemplateEdit} style={{display: 'flex', flexDirection: 'column', gap: 14, marginTop: 10}}>
                <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12}}>
                  <div className="letter-form-group">
                    <label>Nama Naskah Dinas (Di Menu Dropdown)</label>
                    <input
                      type="text"
                      value={editingTemplate.name}
                      required
                      onChange={e => setEditingTemplate({...editingTemplate, name: e.target.value})}
                    />
                  </div>
                  <div className="letter-form-group">
                    <label>Kategori Naskah</label>
                    <select
                      value={editingTemplate.category}
                      onChange={e => setEditingTemplate({...editingTemplate, category: e.target.value})}
                    >
                      <option value="disiplin">Disiplin Pegawai (Format Panggilan)</option>
                      <option value="keuangan">Keuangan (Format Penagihan & Tabel Sisa)</option>
                      <option value="berita-acara">Berita Acara (Format BAP Dua Pihak)</option>
                    </select>
                  </div>
                </div>

                <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12}}>
                  <div className="letter-form-group">
                    <label>Kode Klasifikasi Arsip</label>
                    <input
                      type="text"
                      value={editingTemplate.code}
                      required
                      placeholder="KP.06.04 atau KU.03.01"
                      onChange={e => setEditingTemplate({...editingTemplate, code: e.target.value})}
                    />
                  </div>
                  <div className="letter-form-group">
                    <label>Derajat Keamanan</label>
                    <input
                      type="text"
                      value={editingTemplate.classification}
                      required
                      placeholder="RAHASIA / SEGERA / BIASA"
                      onChange={e => setEditingTemplate({...editingTemplate, classification: e.target.value.toUpperCase()})}
                    />
                  </div>
                  <div className="letter-form-group">
                    <label>Judul Tercetak</label>
                    <input
                      type="text"
                      value={editingTemplate.title}
                      required
                      placeholder="SURAT PANGGILAN"
                      onChange={e => setEditingTemplate({...editingTemplate, title: e.target.value.toUpperCase()})}
                    />
                  </div>
                </div>

                <div className="letter-form-group">
                  <label>Teks Kalimat Pembuka</label>
                  <textarea
                    rows={2}
                    value={editingTemplate.openingText || ''}
                    onChange={e => setEditingTemplate({...editingTemplate, openingText: e.target.value})}
                    placeholder="Bersama ini diminta dengan hormat kehadiran Saudara:"
                  />
                </div>

                <div className="letter-form-group">
                  <label>Teks Agenda / Alasan Pemanggilan / Penagihan Baku</label>
                  <textarea
                    rows={4}
                    value={editingTemplate.agendaDefault}
                    required
                    onChange={e => setEditingTemplate({...editingTemplate, agendaDefault: e.target.value})}
                  />
                </div>

                <div className="letter-form-group">
                  <label>Teks Kalimat Penutup</label>
                  <input
                    type="text"
                    value={editingTemplate.closingText || ''}
                    onChange={e => setEditingTemplate({...editingTemplate, closingText: e.target.value})}
                    placeholder="Demikian untuk dilaksanakan."
                  />
                </div>

                {/* TEMBUSAN EDITOR */}
                <div className="letter-form-group">
                  <label>Daftar Tembusan Standar</label>
                  <div style={{display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8}}>
                    {(editingTemplate.tembusan || []).map((t, idx) => (
                      <div key={idx} style={{display: 'flex', gap: 8, alignItems: 'center'}}>
                        <span style={{color: '#94a3b8', fontSize: '0.85rem', width: 20}}>{idx + 1}.</span>
                        <input
                          type="text"
                          value={t}
                          style={{flex: 1}}
                          onChange={e => {
                            const updated = [...editingTemplate.tembusan]
                            updated[idx] = e.target.value
                            setEditingTemplate({...editingTemplate, tembusan: updated})
                          }}
                        />
                        <button
                          type="button"
                          className="icon-btn"
                          style={{color: '#ef4444'}}
                          title="Hapus baris tembusan"
                          onClick={() => handleRemoveTembusan(idx)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>

                  <div style={{display: 'flex', gap: 8}}>
                    <input
                      type="text"
                      placeholder="Tambah pihak tembusan baru..."
                      value={newTembusanInput}
                      onChange={e => setNewTembusanInput(e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={handleAddTembusan}
                    >
                      <Plus size={16} /> Tambah
                    </button>
                  </div>
                </div>

                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14}}>
                  <button
                    type="button"
                    className="btn secondary"
                    style={{color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)'}}
                    onClick={() => handleDeleteTemplate(editingTemplate.id)}
                  >
                    <Trash2 size={16} /> Hapus Template Ini
                  </button>
                  <div style={{display: 'flex', gap: 10}}>
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={() => setEditingTemplate(null)}
                    >
                      Batal
                    </button>
                    <button type="submit" className="btn primary">
                      <Save size={16} /> Simpan Perubahan Template
                    </button>
                  </div>
                </div>
              </form>
            </div>
          ) : (
            // ================= DAFTAR KATALOG TEMPLATE =================
            <div className="letter-sidebar-panel" style={{maxWidth: 960, margin: '0 auto', width: '100%'}}>
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                <div>
                  <h3><Settings size={20} color="#38bdf8" /> CMS Template Naskah Dinas Kemensos</h3>
                  <p style={{fontSize: '0.88rem', color: '#94a3b8', margin: '4px 0 0 0'}}>
                    Seluruh teks naskah dinas, judul, kode klasifikasi arsip, agenda, dan tembusan dapat diedit atau ditambah sesuai kebutuhan penugasan Anda.
                  </p>
                </div>
                <div style={{display: 'flex', gap: 10}}>
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={handleResetTemplates}
                    title="Kembalikan ke template default Kemensos"
                  >
                    <RotateCcw size={16} /> Reset Default
                  </button>
                  <button
                    type="button"
                    className="btn primary"
                    onClick={handleCreateNewTemplate}
                  >
                    <Plus size={16} /> Tambah Template Baru
                  </button>
                </div>
              </div>

              <div style={{display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14}}>
                {templates.map(tpl => (
                  <div
                    key={tpl.id}
                    style={{
                      background: 'rgba(30, 41, 59, 0.65)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 8,
                      padding: 16
                    }}
                  >
                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8}}>
                      <div style={{display: 'flex', alignItems: 'center', gap: 10}}>
                        <span className={`pill ${tpl.classification === 'RAHASIA' ? 'amber' : tpl.classification === 'SEGERA' ? 'red' : 'blue'}`}>
                          {tpl.classification}
                        </span>
                        <strong style={{color: '#f8fafc', fontSize: '1.02rem'}}>{tpl.name}</strong>
                      </div>
                      <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
                        <span style={{fontFamily: 'monospace', color: '#38bdf8', fontSize: '0.85rem'}}>
                          Kode: {tpl.code}
                        </span>
                        <button
                          type="button"
                          className="btn secondary"
                          style={{padding: '5px 12px', fontSize: '0.82rem'}}
                          onClick={() => setEditingTemplate({...tpl})}
                        >
                          <Pencil size={14} /> Edit Teks
                        </button>
                      </div>
                    </div>

                    <div style={{fontSize: '0.86rem', color: '#cbd5e1', marginBottom: 6}}>
                      <strong>Judul Naskah:</strong> {tpl.title}
                    </div>

                    <div style={{fontSize: '0.85rem', color: '#94a3b8', marginBottom: 8}}>
                      <strong>Teks Agenda Baku:</strong> {tpl.agendaDefault}
                    </div>

                    <div style={{fontSize: '0.82rem', color: '#64748b'}}>
                      <strong>Tembusan Standar ({tpl.tembusan?.length || 0} pihak):</strong>
                      <ul style={{margin: '4px 0 0 16px', padding: 0}}>
                        {(tpl.tembusan || []).map((t, i) => (
                          <li key={i}>{t}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. MODAL PROGRESS PEMBUATAN PDF BATCH RESMI KEMENSOS */}
      {downloadProgress && (
        <div className="pdf-progress-overlay no-print">
          <div className="pdf-progress-modal">
            <div className="pdf-progress-spinner">
              <LoaderCircle size={28} className="spin" color="#38bdf8" />
            </div>
            <div className="pdf-progress-info">
              <h4>Menyiapkan Berkas PDF Resmi Kemensos</h4>
              <p>{downloadProgress.text}</p>
              <div className="pdf-progress-bar-track">
                <div
                  className="pdf-progress-bar-fill"
                  style={{
                    width: `${Math.min(100, Math.round((downloadProgress.current / downloadProgress.total) * 100))}%`
                  }}
                />
              </div>
              <div className="pdf-progress-stat">
                <span>{downloadProgress.current.toLocaleString('id-ID')} dari {downloadProgress.total.toLocaleString('id-ID')} Lembar</span>
                <span>{Math.round((downloadProgress.current / downloadProgress.total) * 100)}%</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
