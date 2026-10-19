import { DEFAULT_ROOMS, sourceKey } from '../interviews/model.js'

// Format hari dan tanggal bahasa Indonesia untuk naskah surat resmi
export const INDO_DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
export const INDO_MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
]
export const INDO_MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des'
]

export function formatIndoDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim())
  if (!m) return null
  const y = parseInt(m[1], 10)
  const mon = parseInt(m[2], 10) - 1
  const d = parseInt(m[3], 10)
  const dt = new Date(Date.UTC(y, mon, d, 12, 0, 0))
  if (isNaN(dt.getTime())) return null

  const hari = INDO_DAYS[dt.getUTCDay()]
  const tanggal = `${d} ${INDO_MONTHS[mon]} ${y}`
  const tanggalShort = `${d} ${INDO_MONTHS_SHORT[mon]} ${y}`
  return { hari, tanggal, tanggalShort }
}

export function formatIndoTime(timeStr, duration = 40, format = 'range') {
  if (!timeStr) return ''
  const clean = String(timeStr).replace(':', '.')
  const parts = clean.split('.')
  const h = parseInt(parts[0], 10) || 0
  const m = parseInt(parts[1], 10) || 0
  const startMin = h * 60 + m
  const dur = Number(duration) || 40
  const endMin = startMin + dur
  const fmt = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}.${String(min % 60).padStart(2, '0')}`

  if (format === 'startOnly') {
    return `${fmt(startMin)} WIB`
  }
  return `${fmt(startMin)} - ${fmt(endMin)} WIB`
}

export function loadInterviewWorkspaceFromStorage(snapshot) {
  if (typeof window === 'undefined' || !window.localStorage) return null
  try {
    if (snapshot) {
      try {
        const sKey = sourceKey(snapshot)
        if (sKey) {
          for (let i = 0; i < window.localStorage.length; i++) {
            const k = window.localStorage.key(i)
            if (k && k.startsWith('tlhp_interviews_v1:') && k.includes(encodeURIComponent(sKey))) {
              const raw = window.localStorage.getItem(k)
              if (raw) {
                const parsed = JSON.parse(raw)
                if (parsed?.entries) return parsed
              }
            }
          }
        }
      } catch (e) {
        console.warn('Error reading exact interview workspace:', e)
      }
    }

    let best = null
    let maxCount = -1
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i)
      if (k && k.startsWith('tlhp_interviews_v1:') && !k.includes(':recovery:')) {
        try {
          const raw = window.localStorage.getItem(k)
          if (!raw) continue
          const parsed = JSON.parse(raw)
          if (parsed && parsed.entries && typeof parsed.entries === 'object') {
            const count = Object.keys(parsed.entries).length
            if (count > maxCount) {
              maxCount = count
              best = parsed
            }
          }
        } catch {
          // ignore corrupted json
        }
      }
    }
    return best
  } catch (err) {
    console.error('Error scanning interview storage:', err)
    return null
  }
}

export function lookupBnbaSchedule(recipient, workspace) {
  if (!workspace || !workspace.entries || !recipient) return null
  const entries = workspace.entries
  const rooms = workspace.rooms || DEFAULT_ROOMS

  const candidates = [
    recipient.nik,
    recipient.nip,
    recipient.key?.replace(/^(judol|master|case|btnk)-/, ''),
    recipient.rawNip
  ].filter(Boolean).map(s => String(s).trim())

  let entry = null
  for (const id of candidates) {
    if (entries[id]) {
      entry = entries[id]
      break
    }
    const unpadded = id.replace(/^0+/, '')
    if (unpadded && entries[unpadded]) {
      entry = entries[unpadded]
      break
    }
  }

  if (!entry) {
    const set = new Set(candidates)
    for (const val of Object.values(entries)) {
      if (!val) continue
      if (set.has(String(val.nik).trim()) || (val.nip && set.has(String(val.nip).trim()))) {
        entry = val
        break
      }
    }
  }

  if (!entry || !entry.date) return null

  const dateParts = formatIndoDate(entry.date)
  if (!dateParts) return null

  const dur = entry.duration || 40
  const room = (rooms || []).find(r => r.id === entry.roomId)
  const roomName = room?.name || entry.roomId || 'Room Ditjen Linjamsos'
  const interviewer = room?.interviewer ? ` (${room.interviewer})` : ''

  return {
    entry,
    hari: dateParts.hari,
    tanggal: dateParts.tanggal,
    tanggalShort: dateParts.tanggalShort,
    jamRange: formatIndoTime(entry.time, dur, 'range'),
    jamStartOnly: formatIndoTime(entry.time, dur, 'startOnly'),
    roomId: entry.roomId,
    roomName,
    interviewer: room?.interviewer || '',
    tempat: `Breakout ${roomName}${interviewer} · Media Daring Zoom Ditjen Linjamsos`,
    session: entry.session,
    status: entry.status || 'Terjadwal'
  }
}

// Konfigurasi kuota dan alokasi sesi harian 26–29 Oktober 2026 (Total 1.057 ASN Judi Online)
// Sesi Pagi: 08.30–12.00 (133 orang/hari)
// Istirahat: 12.00–13.00
// Sesi Siang: 13.00–16.30 (131–132 orang/hari)
// Cadangan/Administrasi: 16.30–17.00
export const DAILY_SESSION_SLOTS = [
  // Day 1: Senin, 26 Oktober 2026 (Total 265 orang: 133 Pagi, 132 Siang)
  { dayIndex: 0, hari: 'Senin', tanggal: '26 Oktober 2026', tanggalShort: '26 Okt', sesiName: 'Sesi Pagi', defaultTime: '08.30–12.00 WIB', start: 0, end: 132, quota: 133 },
  { dayIndex: 0, hari: 'Senin', tanggal: '26 Oktober 2026', tanggalShort: '26 Okt', sesiName: 'Sesi Siang', defaultTime: '13.00–16.30 WIB', start: 133, end: 264, quota: 132 },
  // Day 2: Selasa, 27 Oktober 2026 (Total 264 orang: 133 Pagi, 131 Siang)
  { dayIndex: 1, hari: 'Selasa', tanggal: '27 Oktober 2026', tanggalShort: '27 Okt', sesiName: 'Sesi Pagi', defaultTime: '08.30–12.00 WIB', start: 265, end: 397, quota: 133 },
  { dayIndex: 1, hari: 'Selasa', tanggal: '27 Oktober 2026', tanggalShort: '27 Okt', sesiName: 'Sesi Siang', defaultTime: '13.00–16.30 WIB', start: 398, end: 528, quota: 131 },
  // Day 3: Rabu, 28 Oktober 2026 (Total 264 orang: 133 Pagi, 131 Siang)
  { dayIndex: 2, hari: 'Rabu', tanggal: '28 Oktober 2026', tanggalShort: '28 Okt', sesiName: 'Sesi Pagi', defaultTime: '08.30–12.00 WIB', start: 529, end: 661, quota: 133 },
  { dayIndex: 2, hari: 'Rabu', tanggal: '28 Oktober 2026', tanggalShort: '28 Okt', sesiName: 'Sesi Siang', defaultTime: '13.00–16.30 WIB', start: 662, end: 792, quota: 131 },
  // Day 4: Kamis, 29 Oktober 2026 (Total 264 orang: 133 Pagi, 131 Siang)
  { dayIndex: 3, hari: 'Kamis', tanggal: '29 Oktober 2026', tanggalShort: '29 Okt', sesiName: 'Sesi Pagi', defaultTime: '08.30–12.00 WIB', start: 793, end: 925, quota: 133 },
  { dayIndex: 3, hari: 'Kamis', tanggal: '29 Oktober 2026', tanggalShort: '29 Okt', sesiName: 'Sesi Siang', defaultTime: '13.00–16.30 WIB', start: 926, end: 1056, quota: 131 }
]

export function resolveDailySessionSlot(idx, customTimes = {}) {
  const morning = customTimes.morningTime || '08.30–12.00 WIB'
  const afternoon = customTimes.afternoonTime || '13.00–16.30 WIB'
  const backup = customTimes.backupTime || '16.30–17.00 WIB'

  for (const s of DAILY_SESSION_SLOTS) {
    if (idx >= s.start && idx <= s.end) {
      return {
        ...s,
        jam: s.sesiName === 'Sesi Pagi' ? morning : afternoon
      }
    }
  }

  // Jika di atas 1.056 peserta (alokasi ke Cadangan / Administrasi Hari ke-4)
  return {
    dayIndex: 3,
    hari: 'Kamis',
    tanggal: '29 Oktober 2026',
    tanggalShort: '29 Okt',
    sesiName: 'Cadangan/Administrasi',
    jam: backup,
    quota: 0
  }
}
