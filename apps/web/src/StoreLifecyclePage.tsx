import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Icon } from './Icon'
import { ApiError, devicesApi, storesApi } from './services/api'
import type { ActivationCodeResponse, StoreDevicesResponse, StoreResponse } from './services/api'
import { replacementBlockReason } from './deviceLifecycle'
import './StoreLifecyclePage.css'

type Action = { kind: 'create' } | { kind: 'activate' | 'replace' | 'revoke' | 'history'; store: StoreResponse }
const date = (value: string | null) => value ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : 'Chưa có'
const errorText = (error: unknown) => error instanceof ApiError ? error.detail ?? error.message : error instanceof Error ? error.message : 'Không thể kết nối máy chủ.'

function LifecycleDialog({ title, busy, close, children }: { title: string; busy: boolean; close: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  const busyRef = useRef(busy)
  useEffect(() => { busyRef.current = busy }, [busy])
  useEffect(() => {
    const dialog = ref.current!
    const previous = document.activeElement as HTMLElement | null
    dialog.showModal()
    return () => { dialog.close(); previous?.focus() }
  }, [])
  return <dialog ref={ref} className="dialog lifecycle-dialog" aria-labelledby="lifecycle-title" onCancel={(event) => { event.preventDefault(); if (!busyRef.current) close() }}>
    <div className="dialog__head"><h2 id="lifecycle-title">{title}</h2><button type="button" className="icon-button" aria-label="Đóng" disabled={busy} onClick={close}><Icon name="close" /></button></div>
    {children}
  </dialog>
}

export function StoreLifecyclePage({ role, homeStoreId, store, realStores, onStoresChange }: {
  role: 'OWNER' | 'STORE_MANAGER'; homeStoreId: string | null; store: string; realStores: StoreResponse[]; onStoresChange: (stores: StoreResponse[]) => void
}) {
  const [tab, setTab] = useState('Chi nhánh')
  const [query, setQuery] = useState('')
  const [action, setAction] = useState<Action | null>(null)
  const [loading, setLoading] = useState(false)
  const [listError, setListError] = useState('')
  const [notice, setNotice] = useState('')
  const lifetime = useRef({ generation: 0 })
  const refresh = useCallback(async () => {
    const generation = ++lifetime.current.generation
    setLoading(true); setListError('')
    try {
      const items = await storesApi.list()
      if (generation === lifetime.current.generation) onStoresChange(items)
      return items
    } catch (error) {
      if (generation === lifetime.current.generation) setListError(errorText(error))
      throw error
    } finally { if (generation === lifetime.current.generation) setLoading(false) }
  }, [onStoresChange])
  useEffect(() => {
    const current = lifetime.current
    let live = true
    void Promise.resolve().then(() => live ? refresh() : undefined).catch(() => {})
    return () => { live = false; current.generation++ }
  }, [refresh])
  const visible = realStores.filter(item => (role === 'OWNER' || item.id === homeStoreId) && (store === 'Toàn chuỗi' || item.name === store) && `${item.name} ${item.code} ${item.address}`.toLowerCase().includes(query.toLowerCase()))
  const open = (next: Action) => { setNotice(''); setAction(next) }
  return <>
    <div className="page-head lifecycle-head"><div><p className="eyebrow">KAFFEIN / QUẢN TRỊ</p><h1>Chi nhánh & thiết bị POS</h1><p>Mỗi chi nhánh sử dụng một máy POS đang hoạt động.</p></div>
      {role === 'OWNER' && <button className="button button--primary" onClick={() => open({ kind: 'create' })}><Icon name="plus" />Tạo chi nhánh</button>}
    </div>
    {notice && <p role="status" className="lifecycle-notice">{notice}</p>}
    {listError && <p role="alert" className="lifecycle-error">Không thể cập nhật danh sách: {listError}. Dữ liệu dưới đây là lần tải trước.</p>}
    <section className="panel table-panel" aria-busy={loading}>
      <div className="table-toolbar lifecycle-toolbar"><div className="tabs" role="tablist" aria-label="Chi nhánh và thiết bị">
        {['Chi nhánh', 'Thiết bị POS'].map(item => <button key={item} role="tab" aria-selected={tab === item} className={tab === item ? 'tab tab--active' : 'tab'} onClick={() => setTab(item)}>{item}</button>)}
      </div><div className="toolbar-actions lifecycle-toolbar-actions"><input className="lifecycle-search" aria-label="Tìm chi nhánh" placeholder="Tìm tên hoặc mã chi nhánh" value={query} onChange={event => setQuery(event.target.value)} />
        <button className="button button--secondary" disabled={loading} onClick={() => { setNotice(''); void refresh().catch(() => {}) }}>{loading ? 'Đang tải…' : 'Tải lại'}</button></div></div>
      <div className="table-scroll"><table><thead><tr><th>Chi nhánh</th><th>{tab === 'Chi nhánh' ? 'Địa chỉ' : 'Máy POS hiện tại'}</th><th>Kết nối / đồng bộ</th><th>Thao tác</th></tr></thead><tbody>
        {visible.map(item => <tr key={item.id}><td><strong>{item.name}</strong><small>{item.code}</small></td>
          <td>{tab === 'Chi nhánh' ? item.address : <><strong>{item.activeDevice?.displayName ?? (item.posDeviceId ? 'POS đang hoạt động' : 'Chưa kích hoạt')}</strong><small>{item.posDeviceId}</small><small>{item.activeDevice?.appVersion ? `Phiên bản ${item.activeDevice.appVersion}` : ''}</small></>}</td>
          <td>{!item.posDeviceId ? 'Chưa có máy' : <><span className={`badge badge--${item.posOnline ? 'green' : 'neutral'}`}>{item.posOnline ? 'Trực tuyến' : 'Mất liên lạc'}</span><small>{item.posOnline ? item.posHasPendingOutbox ? 'Còn dữ liệu chờ đồng bộ' : 'Không báo dữ liệu chờ' : 'Chưa rõ trạng thái đồng bộ'}</small><small>{date(item.posLastHeartbeat)}</small></>}</td>
          <td><div className="lifecycle-actions"><button className="button button--secondary" onClick={() => open({ kind: 'history', store: item })}>Lịch sử máy{item.revokedDeviceCount ? ` (${item.revokedDeviceCount} đã thu hồi)` : ''}</button>
            {role === 'OWNER' && <>{item.posDeviceId ? <><button className="button button--secondary" disabled={loading || !!listError} onClick={() => open({ kind: 'replace', store: item })}>Thay máy</button><button className="button button--text lifecycle-danger" disabled={loading || !!listError} onClick={() => open({ kind: 'revoke', store: item })}>Thu hồi khẩn cấp</button></> : <button className="button button--primary" disabled={loading || !!listError} onClick={() => open({ kind: 'activate', store: item })}>Cấp mã kích hoạt</button>}</>}
          </div></td></tr>)}
      </tbody></table>{visible.length === 0 && <p className="lifecycle-empty">{loading ? 'Đang tải chi nhánh…' : 'Không có chi nhánh phù hợp.'}</p>}</div>
    </section>
    {action && <LifecycleAction key={action.kind + ('store' in action ? action.store.id : '')} action={action} close={() => setAction(null)} refresh={refresh} done={(message) => { setNotice(message); setAction(null) }} />}
  </>
}

function LifecycleAction({ action, close, refresh, done }: { action: Action; close: () => void; refresh: () => Promise<StoreResponse[]>; done: (message: string) => void }) {
  const [busy, setBusy] = useState(action.kind === 'history')
  const inFlight = useRef(false)
  const [error, setError] = useState('')
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [hours, setHours] = useState(24)
  const [acknowledged, setAcknowledged] = useState(false)
  const [activation, setActivation] = useState<ActivationCodeResponse | null>(null)
  const [history, setHistory] = useState<StoreDevicesResponse | null>(null)
  const [historyRevision, setHistoryRevision] = useState(0)
  const [copyStatus, setCopyStatus] = useState('')
  const [latestStore, setLatestStore] = useState('store' in action ? action.store : null)
  const titles = { create: 'Tạo chi nhánh', activate: 'Cấp mã kích hoạt POS', replace: 'Thay máy POS', revoke: 'Thu hồi thiết bị khẩn cấp', history: 'Lịch sử thiết bị POS' }
  const storeId = 'store' in action ? action.store.id : null
  useEffect(() => {
    if (action.kind !== 'history' || !storeId) return
    let live = true
    storesApi.devices(storeId).then(value => { if (live) setHistory(value) }).catch(reason => { if (live) setError(errorText(reason)) }).finally(() => { if (live) setBusy(false) })
    return () => { live = false }
  }, [action.kind, storeId, historyRevision])
  const block = action.kind === 'replace' && latestStore ? replacementBlockReason(latestStore) : null
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (inFlight.current || activation || action.kind === 'history') return
    inFlight.current = true; setBusy(true); setError('')
    let succeeded = false
    try {
      if (action.kind === 'create') {
        await storesApi.create({ code: code.trim(), name: name.trim(), address: address.trim() }); succeeded = true
      } else {
        // Re-read immediately before mutation. Never submit against a different active device.
        const fresh = (await refresh()).find(item => item.id === action.store.id)
        if (!fresh) throw new Error('Chi nhánh không còn trong phạm vi quản lý.')
        setLatestStore(fresh)
        if (fresh.posDeviceId !== action.store.posDeviceId) throw new Error('Máy POS đã thay đổi. Đóng cửa sổ và chọn lại thiết bị.')
        if (action.kind === 'revoke') {
          if (!acknowledged || !fresh.posDeviceId) throw new Error('Cần xác nhận rủi ro thu hồi.')
          await devicesApi.revoke(fresh.posDeviceId); succeeded = true
        } else {
          if (action.kind === 'replace') {
            const reason = replacementBlockReason(fresh)
            if (reason) throw new Error(reason)
            if (!acknowledged) throw new Error('Cần xác nhận thay máy.')
          }
          setActivation(await devicesApi.createActivation(fresh.id, { reissue: action.kind === 'replace', expiresInHours: hours }))
          return
        }
      }
      await refresh()
      done(action.kind === 'create' ? 'Đã tạo chi nhánh. Bạn có thể cấp mã kích hoạt cho máy mới.' : 'Đã thu hồi quyền truy cập thiết bị. Máy ngoại tuyến chỉ nhận được thông báo khi kết nối lại.')
    } catch (reason) {
      // A successful mutation must not be retried just because the following GET failed.
      if (succeeded) done('Thao tác đã thành công, nhưng danh sách chưa cập nhật. Hãy bấm Tải lại; không thực hiện lại thao tác.')
      else setError(errorText(reason))
    } finally { inFlight.current = false; setBusy(false) }
  }
  return <LifecycleDialog title={titles[action.kind]} busy={busy} close={close}>
    {'store' in action && <p>{action.store.name} · {action.store.code}</p>}
    {error && <p role="alert" className="lifecycle-error">{error}</p>}
    {action.kind === 'history' ? <><div className="lifecycle-history" aria-busy={busy}>
      {busy && <p role="status">Đang tải lịch sử…</p>}
      {!busy && history?.devices.length === 0 && <p>Chưa có thiết bị được kích hoạt.</p>}
      {!busy && history?.devices.map(device => <article key={device.id}><strong>{device.displayName}</strong><span className={`badge badge--${device.status === 'ACTIVE' ? 'green' : 'neutral'}`}>{device.status === 'ACTIVE' ? 'Đang hoạt động' : device.status === 'REVOKED' ? 'Đã thu hồi' : device.status}</span><small>{device.id}</small><p>Phiên bản: {device.appVersion ?? 'Chưa có'}<br />Kích hoạt: {date(device.enrolledAt)}<br />Heartbeat: {date(device.lastHeartbeatAt)}<br />Thu hồi: {date(device.revokedAt)}</p></article>)}
    </div><div className="dialog__foot"><button className="button button--secondary" disabled={busy} onClick={() => { setBusy(true); setError(''); setHistory(null); setHistoryRevision(value => value + 1) }}>Tải lại</button><button className="button button--primary" disabled={busy} onClick={close}>Đóng</button></div></> : activation ? <>
      <p role="status">Đã cấp mã. {action.kind === 'replace' ? 'Máy cũ chưa bị thu hồi; việc thay máy chỉ hoàn tất khi máy mới kích hoạt thành công.' : 'Nhập mã này trên máy POS mới.'}</p>
      <label className="lifecycle-code">Mã kích hoạt<input readOnly value={activation.activationCode} aria-label="Mã kích hoạt" onFocus={event => event.target.select()} /></label>
      <p>Hết hạn: {date(activation.expiresAt)}. Mã chỉ dùng một lần; không chia sẻ công khai.</p>
      <div className="dialog__foot"><button className="button button--secondary" onClick={async () => { try { await navigator.clipboard.writeText(activation.activationCode); setCopyStatus('Đã sao chép') } catch { setCopyStatus('Không thể sao chép tự động. Chọn mã để sao chép thủ công.') } }}>Sao chép mã</button><button className="button button--primary" onClick={close}>Xong</button></div>
      <p className="lifecycle-copy-status" role="status" aria-live="polite">{copyStatus}</p>
    </> : <form onSubmit={event => void submit(event)}>
      {action.kind === 'create' ? <div className="dialog__fields">
        <label>Mã chi nhánh<input autoFocus required pattern="[A-Za-z0-9_-]+" value={code} onChange={event => setCode(event.target.value)} disabled={busy} /></label>
        <label>Tên chi nhánh<input required minLength={3} value={name} onChange={event => setName(event.target.value)} disabled={busy} /></label>
        <label>Địa chỉ<input required minLength={5} value={address} onChange={event => setAddress(event.target.value)} disabled={busy} /></label>
      </div> : <>
        {action.kind === 'revoke' ? <p className="lifecycle-error">Thu hồi ngay quyền truy cập của máy này, không xóa lịch sử. Dữ liệu chưa đồng bộ trên máy cũ có thể không gửi được nữa. Máy đang offline có thể tiếp tục bán cho đến khi nhận được xác nhận thu hồi từ server.</p> : <div className="dialog__fields"><label>Thời hạn mã (giờ)<input type="number" min={1} max={168} step={1} required value={hours} onChange={event => setHours(Number(event.target.value))} disabled={busy} /></label><p>Cấp mã mới sẽ vô hiệu hóa các mã chưa sử dụng trước đó của chi nhánh.</p></div>}
        {block && <p role="alert" className="lifecycle-error">{block}</p>}
        {(action.kind === 'replace' || action.kind === 'revoke') && <label className="lifecycle-confirm"><input type="checkbox" checked={acknowledged} disabled={busy} onChange={event => setAcknowledged(event.target.checked)} />{action.kind === 'replace' ? 'Tôi đã đối soát, đóng phiên quỹ và xử lý xong giao dịch QR trên máy cũ; đồng ý thay máy.' : 'Tôi hiểu rủi ro dữ liệu chưa đồng bộ và xác nhận thu hồi khẩn cấp.'}</label>}
      </>}
      <div className="dialog__foot"><button type="button" className="button button--secondary" disabled={busy} onClick={close}>Hủy</button><button className="button button--primary" disabled={busy || !!block || ((action.kind === 'replace' || action.kind === 'revoke') && !acknowledged)}>{busy ? 'Đang xử lý…' : action.kind === 'create' ? 'Tạo chi nhánh' : action.kind === 'revoke' ? 'Thu hồi ngay' : 'Cấp mã'}</button></div>
    </form>}
  </LifecycleDialog>
}
