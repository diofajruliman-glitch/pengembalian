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
