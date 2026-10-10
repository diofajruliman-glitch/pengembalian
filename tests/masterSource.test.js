import test from 'node:test'
import assert from 'node:assert/strict'
import {committedMaster} from '../src/recovery/masterSource.js'

test('uncommitted previews and workspace loading cannot replace persisted balances',()=>{
 const stored={source:'database',scope:'production',revision:1}
 assert.equal(committedMaster(stored,{source:'excel',results:[]}),stored)
 assert.equal(committedMaster(stored,null),stored)
 assert.equal(committedMaster(null,{source:'excel'}),null)
 const refreshed={source:'database',scope:'production',revision:2}
 assert.equal(committedMaster(stored,refreshed),refreshed)
})
