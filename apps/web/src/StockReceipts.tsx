import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { Role } from './context/AuthContext'
import {
  ApiError,
  inventoryApi,
  stockReceiptsApi,
  type IngredientResponse,
  type PaginatedStockReceiptsResponse,
  type StockReceiptInput,
  type StockReceiptResponse,
  type StockReceiptSourceType,
  type StockReceiptStatus,
  type StoreResponse,
} from './services/api'
import { inspectReceiptCsv } from './stockReceiptCsv'
import './StockReceipts.css'

type Screen = 'list' | 'new' | 'detail' | 'edit'
type EntryMethod = 'manual' | 'csv'
type FormLine = { key: string; ingredientId: string; quantity: string; unitCost: string; note: string }
type ReceiptForm = {
  sourceType: StockReceiptSourceType
  sourceName: string
  documentNo: string
  documentDate: string
  note: string
  lines: FormLine[]
}

const newLine = (): FormLine => ({ key: crypto.randomUUID(), ingredientId: '', quantity: '', unitCost: '', note: '' })
const emptyForm = (): ReceiptForm => ({
  sourceType: 'EXTERNAL_SUPPLIER', sourceName: '', documentNo: '', documentDate: '', note: '', lines: [newLine()],
})
const money = (value: string | number) => `${new Intl.NumberFormat('vi-VN').format(Number(value))} đ`
const dateTime = (value?: string | null) => value
  ? new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
  : '—'
const sourceLabel = (source: StockReceiptSourceType) => source === 'EXTERNAL_SUPPLIER' ? 'Nhà cung cấp' : 'Kho nguồn (chưa quản lý)'
const statusLabel: Record<StockReceiptStatus, string> = {
  DRAFT: 'Nháp', REVIEWED: 'Đã sửa/kiểm tra', POSTED: 'Đã đăng kho', REJECTED: 'Đã từ chối',
}
const statusTone: Record<StockReceiptStatus, string> = {
  DRAFT: 'amber', REVIEWED: 'blue', POSTED: 'green', REJECTED: 'red',
}
const errorText = (error: unknown) => {
  if (error instanceof ApiError) return error.detail && error.detail !== error.message
    ? `${error.message}: ${error.detail}` : error.message
  return error instanceof Error ? error.message : 'Có lỗi không xác định. Vui lòng thử lại.'
}
const toForm = (receipt: StockReceiptResponse): ReceiptForm => ({
  sourceType: receipt.sourceType,
  sourceName: receipt.sourceName,
  documentNo: receipt.documentNo ?? '',
  documentDate: receipt.documentDate ? receipt.documentDate.slice(0, 10) : '',
  note: receipt.note ?? '',
  lines: receipt.lines.map((line) => ({
    key: line.id,
    ingredientId: line.ingredientId,
    quantity: String(line.receivedQuantity),
    unitCost: line.unitCostVnd,
    note: line.note ?? '',
  })),
})

function validatedHeader(form: ReceiptForm): Omit<StockReceiptInput, 'lines'> {
  if (!form.sourceName.trim()) throw new Error('Cần nhập tên nhà cung cấp hoặc kho nguồn.')
  return {
    sourceType: form.sourceType,
    sourceName: form.sourceName.trim(),
    documentNo: form.documentNo.trim() || undefined,
    documentDate: form.documentDate ? `${form.documentDate}T00:00:00.000Z` : undefined,
    note: form.note.trim() || undefined,
  }
}

