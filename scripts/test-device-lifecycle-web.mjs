/** Browser rehearsal with synthetic HTTP responses only. Never contacts the demo API.
 * Build web first. Requires installed Edge; no browser dependencies or credentials.
 * Usage: node scripts/test-device-lifecycle-web.mjs
 */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile, mkdtemp, writeFile } from 'node:fs/promises'
import { resolve, join, extname } from 'node:path'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const root = fileURLToPath(new URL('../apps/web/dist', import.meta.url))
const artifacts = await mkdtemp(join(tmpdir(), 'kaffein-lifecycle-web-'))
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname
    const file = pathname.startsWith('/assets/') ? resolve(root, '.' + pathname) : join(root, 'index.html')
    assert.ok(file.startsWith(root + '\\') || file.startsWith(root + '/'))
    const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' }[extname(file)] ?? 'application/octet-stream'
    response.writeHead(200, { 'Content-Type': mime }); response.end(await readFile(file))
  } catch { response.writeHead(404); response.end() }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`
const browser = spawn(process.env.LIFECYCLE_BROWSER ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
  '--remote-debugging-port=0', `--user-data-dir=${artifacts}`, 'about:blank',
], { windowsHide: true, stdio: 'ignore' })
const browserErrors = []
browser.on('error', error => browserErrors.push(error))
let socket
try {
  let port
  for (let attempt = 0; attempt < 100; attempt++) {
    if (browserErrors.length) throw browserErrors[0]
    try { port = Number((await readFile(join(artifacts, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break } catch { await wait(100) }
  }
  assert.ok(port, 'Browser did not expose local debugging port')
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
  socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }) })
  let nextId = 0
  const pending = new Map()
  const requests = []
  const failures = []
  let stores = [
    { id: '1', code: 'TEST1', name: 'Chi nhánh TEST sạch', address: 'Test address', posDeviceId: 'test-device-1', posOnline: true, posHasPendingOutbox: false },
    { id: '2', code: 'TEST2', name: 'Chi nhánh TEST mới', address: 'Test address', posDeviceId: null, posOnline: false, posHasPendingOutbox: false },
    { id: '3', code: 'TEST3', name: 'Chi nhánh TEST pending', address: 'Test address', posDeviceId: 'test-device-3', posOnline: true, posHasPendingOutbox: true },
    { id: '4', code: 'TEST4', name: 'Chi nhánh TEST offline', address: 'Test address', posDeviceId: 'test-device-4', posOnline: false, posHasPendingOutbox: false },
  ]
  let failAfterMutation = false
  let refreshDelay = 0
  const command = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)) }, 10_000)
    pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value) }, reject: error => { clearTimeout(timer); reject(error) } })
    socket.send(JSON.stringify({ id, method, params }))
  })
  const fulfill = async event => {
    const { requestId, request } = event
    // Intercept ALL network destinations. Only the local build is allowed through.
    const url = new URL(request.url)
    if (url.origin === origin) return command('Fetch.continueRequest', { requestId })
    let status = 200
    let body = {}
    const path = url.pathname.replace(/^\/api\/v1/, '')
    if (request.method !== 'OPTIONS') {
      const payload = request.postData ? JSON.parse(request.postData) : undefined
      requests.push({ method: request.method, path, payload })
      if (path === '/auth/me') body = { userId: 'test-owner', role: 'OWNER', fullName: 'Test Owner', homeStoreId: null }
      else if (path === '/auth/stores') {
        if (refreshDelay) await wait(refreshDelay)
        if (failAfterMutation) { status = 503; body = { detail: 'Synthetic refresh failure' } }
        else body = stores.map(store => ({ ...store, posLastHeartbeat: store.posOnline ? new Date().toISOString() : null, activeDevice: store.posDeviceId ? { id: store.posDeviceId, displayName: `POS ${store.code}`, appVersion: 'test', hasPendingOutbox: store.posHasPendingOutbox, isOnline: store.posOnline } : null, revokedDeviceCount: 1 }))
      } else if (path === '/stores' && request.method === 'POST') {
        body = { ...payload, id: '5', status: 'ACTIVE' }
        stores.push({ ...body, posDeviceId: null, posOnline: false, posHasPendingOutbox: false })
        failAfterMutation = true
      } else if (/^\/stores\/\d+\/devices$/.test(path)) body = { storeId: path.split('/')[2], storeName: 'Test', devices: [
        { id: 'test-old', displayName: 'POS cũ TEST', status: 'REVOKED', appVersion: 'test', enrolledAt: new Date().toISOString(), revokedAt: new Date().toISOString(), lastHeartbeatAt: null },
      ] }
      else if (path === '/device-activations') body = { activationCode: 'synthetic.code-not-valid', expiresAt: new Date(Date.now() + 7200_000).toISOString(), storeId: payload.storeId }
      else if (/^\/devices\/[^/]+\/revoke$/.test(path)) {
        const id = path.split('/')[2]
        stores = stores.map(store => store.posDeviceId === id ? { ...store, posDeviceId: null, posOnline: false } : store)
        body = { success: true, deviceId: id, status: 'REVOKED' }
      } else { status = 404; body = { detail: 'Synthetic route not found' } }
    }
    return command('Fetch.fulfillRequest', { requestId, responseCode: status, responseHeaders: [
      { name: 'Content-Type', value: 'application/json' }, { name: 'Access-Control-Allow-Origin', value: '*' },
      { name: 'Access-Control-Allow-Headers', value: 'Authorization,Content-Type' }, { name: 'Access-Control-Allow-Methods', value: 'GET,POST,OPTIONS' },
    ], body: Buffer.from(JSON.stringify(body)).toString('base64') })
  }
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data)
    if (message.id) {
      const target = pending.get(message.id)
      pending.delete(message.id)
      if (message.error) target?.reject(new Error(message.error.message)); else target?.resolve(message.result)
    } else if (message.method === 'Fetch.requestPaused') void fulfill(message.params).catch(error => failures.push(error.message))
    else if (message.method === 'Runtime.exceptionThrown') failures.push(message.params.exceptionDetails.text)
  })
  await command('Page.enable')
  await command('Runtime.enable')
  await command('Fetch.enable', { patterns: [{ urlPattern: '*' }] })
  await command('Page.addScriptToEvaluateOnNewDocument', { source: "localStorage.setItem('access_token', 'synthetic-browser-test-only')" })
  await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  await command('Page.navigate', { url: origin + '/stores' })
  const evaluate = async expression => {
    const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text + ': ' + result.exceptionDetails.exception?.description)
    return result.result.value
  }
  const until = async (expression, label) => {
    for (let attempt = 0; attempt < 100; attempt++) { if (await evaluate(expression)) return; await wait(50) }
    throw new Error(`UI timeout: ${label}`)
  }
  const click = async (text, scope = 'document') => evaluate(`(() => { const button = Array.from((${scope}).querySelectorAll('button')).find(item => item.textContent.trim() === ${JSON.stringify(text)}); if (!button || button.disabled) throw Error('Missing/enabled button: '+${JSON.stringify(text)}); button.click() })()`)
  const row = name => `Array.from(document.querySelectorAll('tbody tr')).find(item=>item.textContent.includes(${JSON.stringify(name)}))`
  const setInput = async (label, value) => evaluate(`(() => { const input = Array.from(document.querySelectorAll('dialog label')).find(item=>item.textContent.includes(${JSON.stringify(label)})).querySelector('input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)}); input.dispatchEvent(new Event('input',{bubbles:true})); })()`)
  const viewport = async width => {
    await command('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false })
    await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
  }
  const screenshot = async name => {
    const result = await command('Page.captureScreenshot', { format: 'png' })
    await writeFile(join(artifacts, name), Buffer.from(result.data, 'base64'))
  }
  const assertToolbarLayout = async width => {
    const layout = await evaluate(`(() => {
      const group = document.querySelector('.lifecycle-toolbar-actions')
      const input = group.querySelector('input').getBoundingClientRect()
      const button = group.querySelector('button').getBoundingClientRect()
      return { inputTop: input.top, buttonTop: button.top, inputHeight: input.height, buttonHeight: button.height,
        inputRight: input.right, buttonLeft: button.left, buttonRight: button.right, inputLeft: input.left,
        overflow: document.documentElement.scrollWidth - innerWidth }
    })()`)
    assert.ok(Math.abs(layout.inputTop - layout.buttonTop) < 1, `Search/reload same row at ${width}px`)
    assert.ok(Math.abs(layout.inputHeight - layout.buttonHeight) < 1, `Search/reload equal height at ${width}px`)
    assert.ok(layout.inputRight <= layout.buttonLeft && layout.inputLeft >= 0 && layout.buttonRight <= width, `Toolbar fits at ${width}px`)
    assert.ok(layout.overflow <= 1, `No page overflow at ${width}px`)
  }
  const assertDialogLayout = async width => {
    const layout = await evaluate(`(() => {
      const foot = document.querySelector('dialog .dialog__foot')
      const [secondary, primary] = foot.querySelectorAll('button')
      const a = secondary.getBoundingClientRect(), b = primary.getBoundingClientRect(), f = foot.getBoundingClientRect()
      const dialog = document.querySelector('dialog')
      return { left: a.left, right: b.right, footLeft: f.left, footRight: f.right, secondaryRight: a.right,
        primaryLeft: b.left, top: a.top, primaryTop: b.top, overflow: dialog.scrollWidth - dialog.clientWidth,
        hasInlineStatus: !!foot.querySelector('[role=status]') }
    })()`)
    assert.ok(Math.abs(layout.left - layout.footLeft) < 1 && Math.abs(layout.right - layout.footRight) < 1, `Dialog buttons anchored left/right at ${width}px`)
    assert.ok(Math.abs(layout.top - layout.primaryTop) < 1 && layout.secondaryRight <= layout.primaryLeft, `Dialog buttons same row at ${width}px`)
    assert.ok(layout.left >= 0 && layout.right <= width && layout.overflow <= 1, `Dialog fits at ${width}px`)
    assert.equal(layout.hasInlineStatus, false, 'Copy feedback is outside the action row')
    return layout
  }
  await until("document.querySelector('tbody')?.textContent.includes('Chi nhánh TEST sạch')", 'store list')
  await assertToolbarLayout(1440)
  await click('Thiết bị POS', "document.querySelector('.lifecycle-toolbar')")
  for (const width of [1920, 1440, 1024, 768, 414, 375, 320]) {
    await viewport(width)
    await assertToolbarLayout(width)
    await screenshot(`toolbar-${width}.png`)
  }
  await viewport(1440)
  await evaluate("document.querySelector('.lifecycle-search').focus()")
  assert.equal(await evaluate("document.activeElement.matches('.lifecycle-search')"), true)
  refreshDelay = 700
  await click('Tải lại', "document.querySelector('.lifecycle-toolbar')")
  await until("document.querySelector('.lifecycle-toolbar-actions button').disabled", 'reload loading state')
  await assertToolbarLayout(1440)
  await until("!document.querySelector('.lifecycle-toolbar-actions button').disabled", 'reload ready')
  refreshDelay = 0
  await click('Lịch sử máy (1 đã thu hồi)', row('TEST sạch'))
  await until("document.querySelector('.lifecycle-history')?.textContent.includes('POS cũ TEST')", 'device history')
  await click('Đóng', "document.querySelector('dialog .dialog__foot')")
  for (const name of ['TEST pending', 'TEST offline']) {
    await click('Thay máy', row(name))
    await until("!!document.querySelector('dialog [role=alert]')", 'replacement block')
    assert.equal(await evaluate("document.querySelector('dialog button.button--primary').disabled"), true)
    await click('Hủy', "document.querySelector('dialog')")
  }
  await click('Thay máy', row('TEST sạch'))
  await evaluate("document.querySelector('dialog input[type=checkbox]').click()")
  await setInput('Thời hạn', '2')
  await click('Cấp mã', "document.querySelector('dialog')")
  await until("!!document.querySelector('.lifecycle-code input')", 'replacement activation code')
  assert.deepEqual(requests.find(item => item.path === '/device-activations').payload, { storeId: '1', reissue: true, expiresInHours: 2 })
  assert.equal(requests.filter(item => item.path.endsWith('/revoke')).length, 0, 'Issuing code does not revoke old POS')
  await click('Xong', "document.querySelector('dialog')")
  await click('Cấp mã kích hoạt', row('TEST mới'))
  await assertDialogLayout(1440)
  await click('Cấp mã', "document.querySelector('dialog')")
  await until("!!document.querySelector('.lifecycle-code input')", 'initial activation code')
  assert.equal(requests.filter(item => item.path === '/device-activations')[1].payload.reissue, false)
  for (const width of [1920, 1440, 1024, 768, 414, 375, 320]) {
    await viewport(width)
    const before = await assertDialogLayout(width)
    await evaluate("Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => {} } })")
    await click('Sao chép mã', "document.querySelector('dialog')")
    await until("document.querySelector('.lifecycle-copy-status').textContent === 'Đã sao chép'", 'clipboard success')
    const copied = await assertDialogLayout(width)
    assert.ok(Math.abs(copied.right - before.right) < 1, 'Copy success cannot move Done horizontally')
    await evaluate("Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw Error('Synthetic clipboard failure') } } })")
    await click('Sao chép mã', "document.querySelector('dialog')")
    await until("document.querySelector('.lifecycle-copy-status').textContent.includes('Không thể sao chép')", 'clipboard fallback')
    const failed = await assertDialogLayout(width)
    assert.ok(Math.abs(failed.right - before.right) < 1, 'Long clipboard error cannot move Done horizontally')
    await screenshot(`activation-${width}.png`)
  }
  await viewport(1440)
  await click('Xong', "document.querySelector('dialog')")
  await click('Thu hồi khẩn cấp', row('TEST offline'))
  assert.equal(await evaluate("document.querySelector('dialog button.button--primary').disabled"), true)
  await evaluate("document.querySelector('dialog input[type=checkbox]').click()")
  await click('Thu hồi ngay', "document.querySelector('dialog')")
  await until("!document.querySelector('dialog')", 'emergency revoke complete')
  assert.equal(requests.filter(item => item.path === '/devices/test-device-4/revoke').length, 1)
  await click('Tạo chi nhánh')
  await setInput('Mã chi nhánh', 'TEST5')
  await setInput('Tên chi nhánh', 'Chi nhánh TEST thêm')
  await setInput('Địa chỉ', 'Test address new')
  await click('Tạo chi nhánh', "document.querySelector('dialog')")
  await until("document.querySelector('.lifecycle-notice')?.textContent.includes('Thao tác đã thành công')", 'mutation success / refresh failure')
  assert.equal(requests.filter(item => item.path === '/stores').length, 1, 'Refresh failure cannot submit duplicate store')
  failAfterMutation = false
  await click('Tải lại', "document.querySelector('.table-toolbar')")
  await until("document.querySelector('tbody')?.textContent.includes('Chi nhánh TEST thêm')", 'refresh new store')
  await screenshot('stores.png')
  assert.deepEqual(failures, [])
  console.log('PASS: history, offline/pending replacement blocks, replacement code, initial code, emergency revoke, store create/refresh failure, no uncaught errors.')
  console.log('PASS: toolbar and dialog layouts at 320, 375, 414, 768, 1024, 1440, 1920px; loading, focus, clipboard success/failure.')
  console.log(`Synthetic browser screenshot: ${join(artifacts, 'stores.png')}`)
} finally {
  socket?.close()
  browser.kill()
  await new Promise(resolve => server.close(resolve))
}
