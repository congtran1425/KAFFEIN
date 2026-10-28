import { useEffect, useRef, type ReactNode } from 'react'
import type { RegisterSessionSummaryItem } from './services/api'

const formatDateTimeVN = (value?: string | null) => value ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '—'
function Badge({ tone = 'neutral', children }: { tone?: string; children: ReactNode }) {
  return <span className={'badge badge--' + tone}>{children}</span>
}
export function registerMoney(value: string | bigint | null | undefined) {
  return `${BigInt(value ?? 0).toLocaleString('vi-VN')} đ`
}
export function RegisterVariance({ session }: { session: RegisterSessionSummaryItem }) {
  if (session.varianceVnd == null) return <>—</>
  const variance = BigInt(session.varianceVnd)
  return <><Badge tone={variance > 0n ? 'green' : variance < 0n ? 'red' : 'neutral'}>
    {variance > 0n ? '+' : ''}{registerMoney(variance)} · {variance > 0n ? 'Thừa quỹ' : variance < 0n ? 'Thiếu quỹ' : 'Khớp'}
  </Badge>{session.compensationCashVnd != null && <small style={{ display: 'block' }}>Đã nộp bù: +{registerMoney(session.compensationCashVnd)}</small>}</>
}
function RegisterCountTable({ counts }: { counts: Record<string, number> | null | undefined }) {
  if (!counts || !Object.keys(counts).length) return <p>Không có bảng kê mệnh giá.</p>
  return <table><thead><tr><th>Mệnh giá</th><th>Số tờ</th><th>Thành tiền</th></tr></thead><tbody>
    {Object.entries(counts).sort(([a], [b]) => Number(b) - Number(a)).map(([denom, count]) => <tr key={denom}>
      <td>{registerMoney(denom)}</td><td>{count}</td><td>{registerMoney(BigInt(denom) * BigInt(count))}</td>
    </tr>)}
  </tbody></table>
}
export function RegisterSessionDenominationModal({ session, onClose }: { session: RegisterSessionSummaryItem; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { const dialog = ref.current; if (dialog && !dialog.open) dialog.showModal() }, [])
  const shortage = session.varianceVnd != null && BigInt(session.varianceVnd) < 0n
  const compensation = BigInt(session.compensationCashVnd ?? 0)
  return <dialog ref={ref} className="dialog" style={{ width: 'min(calc(100% - 2rem), 1180px)', maxHeight: '90dvh', padding: '1.5rem' }} onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose() }}>
    <div className="dialog__head"><div><h2>Bảng kê tiền mặt · {session.id.slice(0, 8).toUpperCase()}</h2><p>{session.storeName}</p></div>
      <button type="button" className="button button--text" aria-label="Đóng chi tiết" onClick={onClose}>✕</button></div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
      <section className="panel"><h3>Quỹ đầu ca</h3><p>{session.openedByName} · {formatDateTimeVN(session.openedAt)}</p>
        <strong>{registerMoney(session.openingCashVnd)}</strong><RegisterCountTable counts={session.openingDenominations} />
        {session.handoverFromSessionId && <p>Nhận từ phiên {session.handoverFromSessionId.slice(0, 8).toUpperCase()}</p>}
      </section>
      <section className="panel"><h3>Kiểm kê chốt két</h3>{session.status === 'OPEN' ? <p>Phiên đang mở.</p> : <>
        <p>{session.closedByName ?? '—'} · {formatDateTimeVN(session.closedAt)}</p>
        <p>Thực đếm ban đầu: <strong>{session.actualCashVnd == null ? '—' : registerMoney(session.actualCashVnd)}</strong></p>
        <p>Theo sổ: {session.expectedCashVnd == null ? '—' : registerMoney(session.expectedCashVnd)}</p><RegisterVariance session={session} />
        <RegisterCountTable counts={session.closingDenominations} />
      </>}</section>
      <section className="panel"><h3>Bồi hoàn thiếu quỹ</h3>{shortage ? <>
        {session.compensationCashVnd == null ? <p>Phiên cũ chưa có dữ liệu tiền bù.</p> : <>
          <Badge tone={compensation >= -BigInt(session.varianceVnd!) ? 'green' : 'red'}>
            {compensation > -BigInt(session.varianceVnd!) ? 'Bù vượt mức' : compensation === -BigInt(session.varianceVnd!) ? 'Đã bù đủ' : 'Chưa bù đủ'}
          </Badge><p>Đã nộp bù: <strong>{registerMoney(compensation)}</strong></p>
          <p>Tiền trong két sau bù: {registerMoney(BigInt(session.actualCashVnd ?? 0) + compensation)}</p>
          <RegisterCountTable counts={session.compensationDenominations} />
          {session.compensationNote && <p>{session.compensationNote}</p>}
        </>}
      </> : <p>Phiên quỹ không phát sinh thiếu hụt. Không cần bồi hoàn.</p>}</section>
    </div>
    <div className="dialog__actions"><button className="button button--secondary" onClick={onClose}>Đóng</button></div>
  </dialog>
}
