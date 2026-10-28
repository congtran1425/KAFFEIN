import type { StoreResponse } from './services/api'

/** UI guard only. The API must repeat these checks at enrollment time. */
export function replacementBlockReason(store: StoreResponse, now = Date.now()): string | null {
  if (!store.posDeviceId) return 'Không còn thiết bị đang hoạt động. Hãy cấp mã kích hoạt mới.'
  const heartbeat = Date.parse(store.posLastHeartbeat ?? '')
  if (!store.posOnline || !Number.isFinite(heartbeat) || now - heartbeat > 90_000 || heartbeat > now + 5_000) {
    return 'Máy cũ mất liên lạc hoặc chưa có heartbeat mới. Không thể xác nhận dữ liệu đã đồng bộ.'
  }
  if (store.posHasPendingOutbox !== false) return 'Máy cũ còn dữ liệu chờ đồng bộ. Hãy hoàn tất đồng bộ trước khi thay máy.'
  return null
}
