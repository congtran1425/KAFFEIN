import assert from 'node:assert/strict'
import test from 'node:test'
import { inspectReceiptCsv } from './stockReceiptCsv.ts'

const ingredients = [{ code: 'ING_COFFEE', isActive: true }, { code: 'OLD_MILK', isActive: false }]

test('validates a simple CSV matching the import API', () => {
  const result = inspectReceiptCsv('ingredient_code,received_quantity,unit_cost_vnd,note\nING_COFFEE,1500,0.25,Bao 1.5kg\n', ingredients)
  assert.equal(result.rows.length, 1)
  assert.deepEqual(result.errors, [])
})

test('does not treat missing or invalid unit cost as zero', () => {
  const result = inspectReceiptCsv('ingredient_code,received_quantity,unit_cost_vnd,note\nING_COFFEE,1500,,\n', ingredients)
  assert.match(result.errors.join(' '), /đơn giá/)
})

test('rejects inactive ingredient, quoted data and invalid quantity before sending to API', () => {
  const result = inspectReceiptCsv('ingredient_code,received_quantity,unit_cost_vnd,note\nOLD_MILK,0,10,\n"ING_COFFEE",2,10,\n', ingredients)
  assert.match(result.errors.join(' '), /không tồn tại hoặc ngừng dùng/)
  assert.match(result.errors.join(' '), /số lượng/)
  assert.match(result.errors.join(' '), /ngoặc kép/)
})
