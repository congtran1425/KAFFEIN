import { useEffect, useState } from 'react'
import { paymentsApi, type CancelledQrReceipt } from './services/api'

/** Incoming money is visible without turning a cancelled checkout into revenue. */
export function CancelledQrReceipts() {
  const [data, setData] = useState<{ total: number; items: CancelledQrReceipt[] } | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    let active = true
    let running = false
    const refresh = async () => {
      if (running) return
      running = true
      try {
        const result = await paymentsApi.cancelledReceipts()
        if (active) { setData(result); setError(false) }
      } catch { if (active) setError(true) }
      finally { running = false }
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), 30_000)
    return () => { active = false; window.clearInterval(timer) }
  }, [])

  if (!error && !data?.total) return null
  return <section className="panel" aria-label="Tiền nhận sau khi hủy QR">
    <h2>Thanh toán QR cần đối soát{data ? ` (${data.total})` : ''}</h2>
    {error && <p role="alert">Chưa tải được danh sách tiền nhận sau khi hủy QR.</p>}
    {!!data?.total && <>
      <p>Khách đã trả vào QR được hủy trước đó. Các khoản này chưa được tính vào doanh thu; cần kiểm tra với khách và cổng thanh toán.</p>
      <table><thead><tr><th>Chi nhánh</th><th>Mã đơn</th><th>Số tiền</th><th>Mã giao dịch cổng thanh toán</th><th>Nhận tiền lúc</th></tr></thead>
        <tbody>{data.items.map((item) => <tr key={item.id}>
          <td>{item.storeName}</td><td>{item.saleNumber}</td>
          <td>{Number(item.amountVnd).toLocaleString('vi-VN')} đ</td>
          <td>{item.providerTransactionId}</td>
          <td>{new Date(item.receivedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</td>
        </tr>)}</tbody></table>
      {data.total > data.items.length && <p>Hiển thị {data.items.length} khoản gần nhất trong tổng số {data.total} khoản.</p>}
    </>}
  </section>
}
