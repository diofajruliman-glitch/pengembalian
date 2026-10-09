import test from 'node:test'
import assert from 'node:assert/strict'
import {importErrorMessage} from '../src/import/importErrors.js'
test('import errors explain corrections and uncertain network outcomes without claiming success',()=>{
 assert.match(importErrorMessage({message:'FILE_ALREADY_COMMITTED'}),/Tidak ada transaksi tambahan/)
 assert.match(importErrorMessage({message:'MISSING_HISTORY_REQUIRES_REVIEW'}),/workbook sebelumnya/)
 assert.match(importErrorMessage({message:'LIVE_RECAP_MISMATCH_MISSING_HISTORY_REQUIRES_REVIEW'}),/Penyimpanan dibatalkan/)
 assert.match(importErrorMessage({message:'Failed to fetch'}),/belum dapat dipastikan/)
 assert.match(importErrorMessage({message:'PRIVATE_SERVER_DETAIL'}),/belum berhasil/)
})
