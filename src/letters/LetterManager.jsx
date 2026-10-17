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
  UserCheck
} from 'lucide-react'
import LetterDocument from './LetterDocument'
import {DEFAULT_OFFICIAL, DEFAULT_VENUE, LETTER_TYPES} from './templates'
import './officialLetter.css'

export default function LetterManager({cases = [], judolSnapshot = null}) {
  const [activeTab, setActiveTab] = useState('generator')
  const [copied, setCopied] = useState(false)

  // CMS State: Profil Pejabat Penandatangan (tersimpan di localStorage)
  const [official, setOfficial] = useState(() => {
    try {
      const saved = localStorage.getItem('kemensos_tlhp_official')
      return saved ? JSON.parse(saved) : DEFAULT_OFFICIAL
    } catch {
      return DEFAULT_OFFICIAL
    }
  })

  // CMS State: Venue & Sesi Default
  const [venue, setVenue] = useState(() => {
    try {
      const saved = localStorage.getItem('kemensos_tlhp_venue')
      return saved ? JSON.parse(saved) : DEFAULT_VENUE
    } catch {
      return DEFAULT_VENUE
    }
  })

  // Template Aktif
  const [selectedTemplateId, setSelectedTemplateId] = useState('panggilan-1')
  const [templates, setTemplates] = useState(() => {
    try {
      const saved = localStorage.getItem('kemensos_tlhp_templates')
      return saved ? JSON.parse(saved) : LETTER_TYPES
    } catch {
      return LETTER_TYPES
    }
  })

  const currentTemplate = useMemo(() => {
    return templates.find(t => t.id === selectedTemplateId) || templates[0]
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

  // Ambil daftar SDM dari Kasus Monitoring
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
      sisaKewajiban: Number(c.sisa_kewajiban || (Number(c.kewajiban_total || 0) - Number(c.realisasi_total || 0))),
      bank: c.bank,
      status: c.status
    }))
  }, [cases])

  // Ambil daftar SDM dari Judol Snapshot jika ada
  const judolList = useMemo(() => {
    const rows = judolSnapshot?.versions?.[judolSnapshot.active]?.result?.rows || []
    return rows.map(r => ({
      key: `judol-${r.nik}`,
      nama: r.nama || 'Tanpa Nama',
      nip: r.nip || r.nik,
      pangkat: 'Pegawai ASN',
      jabatan: 'Pegawai Direktorat PSNK',
      unitKerja: 'Direktorat Perlindungan Sosial Non Kebencanaan',
      kewajibanTotal: 0,
      realisasiTotal: 0,
      sisaKewajiban: 0,
      indikasi: r.hasilPenilaian,
      kategori: r.historical?.kategori || r.after?.kategori || 'Ringan'
    }))
  }, [judolSnapshot])

  // Opsi SDM yang aktif sesuai sumber
  const activeSDMOptions = useMemo(() => {
    const list = recipientSource === 'sdm_cases' ? caseList : recipientSource === 'judol' ? judolList : []
    if (!searchSDM.trim()) return list
    const q = searchSDM.trim().toLowerCase()
    return list.filter(item => (
      item.nama.toLowerCase().includes(q) ||
      item.nip.toLowerCase().includes(q)
    ))
  }, [recipientSource, caseList, judolList, searchSDM])

  // Update default nomor surat ketika template berganti
  useEffect(() => {
    if (currentTemplate) {
      const code = currentTemplate.code || 'KP.06.04'
      setLetterNumber(`       /3.3/${code}/10/2026`)
    }
  }, [currentTemplate])

  // Auto-select first item jika beralih sumber
  useEffect(() => {
    if (recipientSource === 'manual') {
      setSelectedSDMKeys(new Set(['manual']))
    } else if (activeSDMOptions.length > 0) {
      setSelectedSDMKeys(new Set([activeSDMOptions[0].key]))
    } else {
      setSelectedSDMKeys(new Set())
    }
  }, [recipientSource, activeSDMOptions.length])

  // Toggle pilihan SDM
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
    const list = recipientSource === 'sdm_cases' ? caseList : judolList
    const filtered = list.filter(x => selectedSDMKeys.has(x.key))
    return filtered.length > 0 ? filtered : [manualRecipient]
  }, [recipientSource, manualRecipient, caseList, judolList, selectedSDMKeys])

  // Simpan CMS Pejabat ke LocalStorage
  const handleSaveOfficial = (e) => {
    e.preventDefault()
    try {
      localStorage.setItem('kemensos_tlhp_official', JSON.stringify(official))
      localStorage.setItem('kemensos_tlhp_venue', JSON.stringify(venue))
      alert('Pengaturan Pejabat & Agenda berhasil disimpan!')
    } catch {
      alert('Gagal menyimpan ke penyimpanan lokal browser.')
    }
  }

  // Cetak / PDF Trigger
  const handlePrint = () => {
    window.print()
  }

  // Salin Teks Surat ke Clipboard
  const handleCopyText = () => {
    const r = activeRecipients[0] || manualRecipient
    const text = `
RAHASIA
${currentTemplate.title}
NOMOR : ${letterNumber}

Bersama ini diminta dengan hormat kehadiran Saudara:
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

Demikian untuk dilaksanakan.

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
      {/* 1. NAVIGASI TAB */}
      <div className="letter-tabs no-print">
        <button
          className={'letter-tab-btn ' + (activeTab === 'generator' ? 'active' : '')}
          onClick={() => setActiveTab('generator')}
        >
          <FileText size={18} />
          <span>Generator Surat & Cetak A4</span>
        </button>
        <button
          className={'letter-tab-btn ' + (activeTab === 'cms-official' ? 'active' : '')}
          onClick={() => setActiveTab('cms-official')}
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

      {/* 2. TAB GENERATOR SURAT */}
      {activeTab === 'generator' && (
        <div className="letter-config-grid">
          {/* SISI KIRI: PANEL KONTROL & PILIH SDM */}
          <div className="letter-sidebar-panel no-print">
            <h3><FileText size={19} color="#38bdf8" /> Konfigurasi Surat</h3>

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

            <div className="letter-form-group">
              <label>Sumber Data Penerima</label>
              <select
                value={recipientSource}
                onChange={e => setRecipientSource(e.target.value)}
              >
                <option value="sdm_cases">Monitoring SDM Kasus ({caseList.length} data)</option>
                {judolList.length > 0 && (
                  <option value="judol">Analisis Disiplin Judol ({judolList.length} data)</option>
                )}
                <option value="manual">Input Manual Perorangan</option>
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
                  <input
                    type="text"
                    placeholder="Cari NIP atau Nama SDM..."
                    value={searchSDM}
                    onChange={e => setSearchSDM(e.target.value)}
                    style={{marginBottom: 6}}
                  />
                  <div className="letter-recipients-box">
                    {!activeSDMOptions.length ? (
                      <div style={{fontSize: '0.82rem', color: '#64748b', padding: 8, textAlign: 'center'}}>
                        Belum ada data SDM pada sumber ini. Tambahkan data di Monitoring SDM atau gunakan Input Manual.
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
                              <div className="rec-nip">{item.nip} · {item.sisaKewajiban ? 'Sisa Rp ' + item.sisaKewajiban.toLocaleString('id-ID') : item.status || 'ASN'}</div>
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
              <label>Klausul Keperluan / Agenda (Opsional)</label>
              <textarea
                rows={3}
                placeholder={currentTemplate.agendaDefault}
                value={customAgenda}
                onChange={e => setCustomAgenda(e.target.value)}
              />
            </div>
          </div>

          {/* SISI KANAN: WADAH PRATINJAU A4 RESMI */}
          <div>
            <div className="letter-preview-toolbar no-print">
              <div style={{color: '#f8fafc', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8}}>
                <FileCheck2 size={19} color="#22c55e" />
                <span>Pratinjau Cetak ({activeRecipients.length} Lembar Surat)</span>
              </div>
              <div className="preview-actions">
                <button
                  type="button"
                  className="btn secondary"
                  onClick={handleCopyText}
                  title="Salin isi surat dalam bentuk teks biasa"
                >
                  {copied ? <Check size={16} color="#22c55e" /> : <Copy size={16} />}
                  <span>{copied ? 'Tersalin!' : 'Salin Teks'}</span>
                </button>
                <button
                  type="button"
                  className="btn primary"
                  onClick={handlePrint}
                  title="Cetak langsung ke printer atau Simpan sebagai PDF A4"
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
        <div className="letter-sidebar-panel" style={{maxWidth: 720, margin: '0 auto'}}>
          <h3><UserCheck size={20} color="#38bdf8" /> Pengaturan Profil Pejabat & Agenda Default</h3>
          <p style={{fontSize: '0.88rem', color: '#94a3b8', margin: 0}}>
            Ubah nama pejabat pemanggil/pemeriksa, jabatan, NIP, serta jadwal default pertemuan luring dan sesi Zoom. Pengaturan ini akan tersimpan di browser Anda.
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
                Simpan Perubahan CMS
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 4. TAB CMS TEMPLATE NASKAH DINAS */}
      {activeTab === 'cms-templates' && (
        <div className="letter-sidebar-panel" style={{maxWidth: 900, margin: '0 auto'}}>
          <h3><Settings size={20} color="#38bdf8" /> Katalog Template Naskah Dinas Kemensos</h3>
          <p style={{fontSize: '0.88rem', color: '#94a3b8', margin: 0}}>
            Daftar template naskah dinas resmi yang tersedia pada aplikasi. Setiap template memuat format kode klasifikasi kearsipan Kemensos, derajat keamanan, dan daftar tembusan standar.
          </p>

          <div style={{display: 'flex', flexDirection: 'column', gap: 14, marginTop: 12}}>
            {templates.map(tpl => (
              <div
                key={tpl.id}
                style={{
                  background: 'rgba(30, 41, 59, 0.6)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8,
                  padding: 16
                }}
              >
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8}}>
                  <div>
                    <span className="pill blue" style={{marginRight: 8}}>{tpl.classification}</span>
                    <strong style={{color: '#f8fafc', fontSize: '1rem'}}>{tpl.name}</strong>
                  </div>
                  <span style={{fontFamily: 'monospace', color: '#38bdf8', fontSize: '0.85rem'}}>
                    Kode: {tpl.code}
                  </span>
                </div>
                <div style={{fontSize: '0.85rem', color: '#cbd5e1', marginBottom: 8}}>
                  <strong>Judul Cetak:</strong> {tpl.title}
                </div>
                <div style={{fontSize: '0.85rem', color: '#94a3b8', marginBottom: 8}}>
                  <strong>Agenda Baku:</strong> {tpl.agendaDefault}
                </div>
                <div style={{fontSize: '0.82rem', color: '#64748b'}}>
                  <strong>Tembusan Standar:</strong>
                  <ul style={{margin: '4px 0 0 16px', padding: 0}}>
                    {tpl.tembusan.map((t, i) => (
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
  )
}
