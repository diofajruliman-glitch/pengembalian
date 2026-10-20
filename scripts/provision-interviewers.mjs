import { pathToFileURL } from 'node:url'
import { OFFICIAL_ROOMS_19 } from '../src/interviews/officialSchedule1057.js'

export const accounts = OFFICIAL_ROOMS_19.map(room => ({
  room_id: room.id,
  nama: room.interviewer,
  email: `${room.interviewer.toLowerCase().trim().replace(/\s+/g, '.')}@kemensos.go.id`
}))

export async function provision({ url, key, password, fetcher = fetch }) {
  if (!url || !key || !password) throw new Error('Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, dan INTERVIEWER_INITIAL_PASSWORD.')
  const origin = new URL(url)
  if (origin.protocol !== 'https:') throw new Error('SUPABASE_URL harus HTTPS.')
  async function request(path, { method = 'GET', body, prefer } = {}) {
    const response = await fetcher(new URL(path, origin), {
      method,
      redirect: 'error',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {})
    })
    // Jangan cetak payload respons atau kredensial pada kegagalan.
    if (!response.ok) throw new Error(`Supabase ${method} ${path.split('?')[0]} gagal (HTTP ${response.status}).`)
    const text = await response.text()
    return text ? JSON.parse(text) : null
  }

  // Pastikan migrasi tersedia sebelum membuat akun Auth.
  const assignments = await request('/rest/v1/interviewer_assignments?select=user_id,room_id')
  const profiles = await request('/rest/v1/profiles?select=id,role')
  const users = []
  for (let page = 1; ; page++) {
    const result = await request(`/auth/v1/admin/users?page=${page}&per_page=100`)
    const batch = result.users || []
    users.push(...batch)
    if (batch.length < 100) break
  }

  // Periksa bentrok seluruh daftar sebelum mutasi; jangan ubah akun milik peran lain.
  for (const account of accounts) {
    const user = users.find(u => u.email?.toLowerCase() === account.email)
    const profile = profiles.find(p => p.id === user?.id)
    if (profile && profile.role !== 'interviewer') throw new Error(`Konflik peran: ${account.email}; tidak ada akun diubah.`)
    if (assignments.some(a => (a.room_id === account.room_id && a.user_id !== user?.id) || (a.user_id === user?.id && a.room_id !== account.room_id))) {
      throw new Error(`Konflik penugasan ${account.room_id}; tidak ada akun diubah.`)
    }
  }

  let completed = 0
  try {
    for (const account of accounts) {
      let user = users.find(u => u.email?.toLowerCase() === account.email)
      if (!user) {
        user = await request('/auth/v1/admin/users', { method: 'POST', body: {
          email: account.email, password, email_confirm: true, user_metadata: { nama: account.nama }
        } })
      }
      if (!user?.id) throw new Error('Respons Auth tidak memuat ID akun.')
      await request('/rest/v1/profiles?on_conflict=id', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: { id: user.id, nama: account.nama, role: 'interviewer' } })
      await request('/rest/v1/interviewer_assignments?on_conflict=user_id', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: { user_id: user.id, room_id: account.room_id } })
      completed++
    }
  } catch (error) {
    throw new Error(`${completed}/19 akun selesai. ${error.message} Jalankan ulang untuk melanjutkan; sandi akun yang sudah ada tidak direset.`)
  }
  return completed
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv.includes('--apply')) {
    console.table(accounts)
    console.log('Pratinjau saja. Gunakan --apply setelah migrasi dan variabel lingkungan disiapkan.')
  } else {
    try {
      const count = await provision({ url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY, password: process.env.INTERVIEWER_INITIAL_PASSWORD })
      console.log(`${count}/19 akun dan penugasan selesai. Akun yang sudah ada tidak direset sandinya.`)
    } catch (error) {
      console.error(error.message)
      process.exitCode = 1
    }
  }
}
