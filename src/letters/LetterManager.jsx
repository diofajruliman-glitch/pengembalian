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
  Files,
  Database,
  CheckCircle2
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
import {indexSnapshot, selectProgress} from '../recovery/progress.js'
import {statusOf, targetStatuses, normalizeSdmStatus, isNonactiveStatus, isSpecialTarget} from '../import/sourceMetadata.js'
import {lookupNipPosition} from './nipPositionReference.js'
import './officialLetter.css'

// Helper filter data uji / simulasi agar tidak pernah masuk ke dokumen resmi
export function isTestRecord(item) {
  if (!item) return true
  const nama = String(item.nama || '').trim()
  const nip = String(item.nip || '').trim()
  const nik = String(item.nik || '').trim()
  const combined = `${nama} ${nip} ${nik} ${item.pic || ''} ${item.catatan || ''} ${item.kategori || ''} ${item.status || ''}`.toLowerCase()
  if (/simulasi|test|testing|dummy|contoh|sample|trial|fiktif|tester|pegawai test|ahmad fauzi/i.test(combined)) return true
  if (/^0{4,}/.test(nip) || /^0{4,}/.test(nik)) return true
  if (/^1{10,}/.test(nip) || /^123456/.test(nip)) return true
  if (!nama || nama.toLowerCase() === 'tanpa nama' || nama.toLowerCase() === '«nama asn»' || nama === '—' || nama === '-') return true
  if (nip.length < 8 && (!nik || nik.length < 8)) return true
  return false
}

