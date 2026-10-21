import React, { useState, useMemo } from 'react'
import {
  Search, Users, Calendar, Clock, Video, FileText, CheckCircle2,
  Copy, ExternalLink, Download, ShieldCheck, ChevronRight, Filter, Building2, Phone
} from 'lucide-react'
import { JADWAL_WAWANCARA_1057_REVISI, lookupJadwalWawancara1057 } from '../letters/jadwalWawancara1057Data.js'
import { NIP_POSITION_REFERENCE } from '../letters/nipPositionReference.js'
import { OFFICIAL_ROOMS_19 } from './officialSchedule1057.js'

export default function PortalWawancara({ onManagePerson }) {
  const [activeTab, setActiveTab] = useState('search') // 'search' | 'roster' | 'rekap'
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedDay, setSelectedDay] = useState('')
  const [selectedSession, setSelectedSession] = useState('')
  const [selectedRoom, setSelectedRoom] = useState('')
  const [selectedPerson, setSelectedPerson] = useState(null)
  const [copiedText, setCopiedText] = useState('')
  const [selectedRosterRoom, setSelectedRosterRoom] = useState('Room 1')

  const copyToClipboard = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedText(label)
      setTimeout(() => setCopiedText(''), 3000)
    } catch {
      // fallback
    }
  }

  // Filtered participants list for search tab
  const filteredParticipants = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return JADWAL_WAWANCARA_1057_REVISI.filter(item => {
      if (selectedDay && item.tanggal !== selectedDay) return false
      if (selectedSession && item.sesi !== selectedSession) return false
      if (selectedRoom && item.room !== selectedRoom) return false
      if (!q) return true
      return (
        item.nama?.toLowerCase().includes(q) ||
        item.nip?.includes(q) ||
        item.nomorSurat?.toLowerCase().includes(q) ||
        item.petugas?.toLowerCase().includes(q) ||
        item.provinsi?.toLowerCase().includes(q) ||
        item.kabKota?.toLowerCase().includes(q)
      )
    })
  }, [searchQuery, selectedDay, selectedSession, selectedRoom])

  // Grouping by Room for Roster View
  const participantsByRoom = useMemo(() => {
    const map = new Map()
    for (const r of OFFICIAL_ROOMS_19) {
      map.set(r.name, [])
    }
    for (const item of JADWAL_WAWANCARA_1057_REVISI) {
      if (map.has(item.room)) {
        map.get(item.room).push(item)
      } else {
        map.set(item.room, [item])
      }
    }
    return map
  }, [])

  const currentRosterList = useMemo(() => {
    return (participantsByRoom.get(selectedRosterRoom) || []).sort((a, b) => {
      const dComp = (a.tanggal || '').localeCompare(b.tanggal || '')
      if (dComp !== 0) return dComp
      return (a.mulai || '').localeCompare(b.mulai || '')
    })
  }, [participantsByRoom, selectedRosterRoom])

  // Roster room metadata
  const currentRoomMeta = useMemo(() => {
    return OFFICIAL_ROOMS_19.find(r => r.name === selectedRosterRoom) || {
      name: selectedRosterRoom,
      interviewer: 'Pewawancara Resmi',
      trafficOfficer: 'Dio Fajrul Iman'
    }
  }, [selectedRosterRoom])

  // Download CSV for current roster room
  const downloadRoomCsv = () => {
    const headers = ['No', 'Hari', 'Tanggal', 'Sesi', 'Jam', 'Room', 'Pewawancara', 'Nama ASN', 'NIP', 'Nomor Surat', 'No HP', 'Kategori Sekjen', 'Link Zoom']
    const rows = currentRosterList.map((p, idx) => [
      idx + 1,
      p.hari,
      p.tanggal,
      p.sesi,
      p.jam,
      p.room,
      p.petugas,
      `"${p.nama}"`,
      `'${p.nip}`,
      `"${p.nomorSurat}"`,
      `'${p.noHp}`,
      p.kategoriSekjen,
      `"${p.linkZoom}"`
    ])
    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\r\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `Jadwal_${selectedRosterRoom.replace(/\s+/g, '_')}_${(currentRoomMeta.interviewer || 'Pewawancara').replace(/\s+/g, '_')}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  // Format WA Message
  const getWaBroadcastMessage = (p) => {
    const pos = NIP_POSITION_REFERENCE[p.nip]
    return `Yth. Bapak/Ibu ${p.nama} (NIP. ${p.nip})
${pos?.jabatan || 'ASN PPPK'} - ${pos?.pangkat || 'Golongan IX'}

Berikut kami sampaikan jadwal resmi Klarifikasi & Wawancara Pemulihan Kinerja Kemensos:
📅 Hari/Tanggal: ${p.hari}, ${p.tanggal}
⏰ Sesi: Sesi ${p.sesi} (Pukul ${p.jam})
🚪 Ruang Breakout: ${p.room}
👤 Pewawancara: ${p.petugas}
📋 Nomor Surat: ${p.nomorSurat}
🔗 Tautan Zoom: ${p.linkZoom || 'https://bit.ly/TLHP_2 (Kode Sandi: 690971)'}

Catatan Penting:
1. Pembukaan Pleno dimulai serentak hari Senin, 26 Oktober 2026 pukul 08.30 WIB di Main Room Zoom.
2. Mohon hadir 15 menit sebelum slot wawancara individual Anda.
3. Gunakan format Nama Zoom: ${p.room}_${p.nama}.
Petugas Lalu Lintas Zoom: Dio Fajrul Iman.`
  }

  return (
    <div className="portal-wawancara-container">
      {/* Header Banner */}
      <div className="portal-header-card">
        <div className="portal-header-content">
          <div className="portal-badge">PORTAL RESMI WAWANCARA & PEMANGGILAN</div>
          <h2>Portal Pencarian Jadwal & Roster 19 Breakout Room</h2>
          <p>
            Pusat informasi pemanggilan wawancara 1.057 ASN (26–29 Oktober 2026).
            Pewawancara resmi: 19 Breakout Room paralel, Petugas Pengatur Zoom: Dio Fajrul Iman.
          </p>
        </div>
        <div className="portal-header-actions">
          <button
            className={`btn ${activeTab === 'search' ? 'primary' : 'secondary'}`}
            onClick={() => setActiveTab('search')}
          >
            <Search size={15} /> Cek Jadwal ASN
          </button>
          <button
            className={`btn ${activeTab === 'roster' ? 'primary' : 'secondary'}`}
            onClick={() => setActiveTab('roster')}
          >
            <Users size={15} /> Roster 19 Pewawancara
          </button>
          <button
            className={`btn ${activeTab === 'rekap' ? 'primary' : 'secondary'}`}
            onClick={() => setActiveTab('rekap')}
          >
            <Calendar size={15} /> Rekap Sesi & Kuota
          </button>
        </div>
      </div>

      {copiedText && (
        <div className="portal-toast" role="alert">
          <CheckCircle2 size={16} /> Berhasil disalin: <b>{copiedText}</b>
        </div>
      )}

      {/* TAB 1: PENCARIAN CEPAT JADWAL ASN */}
      {activeTab === 'search' && (
        <section className="portal-section">
          <div className="portal-search-bar panel">
            <div className="portal-search-input-wrap">
              <Search size={18} className="search-icon" />
              <input
                type="search"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Ketik NIP 18 digit, Nama ASN, Nomor Surat, atau Nama Pewawancara…"
                className="portal-search-input"
                autoFocus
              />
              {searchQuery && (
                <button className="icon-btn clear-btn" onClick={() => setSearchQuery('')}>×</button>
              )}
            </div>

            <div className="portal-filter-row">
              <label>
                <span>Filter Tanggal:</span>
                <select value={selectedDay} onChange={e => setSelectedDay(e.target.value)}>
                  <option value="">Semua Tanggal (26–29 Okt)</option>
                  <option value="26 Oktober 2026">Senin, 26 Okt 2026 (265 ASN)</option>
                  <option value="27 Oktober 2026">Selasa, 27 Okt 2026 (264 ASN)</option>
                  <option value="28 Oktober 2026">Rabu, 28 Okt 2026 (264 ASN)</option>
                  <option value="29 Oktober 2026">Kamis, 29 Okt 2026 (264 ASN)</option>
                </select>
              </label>

              <label>
                <span>Filter Sesi:</span>
                <select value={selectedSession} onChange={e => setSelectedSession(e.target.value)}>
                  <option value="">Semua Sesi</option>
                  <option value="Pagi">Sesi Pagi (08.30–12.00 WIB)</option>
                  <option value="Siang">Sesi Siang (13.00–16.30 WIB)</option>
                </select>
              </label>

              <label>
                <span>Filter Breakout Room:</span>
                <select value={selectedRoom} onChange={e => setSelectedRoom(e.target.value)}>
                  <option value="">Semua 19 Room</option>
                  {OFFICIAL_ROOMS_19.map(r => (
                    <option key={r.id} value={r.name}>{r.name} · {r.interviewer}</option>
                  ))}
                </select>
              </label>

              <div className="portal-search-summary">
                Menemukan <b>{filteredParticipants.length}</b> dari 1.057 ASN
              </div>
            </div>
          </div>

          {/* DETAIL KARTU ASN TERPILIH */}
          {selectedPerson && (
            <div className="portal-person-card panel">
              <div className="portal-person-card-header">
                <div>
                  <span className="portal-card-tag">INFORMASI PEMANGGILAN RESMI</span>
                  <h3>{selectedPerson.nama}</h3>
                  <div className="portal-meta-chips">
                    <span>NIP: <b>{selectedPerson.nip}</b></span>
                    <span>Provinsi: <b>{selectedPerson.provinsi}</b></span>
                    <span>Kab/Kota: <b>{selectedPerson.kabKota}</b></span>
                    <span className={'category-chip ' + (selectedPerson.kategoriSekjen === 'Berat' ? 'is-heavy' : '')}>
                      Kategori: {selectedPerson.kategoriSekjen}
                    </span>
                  </div>
                </div>
                <button className="btn secondary" onClick={() => setSelectedPerson(null)}>Tutup Detail</button>
              </div>

              <div className="portal-person-grid">
                <div className="portal-info-box">
                  <div className="portal-info-label"><Calendar size={14} /> WAKTU PELAKSANAAN</div>
                  <div className="portal-info-val-large">{selectedPerson.hari}, {selectedPerson.tanggal}</div>
                  <div className="portal-info-sub">
                    Sesi <b>{selectedPerson.sesi}</b> · Jam <b>{selectedPerson.jam}</b> ({selectedPerson.durasi} menit)
                  </div>
                </div>

                <div className="portal-info-box">
                  <div className="portal-info-label"><Building2 size={14} /> RUANG & PEWAWANCARA</div>
                  <div className="portal-info-val-large">{selectedPerson.room}</div>
                  <div className="portal-info-sub">
                    Pewawancara Utama: <b>{selectedPerson.petugas}</b><br />
                    Pengatur Zoom: <b>Dio Fajrul Iman</b>
                  </div>
                </div>

                <div className="portal-info-box">
                  <div className="portal-info-label"><FileText size={14} /> DOKUMEN & PERSURATAN</div>
                  <div className="portal-info-val">{selectedPerson.nomorSurat || 'Belum ada nomor surat'}</div>
                  <div className="portal-info-sub">
                    Format: Permensos No 5/2023 · TTE & Cap Stempel Faisal
                  </div>
                </div>

                <div className="portal-info-box">
                  <div className="portal-info-label"><Video size={14} /> TAUTAN ZOOM RESMI</div>
                  <div className="portal-info-val portal-link-text">
                    {selectedPerson.linkZoom || 'https://bit.ly/TLHP_2 (Kode Sandi: 690971)'}
                  </div>
                  <div className="portal-link-actions">
                    <button
                      className="btn secondary sm"
                      onClick={() => copyToClipboard(selectedPerson.linkZoom || 'https://bit.ly/TLHP_2 (Kode Sandi: 690971)', 'Tautan Zoom')}
                    >
                      <Copy size={13} /> Salin Link
                    </button>
                    <a
                      href="https://bit.ly/TLHP_2"
                      target="_blank"
                      rel="noreferrer"
                      className="btn primary sm"
                    >
                      <ExternalLink size={13} /> Buka Zoom
                    </a>
                  </div>
                </div>
              </div>

              <div className="portal-card-footer">
                <button
                  className="btn secondary"
                  onClick={() => copyToClipboard(getWaBroadcastMessage(selectedPerson), 'Pesan WhatsApp Peserta')}
                >
                  <Copy size={14} /> Salin Format Pesan WhatsApp
                </button>
                {onManagePerson && (
                  <button className="btn primary" onClick={() => onManagePerson(selectedPerson.nip)}>
                    Buka di Kertas Kerja Monitoring →
                  </button>
                )}
              </div>
            </div>
          )}

          {/* TABEL HASIL PENCARIAN */}
          <div className="panel table-panel">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>No</th>
                    <th>Nama & Identitas</th>
                    <th>Jadwal / Sesi</th>
                    <th>Breakout Room</th>
                    <th>Pewawancara</th>
                    <th>No Surat</th>
                    <th>Tautan Zoom</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {!filteredParticipants.length ? (
                    <tr>
                      <td colSpan="8" className="empty" style={{ textAlign: 'center', padding: '30px' }}>
                        <Users size={32} />
                        <b>Tidak ada data ASN yang cocok dengan pencarian</b>
                        <span>Periksa kembali NIP atau ejaan nama.</span>
                      </td>
                    </tr>
                  ) : (
                    filteredParticipants.slice(0, 50).map((p, idx) => (
                      <tr key={p.nip} className={selectedPerson?.nip === p.nip ? 'selected-row' : ''}>
                        <td>{idx + 1}</td>
                        <td>
                          <b>{p.nama}</b>
                          <small className="mono">NIP {p.nip}</small>
                          <small>{p.provinsi} · {p.kabKota}</small>
                        </td>
                        <td>
                          <b>{p.hari}, {p.tanggal}</b>
                          <small>{p.jam} (Sesi {p.sesi})</small>
                        </td>
                        <td>
                          <span className="portal-room-badge">{p.room}</span>
                        </td>
                        <td>
                          <b>{p.petugas}</b>
                        </td>
                        <td>
                          <small>{p.nomorSurat || '—'}</small>
                        </td>
                        <td>
                          <button
                            className="btn secondary sm icon-only"
                            title="Salin Link Zoom"
                            onClick={() => copyToClipboard(p.linkZoom || 'https://bit.ly/TLHP_2 (Kode Sandi: 690971)', `Zoom ${p.nama}`)}
                          >
                            <Copy size={13} />
                          </button>
                        </td>
                        <td>
                          <button
                            className="btn secondary sm"
                            onClick={() => setSelectedPerson(p)}
                          >
                            Rincian
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {filteredParticipants.length > 50 && (
              <div className="portal-pagination-note">
                Menampilkan 50 data teratas dari {filteredParticipants.length} hasil pencarian. Gunakan filter untuk mempersempit.
              </div>
            )}
          </div>
        </section>
      )}

      {/* TAB 2: ROSTER 19 PEWAWANCARA */}
      {activeTab === 'roster' && (
        <section className="portal-section">
          {/* Room Selector Grid */}
          <div className="portal-rooms-selector panel">
            <div className="panel-heading">
              <div>
                <h2>Pilih Breakout Room / Pewawancara Resmi</h2>
                <p>Klik salah satu room untuk melihat daftar peserta, waktu, dan mengunduh jadwal pewawancara.</p>
              </div>
            </div>
            <div className="portal-room-pills">
              {OFFICIAL_ROOMS_19.map(r => {
                const count = (participantsByRoom.get(r.name) || []).length
                const isActive = selectedRosterRoom === r.name
                return (
                  <button
                    key={r.id}
                    className={`portal-room-pill-btn ${isActive ? 'is-active' : ''}`}
                    onClick={() => setSelectedRosterRoom(r.name)}
                  >
                    <span className="room-num">{r.name}</span>
                    <b className="room-interviewer">{r.interviewer}</b>
                    <small className="room-count">{count} ASN Terjadwal</small>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Roster View for Selected Room */}
          <div className="panel">
            <div className="panel-heading" style={{ borderBottom: '1px solid #e1e9ec', paddingBottom: '14px', marginBottom: '16px' }}>
              <div>
                <span className="eyebrow">ROSTER PEWAWANCARA RESMI</span>
                <h2>{selectedRosterRoom} · {currentRoomMeta.interviewer}</h2>
                <p>
                  Total <b>{currentRosterList.length} ASN</b> dialokasikan ke room ini selama 4 hari kegiatan (26–29 Oktober 2026).
                  Petugas Lalu Lintas Zoom: <b>{currentRoomMeta.trafficOfficer}</b>.
                </p>
              </div>
              <div className="portal-roster-actions">
                <button className="btn primary" onClick={downloadRoomCsv}>
                  <Download size={15} /> Unduh CSV Roster {selectedRosterRoom}
                </button>
              </div>
            </div>

            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>No</th>
                    <th>Waktu (WIB)</th>
                    <th>Hari & Tanggal</th>
                    <th>Sesi</th>
                    <th>Nama Responden</th>
                    <th>NIP</th>
                    <th>Wilayah</th>
                    <th>Kategori Pelanggaran</th>
                    <th>Nomor Surat</th>
                    <th>Kontak HP</th>
                  </tr>
                </thead>
                <tbody>
                  {currentRosterList.map((p, idx) => (
                    <tr key={p.nip}>
                      <td>{idx + 1}</td>
                      <td><b>{p.mulai}–{p.selesai}</b></td>
                      <td>{p.hari}, {p.tanggal}</td>
                      <td><span className="pill blue">{p.sesi}</span></td>
                      <td><b>{p.nama}</b></td>
                      <td className="mono">{p.nip}</td>
                      <td>{p.provinsi} ({p.kabKota})</td>
                      <td>
                        <span className={'category-chip ' + (p.kategoriSekjen === 'Berat' ? 'is-heavy' : '')}>
                          {p.kategoriSekjen}
                        </span>
                      </td>
                      <td><small>{p.nomorSurat || '—'}</small></td>
                      <td><small className="mono">{p.noHp || '—'}</small></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* TAB 3: REKAPITULASI SESI & KUOTA HARIAN */}
      {activeTab === 'rekap' && (
        <section className="portal-section">
          <div className="portal-grid-two">
            {/* Kuota 4 Hari */}
            <div className="panel">
              <div className="panel-heading">
                <h2>Alokasi Harian (26–29 Oktober 2026)</h2>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Hari / Tanggal</th>
                      <th>Sesi Pagi (08.30–12.00)</th>
                      <th>Sesi Siang (13.00–16.30)</th>
                      <th>Total Harian</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><b>Senin, 26 Okt 2026</b></td>
                      <td>133 ASN</td>
                      <td>132 ASN</td>
                      <td><b>265 ASN</b></td>
                    </tr>
                    <tr>
                      <td><b>Selasa, 27 Okt 2026</b></td>
                      <td>133 ASN</td>
                      <td>131 ASN</td>
                      <td><b>264 ASN</b></td>
                    </tr>
                    <tr>
                      <td><b>Rabu, 28 Okt 2026</b></td>
                      <td>133 ASN</td>
                      <td>131 ASN</td>
                      <td><b>264 ASN</b></td>
                    </tr>
                    <tr>
                      <td><b>Kamis, 29 Okt 2026</b></td>
                      <td>133 ASN</td>
                      <td>131 ASN</td>
                      <td><b>264 ASN</b></td>
                    </tr>
                    <tr style={{ background: '#f0fdf4', fontWeight: 'bold' }}>
                      <td>TOTAL KESELURUHAN</td>
                      <td>532 ASN</td>
                      <td>525 ASN</td>
                      <td>1.057 ASN</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Rekap Kategori Pelanggaran */}
            <div className="panel">
              <div className="panel-heading">
                <h2>Pemerataan Beban Kategori Sekjen</h2>
              </div>
              <div className="portal-kategori-stat-cards">
                <div className="portal-stat-card is-berat">
                  <span className="stat-label">Kategori Berat</span>
                  <strong>291 ASN</strong>
                  <small>Tersebar merata ke 19 Room (15–16 ASN/room)</small>
                </div>
                <div className="portal-stat-card is-sedang">
                  <span className="stat-label">Kategori Sedang</span>
                  <strong>156 ASN</strong>
                  <small>Tersebar merata ke 19 Room (8–9 ASN/room)</small>
                </div>
                <div className="portal-stat-card is-ringan">
                  <span className="stat-label">Kategori Ringan</span>
                  <strong>610 ASN</strong>
                  <small>Tersebar merata ke 19 Room (32 ASN/room)</small>
                </div>
              </div>

              <div className="notice blue-notice" style={{ marginTop: '16px' }}>
                <ShieldCheck size={16} />
                <span>
                  <b>Ketentuan Operasional Zoom:</b> Link Zoom resmi menggunakan <code>https://bit.ly/TLHP_2 (Kode Sandi: 690971)</code>.
                  Host/Co-Host mengatur perpindahan peserta ke 19 Breakout Room sesuai alokasi resmi.
                </span>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
