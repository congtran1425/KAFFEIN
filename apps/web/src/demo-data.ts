// Bản xem trước UI. Không phải dữ liệu lấy từ API hoặc cơ sở dữ liệu.
export const stores = [
  { code: 'S01', name: 'Thảo Điền', address: '12 Nguyễn Văn Hưởng, TP. Thủ Đức', manager: 'Minh Anh', online: true },
  { code: 'S02', name: 'Bình Thạnh', address: '84 Điện Biên Phủ, Bình Thạnh', manager: 'Hoàng Nam', online: false },
  { code: 'S03', name: 'Phú Nhuận', address: '35 Phan Xích Long, Phú Nhuận', manager: 'Ngọc Hà', online: true },
]

export const products = [
  { code: 'CF-001', name: 'Cà phê đen đá', category: 'Cà phê', sizes: 'M 29.000 đ · L 35.000 đ', active: true },
  { code: 'CF-002', name: 'Cà phê sữa đá', category: 'Cà phê', sizes: 'M 35.000 đ · L 42.000 đ', active: true },
  { code: 'CF-003', name: 'Bạc xỉu', category: 'Cà phê', sizes: 'M 39.000 đ · L 47.000 đ', active: true },
  { code: 'CF-004', name: 'Cold brew', category: 'Cà phê', sizes: 'M 42.000 đ · L 49.000 đ', active: true },
  { code: 'CF-005', name: 'Caramel latte', category: 'Cà phê', sizes: 'M 49.000 đ · L 56.000 đ', active: true },
  { code: 'CF-006', name: 'Cappuccino', category: 'Cà phê', sizes: 'M 45.000 đ · L 52.000 đ', active: false },
]

export const ingredients = [
  { code: 'NL-001', name: 'Cà phê hạt', unit: 'g', stock: '12.500 g', threshold: '2.000 g', low: false },
  { code: 'NL-002', name: 'Sữa tươi', unit: 'ml', stock: '5.000 ml', threshold: '6.000 ml', low: true },
  { code: 'NL-003', name: 'Sữa đặc', unit: 'ml', stock: '8.500 ml', threshold: '2.000 ml', low: false },
  { code: 'NL-004', name: 'Đá viên', unit: 'g', stock: '35.000 g', threshold: '10.000 g', low: false },
  { code: 'NL-005', name: 'Trân châu', unit: 'g', stock: '2.400 g', threshold: '1.000 g', low: false },
]

export const employees = [
  { code: '1000001', name: 'Nguyễn Minh Anh', home: 'Thảo Điền', at: 'Thảo Điền', role: 'Cửa hàng trưởng', checkin: '06:05', checkout: '14:03', note: 'Đủ lượt' },
  { code: '1000002', name: 'Lê Hoàng Nam', home: 'Bình Thạnh', at: 'Bình Thạnh', role: 'Cửa hàng trưởng', checkin: '06:02', checkout: '—', note: 'Đang làm' },
  { code: '1000003', name: 'Nguyễn Bảo An', home: 'Thảo Điền', at: 'Bình Thạnh', role: 'Nhân viên', checkin: '13:58', checkout: '—', note: 'Làm hỗ trợ' },
  { code: '1000004', name: 'Trần Khánh Linh', home: 'Thảo Điền', at: 'Thảo Điền', role: 'Nhân viên', checkin: '06:11', checkout: '—', note: 'Quên check-out' },
  { code: '1000005', name: 'Phạm Ngọc Hà', home: 'Phú Nhuận', at: 'Phú Nhuận', role: 'Cửa hàng trưởng', checkin: '14:01', checkout: '—', note: 'Đang làm' },
]

export const receipts = [
  { code: 'HD-000128', time: '08/10/2026 · 15:18', store: 'Thảo Điền', cashier: 'Nguyễn Bảo An', method: 'Tiền mặt', total: 92000 },
  { code: 'HD-000127', time: '08/10/2026 · 15:04', store: 'Bình Thạnh', cashier: 'Lê Hoàng Nam', method: 'ZaloPay', total: 74000 },
  { code: 'HD-000126', time: '08/10/2026 · 14:52', store: 'Phú Nhuận', cashier: 'Phạm Ngọc Hà', method: 'Tiền mặt', total: 84000 },
  { code: 'HD-000125', time: '08/10/2026 · 14:31', store: 'Thảo Điền', cashier: 'Trần Khánh Linh', method: 'ZaloPay', total: 112000 },
]

export const registerSessions = [
  { id: 'CA-00128', store: 'Thảo Điền', cashier: 'Minh Anh', time: '08/10 · 14:00', opening: 1000000, difference: null, open: true },
  { id: 'CA-00127', store: 'Phú Nhuận', cashier: 'Ngọc Hà', time: '08/10 · 14:00', opening: 1000000, difference: null, open: true },
  { id: 'CA-00126', store: 'Bình Thạnh', cashier: 'Hoàng Nam', time: '08/10 · 06:00–14:00', opening: 1000000, difference: -10000, open: false },
]
