import { JADWAL_WAWANCARA_1057_REVISI } from '../letters/jadwalWawancara1057Data.js'
import { REAL_DISCIPLINE_DATA } from '../letters/realDisciplineData.js'

// Populasi 1.057 ASN berstatus Terbukti dari Dataset Resmi
export const OFFICIAL_POPULATION_1057 = REAL_DISCIPLINE_DATA.filter(r => r.hasilPenilaian === 'Terbukti')

// 19 Pewawancara resmi sesuai hasil alokasi jadwal 26–29 Oktober 2026
export const OFFICIAL_INTERVIEWERS_19 = [
  'PSNK 1',
  'PSNK 2',
  'PSNK 3',
  'PSNK 4',
  'Sekretariat Linjamsos',
  'Indra Maulana',
  'Achmad Mustaqim',
  'Tasria Efrizka',
  'Helmy',
  'Asiafry Raynaldi',
  'Donny Anugerah Perkasa',
  'Putri Angelina',
  'Prabasari',
  'Wawan Soedarso',
  'Ivo Nilasari',
  'Alfi Sudirasmita',
  'TU 1',
  'TU 2',
  'Abi Setiadi Halim'
]

// 19 Breakout Room paralel
export const OFFICIAL_ROOMS_19 = OFFICIAL_INTERVIEWERS_19.map((interviewer, idx) => ({
  id: `room-${idx + 1}`,
  name: `Room ${idx + 1}`,
  interviewer,
  crossInterviewer: '',
  trafficOfficer: idx < 9 ? 'Dio' : '',
  enabled: true
}))

// Parameter pelaksanaan 26–29 Oktober 2026 (4 hari, 30 menit per slot, 14 slot/hari)
export const OFFICIAL_SETTINGS_2026 = {
  startDate: '2026-10-26',
  startTime: '08:30',
  duration: 30,
  gap: 0,
  perDay: 14,
  skipWeekends: true
}

const DATE_MAP = {
  '26 Oktober 2026': '2026-10-26',
  '27 Oktober 2026': '2026-10-27',
  '28 Oktober 2026': '2026-10-28',
  '29 Oktober 2026': '2026-10-29'
}

const TIME_TO_SLOT = {
  '08:30': 1,
  '09:00': 2,
  '09:30': 3,
  '10:00': 4,
  '10:30': 5,
  '11:00': 6,
  '11:30': 7,
  '13:00': 8,
  '13:30': 9,
  '14:00': 10,
  '14:30': 11,
  '15:00': 12,
  '15:30': 13,
  '16:00': 14
}

/**
 * Bangun pemetaan entri monitoring wawancara untuk populasi ASN Terbukti.
 * Mencocokkan berdasarkan NIP, NIK, atau Nama ke 1.057 alokasi jadwal.
 */
export function buildOfficialEntries(population = OFFICIAL_POPULATION_1057) {
  const byNip = new Map()
  const byNik = new Map()
  const byName = new Map()

  for (const person of population) {
    if (person?.nip) byNip.set(String(person.nip).trim(), person)
    if (person?.nik) byNik.set(String(person.nik).trim(), person)
    if (person?.nama) byName.set(String(person.nama).trim().toLowerCase(), person)
  }

  const entries = {}
  for (const item of JADWAL_WAWANCARA_1057_REVISI) {
    const nipKey = String(item.nip || '').trim()
    const nikKey = String(item.nik || '').trim()
    const nameKey = String(item.nama || '').trim().toLowerCase()

    const person = byNip.get(nipKey) || byNik.get(nikKey) || byName.get(nameKey)
    if (!person || !person.nik) continue

    const roomNum = String(item.room || '').replace('Room ', '').trim()
    const roomId = `room-${roomNum}`
    const rawDate = item.tanggal ? (DATE_MAP[item.tanggal] || item.tanggal) : '2026-10-26'
    const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : '2026-10-26'
    const time = item.mulai ? String(item.mulai).trim() : '08:30'
    const session = TIME_TO_SLOT[time] || item.slot || 1

    entries[person.nik] = {
      nik: person.nik,
      date,
      time,
      session,
      roomId,
      duration: 30,
      status: 'Terjadwal',
      verified: false,
      zoomName: '',
      notes: item.linkZoom ? `Link Zoom: ${item.linkZoom}` : '',
      leader: '',
      startedAt: '',
      finishedAt: '',
      updatedAt: '2026-10-19T08:30:00.000Z'
    }
  }

  return entries
}

/**
 * Menghasilkan workspace resmi 1.057 ASN yang siap dimuat ke penyimpanan browser.
 */
export function createOfficialWorkspace(population = OFFICIAL_POPULATION_1057) {
  return {
    entries: buildOfficialEntries(population),
    rooms: OFFICIAL_ROOMS_19,
    settings: OFFICIAL_SETTINGS_2026,
    revision: 1
  }
}
