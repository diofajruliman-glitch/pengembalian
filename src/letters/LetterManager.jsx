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
  Sparkles
} from 'lucide-react'
import LetterDocument from './LetterDocument'
import {DEFAULT_OFFICIAL, DEFAULT_VENUE, LETTER_TYPES} from './templates'
import './officialLetter.css'

export default function LetterManager({cases = [], judolSnapshot = null, masterSnapshot = null}) {
  const [activeTab, setActiveTab] = useState('generator')
  const [copied, setCopied] = useState(false)

  // CMS State: Profil Pejabat Penandatangan
  const [official, setOfficial] = useState(() => {
    try {
      const saved = localStorage.getItem('kemensos_tlhp_official')
      return saved ? JSON.parse(saved) : DEFAULT_OFFICIAL
    } catch {
      return DEFAULT_OFFICIAL
    }
  })

  // CMS State: Venue & Sesi Agenda Default
  const [venue, setVenue] = useState(() => {
    try {
      const saved = localStorage.getItem('kemensos_tlhp_venue')
      return saved ? JSON.parse(saved) : DEFAULT_VENUE
    } catch {
      return DEFAULT_VENUE
    }
  })

  // CMS State: Daftar Template Naskah Dinas (Bisa diedit teksnya secara penuh)
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

  // Nomor & Tanggal Surat
  const [letterNumber, setLetterNumber] = useState('       /3.3/KP.06.04/10/2026')
  const [letterDate, setLetterDate] = useState(() => {
    const d = new Date()
    return d.toLocaleDateString('id-ID', {day: 'numeric', month: 'long', year: 'numeric'})
  })
  const [customAgenda, setCustomAgenda] = useState('')

  // Sumber Data SDM Penerima
  const [recipientSource, setRecipientSource] = useState('sdm_cases')
  const [searchSDM, setSearchSDM] = useState('')
  const [filterStatusSDM, setFilterStatusSDM] = useState('all')
  const [selectedSDMKeys, setSelectedSDMKeys] = useState(new Set())

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

  // 1. DATA SDM DARI MONITORING SDM (cases)
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
      provinsi: c.provinsi || ''
    }))
  }, [cases])

  // 2. DATA SDM DARI KATEGORISASI DISIPLIN (JUDOL)
  const judolList = useMemo(() => {
    const rows = judolSnapshot?.versions?.[judolSnapshot.active]?.result?.rows || []
    return rows.map(r => ({
      key: `judol-${r.nik || r.nip}`,
      nama: r.nama || 'Tanpa Nama',
      nip: r.nip || r.nik,
      pangkat: 'Pegawai ASN',
      jabatan: 'Pegawai Direktorat PSNK',
      unitKerja: 'Direktorat Perlindungan Sosial Non Kebencanaan',
      kewajibanTotal: 0,
      realisasiTotal: 0,
      sisaKewajiban: 0,
      indikasi: r.hasilPenilaian,
      kategori: r.historical?.kategori || r.after?.kategori || 'Ringan',
      status: `Indikasi ${r.hasilPenilaian || 'Disiplin'}`
    }))
  }, [judolSnapshot])

  // 3. DATA SDM DARI MASTER WORKBOOK (masterSnapshot)
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
    if (recipientSource === 'sdm_cases') list = caseList
    else if (recipientSource === 'judol') list = judolList
    else if (recipientSource === 'master') list = masterList

    if (filterStatusSDM === 'unpaid') {
      list = list.filter(item => item.sisaKewajiban > 0)
    }

    if (!searchSDM.trim()) return list
    const q = searchSDM.trim().toLowerCase()
    return list.filter(item => (
      item.nama.toLowerCase().includes(q) ||
      item.nip.toLowerCase().includes(q) ||
      (item.provinsi && item.provinsi.toLowerCase().includes(q))
    ))
  }, [recipientSource, caseList, judolList, masterList, filterStatusSDM, searchSDM])

  // Update nomor surat ketika template berganti
  useEffect(() => {
    if (currentTemplate) {
      const code = currentTemplate.code || 'KP.06.04'
      const m = new Date().getMonth() + 1
      const y = new Date().getFullYear()
      setLetterNumber(`       /3.3/${code}/${String(m).padStart(2, '0')}/${y}`)
    }
  }, [currentTemplate])

  // Auto-select item pertama jika beralih sumber
  useEffect(() => {
    if (recipientSource === 'manual') {
      setSelectedSDMKeys(new Set(['manual']))
    } else if (activeSDMOptions.length > 0) {
      setSelectedSDMKeys(new Set([activeSDMOptions[0].key]))
    } else {
      setSelectedSDMKeys(new Set())
    }
  }, [recipientSource, activeSDMOptions.length])

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

  // Daftar Penerima yang akan dicetak
  const activeRecipients = useMemo(() => {
    if (recipientSource === 'manual') return [manualRecipient]
    const list = recipientSource === 'sdm_cases' ? caseList : recipientSource === 'judol' ? judolList : masterList
    const filtered = list.filter(x => selectedSDMKeys.has(x.key))
    return filtered.length > 0 ? filtered : [manualRecipient]
  }, [recipientSource, manualRecipient, caseList, judolList, masterList, selectedSDMKeys])

  // Simpan CMS Pejabat & Agenda
  const handleSaveOfficial = (e) => {
    e.preventDefault()
    try {
      localStorage.setItem('kemensos_tlhp_official', JSON.stringify(official))
      localStorage.setItem('kemensos_tlhp_venue', JSON.stringify(venue))
      alert('Pengaturan Profil Pejabat & Agenda berhasil disimpan!')
    } catch {
      alert('Gagal menyimpan ke penyimpanan browser.')
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

  // Trigger Cetak / PDF
  const handlePrint = () => {
    window.print()
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
                onChange={e => setSelectedTemplateId(e.target.value)}
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
                onChange={e => setRecipientSource(e.target.value)}
              >
                <option value="sdm_cases">1. Monitoring SDM Kasus ({caseList.length} data)</option>
                {judolList.length > 0 && (
                  <option value="judol">2. Analisis Disiplin ASN / Judol ({judolList.length} data)</option>
                )}
                {masterList.length > 0 && (
                  <option value="master">3. Master & Progres Tersimpan ({masterList.length} SDM)</option>
                )}
                <option value="manual">4. Input Manual Perorangan</option>
              </select>
            </div>

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
                      placeholder="Cari NIP atau Nama SDM..."
                      value={searchSDM}
                      onChange={e => setSearchSDM(e.target.value)}
                      style={{flex: 1}}
                    />
                    {recipientSource === 'sdm_cases' && (
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
                        Tidak ada data yang cocok dengan pencarian.
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
              <div style={{color: '#f8fafc', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8}}>
                <FileCheck2 size={19} color="#22c55e" />
                <span>Pratinjau Cetak ({activeRecipients.length} Lembar Naskah Dinas)</span>
              </div>
              <div className="preview-actions">
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
                  onClick={handlePrint}
                  title="Cetak langsung atau simpan ke PDF A4"
                >
                  <Printer size={16} />
                  <span>Cetak / Simpan PDF</span>
                </button>
              </div>
            </div>

            <div className="letter-preview-stage">
              {activeRecipients.map((rec, index) => (
                <LetterDocument
                  key={rec.key || index}
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
    </div>
  )
}
