import assert from 'node:assert/strict'
import test from 'node:test'
import { rowsForStore } from './inventorySnapshot.ts'

test('inventory renders safely before stores and stock are loaded', () => {
  assert.deepEqual(rowsForStore(null, undefined), [])
  assert.deepEqual(rowsForStore(null, '1'), [])
})

test('inventory never shows another store snapshot', () => {
  const snapshot = { storeId: '1', rows: [{ ingredientId: '10' }] }
  assert.deepEqual(rowsForStore(snapshot, undefined), [])
  assert.deepEqual(rowsForStore(snapshot, '2'), [])
  assert.equal(rowsForStore(snapshot, '1'), snapshot.rows)
})
