import assert from 'node:assert/strict'
import test from 'node:test'
import { replacementBlockReason } from './deviceLifecycle.ts'

const now = Date.parse('2026-10-11T03:00:00Z')
const clean = { posDeviceId: 'old', posOnline: true, posLastHeartbeat: new Date(now - 1000).toISOString(), posHasPendingOutbox: false }
test('routine replacement requires a fresh, explicitly clean heartbeat', () => {
  assert.equal(replacementBlockReason(clean, now), null)
  for (const patch of [{ posOnline: false }, { posLastHeartbeat: null }, { posLastHeartbeat: 'bad' }, { posLastHeartbeat: new Date(now - 90001).toISOString() }, { posHasPendingOutbox: true }, { posHasPendingOutbox: undefined }, { posDeviceId: null }]) {
    assert.ok(replacementBlockReason({ ...clean, ...patch }, now))
  }
})
test('future heartbeat beyond clock tolerance does not prove synchronization', () => {
  assert.ok(replacementBlockReason({ ...clean, posLastHeartbeat: new Date(now + 6000).toISOString() }, now))
})