export default function LetterManager({
  cases = [],
  judolSnapshot = null,
  onOpenJudolSource = null,
  masterSnapshot = null,
  matrix = [],
  actions = [],
  supabase = null,
  databaseOnly = true
}) {
  const [activeTab, setActiveTab] = useState('generator')
  const [copied, setCopied] = useState(false)
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(null)
  const [dbCases, setDbCases] = useState([])
  const [loadingDbCases, setLoadingDbCases] = useState(false)
  const [dbCasesError, setDbCasesError] = useState('')

  // Muat data SDM langsung dari database Supabase (sdm_cases) bila akun terotentikasi (dengan pagination chunking)
  useEffect(() => {
    setDbCases([])
    setDbCasesError('')
    if (!supabase) return
    let active = true
    setLoadingDbCases(true)

    const loadAllDbCases = async () => {
      try {
        const all = []
        let offset = 0
        let hasMore = true
        while (hasMore && active) {
          const { data, error } = await supabase
            .from('sdm_cases')
            .select('*')
            .is('deleted_at', null)
            .order('id', { ascending: true })
            .range(offset, offset + 999)
          if (!active) return
          if (error) throw error
          if (data && data.length > 0) {
            all.push(...data)
            hasMore = data.length === 1000
            offset += 1000
          } else {
            hasMore = false
          }
        }
        if (active) {
          setDbCases(all)
        }
      } catch (err) {
        if (active) {
          console.error('Error loading sdm_cases in LetterManager:', err)
          setDbCasesError('Daftar SDM dari database belum dapat dimuat. Periksa koneksi dan hak akses.')
        }
      } finally {
        if (active) setLoadingDbCases(false)
      }
    }

    loadAllDbCases()
    return () => { active = false }
  }, [supabase])

  const effectiveCases = useMemo(() => {
    const map = new Map()
    for (const c of (cases || [])) {
      if (c?.nip && !isTestRecord(c)) map.set(c.nip, c)
    }
    for (const c of (dbCases || [])) {
      if (c?.nip && !isTestRecord(c)) map.set(c.nip, c)
    }
    return Array.from(map.values())
  }, [cases, dbCases])

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

  // Opsi Baris Pangkat / Golongan (Default: true untuk surat resmi pemanggilan & klarifikasi)
  const [showRank, setShowRank] = useState(true)

  // Sinkronisasi Pengaturan ketika template berganti
  useEffect(() => {
    if (currentTemplate) {
      setShowClassification(currentTemplate.showClassification !== false)
      setClassificationPosition(currentTemplate.classificationPosition || 'left')
      setClassificationText(currentTemplate.classification || 'RAHASIA')
      setShowRank(currentTemplate.showRank !== false)
    }
  }, [currentTemplate?.id])

  // Nomor & Tanggal Surat
  const [letterNumber, setLetterNumber] = useState('       /3.3/KP.06.04/10/2026')
  const [letterDate, setLetterDate] = useState(() => {
    const d = new Date()
    return d.toLocaleDateString('id-ID', {day: 'numeric', month: 'long', year: 'numeric'})
  })
  const [customAgenda, setCustomAgenda] = useState('')
  const [customOpening, setCustomOpening] = useState('')
  const [customCoordination, setCustomCoordination] = useState('')
  const [customClosing, setCustomClosing] = useState('')

  // Sumber Data SDM Penerima
  const [recipientSource, setRecipientSource] = useState('sdm_cases')
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

  // Manual Recipient Form (Input Khusus / Tambahan)
  const [manualRecipient, setManualRecipient] = useState({
    nama: '',
    nip: '',
    pangkat: 'Pegawai ASN / PPPK',
    jabatan: 'PPPK Direktorat PSNK',
    unitKerja: 'Direktorat Perlindungan Sosial Non Kebencanaan',
    kewajibanTotal: 0,
    realisasiTotal: 0,
    sisaKewajiban: 0
  })

  // State untuk Editor CMS Template
  const [editingTemplate, setEditingTemplate] = useState(null)
  const [newTembusanInput, setNewTembusanInput] = useState('')

  // Helper identifikasi SDM Nonaktif
  const isNonactivePerson = (p) => {
    const s = `${p.status || ''} ${p.status_sdm || ''} ${p.kategori || ''} ${p.sourceMetadata?.status || ''}`.toLowerCase()
    return /meninggal|resign|pensiun|bup|mengundurkan|phk/.test(s)
  }

  // 1. DATA SDM DARI PENANGANAN SDM — BOTTLENECK (Matriks Hambatan & Master/Database)
  const selectedBottleneck = useMemo(() => {
    if (!selectedBottleneckNo) return null
    return matrix.find(m => String(m.no) === String(selectedBottleneckNo)) || null
  }, [matrix, selectedBottleneckNo])

  const allBottleneckSDM = useMemo(() => {
    const map = new Map()

    // 1. Ambil data dari masterSnapshot menggunakan recovery engine resmi (progress.js)
    if (masterSnapshot?.results?.length) {
      try {
        const index = indexSnapshot(masterSnapshot.results)
        const progress = selectProgress(index, {
          worklist: focusNonactiveSDM ? 'nonactive' : '',
          remainingOnly: focusNonactiveSDM
        })

        for (const p of (progress.rows || [])) {
          if (!p?.nip || isTestRecord(p)) continue
          const currentStatus = statusOf(p) || p.status_sdm || (isNonactiveStatus(statusOf(p)) ? 'SDM Nonaktif' : 'Aktif')
          const posRef = lookupNipPosition(p.nip)
          map.set(p.nip, {
            key: `btnk-master-${p.nip}`,
            nama: p.nama || posRef?.nama || 'Tanpa Nama',
            nip: p.nip,
            pangkat: posRef?.pangkat || p.pangkat || 'Golongan IX',
            jabatan: posRef?.jabatan || p.jabatan || 'Penata Layanan Operasional',
            unitKerja: p.unitKerja || 'Direktorat Perlindungan Sosial Non Kebencanaan',
            kewajibanTotal: Number(p.obligation || 0),
            realisasiTotal: Number(p.payment || 0),
            sisaKewajiban: Number(p.remaining || 0),
            bank: p.bank || 'Bank Pemerintah',
            status: currentStatus,
            kategori: currentStatus,
            pic: 'Tim TLHP PSNK',
            deadline: '2026-12-15',
            provinsi: p.provinsi || ''
          })
        }
      } catch (err) {
        console.error('Error processing masterSnapshot in LetterManager:', err)
      }
    }

    // 2. Gabungkan data riil dari database Supabase (effectiveCases / sdm_cases)
    if (effectiveCases && effectiveCases.length) {
      for (const c of effectiveCases) {
        if (!c?.nip || isTestRecord(c)) continue
        const kw = Number(c.kewajibanTotal || c.kewajiban_total || 0)
        const real = Number(c.realisasiTotal || c.realisasi_total || 0)
        const sisa = Number(c.sisaKewajiban != null ? c.sisaKewajiban : (c.sisa_kewajiban != null ? c.sisa_kewajiban : Math.max(0, kw - real)))
        const nonactive = isNonactivePerson(c) || isNonactiveStatus(c.status || c.kategori)

        if (focusNonactiveSDM && (!nonactive || sisa <= 0)) continue

        const posRef = lookupNipPosition(c.nip)
        if (map.has(c.nip)) {
          const prev = map.get(c.nip)
          map.set(c.nip, {
            ...prev,
            nama: c.nama || prev.nama,
            pangkat: posRef?.pangkat || prev.pangkat || 'Golongan IX',
            jabatan: posRef?.jabatan || prev.jabatan || 'Penata Layanan Operasional',
            kewajibanTotal: kw || prev.kewajibanTotal,
            realisasiTotal: real || prev.realisasiTotal,
            sisaKewajiban: sisa,
            bank: c.bank || prev.bank,
            status: c.status || prev.status,
            kategori: c.kategori || prev.kategori,
            pic: c.pic || prev.pic,
            deadline: c.deadline || prev.deadline,
            provinsi: c.provinsi || prev.provinsi
          })
        } else {
          map.set(c.nip, {
            key: `btnk-${c.id || c.nip}`,
            nama: c.nama || posRef?.nama || 'Tanpa Nama',
            nip: c.nip,
            pangkat: posRef?.pangkat || c.pangkat || 'Golongan IX',
            jabatan: posRef?.jabatan || c.jabatan || 'Penata Layanan Operasional',
            unitKerja: c.unitKerja || 'Direktorat Perlindungan Sosial Non Kebencanaan',
            kewajibanTotal: kw,
            realisasiTotal: real,
            sisaKewajiban: sisa,
            bank: c.bank || 'Bank Pemerintah',
            status: c.status || (nonactive ? 'SDM Nonaktif' : 'Aktif'),
            kategori: c.kategori || (nonactive ? 'SDM Nonaktif' : 'Umum'),
            pic: c.pic || 'Pokja Evkin / PSNK',
            deadline: c.deadline || '2026-12-15',
            provinsi: c.provinsi || ''
          })
        }
      }
    }

    return Array.from(map.values())
  }, [masterSnapshot, effectiveCases, focusNonactiveSDM])

  const bottleneckList = useMemo(() => {
    if (!selectedBottleneck) return allBottleneckSDM
    const allowedTargets = focusNonactiveSDM ? targetStatuses(selectedBottleneck) : []
    const bCat = (selectedBottleneck.kategori || '').toLowerCase().trim()

    return allBottleneckSDM.filter(c => {
      if (focusNonactiveSDM && allowedTargets.length) {
        const norm = normalizeSdmStatus(c.status || c.kategori)
        if (allowedTargets.includes(norm)) return true
      }
      const cCat = `${c.kategori || ''} ${c.status || ''}`.toLowerCase()
      return bCat && (cCat.includes(bCat) || bCat.includes(cCat))
    })
  }, [allBottleneckSDM, selectedBottleneck, focusNonactiveSDM])

  // 2. DATA SDM DARI MONITORING SDM (effectiveCases / sdm_cases Supabase & Master)
  const caseList = useMemo(() => {
    const map = new Map()

    if (effectiveCases && effectiveCases.length) {
      for (const c of effectiveCases) {
        if (!c?.nip || isTestRecord(c)) continue
        const kw = Number(c.kewajibanTotal || c.kewajiban_total || 0)
        const real = Number(c.realisasiTotal || c.realisasi_total || 0)
        const sisa = Number(c.sisaKewajiban != null ? c.sisaKewajiban : (c.sisa_kewajiban != null ? c.sisa_kewajiban : Math.max(0, kw - real)))
        const posRef = lookupNipPosition(c.nip)

        map.set(c.nip, {
          key: `case-${c.id || c.nip}`,
          id: c.id,
          nama: c.nama || posRef?.nama || 'Tanpa Nama',
          nip: c.nip,
          pangkat: posRef?.pangkat || c.pangkat || 'Golongan IX',
          jabatan: posRef?.jabatan || c.jabatan || 'Penata Layanan Operasional',
          unitKerja: c.unitKerja || 'Direktorat Perlindungan Sosial Non Kebencanaan',
          kewajibanTotal: kw,
          realisasiTotal: real,
          sisaKewajiban: sisa,
          bank: c.bank || 'Bank Pemerintah',
          status: c.status || 'Aktif',
          kategori: c.kategori || 'Umum',
          provinsi: c.provinsi || '',
          kabKota: c.kab_kota || c.kabKota || '',
          pic: c.pic || 'Pokja SD Tim TLHP',
          deadline: c.deadline || '2026-12-15'
        })
      }
    }

    if (masterSnapshot?.results?.length) {
      try {
        const index = indexSnapshot(masterSnapshot.results)
        const progress = selectProgress(index)
        for (const p of (progress.rows || [])) {
          if (!p?.nip || map.has(p.nip) || isTestRecord(p)) continue
          const kw = Number(p.obligation || 0)
          const real = Number(p.payment || 0)
          const sisa = Number(p.remaining != null ? p.remaining : Math.max(0, kw - real))
          const posRef = lookupNipPosition(p.nip)
          map.set(p.nip, {
            key: `case-master-${p.nip}`,
            nama: p.nama || posRef?.nama || 'Tanpa Nama',
            nip: p.nip,
            pangkat: posRef?.pangkat || p.pangkat || 'Golongan IX',
            jabatan: posRef?.jabatan || p.jabatan || 'Penata Layanan Operasional',
            unitKerja: 'Direktorat Perlindungan Sosial Non Kebencanaan',
            kewajibanTotal: kw,
            realisasiTotal: real,
            sisaKewajiban: sisa,
            bank: p.bank || 'Bank Pemerintah',
            status: statusOf(p) || p.status_sdm || 'Data Master',
            kategori: statusOf(p) || p.status_sdm || 'Umum',
            provinsi: p.provinsi || '',
            kabKota: p.kabKota || '',
            pic: 'Pokja SD Tim TLHP',
            deadline: '2026-12-15'
          })
        }
      } catch (err) {
        console.error('Error indexing master in caseList:', err)
      }
    }

    return Array.from(map.values())
  }, [effectiveCases, masterSnapshot])

  // 3. DATA SDM DARI KATEGORISASI DISIPLIN (JUDOL) — POPULASI & FILTER
  const judolRows = useMemo(() => {
    return judolSnapshot?.versions?.[judolSnapshot.active]?.result?.rows || []
  }, [judolSnapshot])

  // Main supplies the verified database response online. An empty/partial
  // dataset remains empty/partial; never merge a bundled personnel list.
  const effectiveJudolRows = judolRows

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
    return filtered
      .filter(r => !isTestRecord(r))
      .map(r => {
        const rawNip = r.nip || r.nik
        const posRef = lookupNipPosition(rawNip)
        return {
          key: `judol-${r.nik || r.nip}`,
          nama: r.nama || posRef?.nama || 'Tanpa Nama',
          nip: rawNip,
          pangkat: posRef?.pangkat || r.pangkat || 'Golongan IX',
          jabatan: posRef?.jabatan || r.jabatan || 'Penata Layanan Operasional',
          unitKerja: 'Direktorat Perlindungan Sosial Non Kebencanaan',
          kewajibanTotal: 0,
          realisasiTotal: 0,
          sisaKewajiban: 0,
          indikasi: r.hasilPenilaian,
          kategori: r[judolPeriod]?.kategori || r.historical?.kategori || 'Ringan',
          status: `Indikasi ${r.hasilPenilaian || 'Disiplin'} (${r[judolPeriod]?.kategori || 'Ringan'})`,
          provinsi: r.provinsi || '',
          kabKota: r.kabKota || ''
        }
      })
  }, [effectiveJudolRows, judolAssessment, judolCategory, judolPeriod, judolAvailability, searchSDM])

  // 4. DATA SDM DARI MASTER WORKBOOK (masterSnapshot)
  const masterList = useMemo(() => {
    const list = []
    const seen = new Set()
    if (masterSnapshot?.results?.length) {
      try {
        const index = indexSnapshot(masterSnapshot.results)
        const progress = selectProgress(index)
        for (const p of (progress.rows || [])) {
          if (!p?.nip || seen.has(p.nip) || isTestRecord(p)) continue
          seen.add(p.nip)
          const posRef = lookupNipPosition(p.nip)
          list.push({
            key: `master-${p.nip}`,
            nama: p.nama || posRef?.nama || 'Tanpa Nama',
            nip: p.nip,
            pangkat: posRef?.pangkat || 'Golongan IX',
            jabatan: posRef?.jabatan || 'Penata Layanan Operasional',
            unitKerja: 'Direktorat Perlindungan Sosial Non Kebencanaan',
            kewajibanTotal: Number(p.obligation || 0),
            realisasiTotal: Number(p.payment || 0),
            sisaKewajiban: Number(p.remaining != null ? p.remaining : Math.max(0, Number(p.obligation || 0) - Number(p.payment || 0))),
            bank: p.bank || '',
            status: statusOf(p) || p.status_sdm || 'Data Master',
            provinsi: p.provinsi || '',
            kabKota: p.kabKota || ''
          })
        }
      } catch (err) {
        console.error('Error processing masterSnapshot in masterList:', err)
      }
    }
    // Jika masterSnapshot belum dimuat, fallback ke effectiveCases dari database Supabase
    if (list.length === 0 && effectiveCases && effectiveCases.length) {
      for (const c of effectiveCases) {
        if (!c?.nip || seen.has(c.nip) || isTestRecord(c)) continue
        seen.add(c.nip)
        const kw = Number(c.kewajibanTotal || c.kewajiban_total || 0)
        const real = Number(c.realisasiTotal || c.realisasi_total || 0)
        const sisa = Number(c.sisaKewajiban != null ? c.sisaKewajiban : (c.sisa_kewajiban != null ? c.sisa_kewajiban : Math.max(0, kw - real)))
        const posRef = lookupNipPosition(c.nip)
        list.push({
          key: `master-case-${c.id || c.nip}`,
          nama: c.nama || posRef?.nama || 'Tanpa Nama',
          nip: c.nip,
          pangkat: posRef?.pangkat || c.pangkat || 'Golongan IX',
          jabatan: posRef?.jabatan || c.jabatan || 'Penata Layanan Operasional',
          unitKerja: c.unitKerja || 'Direktorat Perlindungan Sosial Non Kebencanaan',
          kewajibanTotal: kw,
          realisasiTotal: real,
          sisaKewajiban: sisa,
          bank: c.bank || '',
          status: c.status || 'Data Master',
          provinsi: c.provinsi || '',
          kabKota: c.kab_kota || c.kabKota || ''
        })
      }
    }
    return list
  }, [masterSnapshot, effectiveCases])

  // Opsi SDM aktif sesuai sumber yang dipilih
  const activeSDMOptions = useMemo(() => {
    let list = []
    if (recipientSource === 'bottleneck') {
      list = bottleneckList
      // Fallback cerdas: Bila daftar bottleneck nonaktif kosong tetapi ada data riil di database,
      // tampilkan data kasus riil dengan sisa kewajiban agar pengguna tidak mendapati tabel kosong
      if (!list.length && caseList.length > 0) {
        list = caseList.filter(item => item.sisaKewajiban > 0)
      }
    } else if (recipientSource === 'sdm_cases') {
      list = caseList
    } else if (recipientSource === 'judol') {
      list = judolList
    } else if (recipientSource === 'master') {
      list = masterList
    }

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
    if (recipientSource === 'manual') return databaseOnly ? [] : [manualRecipient]
    const list = activeSDMOptions
    if (!list.length) return []

    const filtered = list.filter(x => selectedSDMKeys.has(x.key))
    const rawList = filtered.length > 0 ? filtered : list
    return rawList.map(r => {
      const posRef = lookupNipPosition(r.nip || r.nik)
      if (!posRef) return r
      return {
        ...r,
        nama: r.nama && r.nama !== 'Tanpa Nama' ? r.nama : (posRef.nama || r.nama),
        pangkat: posRef.pangkat || r.pangkat || 'Golongan IX',
        jabatan: posRef.jabatan || r.jabatan || 'Penata Layanan Operasional'
      }
    })
  }, [recipientSource, manualRecipient, activeSDMOptions, selectedSDMKeys, databaseOnly])

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
        customOpening,
        customCoordination,
        customClosing,
        recipients: listToDownload,
        showClassification,
        classificationPosition,
        classificationText,
        showRank,
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
    const r = activeRecipients[0]
    if (!r) return
    const effectiveCoord = customCoordination || currentTemplate.coordinationText || 'Apabila terdapat ketidaksesuaian perhitungan data atau telah memiliki bukti setor yang belum terverifikasi, Saudara dapat segera berkoordinasi langsung dengan Pokja SD Tim TLHP Direktorat PSNK.'
    const text = `
${currentTemplate.classification}
${currentTemplate.title}
NOMOR : ${letterNumber}

${customOpening || currentTemplate.openingText}
Nama        : ${r.nama}
NIP/NIPPPK  : ${r.nip}
${showRank ? `Pangkat     : ${r.pangkat || '—'}\n` : ''}Jabatan     : ${r.jabatan || 'PPPK'}
Unit Kerja  : ${r.unitKerja || official.unitKerja}

${venue.linkZoom ? `Dan Pada sesi :\nHari        : ${venue.hari}\nTanggal     : ${venue.tanggal}\nJam         : ${venue.jam}\nLink zoom   : ${venue.linkZoom}\n` : ''}
${customAgenda || currentTemplate.agendaDefault}

${currentTemplate.category === 'keuangan' ? effectiveCoord + '\n\n' : ''}${customClosing || currentTemplate.closingText}

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
    // 2. Jika Surat Penagihan Pengembalian / Surat Pemanggilan Pengembalian Tukin -> Otomatis alihkan ke data keuangan
    else if (tpl.category === 'keuangan' || templateId === 'panggilan-tukin' || templateId.startsWith('tagihan')) {
      if (bottleneckList.length > 0) {
        setRecipientSource('bottleneck')
        setFocusNonactiveSDM(true)
        setSelectedBottleneckNo('')
      } else {
        setRecipientSource('sdm_cases')
        setFilterStatusSDM('unpaid')
      }
      setPreviewPage(0)
    } else {
      // 3. Untuk surat panggilan disiplin umum -> Alihkan ke Database Monitoring SDM
      if (recipientSource === 'bottleneck' && bottleneckList.length === 0) {
        setRecipientSource('sdm_cases')
        setFilterStatusSDM('all')
      }
      setPreviewPage(0)
    }
  }

  // Handler pergantian sumber data penerima dengan sinkronisasi template naskah dinas
  const handleRecipientSourceChange = (newSource) => {
    setRecipientSource(newSource)
    setPreviewPage(0)
    setSearchSDM('')

    if (newSource === 'bottleneck') {
      setFocusNonactiveSDM(true)
      setSelectedBottleneckNo('')
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
    } else if (newSource === 'sdm_cases') {
      setTimeout(() => {
        setSelectedSDMKeys(new Set(caseList.map(x => x.key)))
      }, 0)
    } else if (newSource === 'master') {
      setTimeout(() => {
        setSelectedSDMKeys(new Set(masterList.map(x => x.key)))
      }, 0)
    } else if (newSource === 'manual') {
      setSelectedSDMKeys(new Set(['manual']))
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
      {dbCasesError && <p className="notice amber-notice" role="alert">{dbCasesError}</p>}
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

            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 10px',
              borderRadius: '6px',
              marginBottom: 12,
              fontSize: '0.78rem',
              fontWeight: 500,
              background: loadingDbCases
                ? 'rgba(234, 179, 8, 0.12)'
                : dbCasesError
                ? 'rgba(239, 68, 68, 0.12)'
                : 'rgba(16, 185, 129, 0.12)',
              color: loadingDbCases
                ? '#facc15'
                : dbCasesError
                ? '#f87171'
                : '#34d399',
              border: `1px solid ${
                loadingDbCases
                  ? 'rgba(234, 179, 8, 0.3)'
                  : dbCasesError
                  ? 'rgba(239, 68, 68, 0.3)'
                  : 'rgba(16, 185, 129, 0.3)'
              }`
            }}>
              {loadingDbCases ? (
                <>
                  <LoaderCircle size={14} className="spin" />
                  <span>Memuat data riil database Supabase...</span>
                </>
              ) : dbCasesError ? (
                <>
                  <AlertCircle size={14} />
                  <span>Koneksi DB terbatas: data master aktif</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={14} />
                  <span>Database Terhubung: <strong>{effectiveCases.length} data riil</strong></span>
                </>
              )}
            </div>

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

            {/* KONTROL DERAJAT KEAMANAN (FLEKSIBEL: PILIHAN CENTANG, RUBAH TEKS, & POSISI KIRI / TENGAH / KANAN) */}
            <div className="classification-control-box">
              <label style={{display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 600, color: '#f8fafc', fontSize: '0.82rem'}}>
                <input
                  type="checkbox"
                  checked={showClassification}
                  onChange={e => setShowClassification(e.target.checked)}
                />
                Tampilkan Derajat Keamanan Dokumen
              </label>

              {showClassification && (
                <div style={{display: 'flex', flexDirection: 'column', gap: 6, marginTop: 2}}>
                  <input
                    type="text"
                    value={classificationText}
                    onChange={e => setClassificationText(e.target.value.toUpperCase())}
                    placeholder="RAHASIA / SEGERA / BIASA"
                    style={{fontSize: '0.82rem', padding: '6px 10px', textTransform: 'uppercase', fontWeight: 600}}
                  />
                  <div>
                    <span style={{fontSize: '0.72rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600}}>
                      Posisi Penempatan di Atas Judul:
                    </span>
                    <div className="pos-button-group">
                      <button
                        type="button"
                        className={`pos-btn ${classificationPosition === 'left' ? 'active' : ''}`}
                        onClick={() => setClassificationPosition('left')}
                        title="Rata Kiri (Standar Format Kemensos)"
                      >
                        <AlignLeft size={13} /> Pinggir Kiri
                      </button>
                      <button
                        type="button"
                        className={`pos-btn ${classificationPosition === 'center' ? 'active' : ''}`}
                        onClick={() => setClassificationPosition('center')}
                        title="Rata Tengah"
                      >
                        <AlignCenter size={13} /> Tengah
                      </button>
                      <button
                        type="button"
                        className={`pos-btn ${classificationPosition === 'right' ? 'active' : ''}`}
                        onClick={() => setClassificationPosition('right')}
                        title="Rata Kanan"
                      >
                        <AlignRight size={13} /> Pinggir Kanan
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* OPSI TAMPILKAN PANGKAT / GOLONGAN */}
            <div className="letter-form-group">
              <label style={{display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.85rem', color: '#f1f5f9', userSelect: 'none', margin: 0}}>
                <input
                  type="checkbox"
                  checked={showRank}
                  onChange={e => setShowRank(e.target.checked)}
                />
                <span>Sertakan Pangkat / Golongan</span>
              </label>
              <span style={{fontSize: '0.74rem', color: '#94a3b8', display: 'block', marginTop: 3}}>
                {showRank ? 'Baris Pangkat/Gol aktif di naskah dan cetakan PDF.' : 'Pangkat/Gol disembunyikan (standar umum pegawai PPPK).'}
              </span>
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

            {/* PEJABAT PENANDATANGAN AKTIF */}
            <div className="letter-form-group">
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                <label>Pejabat Penandatangan</label>
                <button
                  type="button"
                  onClick={() => setActiveTab('cms-official')}
                  style={{background: 'none', border: 'none', color: '#38bdf8', fontSize: '0.75rem', cursor: 'pointer', padding: 0}}
                >
                  Kelola Pejabat (CMS) →
                </button>
              </div>
              <select
                value={selectedOfficialId}
                onChange={e => handleSelectOfficial(e.target.value)}
              >
                {officials.map(o => (
                  <option key={o.id} value={o.id}>
                    {o.nama} — {o.jabatan}
                  </option>
                ))}
              </select>
            </div>

            {/* PRESET AGENDA & LOKASI PERTEMUAN */}
            <div className="letter-form-group">
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                <label>Agenda & Lokasi Pertemuan</label>
                <button
                  type="button"
                  onClick={() => setActiveTab('cms-official')}
                  style={{background: 'none', border: 'none', color: '#38bdf8', fontSize: '0.75rem', cursor: 'pointer', padding: 0}}
                >
                  Kelola Agenda (CMS) →
                </button>
              </div>
              <select
                value={selectedVenueId}
                onChange={e => handleSelectVenue(e.target.value)}
              >
                {venues.map(v => (
                  <option key={v.id} value={v.id}>
                    {v.name || `${v.hari}, ${v.tanggal} (${v.jam})`}
                  </option>
                ))}
              </select>
            </div>

            <hr style={{borderColor: 'rgba(255,255,255,0.08)', margin: '4px 0'}} />

            {/* SUMBER DATA PENERIMA */}
            <div className="letter-form-group">
              <label>Sumber Data Penerima</label>
              <select
                value={recipientSource}
                onChange={e => handleRecipientSourceChange(e.target.value)}
              >
                <option value="sdm_cases">
                  1. Database Monitoring SDM ({caseList.length} data riil)
                </option>
                <option value="bottleneck">
                  2. Penanganan SDM — Bottleneck ({focusNonactiveSDM ? `${bottleneckList.length} SDM Nonaktif` : `${matrix.length} Kategori`})
                </option>
                <option value="judol">
                  3. Disiplin ASN — Klarifikasi Transaksi ({judolFocused.length.toLocaleString('id-ID')} SDM · Terbukti: {(judolCounts['Terbukti'] || 0).toLocaleString('id-ID')}, Tidak Terbukti: {(judolCounts['Tidak Terbukti'] || 0).toLocaleString('id-ID')})
                </option>
                {masterList.length > 0 && (
                  <option value="master">4. Master & Progres Tersimpan ({masterList.length} SDM)</option>
                )}
                {!databaseOnly && <option value="manual">5. Input Manual Perorangan</option>}
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
                        setSelectedSDMKeys(new Set(allBottleneckSDM.map(x => x.key)))
                      }}
                    >
                      {focusNonactiveSDM ? `Semua Nonaktif (${allBottleneckSDM.length})` : `Semua Bottleneck (${allBottleneckSDM.length})`}
                    </button>
                    {(focusNonactiveSDM ? matrix.filter(isSpecialTarget) : matrix).map(m => {
                      const mTargets = focusNonactiveSDM ? targetStatuses(m) : []
                      const mCat = (m.kategori || '').toLowerCase().trim()
                      const matchCount = allBottleneckSDM.filter(c => {
                        if (focusNonactiveSDM && mTargets.length) {
                          const norm = normalizeSdmStatus(c.status || c.kategori)
                          if (mTargets.includes(norm)) return true
                        }
                        const cCat = `${c.kategori || ''} ${c.status || ''}`.toLowerCase()
                        return mCat && (cCat.includes(mCat) || mCat.includes(cCat))
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
                      setCustomAgenda('Diminta kepada Saudara/i atau pihak yang mewakili untuk segera melakukan penyetoran sisa kewajiban tersebut ke Kas Negara melalui Kode Billing SIMPONI (Akun Penerimaan Pengembalian Belanja Pegawai TA Yang Lalu) selambat-lambatnya sebelum 15 Desember 2026, dan segera menyampaikan bukti setor sah (NTPN/BPN) kepada Pokja SD Tim TLHP Direktorat PSNK.')
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
                  {!judolRows.length && onOpenJudolSource && (
                    <button
                      type="button"
                      onClick={onOpenJudolSource}
                      style={{background: 'none', border: 'none', color: '#38bdf8', fontSize: '0.78rem', cursor: 'pointer', padding: 0}}
                    >
                      Pilih dataset online
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
                        {loadingDbCases
                          ? 'Memuat data SDM dari database...'
                          : focusNonactiveSDM && recipientSource === 'bottleneck'
                          ? 'Tidak ada data SDM nonaktif dengan sisa pengembalian yang ditemukan di database.'
                          : 'Tidak ada data yang cocok dengan kriteria filter.'}
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
                                {item.jabatan && ` · ${item.jabatan}`}
                                {item.pangkat && ` · ${item.pangkat}`}
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

            {/* KUSTOMISASI TEKS NASKAH DINAS */}
            <div style={{
              background: 'rgba(30, 41, 59, 0.7)',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              borderRadius: '8px',
              padding: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px'
            }}>
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                <label style={{fontWeight: 700, color: '#38bdf8', fontSize: '0.85rem', margin: 0}}>
                  Kustomisasi Teks Naskah Surat
                </label>
                {(customOpening || customAgenda || customCoordination || customClosing) && (
                  <button
                    type="button"
                    style={{background: 'none', border: 'none', color: '#f87171', fontSize: '0.78rem', cursor: 'pointer', padding: 0}}
                    onClick={() => {
                      setCustomOpening('')
                      setCustomAgenda('')
                      setCustomCoordination('')
                      setCustomClosing('')
                    }}
                  >
                    Reset Teks
                  </button>
                )}
              </div>

              <div className="letter-form-group" style={{margin: 0}}>
                <label style={{fontSize: '0.78rem', color: '#94a3b8'}}>1. Paragraf Pembuka (Opsional)</label>
                <textarea
                  rows={2}
                  placeholder={currentTemplate.openingText}
                  value={customOpening}
                  onChange={e => setCustomOpening(e.target.value)}
                  style={{fontSize: '0.82rem'}}
                />
              </div>

              <div className="letter-form-group" style={{margin: 0}}>
                <label style={{fontSize: '0.78rem', color: '#94a3b8'}}>2. Agenda / Klausul Penyetoran SIMPONI</label>
                <textarea
                  rows={3}
                  placeholder={currentTemplate.agendaDefault}
                  value={customAgenda}
                  onChange={e => setCustomAgenda(e.target.value)}
                  style={{fontSize: '0.82rem'}}
                />
              </div>

              {currentTemplate.category === 'keuangan' && (
                <div className="letter-form-group" style={{margin: 0}}>
                  <label style={{fontSize: '0.78rem', color: '#94a3b8'}}>3. Teks Koordinasi / Ketidaksesuaian Data (Pokja SD)</label>
                  <textarea
                    rows={2}
                    placeholder={currentTemplate.coordinationText || 'Apabila terdapat ketidaksesuaian perhitungan data atau telah memiliki bukti setor yang belum terverifikasi, Saudara dapat segera berkoordinasi langsung dengan Pokja SD Tim TLHP Direktorat PSNK.'}
                    value={customCoordination}
                    onChange={e => setCustomCoordination(e.target.value)}
                    style={{fontSize: '0.82rem'}}
                  />
                </div>
              )}

              <div className="letter-form-group" style={{margin: 0}}>
                <label style={{fontSize: '0.78rem', color: '#94a3b8'}}>{currentTemplate.category === 'keuangan' ? '4.' : '3.'} Kalimat Penutup (Opsional)</label>
                <input
                  type="text"
                  placeholder={currentTemplate.closingText}
                  value={customClosing}
                  onChange={e => setCustomClosing(e.target.value)}
                  style={{fontSize: '0.82rem'}}
                />
              </div>
            </div>
          </div>

          {/* SISI KANAN: WADAH PRATINJAU A4 RESMI DENGAN KOP GAMBAR ASLI */}
          <div>
            <div className="letter-preview-toolbar no-print">
              <div style={{color: '#f8fafc', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap'}}>
                <FileCheck2 size={19} color="#22c55e" />
                <span>Pratinjau ({activeRecipients.length.toLocaleString('id-ID')} Lembar Naskah Dinas)</span>
                <span className="pill" style={{background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', borderColor: 'rgba(56, 189, 248, 0.3)', fontSize: '0.78rem', fontWeight: 600}}>
                  Font: Arial 12pt (Tata Naskah Dinas)
                </span>
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
                  disabled={!activeRecipients.length}
                  title="Salin teks surat ke clipboard"
                >
                  {copied ? <Check size={16} color="#22c55e" /> : <Copy size={16} />}
                  <span>{copied ? 'Tersalin!' : 'Salin Teks'}</span>
                </button>
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => handleDownloadPdf(true)}
                  disabled={isDownloadingPdf || !activeRecipients.length}
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
                  disabled={!activeRecipients.length}
                  title="Cetak langsung atau simpan via dialog printer browser"
                >
                  <Printer size={16} />
                  <span>Cetak / Simpan PDF</span>
                </button>
              </div>
            </div>

            <div className="letter-preview-stage">
              {!activeRecipients.length && (
                <div style={{
                  padding: '48px 24px',
                  textAlign: 'center',
                  background: '#ffffff',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                  color: '#475569',
                  maxWidth: '210mm',
                  margin: '0 auto'
                }}>
                  <ShieldCheck size={40} color="#0284c7" style={{margin: '0 auto 12px auto'}} />
                  <h3 style={{fontSize: '1.15rem', color: '#0f172a', marginBottom: '8px'}}>
                    Tidak Ada Naskah Dinas Sesuai Kriteria Filter
                  </h3>
                  <p style={{fontSize: '0.9rem', color: '#64748b', maxWidth: '480px', margin: '0 auto 16px auto', lineHeight: 1.45}}>
                    {loadingDbCases
                      ? 'Sedang menghubungkan dan memuat data SDM riil dari database Supabase...'
                      : 'Data penerima yang aktif saat ini kosong atau tidak cocok dengan filter pencarian.'}
                  </p>
                  {caseList.length > 0 && recipientSource !== 'sdm_cases' && (
                    <button
                      type="button"
                      className="btn primary"
                      onClick={() => handleRecipientSourceChange('sdm_cases')}
                      style={{margin: '0 auto', background: '#0284c7', borderColor: '#0284c7', fontWeight: 600}}
                    >
                      Buka Data Monitoring SDM ({caseList.length} data riil dari database)
                    </button>
                  )}
                </div>
              )}
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
                  customOpening={customOpening}
                  customCoordination={customCoordination}
                  customClosing={customClosing}
                  showClassification={showClassification}
                  classificationPosition={classificationPosition}
                  classificationText={classificationText}
                  showRank={showRank}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 3. TAB CMS PEJABAT & VENUE AGENDA (FLEKSIBEL: TAMBAH, EDIT, HAPUS, GANTI AKTIF) */}
      {activeTab === 'cms-official' && (
        <div style={{display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 1040, margin: '0 auto', width: '100%'}}>
          {/* SECTION 1: PROFIL PEJABAT PENANDATANGAN */}
          <div className="letter-sidebar-panel" style={{width: '100%'}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10}}>
              <div>
                <h3><UserCheck size={20} color="#38bdf8" /> Profil Pejabat Penandatangan Naskah Dinas</h3>
                <p style={{fontSize: '0.85rem', color: '#94a3b8', margin: '4px 0 0 0'}}>
                  Kelola daftar pejabat yang berwenang menandatangani surat panggilan, berita acara, maupun surat penagihan.
                </p>
              </div>
              <div style={{display: 'flex', gap: 8}}>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={handleResetOfficials}
                  title="Kembalikan daftar pejabat ke standar bawaan Kemensos"
                >
                  <RotateCcw size={15} /> Reset Default
                </button>
                <button
                  type="button"
                  className="btn primary"
                  onClick={handleCreateOfficial}
                >
                  <Plus size={15} /> Tambah Pejabat
                </button>
              </div>
            </div>

            {/* FORM EDIT / TAMBAH PEJABAT */}
            {editingOfficial && (
              <form
                onSubmit={handleSaveOfficialForm}
                style={{
                  background: 'rgba(15, 23, 42, 0.9)',
                  border: '1px solid #0284c7',
                  borderRadius: 8,
                  padding: 16,
                  margin: '12px 0',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12
                }}
              >
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                  <h4 style={{margin: 0, color: '#38bdf8', fontSize: '0.95rem'}}>
                    <Pencil size={15} style={{display: 'inline', marginRight: 6}} />
                    Edit Profil: {editingOfficial.nama}
                  </h4>
                  <button
                    type="button"
                    className="btn secondary"
                    style={{padding: '3px 8px', fontSize: '0.78rem'}}
                    onClick={() => setEditingOfficial(null)}
                  >
                    Batal
                  </button>
                </div>

                <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10}}>
                  <div className="letter-form-group">
                    <label>Nama Pejabat (Dengan Gelar)</label>
                    <input
                      type="text"
                      value={editingOfficial.nama}
                      required
                      onChange={e => setEditingOfficial({...editingOfficial, nama: e.target.value})}
                    />
                  </div>
                  <div className="letter-form-group">
                    <label>NIP Pejabat</label>
                    <input
                      type="text"
                      value={editingOfficial.nip}
                      required
                      onChange={e => setEditingOfficial({...editingOfficial, nip: e.target.value})}
                    />
                  </div>
                  <div className="letter-form-group">
                    <label>Pangkat / Golongan</label>
                    <input
                      type="text"
                      value={editingOfficial.pangkat}
                      required
                      placeholder="Pembina Tingkat I (IV/c)"
                      onChange={e => setEditingOfficial({...editingOfficial, pangkat: e.target.value, pangkatSingkat: e.target.value})}
                    />
                  </div>
                  <div className="letter-form-group">
                    <label>Kota Titimangsa</label>
                    <input
                      type="text"
                      value={editingOfficial.kota}
                      required
                      placeholder="Jakarta"
                      onChange={e => setEditingOfficial({...editingOfficial, kota: e.target.value})}
                    />
                  </div>
                </div>

                <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10}}>
                  <div className="letter-form-group">
                    <label>Jabatan Lengkap</label>
                    <input
                      type="text"
                      value={editingOfficial.jabatan}
                      required
                      placeholder="Direktur Perlindungan Sosial Non Kebencanaan"
                      onChange={e => setEditingOfficial({...editingOfficial, jabatan: e.target.value})}
                    />
                  </div>
                  <div className="letter-form-group">
                    <label>Unit Kerja</label>
                    <input
                      type="text"
                      value={editingOfficial.unitKerja}
                      required
                      placeholder="Direktorat Perlindungan Sosial Non Kebencanaan"
                      onChange={e => setEditingOfficial({...editingOfficial, unitKerja: e.target.value})}
                    />
                  </div>
                </div>

                <div style={{display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4}}>
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => setEditingOfficial(null)}
                  >
                    Batal
                  </button>
                  <button type="submit" className="btn primary">
                    <Save size={15} /> Simpan Profil Pejabat
                  </button>
                </div>
              </form>
            )}

            {/* DAFTAR CARD PROFIL PEJABAT */}
            <div className="cms-card-grid">
              {officials.map(o => {
                const isActive = o.id === selectedOfficialId
                return (
                  <div key={o.id} className={`cms-item-card ${isActive ? 'is-active' : ''}`}>
                    <div className="cms-item-header">
                      <div>
                        <div className="cms-item-title">{o.nama}</div>
                        <div className="cms-item-subtitle">{o.jabatan}</div>
                      </div>
                      {isActive && (
                        <span className="cms-active-pill">
                          <Check size={12} /> Penandatangan Aktif
                        </span>
                      )}
                    </div>

                    <div className="cms-item-body">
                      <div><b>NIP:</b> {o.nip}</div>
                      <div><b>Pangkat:</b> {o.pangkat || o.pangkatSingkat}</div>
                      <div><b>Unit:</b> {o.unitKerja}</div>
                      <div><b>Titimangsa:</b> {o.kota}</div>
                    </div>

                    <div className="cms-item-actions">
                      {!isActive ? (
                        <button
                          type="button"
                          className="btn secondary"
                          style={{fontSize: '0.78rem', padding: '4px 10px', color: '#38bdf8', borderColor: 'rgba(56,189,248,0.3)'}}
                          onClick={() => handleSelectOfficial(o.id)}
                        >
                          Pilih Sebagai Aktif
                        </button>
                      ) : (
                        <span style={{fontSize: '0.75rem', color: '#22c55e', fontWeight: 600}}>
                          ✓ Sedang Digunakan
                        </span>
                      )}
                      <div style={{display: 'flex', gap: 6}}>
                        <button
                          type="button"
                          className="btn secondary"
                          style={{padding: '4px 8px', fontSize: '0.78rem'}}
                          onClick={() => setEditingOfficial({...o})}
                          title="Edit profil pejabat ini"
                        >
                          <Pencil size={13} /> Edit
                        </button>
                        <button
                          type="button"
                          className="btn secondary"
                          style={{padding: '4px 8px', fontSize: '0.78rem', color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)'}}
                          onClick={() => handleDeleteOfficial(o.id)}
                          disabled={officials.length <= 1}
                          title={officials.length <= 1 ? 'Minimal harus ada 1 pejabat' : 'Hapus profil pejabat ini'}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* SECTION 2: PRESET AGENDA & LOKASI PERTEMUAN */}
          <div className="letter-sidebar-panel" style={{width: '100%'}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10}}>
              <div>
                <h3><Calendar size={20} color="#38bdf8" /> Preset Jadwal, Lokasi & Sesi Zoom Pertemuan</h3>
                <p style={{fontSize: '0.85rem', color: '#94a3b8', margin: '4px 0 0 0'}}>
                  Kelola jadwal pemeriksaan/klarifikasi luring di kantor maupun tautan video conference Zoom.
                </p>
              </div>
              <div style={{display: 'flex', gap: 8}}>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={handleResetVenues}
                  title="Kembalikan daftar agenda ke standar bawaan Kemensos"
                >
                  <RotateCcw size={15} /> Reset Default
                </button>
                <button
                  type="button"
                  className="btn primary"
                  onClick={handleCreateVenue}
                >
                  <Plus size={15} /> Tambah Preset Lokasi
                </button>
              </div>
            </div>

            {/* FORM EDIT / TAMBAH AGENDA */}
            {editingVenue && (
              <form
                onSubmit={handleSaveVenueForm}
                style={{
                  background: 'rgba(15, 23, 42, 0.9)',
                  border: '1px solid #0284c7',
                  borderRadius: 8,
                  padding: 16,
                  margin: '12px 0',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12
                }}
              >
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                  <h4 style={{margin: 0, color: '#38bdf8', fontSize: '0.95rem'}}>
                    <Pencil size={15} style={{display: 'inline', marginRight: 6}} />
                    Edit Preset: {editingVenue.name}
                  </h4>
                  <button
                    type="button"
                    className="btn secondary"
                    style={{padding: '3px 8px', fontSize: '0.78rem'}}
                    onClick={() => setEditingVenue(null)}
                  >
                    Batal
                  </button>
                </div>

                <div className="letter-form-group">
                  <label>Nama Label Preset</label>
                  <input
                    type="text"
                    value={editingVenue.name || ''}
                    required
                    placeholder="Misal: Gedung A Kemensos Salemba + Sesi Zoom"
                    onChange={e => setEditingVenue({...editingVenue, name: e.target.value})}
                  />
                </div>

                <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10}}>
                  <div className="letter-form-group">
                    <label>Hari Pelaksanaan</label>
                    <input
                      type="text"
                      value={editingVenue.hari}
                      required
                      placeholder="Senin"
                      onChange={e => setEditingVenue({...editingVenue, hari: e.target.value})}
                    />
                  </div>
                  <div className="letter-form-group">
                    <label>Tanggal Pertemuan</label>
                    <input
                      type="text"
                      value={editingVenue.tanggal}
                      required
                      placeholder="26 Oktober 2026"
                      onChange={e => setEditingVenue({...editingVenue, tanggal: e.target.value})}
                    />
                  </div>
                  <div className="letter-form-group">
                    <label>Jam Pelaksanaan</label>
                    <input
                      type="text"
                      value={editingVenue.jam}
                      required
                      placeholder="10.00 WIB"
                      onChange={e => setEditingVenue({...editingVenue, jam: e.target.value})}
                    />
                  </div>
                </div>

                <div className="letter-form-group">
                  <label>Tempat Pertemuan (Luring)</label>
                  <input
                    type="text"
                    value={editingVenue.tempat}
                    required
                    placeholder="Kementerian Sosial Gedung A Lantai 3 Dit. Jamsos"
                    onChange={e => setEditingVenue({...editingVenue, tempat: e.target.value})}
                  />
                </div>

                <div className="letter-form-group">
                  <label>Tautan Link Zoom / Sesi Daring (Opsional)</label>
                  <input
                    type="text"
                    value={editingVenue.linkZoom || ''}
                    placeholder="https://zoom.us/j/... (Kosongkan jika hanya luring)"
                    onChange={e => setEditingVenue({...editingVenue, linkZoom: e.target.value})}
                  />
                </div>

                <div style={{display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4}}>
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => setEditingVenue(null)}
                  >
                    Batal
                  </button>
                  <button type="submit" className="btn primary">
                    <Save size={15} /> Simpan Preset Agenda
                  </button>
                </div>
              </form>
            )}

            {/* DAFTAR CARD PRESET AGENDA */}
            <div className="cms-card-grid">
              {venues.map(v => {
                const isActive = v.id === selectedVenueId
                return (
                  <div key={v.id} className={`cms-item-card ${isActive ? 'is-active' : ''}`}>
                    <div className="cms-item-header">
                      <div>
                        <div className="cms-item-title">{v.name || 'Preset Agenda'}</div>
                        <div className="cms-item-subtitle">{v.hari}, {v.tanggal} ({v.jam})</div>
                      </div>
                      {isActive && (
                        <span className="cms-active-pill">
                          <Check size={12} /> Agenda Aktif
                        </span>
                      )}
                    </div>

                    <div className="cms-item-body">
                      <div><b>Tempat:</b> {v.tempat}</div>
                      {v.linkZoom ? (
                        <div style={{color: '#38bdf8', wordBreak: 'break-all'}}>
                          <b>Zoom:</b> {v.linkZoom}
                        </div>
                      ) : (
                        <div style={{color: '#64748b'}}><b>Sesi Daring:</b> Tidak ada (Hanya luring)</div>
                      )}
                    </div>

                    <div className="cms-item-actions">
                      {!isActive ? (
                        <button
                          type="button"
                          className="btn secondary"
                          style={{fontSize: '0.78rem', padding: '4px 10px', color: '#38bdf8', borderColor: 'rgba(56,189,248,0.3)'}}
                          onClick={() => handleSelectVenue(v.id)}
                        >
                          Gunakan Lokasi Ini
                        </button>
                      ) : (
                        <span style={{fontSize: '0.75rem', color: '#22c55e', fontWeight: 600}}>
                          ✓ Sedang Digunakan
                        </span>
                      )}
                      <div style={{display: 'flex', gap: 6}}>
                        <button
                          type="button"
                          className="btn secondary"
                          style={{padding: '4px 8px', fontSize: '0.78rem'}}
                          onClick={() => setEditingVenue({...v})}
                          title="Edit preset agenda ini"
                        >
                          <Pencil size={13} /> Edit
                        </button>
                        <button
                          type="button"
                          className="btn secondary"
                          style={{padding: '4px 8px', fontSize: '0.78rem', color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)'}}
                          onClick={() => handleDeleteVenue(v.id)}
                          disabled={venues.length <= 1}
                          title={venues.length <= 1 ? 'Minimal harus ada 1 agenda' : 'Hapus preset agenda ini'}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
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

                <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12}}>
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
                    <label>Judul Tercetak</label>
                    <input
                      type="text"
                      value={editingTemplate.title}
                      required
                      placeholder="SURAT PANGGILAN / SURAT PENAGIHAN"
                      onChange={e => setEditingTemplate({...editingTemplate, title: e.target.value.toUpperCase()})}
                    />
                  </div>
                </div>

                {/* DERAJAT KEAMANAN BAWAAN TEMPLATE */}
                <div style={{background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(56, 189, 248, 0.25)', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 10}}>
                  <label style={{display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 600, color: '#f8fafc', fontSize: '0.84rem'}}>
                    <input
                      type="checkbox"
                      checked={editingTemplate.showClassification !== false}
                      onChange={e => setEditingTemplate({...editingTemplate, showClassification: e.target.checked})}
                    />
                    Tampilkan Derajat Keamanan Dokumen Secara Bawaan
                  </label>

                  {editingTemplate.showClassification !== false && (
                    <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12}}>
                      <div className="letter-form-group">
                        <label>Teks Derajat Keamanan</label>
                        <input
                          type="text"
                          value={editingTemplate.classification || 'RAHASIA'}
                          required
                          placeholder="RAHASIA / SEGERA / BIASA"
                          onChange={e => setEditingTemplate({...editingTemplate, classification: e.target.value.toUpperCase()})}
                        />
                      </div>
                      <div className="letter-form-group">
                        <label>Posisi Derajat Keamanan</label>
                        <select
                          value={editingTemplate.classificationPosition || 'left'}
                          onChange={e => setEditingTemplate({...editingTemplate, classificationPosition: e.target.value})}
                        >
                          <option value="left">Pinggir Kiri (Standar Kemensos)</option>
                          <option value="center">Tengah (Center)</option>
                          <option value="right">Pinggir Kanan</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>

                <div className="letter-form-group" style={{background: 'rgba(255,255,255,0.02)', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-color, #334155)'}}>
                  <label style={{display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.84rem', color: '#f8fafc', margin: 0}}>
                    <input
                      type="checkbox"
                      checked={editingTemplate.showRank === true}
                      onChange={e => setEditingTemplate({...editingTemplate, showRank: e.target.checked})}
                    />
                    Sertakan Baris Pangkat / Golongan secara Baku
                  </label>
                  <p style={{fontSize: '0.74rem', color: 'var(--text-muted, #94a3b8)', margin: '4px 0 0 24px'}}>
                    Centang jika ingin baris Pangkat/Golongan tampil secara baku (khusus PNS). Jika tidak dicentang (baku), baris Pangkat akan disembunyikan (sesuai untuk PPPK / Non-PNS).
                  </p>
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
                  <label>Teks Koordinasi / Ketidaksesuaian Data (Pokja SD)</label>
                  <textarea
                    rows={2}
                    value={editingTemplate.coordinationText || ''}
                    onChange={e => setEditingTemplate({...editingTemplate, coordinationText: e.target.value})}
                    placeholder="Apabila terdapat ketidaksesuaian perhitungan data atau telah memiliki bukti setor yang belum terverifikasi, Saudara dapat segera berkoordinasi langsung dengan Pokja SD Tim TLHP Direktorat PSNK."
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
                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8}}>
                      <div style={{display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap'}}>
                        {tpl.showClassification !== false ? (
                          <span className={`pill ${tpl.classification === 'RAHASIA' ? 'amber' : tpl.classification === 'SEGERA' ? 'red' : 'blue'}`}>
                            {tpl.classification} ({tpl.classificationPosition === 'center' ? 'Tengah' : tpl.classificationPosition === 'right' ? 'Kanan' : 'Kiri'})
                          </span>
                        ) : (
                          <span className="pill gray" style={{fontSize: '0.72rem'}}>Tanpa Derajat</span>
                        )}
                        <strong style={{color: '#f8fafc', fontSize: '1.02rem'}}>{tpl.name}</strong>
                        <span style={{fontFamily: 'monospace', color: '#38bdf8', fontSize: '0.82rem'}}>
                          Kode: {tpl.code}
                        </span>
                      </div>
                      <div style={{display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap'}}>
                        <button
                          type="button"
                          className="btn secondary"
                          style={{padding: '5px 10px', fontSize: '0.8rem', color: '#38bdf8', borderColor: 'rgba(56,189,248,0.3)'}}
                          onClick={() => {
                            setSelectedTemplateId(tpl.id)
                            setActiveTab('generator')
                          }}
                        >
                          Pilih Dokumen
                        </button>
                        <button
                          type="button"
                          className="btn secondary"
                          style={{padding: '5px 10px', fontSize: '0.8rem'}}
                          onClick={() => setEditingTemplate({...tpl})}
                        >
                          <Pencil size={13} /> Edit Teks
                        </button>
                        <button
                          type="button"
                          className="btn secondary"
                          style={{padding: '5px 10px', fontSize: '0.8rem'}}
                          onClick={() => handleDuplicateTemplate(tpl)}
                          title="Duplikat template ini untuk membuat variasi baru"
                        >
                          <Files size={13} /> Duplikat
                        </button>
                        <button
                          type="button"
                          className="btn secondary"
                          style={{padding: '5px 8px', fontSize: '0.8rem', color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)'}}
                          onClick={() => handleDeleteTemplate(tpl.id)}
                          disabled={templates.length <= 1}
                          title="Hapus template naskah dinas ini"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    <div style={{fontSize: '0.86rem', color: '#cbd5e1', marginBottom: 6}}>
                      <strong>Judul Naskah:</strong> {tpl.title}
                    </div>

                    <div style={{fontSize: '0.85rem', color: '#94a3b8', marginBottom: 8}}>
                      <strong>Teks Agenda Baku:</strong> {tpl.agendaDefault}
                    </div>

                    {tpl.coordinationText && (
                      <div style={{fontSize: '0.85rem', color: '#38bdf8', marginBottom: 8}}>
                        <strong>Teks Koordinasi Pokja SD:</strong> {tpl.coordinationText}
                      </div>
                    )}

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
