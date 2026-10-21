import test from 'node:test'
import assert from 'node:assert/strict'
import { accounts, provision } from '../scripts/provision-interviewers.mjs'
import { OFFICIAL_ROOMS_19 } from '../src/interviews/officialSchedule1057.js'

test('19 unique emails follow the official room assignments', () => {
  assert.equal(accounts.length, 19)
  assert.equal(new Set(accounts.map(a => a.email)).size, 19)
  assert.equal(accounts[0].email, 'sekretariat.linjamsos@kemensos.go.id')
  assert.equal(accounts[4].email, 'leo.suta@kemensos.go.id')
  assert.equal(accounts[18].room_id, 'room-19')
})

test('account display names match every official schedule room exactly', () => {
  assert.deepEqual(
    accounts.map(({ room_id, nama }) => ({ room_id, nama })),
    OFFICIAL_ROOMS_19.map(({ id, interviewer }) => ({ room_id: id, nama: interviewer }))
  )
  assert.equal(accounts.find(a => a.room_id === 'room-10').nama, 'Iwien')
  assert.equal(accounts.find(a => a.room_id === 'room-11').nama, 'Mahmud syahputra')
})

test('rooms sharing an institutional display name keep distinct login emails', () => {
  const first = accounts.find(a => a.room_id === 'room-1')
  const second = accounts.find(a => a.room_id === 'room-2')
  assert.equal(first.nama, 'Sekretariat Linjamsos')
  assert.equal(second.nama, first.nama)
  assert.equal(second.email, 'sekretariat.linjamsos.2@kemensos.go.id')
  assert.notEqual(first.email, second.email)
})

function backend({ existing = false, conflicting = false } = {}) {
  const writes = []
  const users = existing ? accounts.map((a, i) => ({ id: `user-${i}`, email: a.email })) : []
  const fetcher = async (url, options) => {
    const path = url.pathname
    if (options.method === 'GET') {
      const data = path.includes('/auth/') ? { users } : path.endsWith('/profiles') && conflicting ? [{ id: users[0].id, role: 'admin' }] : []
      return new Response(JSON.stringify(data))
    }
    const body = JSON.parse(options.body)
    writes.push({ path, body })
    return path.includes('/auth/') ? new Response(JSON.stringify({ id: `created-${writes.length}` })) : new Response(null, { status: 201 })
  }
  return { writes, fetcher }
}
const config = { url: 'https://example.supabase.co', key: 'test-key', password: 'test-password' }

test('creates Auth accounts, scoped profiles and assignments', async () => {
  const mock = backend()
  assert.equal(await provision({ ...config, fetcher: mock.fetcher }), 19)
  assert.equal(mock.writes.filter(w => w.path.includes('/auth/')).length, 19)
  assert.equal(mock.writes.filter(w => w.path.endsWith('/profiles') && w.body.role === 'interviewer').length, 19)
})

test('rerun preserves existing passwords', async () => {
  const mock = backend({ existing: true })
  assert.equal(await provision({ ...config, fetcher: mock.fetcher }), 19)
  assert.equal(mock.writes.filter(w => w.path.includes('/auth/')).length, 0)
})

test('rejects existing admin before making any writes', async () => {
  const mock = backend({ existing: true, conflicting: true })
  await assert.rejects(provision({ ...config, fetcher: mock.fetcher }), /Konflik peran/)
  assert.equal(mock.writes.length, 0)
})