function validatedPayload(form: ReceiptForm): StockReceiptInput {
  const header = validatedHeader(form)
  if (form.lines.length === 0) throw new Error('Phiếu phải có ít nhất một dòng nguyên liệu.')
  const lines = form.lines.map((line, index) => {
    if (!line.ingredientId) throw new Error(`Dòng ${index + 1}: cần chọn nguyên liệu.`)
    if (!/^\d+(?:\.\d{1,3})?$/.test(line.quantity) || Number(line.quantity) <= 0) {
      throw new Error(`Dòng ${index + 1}: số lượng phải lớn hơn 0, tối đa 3 chữ số thập phân.`)
    }
    if (!/^\d+(?:\.\d{1,3})?$/.test(line.unitCost)) {
      throw new Error(`Dòng ${index + 1}: cần nhập đơn giá thực tế, không để trống.`)
    }
    return {
      ingredientId: line.ingredientId,
      receivedQuantity: Number(line.quantity),
      unitCostVnd: Number(line.unitCost),
      note: line.note.trim() || undefined,
    }
  })
  return { ...header, lines }
}

export function StockReceiptsPage({ role, homeStoreId, store, stores }: {
  role: Role
  homeStoreId: string | null
  store: string
  stores: StoreResponse[]
}) {
  const allowedStores = role === 'OWNER' ? stores : stores.filter((item) => item.id === homeStoreId)
  const topbarStore = allowedStores.find((item) => item.name === store)
  const [branchId, setBranchId] = useState('')
  const currentStore = topbarStore ?? allowedStores.find((item) => item.id === branchId) ?? allowedStores[0]
  const storeId = currentStore?.id
  const [screen, setScreen] = useState<Screen>('list')
  const [entryMethod, setEntryMethod] = useState<EntryMethod>('manual')
  const [statusFilter, setStatusFilter] = useState<'' | StockReceiptStatus>('')
  const [sourceFilter, setSourceFilter] = useState<'' | StockReceiptSourceType>('')
  const [page, setPage] = useState(1)
  const [listSnapshot, setListSnapshot] = useState<{ key: string; result: PaginatedStockReceiptsResponse | null } | null>(null)
  const [ingredients, setIngredients] = useState<IngredientResponse[]>([])
  const [detail, setDetail] = useState<StockReceiptResponse | null>(null)
  const [form, setForm] = useState<ReceiptForm>(emptyForm)
  const [csvContent, setCsvContent] = useState('')
  const [csvName, setCsvName] = useState('')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [revision, setRevision] = useState(0)
  const postKeys = useRef(new Map<string, string>())
  const queryKey = `${storeId ?? ''}|${statusFilter}|${sourceFilter}|${page}|${revision}`
  const list = listSnapshot?.key === queryKey ? listSnapshot.result : null
  const loading = listSnapshot?.key !== queryKey

  useEffect(() => {
    let active = true
    inventoryApi.ingredients().then((items) => { if (active) setIngredients(items) })
      .catch((reason) => { if (active) setError(errorText(reason)) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!storeId) return
    let active = true
    const key = `${storeId}|${statusFilter}|${sourceFilter}|${page}|${revision}`
    stockReceiptsApi.list(storeId, {
      status: statusFilter || undefined,
      sourceType: sourceFilter || undefined,
      page,
    }).then((result) => {
      if (active) { setListSnapshot({ key, result }); setError('') }
    }).catch((reason) => { if (active) { setListSnapshot({ key, result: null }); setError(errorText(reason)) } })
    return () => { active = false }
  }, [storeId, statusFilter, sourceFilter, page, revision])

  function selectBranch(id: string) {
    setBranchId(id)
    setScreen('list')
    setDetail(null)
    setPage(1)
    setError('')
    setNotice('')
  }

  const activeIngredients = ingredients.filter((item) => item.isActive)
  const csvCheck = inspectReceiptCsv(csvContent, activeIngredients)
  const estimatedTotal = form.lines.reduce((total, line) => {
    const quantity = Number(line.quantity)
    const cost = Number(line.unitCost)
    return total + (line.quantity && line.unitCost && Number.isFinite(quantity * cost) ? Math.round(quantity * cost) : 0)
  }, 0)

  function updateForm(field: keyof Omit<ReceiptForm, 'lines'>, value: string) {
    setForm((previous) => ({ ...previous, [field]: value }))
  }

  function updateLine(key: string, field: keyof Omit<FormLine, 'key'>, value: string) {
    setForm((previous) => ({ ...previous, lines: previous.lines.map((line) =>
      line.key === key ? { ...line, [field]: value } : line,
    ) }))
  }

  function beginNew() {
    setForm(emptyForm())
    setCsvContent('')
    setCsvName('')
    setEntryMethod('manual')
    setDetail(null)
    setError('')
    setNotice('')
    setScreen('new')
  }

  async function openDetail(id: string) {
    setWorking(true)
    setError('')
    try {
      const receipt = await stockReceiptsApi.detail(id)
      if (receipt.storeId !== storeId) throw new Error('Phiếu không thuộc chi nhánh đang chọn.')
      setDetail(receipt)
      setScreen('detail')
    } catch (reason) { setError(errorText(reason)) }
    finally { setWorking(false) }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!storeId || working) return
    setError('')
    setNotice('')
    let payload: StockReceiptInput | null = null
    let header: Omit<StockReceiptInput, 'lines'>
    try {
      header = validatedHeader(form)
      if (entryMethod !== 'csv' || screen === 'edit') payload = validatedPayload(form)
      if (payload && payload.lines.some((line) => !activeIngredients.some((item) => item.id === line.ingredientId))) {
        throw new Error('Một nguyên liệu không còn hoạt động. Vui lòng chọn lại.')
      }
      if (entryMethod === 'csv' && (csvCheck.errors.length > 0 || csvCheck.rows.length === 0)) {
        throw new Error('CSV còn lỗi; vui lòng sửa trước khi tạo phiếu nháp.')
      }
    } catch (reason) { setError(errorText(reason)); return }
    setWorking(true)
    try {
      const receipt = screen === 'edit' && detail && payload
        ? await stockReceiptsApi.update(detail.id, payload)
        : entryMethod === 'csv'
          ? await stockReceiptsApi.importCsv(storeId, { ...header, csvContent })
          : await stockReceiptsApi.create(storeId, payload!)
      setDetail(receipt)
      setScreen('detail')
      setNotice(receipt.status === 'DRAFT'
        ? 'Đã lưu nháp. Tồn kho chưa thay đổi.'
        : 'Đã lưu chỉnh sửa. API chuyển phiếu sang trạng thái “Đã sửa/kiểm tra”; tồn kho chưa thay đổi.')
      setRevision((value) => value + 1)
    } catch (reason) { setError(errorText(reason)) }
    finally { setWorking(false) }
  }

  async function chooseCsv(file?: File) {
    setError('')
    setCsvContent('')
    setCsvName(file?.name ?? '')
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.csv')) { setError('Chỉ nhận file .csv. PDF chưa có API xử lý.'); return }
    if (file.size > 1024 * 1024) { setError('File CSV vượt quá 1 MB.'); return }
    try { setCsvContent(await file.text()) }
    catch (reason) { setError(errorText(reason)) }
  }

  function downloadTemplate() {
    const blob = new Blob(['ingredient_code,received_quantity,unit_cost_vnd,note\n'], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'mau-phieu-nhap-hang.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  function postKeyFor(id: string) {
    const storageKey = `stock-receipt-post:${id}`
    let key = postKeys.current.get(id)
    try { key ??= sessionStorage.getItem(storageKey) ?? undefined } catch { /* session storage may be disabled */ }
    if (!key) key = crypto.randomUUID()
    postKeys.current.set(id, key)
    try { sessionStorage.setItem(storageKey, key) } catch { /* in-memory retry still works */ }
    return key
  }

  function clearPostKey(id: string) {
    postKeys.current.delete(id)
    try { sessionStorage.removeItem(`stock-receipt-post:${id}`) } catch { /* storage may be disabled */ }
  }

  async function post() {
    if (!detail || working) return
    setError('')
    setWorking(true)
    try {
      const latest = await stockReceiptsApi.detail(detail.id)
      setDetail(latest)
      if (latest.status !== 'DRAFT' && latest.status !== 'REVIEWED') throw new Error('Phiếu không còn ở trạng thái có thể đăng kho.')
      if (latest.lines.some((line) => line.validationErrors)) throw new Error('Phiếu còn lỗi dòng; sửa trước khi đăng kho.')
      if (!window.confirm(`Đăng kho phiếu ${latest.receiptCode} cho ${currentStore.name}? Thao tác sẽ cộng tồn kho và không thể hoàn tác trong MVP.`)) return
      const posted = await stockReceiptsApi.post(latest.id, postKeyFor(latest.id))
      clearPostKey(latest.id)
      setDetail(posted)
      setNotice('Đã đăng kho. Tồn kho đã được cộng trên server; POS sẽ kéo thay đổi khi đồng bộ.')
      setRevision((value) => value + 1)
    } catch (reason) {
      try {
        const latest = await stockReceiptsApi.detail(detail.id)
        setDetail(latest)
        if (latest.status === 'POSTED') {
          clearPostKey(latest.id)
          setNotice('Phiếu đã đăng kho trên server. Không gửi lại thao tác.')
          setRevision((value) => value + 1)
          return
        }
      } catch { /* retain the original post error */ }
      setError(errorText(reason))
    } finally { setWorking(false) }
  }

  async function reject() {
    if (!detail || working) return
    const reason = window.prompt(`Lý do từ chối phiếu ${detail.receiptCode}:`)
    if (reason === null) return
    if (!reason.trim()) { setError('Cần nhập lý do từ chối.'); return }
    if (!window.confirm(`Từ chối phiếu ${detail.receiptCode}? Phiếu sẽ không thể sửa hay đăng kho.`)) return
    setWorking(true)
    setError('')
    try {
      const rejected = await stockReceiptsApi.reject(detail.id, reason.trim())
      setDetail(rejected)
      setNotice('Đã từ chối phiếu. Tồn kho không thay đổi.')
      setRevision((value) => value + 1)
    } catch (failure) { setError(errorText(failure)) }
    finally { setWorking(false) }
  }

  if (!currentStore) return <div className="panel"><h1>Phiếu nhập hàng</h1><p>Không có chi nhánh được phép quản lý hoặc chưa tải được danh sách chi nhánh.</p></div>

  return <div className="stock-receipts">
    <div className="stock-receipts__head">
      <div className="page-head">
        <span className="eyebrow">KAFFEIN / KHO CHI NHÁNH</span>
        <h1>Phiếu nhập hàng</h1>
        <p>Tạo nháp, đối chiếu hàng thực nhận và đăng kho cho từng chi nhánh.</p>
      </div>
      <div className="stock-receipts__head-actions">
        {role === 'OWNER' && !topbarStore && <label>Chi nhánh
          <select value={currentStore.id} disabled={working} onChange={(event) => selectBranch(event.target.value)}>
            {allowedStores.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>}
        {screen !== 'list' && <button type="button" className="button button--secondary" onClick={() => { setScreen('list'); setError(''); setNotice('') }}>Danh sách phiếu</button>}
        {screen === 'list' && <button type="button" className="button button--primary" onClick={beginNew}>+ Tạo phiếu nhập</button>}
      </div>
    </div>

    <div className={`stock-receipts__readiness ${!currentStore.posOnline || currentStore.posHasPendingOutbox ? 'stock-receipts__readiness--blocked' : ''}`}>
      <strong>{currentStore.posOnline && !currentStore.posHasPendingOutbox ? 'POS đang trực tuyến' : 'POS chưa sẵn sàng đăng kho'}</strong>
      <span>Có thể lưu nháp khi POS offline. Chỉ server mới quyết định điều kiện đăng kho tại thời điểm xác nhận; POS cần online và đã đồng bộ hết outbox.</span>
    </div>
    {error && <div role="alert" className="stock-receipts__message stock-receipts__message--error">{error}</div>}
    {notice && <div role="status" className="stock-receipts__message stock-receipts__message--ok">{notice}</div>}

    {screen === 'list' && <div className="panel stock-receipts__list">
      <div className="stock-receipts__toolbar">
        <div><h2>Phiếu của {currentStore.name}</h2><p>{list ? `${list.total} phiếu` : 'Đang tải dữ liệu'}</p></div>
        <div className="stock-receipts__filters">
          <label>Trạng thái<select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value as typeof statusFilter); setPage(1) }}>
            <option value="">Tất cả</option>{Object.entries(statusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></label>
          <label>Nguồn hàng<select value={sourceFilter} onChange={(event) => { setSourceFilter(event.target.value as typeof sourceFilter); setPage(1) }}>
            <option value="">Tất cả</option><option value="EXTERNAL_SUPPLIER">Nhà cung cấp</option><option value="CENTRAL_WAREHOUSE_UNTRACKED">Kho nguồn</option>
          </select></label>
          <button type="button" className="button button--secondary" onClick={() => setRevision((value) => value + 1)}>Tải lại</button>
        </div>
      </div>
      {loading ? <p className="stock-receipts__placeholder">Đang tải phiếu…</p>
        : !list?.items.length ? <p className="stock-receipts__placeholder">Chưa có phiếu phù hợp bộ lọc.</p>
          : <div className="stock-receipts__table-wrap"><table><thead><tr><th>Mã phiếu</th><th>Nguồn giao</th><th>Ngày tạo</th><th>Dòng</th><th>Tổng giá trị</th><th>Trạng thái</th><th></th></tr></thead>
            <tbody>{list.items.map((item) => <tr key={item.id}>
              <td><strong>{item.receiptCode}</strong><small>{item.createdByName}</small></td>
              <td>{item.sourceName}<small>{sourceLabel(item.sourceType)}</small></td>
              <td>{dateTime(item.createdAt)}</td><td>{item.lineCount}</td><td>{money(item.totalCostVnd)}</td>
              <td><span className={`badge badge--${statusTone[item.status]}`}>{statusLabel[item.status]}</span></td>
              <td><button type="button" className="button button--text" disabled={working} onClick={() => void openDetail(item.id)}>Xem phiếu</button></td>
            </tr>)}</tbody></table></div>}
      {list && list.totalPages > 1 && <div className="stock-receipts__pagination">
        <button type="button" className="button button--secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Trước</button>
        <span>Trang {list.page}/{list.totalPages}</span>
        <button type="button" className="button button--secondary" disabled={page >= list.totalPages} onClick={() => setPage(page + 1)}>Sau</button>
      </div>}
    </div>}

    {(screen === 'new' || screen === 'edit') && <form className="panel stock-receipts__form" onSubmit={(event) => void save(event)}>
      <div className="stock-receipts__section-head"><div><h2>{screen === 'edit' ? `Sửa ${detail?.receiptCode}` : 'Tạo phiếu nháp'}</h2><p>Lưu nháp không cộng tồn kho. Số lượng tính theo đơn vị cơ sở của nguyên liệu.</p></div></div>
      {screen === 'new' && <div className="stock-receipts__tabs">
        <button type="button" className={entryMethod === 'manual' ? 'is-active' : ''} onClick={() => setEntryMethod('manual')}>Nhập thủ công</button>
        <button type="button" className={entryMethod === 'csv' ? 'is-active' : ''} onClick={() => setEntryMethod('csv')}>Nhập CSV</button>
      </div>}
      <div className="stock-receipts__fields">
        <label>Loại nguồn hàng<select value={form.sourceType} onChange={(event) => updateForm('sourceType', event.target.value)}>
          <option value="EXTERNAL_SUPPLIER">Nhà cung cấp ngoài</option><option value="CENTRAL_WAREHOUSE_UNTRACKED">Kho nguồn chưa quản lý</option>
        </select></label>
        <label>Tên nhà cung cấp / kho nguồn <span>*</span><input required value={form.sourceName} onChange={(event) => updateForm('sourceName', event.target.value)} /></label>
        <label>Số chứng từ<input value={form.documentNo} onChange={(event) => updateForm('documentNo', event.target.value)} /></label>
        <label>Ngày chứng từ<input type="date" value={form.documentDate} onChange={(event) => updateForm('documentDate', event.target.value)} /></label>
        <label className="stock-receipts__full">Ghi chú phiếu<textarea rows={2} value={form.note} onChange={(event) => updateForm('note', event.target.value)} /></label>
      </div>
      {entryMethod === 'csv' && screen === 'new' ? <div className="stock-receipts__csv">
        <div className="stock-receipts__section-head"><h3>Dữ liệu CSV</h3><button type="button" className="button button--secondary" onClick={downloadTemplate}>Tải mẫu CSV</button></div>
        <p>CSV UTF-8: <code>ingredient_code,received_quantity,unit_cost_vnd,note</code>. Chỉ hỗ trợ dấu phẩy phân cột đơn giản; chưa hỗ trợ ô chứa dấu phẩy/ngoặc kép. PDF/OCR chưa có API.</p>
        <label>Chọn file CSV<input type="file" accept=".csv,text/csv" onChange={(event) => void chooseCsv(event.target.files?.[0])} /></label>
        {csvName && <p>File: {csvName}</p>}
        {csvContent && <><p>{csvCheck.rows.length} dòng dữ liệu; {csvCheck.errors.length} lỗi kiểm tra trước khi gửi.</p>
          {csvCheck.errors.length > 0 && <ul className="stock-receipts__csv-errors">{csvCheck.errors.slice(0, 20).map((item, index) => <li key={index}>{item}</li>)}</ul>}
          {csvCheck.rows.length > 0 && <div className="stock-receipts__table-wrap"><table><thead><tr><th>Mã nguyên liệu</th><th>Số lượng</th><th>Đơn giá</th><th>Ghi chú</th></tr></thead><tbody>
            {csvCheck.rows.slice(0, 10).map((row, index) => <tr key={index}><td>{row.code}</td><td>{row.quantity}</td><td>{row.unitCost}</td><td>{row.note}</td></tr>)}
          </tbody></table></div>}
        </>}
      </div> : <div className="stock-receipts__lines">
        <div className="stock-receipts__section-head"><div><h3>Hàng thực nhận</h3><p>Không nhập giá chưa biết thành 0; giá vốn hiện là thông tin phiếu, chưa dùng tính lợi nhuận.</p></div>
          <button type="button" className="button button--secondary" onClick={() => setForm((previous) => ({ ...previous, lines: [...previous.lines, newLine()] }))}>+ Thêm dòng</button></div>
        {form.lines.map((line, index) => <div className="stock-receipts__line" key={line.key}>
          <label>Nguyên liệu {index + 1}<select value={line.ingredientId} onChange={(event) => updateLine(line.key, 'ingredientId', event.target.value)}>
            <option value="">Chọn nguyên liệu</option>{activeIngredients.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name} ({item.baseUnit})</option>)}
          </select></label>
          <label>Số lượng (đơn vị cơ sở)<input type="number" min="0.001" step="0.001" value={line.quantity} onChange={(event) => updateLine(line.key, 'quantity', event.target.value)} /></label>
          <label>Đơn giá / đơn vị (VND)<input type="number" min="0" step="0.001" value={line.unitCost} onChange={(event) => updateLine(line.key, 'unitCost', event.target.value)} /></label>
          <label>Ghi chú dòng<input value={line.note} onChange={(event) => updateLine(line.key, 'note', event.target.value)} /></label>
          <button type="button" className="button button--text" disabled={form.lines.length === 1} onClick={() => setForm((previous) => ({ ...previous, lines: previous.lines.filter((item) => item.key !== line.key) }))}>Xóa</button>
        </div>)}
        <p className="stock-receipts__total">Tổng giá trị ước tính: <strong>{money(estimatedTotal)}</strong></p>
      </div>}
      <div className="stock-receipts__actions">
        <button type="button" className="button button--secondary" onClick={() => setScreen(detail ? 'detail' : 'list')}>Hủy</button>
        <button type="submit" className="button button--primary" disabled={working || (entryMethod === 'csv' && (csvCheck.errors.length > 0 || csvCheck.rows.length === 0))}>
          {working ? 'Đang lưu…' : screen === 'edit' ? 'Lưu sửa (chuyển sang Đã sửa/kiểm tra)' : 'Lưu phiếu nháp'}
        </button>
      </div>
    </form>}

    {screen === 'detail' && detail && <div className="panel stock-receipts__detail">
      <div className="stock-receipts__section-head"><div><h2>{detail.receiptCode}</h2><p>{currentStore.name} · Tạo {dateTime(detail.createdAt)} bởi {detail.createdByName}</p></div>
        <span className={`badge badge--${statusTone[detail.status]}`}>{statusLabel[detail.status]}</span></div>
      <div className="stock-receipts__facts">
        <div><small>Nguồn hàng</small><strong>{sourceLabel(detail.sourceType)} · {detail.sourceName}</strong></div>
        <div><small>Chứng từ</small><strong>{detail.documentNo || 'Chưa có'}</strong></div>
        <div><small>Ngày chứng từ</small><strong>{detail.documentDate ? detail.documentDate.slice(0, 10) : 'Chưa có'}</strong></div>
        <div><small>Người đăng kho</small><strong>{detail.postedByName || 'Chưa đăng kho'}</strong></div>
      </div>
      {detail.note && <p>Ghi chú: {detail.note}</p>}
      {detail.rejectionReason && <p className="stock-receipts__message stock-receipts__message--error">Lý do từ chối: {detail.rejectionReason}</p>}
      <div className="stock-receipts__table-wrap"><table><thead><tr><th>#</th><th>Nguyên liệu</th><th>Thực nhận</th><th>Đơn giá</th><th>Thành tiền</th><th>Ghi chú / lỗi</th></tr></thead><tbody>
        {detail.lines.map((line) => <tr key={line.id}><td>{line.lineNumber}</td><td><strong>{line.ingredientName}</strong><small>{line.ingredientCode}</small></td>
          <td>{line.receivedQuantity} {line.baseUnit}</td><td>{money(line.unitCostVnd)}</td><td>{money(line.lineTotalVnd)}</td>
          <td>{line.note || '—'}{line.validationErrors && <small className="stock-receipts__line-error">{line.validationErrors}</small>}</td></tr>)}
      </tbody></table></div>
      <div className="stock-receipts__detail-footer"><strong>Tổng giá trị: {money(detail.totalCostVnd)}</strong><div>
        {(detail.status === 'DRAFT' || detail.status === 'REVIEWED') && <>
          <button type="button" className="button button--secondary" disabled={working} onClick={() => { setForm(toForm(detail)); setEntryMethod('manual'); setError(''); setScreen('edit') }}>Sửa phiếu</button>
          <button type="button" className="button button--secondary" disabled={working} onClick={() => void reject()}>Từ chối</button>
          <button type="button" className="button button--primary" disabled={working || detail.lines.some((line) => !!line.validationErrors)} onClick={() => void post()}>{working ? 'Đang xử lý…' : 'Đăng kho'}</button>
        </>}
      </div></div>
      {detail.status !== 'POSTED' && <p className="stock-receipts__footnote">Phiếu chưa đăng kho không làm thay đổi số dư. Sau khi đăng kho, phiếu bất biến trong MVP.</p>}
    </div>}
  </div>
}
