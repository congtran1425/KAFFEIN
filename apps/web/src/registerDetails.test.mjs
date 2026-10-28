import assert from 'node:assert/strict'
import test, { after } from 'node:test'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import ts from 'typescript'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const sourcePath = fileURLToPath(new URL('./RegisterDetails.tsx', import.meta.url))
const directory = path.resolve(path.dirname(sourcePath), '../node_modules/.cache')
fs.mkdirSync(directory, { recursive: true })
const compiledPath = path.join(directory, `register-details-${process.pid}.mjs`)
fs.writeFileSync(compiledPath, ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText)
after(() => fs.unlinkSync(compiledPath))
const { registerMoney, RegisterVariance, RegisterSessionDenominationModal } = await import(pathToFileURL(compiledPath).href)
const base = { id: 'session-test', storeName: 'Test store', openedByName: 'Test cashier', closedByName: 'Test cashier',
  status: 'CLOSED', openedAt: '2026-10-19T00:00:00Z', closedAt: '2026-10-19T05:00:00Z', openingCashVnd: '60000', expectedCashVnd: '60000',
  actualCashVnd: '25000', varianceVnd: '-35000', openingDenominations: { '50000': 1, '10000': 1 },
  closingDenominations: { '20000': 1, '5000': 1 }, compensationCashVnd: '50000', compensationDenominations: { '50000': 1 } }

test('register money preserves integers beyond Number precision', () => {
  assert.equal(registerMoney('9007199254740993'), '9.007.199.254.740.993 đ')
  assert.equal(registerMoney('0'), '0 đ')
})
test('admin renders original shortage, overpayment and all three denomination cards', () => {
  const html = renderToStaticMarkup(createElement(RegisterSessionDenominationModal, { session: base, onClose() {} }))
  for (const text of ['Quỹ đầu ca', 'Kiểm kê chốt két', 'Bồi hoàn thiếu quỹ', 'Bù vượt mức', '35.000', '50.000', '75.000']) assert.ok(html.includes(text), text)
})
test('surplus uses a positive green badge and zero remains balanced', () => {
  let html = renderToStaticMarkup(createElement(RegisterVariance, { session: { ...base, varianceVnd: '10000', compensationCashVnd: null } }))
  assert.ok(html.includes('badge--green')); assert.ok(html.includes('+10.000')); assert.ok(html.includes('Thừa quỹ'))
  html = renderToStaticMarkup(createElement(RegisterVariance, { session: { ...base, varianceVnd: '0', compensationCashVnd: null } }))
  assert.ok(html.includes('0 đ')); assert.ok(html.includes('Khớp'))
})
test('legacy missing compensation remains unknown rather than marked repaid', () => {
  const html = renderToStaticMarkup(createElement(RegisterSessionDenominationModal, { session: { ...base, compensationCashVnd: null }, onClose() {} }))
  assert.ok(html.includes('Phiên cũ chưa có dữ liệu tiền bù.'))
  assert.ok(!html.includes('Đã bù đủ'))
})
