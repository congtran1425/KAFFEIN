/**
 * Central API client for the KAFFEIN Web Admin Console.
 *
 * Responsibilities:
 *  - Prepend base URL (reads from VITE_API_BASE_URL env or defaults to localhost:3000)
 *  - Attach Authorization: Bearer <token> from localStorage automatically
 *  - Parse RFC 9457 Problem Details errors into Vietnamese user-facing messages
 *  - Throw ApiError for all non-2xx responses
 */

const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:3000/api/v1'

export class ApiError extends Error {
  readonly status: number
  readonly detail?: string

  constructor(status: number, message: string, detail?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}


function getToken(): string | null {
  return localStorage.getItem('access_token')
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  skipAuth = false,
  extraHeaders?: Record<string, string>,
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...extraHeaders }
  if (!skipAuth) {
    const token = getToken()
    if (token) headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (res.ok) {
    const text = await res.text()
    return text ? (JSON.parse(text) as T) : (undefined as unknown as T)
  }

  // Parse Problem Details (RFC 9457) or plain JSON error
  let message = `Lỗi ${res.status}`
  let detail: string | undefined
  try {
    const err = await res.json()
    message = err.title ?? err.message ?? message
    detail = err.detail ?? err.error
  } catch {
    // ignore parse error
  }
  throw new ApiError(res.status, message, detail)
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export interface LoginResponse {
  accessToken: string
  userId: string
  role: 'OWNER' | 'STORE_MANAGER'
  homeStoreId: string | null
  fullName: string
  expiresIn: number
}

export interface MeResponse {
  userId: string
  fullName: string
  role: 'OWNER' | 'STORE_MANAGER'
  homeStoreId: string | null
}

export const authApi = {
  login: (email: string, password: string) =>
    request<LoginResponse>('POST', '/auth/web/login', { email, password }, true),

  me: () => request<MeResponse>('GET', '/auth/me'),
}

export interface CancelledQrReceipt {
  id: string
  saleId: string
  saleNumber: string
  storeId: string
  storeName: string
  method: string
  amountVnd: string
  merchantOrderId: string | null
  providerTransactionId: string | null
  cancelledAt?: string
  receivedAt: string
}

export const paymentsApi = {
  cancelledReceipts: () => request<{ total: number; items: CancelledQrReceipt[] }>(
    'GET', '/payments/online/cancelled-receipts',
  ),
}

// ─── Stores ──────────────────────────────────────────────────────────────────

export interface StoreResponse {
  id: string
  code: string
  name: string
  address: string
  posDeviceId: string | null
  posLastHeartbeat: string | null
  posOnline: boolean
  posHasPendingOutbox: boolean
  activeDevice?: {
    id: string
    displayName: string
    appVersion: string | null
    lastHeartbeatAt: string | null
    isOnline: boolean
    hasPendingOutbox: boolean
  } | null
  revokedDeviceCount?: number
}

export const storesApi = {
  list: () => request<StoreResponse[]>('GET', '/auth/stores'),
  create: (body: { code: string; name: string; address: string }) =>
    request<{ id: string; code: string; name: string; address: string; status: string }>('POST', '/stores', body),
  devices: (storeId: string) => request<StoreDevicesResponse>('GET', `/stores/${encodeURIComponent(storeId)}/devices`),
}

export interface StoreDevicesResponse {
  storeId: string
  storeName: string
  devices: {
    id: string
    displayName: string
    status: string
    appVersion: string | null
    enrolledAt: string
    lastHeartbeatAt: string | null
    revokedAt: string | null
  }[]
}

// ─── Catalog ─────────────────────────────────────────────────────────────────

export interface VariantResponse {
  id: string
  code: string
  sizeLabel: string | null
  priceVnd: string
  isDefault: boolean
}

export interface ToppingResponse {
  id: string
  code: string
  name: string
  priceVnd: string
  isActive?: boolean
}

export interface ProductResponse {
  id: string
  code: string
  name: string
  isActive: boolean
  description: string | null
  category: { id: string; name: string; taxRateBps: number }
  variants: VariantResponse[]
  toppings: ToppingResponse[]
  updatedAt: string
}

export interface CategoryResponse {
  id: string
  name: string
  sortOrder: number
  taxRateBps: number
  updatedAt: string
}

export const catalogApi = {
  products: () => request<ProductResponse[]>('GET', '/products'),
  webProducts: () => request<ProductResponse[]>('GET', '/web/products'),
  categories: () => request<CategoryResponse[]>('GET', '/product-categories'),
  toppings: () => request<ToppingResponse[]>('GET', '/web/toppings'),
  toggleStatus: (productId: string, isActive: boolean) =>
    request('PATCH', `/products/${productId}/status`, { isActive }),
  updateVariantPrice: (variantId: string, priceVnd: string) =>
    request('PATCH', `/product-variants/${variantId}/price`, { priceVnd }),
  updateCategoryTax: (categoryId: string, taxRateBps: number) =>
    request('PATCH', `/product-categories/${categoryId}/tax`, { taxRateBps }),
  updateToppingPrice: (toppingId: string, priceVnd: string) =>
    request('PATCH', `/toppings/${toppingId}/price`, { priceVnd }),
}

// ─── Inventory ───────────────────────────────────────────────────────────────

export interface IngredientResponse {
  id: string
  code: string
  name: string
  baseUnit: string
  isActive: boolean
}

export interface StockBalanceResponse {
  storeId: string
  ingredientId: string
  ingredientCode: string
  ingredientName: string
  baseUnit: string
  quantity: number
  updatedAt: string
}

export interface StockAdjustmentItem {
  ingredientId: string
  quantityDelta: number
}

export interface RecipeResponse {
  id: string
  productVariantId: string
  versionNo: number
  status: string
  items: Array<{
    ingredientId: string
    ingredientCode: string
    ingredientName: string
    baseUnit: string
    quantity: number
  }>
}

export const inventoryApi = {
  ingredients: () => request<IngredientResponse[]>('GET', '/ingredients'),
  recipes: () => request<RecipeResponse[]>('GET', '/recipes'),
  stockBalances: (storeId: string) =>
    request<StockBalanceResponse[]>('GET', `/stores/${storeId}/stock-balances`),
  adjust: (
    storeId: string,
    movementType: 'RECEIPT' | 'ADJUSTMENT' | 'WASTE',
    items: StockAdjustmentItem[],
    reason?: string,
  ) =>
    request<StockBalanceResponse[]>('POST', `/stores/${storeId}/stock-adjustments`, {
      movementType,
      items,
      reason,
    }),
}

// Stock receipts are store-scoped. Creating a draft never changes the stock balance;
// only the explicit post operation does so on the server.
export type StockReceiptSourceType = 'EXTERNAL_SUPPLIER' | 'CENTRAL_WAREHOUSE_UNTRACKED'
export type StockReceiptStatus = 'DRAFT' | 'REVIEWED' | 'POSTED' | 'REJECTED'

export interface StockReceiptLineInput {
  ingredientId: string
  receivedQuantity: number
  unitCostVnd: number
  note?: string
}

export interface StockReceiptInput {
  sourceType: StockReceiptSourceType
  sourceName: string
  documentNo?: string
  documentDate?: string
  note?: string
  lines: StockReceiptLineInput[]
}

export interface StockReceiptLineResponse {
  id: string
  ingredientId: string
  ingredientCode: string
  ingredientName: string
  lineNumber: number
  receivedQuantity: number
  baseUnit: string
  unitCostVnd: string
  lineTotalVnd: string
  note: string | null
  validationErrors: string | null
}

export interface StockReceiptResponse {
  id: string
  storeId: string
  receiptCode: string
  sourceType: StockReceiptSourceType
  sourceName: string
  documentNo: string | null
  documentDate: string | null
  status: StockReceiptStatus
  totalCostVnd: string
  note: string | null
  rejectionReason: string | null
  createdByName: string
  reviewedByName: string | null
  postedByName: string | null
  postedAt: string | null
  createdAt: string
  lines: StockReceiptLineResponse[]
}

export interface StockReceiptListItem {
  id: string
  storeId: string
  receiptCode: string
  sourceType: StockReceiptSourceType
  sourceName: string
  documentNo: string | null
  status: StockReceiptStatus
  totalCostVnd: string
  lineCount: number
  createdByName: string
  postedByName: string | null
  postedAt: string | null
  createdAt: string
}

export interface PaginatedStockReceiptsResponse {
  items: StockReceiptListItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export const stockReceiptsApi = {
  list: (storeId: string, filters: { status?: StockReceiptStatus; sourceType?: StockReceiptSourceType; page: number }) => {
    const query = new URLSearchParams({ page: String(filters.page), pageSize: '20' })
    if (filters.status) query.set('status', filters.status)
    if (filters.sourceType) query.set('sourceType', filters.sourceType)
    return request<PaginatedStockReceiptsResponse>('GET', `/stores/${storeId}/stock-receipts?${query}`)
  },
  detail: (id: string) => request<StockReceiptResponse>('GET', `/stock-receipts/${id}`),
  create: (storeId: string, body: StockReceiptInput) =>
    request<StockReceiptResponse>('POST', `/stores/${storeId}/stock-receipts`, body),
  update: (id: string, body: StockReceiptInput) =>
    request<StockReceiptResponse>('PATCH', `/stock-receipts/${id}`, body),
  importCsv: (storeId: string, body: Omit<StockReceiptInput, 'lines'> & { csvContent: string }) =>
    request<StockReceiptResponse>('POST', `/stores/${storeId}/stock-receipts/import-csv`, body),
  post: (id: string, idempotencyKey: string) =>
    request<StockReceiptResponse>('POST', `/stock-receipts/${id}/post`, undefined, false, { 'idempotency-key': idempotencyKey }),
  reject: (id: string, reason: string) =>
    request<StockReceiptResponse>('POST', `/stock-receipts/${id}/reject`, { reason }),
}

// ─── Sales ───────────────────────────────────────────────────────────────────

export interface SaleSummaryItem {
  id: string
  saleNumber: string
  storeId: string
  storeName: string
  cashierName: string
  status: string
  subtotalVnd: string
  taxVnd: string
  totalVnd: string
  completedAt: string | null
  createdAt: string
  paymentMethod: string
  itemCount: number
}

export interface PaginatedSalesResponse {
  items: SaleSummaryItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface SaleDetailItem {
  id: string
  productId: string
  productName: string
  variantId: string
  variantName: string
  baseUnitPriceVnd: string
  quantity: number
  taxRateBps: number
  taxAmountVnd: string
  subtotalVnd: string
  lineTotalVnd: string
  note?: string
  toppings: Array<{
    id: string
    toppingId: string
    toppingName: string
    unitPriceVnd: string
    quantityPerItem: number
  }>
  consumptions: Array<{
    id: string
    ingredientId: string
    ingredientName: string
    baseUnit: string
    quantityPerItem: number
    quantityTotal: number
  }>
}

export interface SaleResponse {
  id: string
  storeId: string
  deviceId: string
  cashierUserId: string
  registerSessionId?: string
  saleNumber: string
  status: string
  subtotalVnd: string
  taxVnd: string
  totalVnd: string
  note?: string
  businessDate: string
  completedAt: string
  createdAt: string
  items: SaleDetailItem[]
  payments: Array<{
    id: string
    method: string
    provider?: string
    status: string
    amountVnd: string
    paidAt?: string
  }>
}

export const salesApi = {
  list: (params?: {
    storeId?: string
    page?: number
    pageSize?: number
    search?: string
    paymentMethod?: string
    fromDate?: string
    toDate?: string
  }) => {
    const query = new URLSearchParams()
    if (params?.storeId) query.set('storeId', params.storeId)
    if (params?.page) query.set('page', params.page.toString())
    if (params?.pageSize) query.set('pageSize', params.pageSize.toString())
    if (params?.search) query.set('search', params.search)
    if (params?.paymentMethod) query.set('paymentMethod', params.paymentMethod)
    if (params?.fromDate) query.set('fromDate', params.fromDate)
    if (params?.toDate) query.set('toDate', params.toDate)
    const qs = query.toString() ? `?${query.toString()}` : ''
    return request<PaginatedSalesResponse>('GET', `/sales${qs}`)
  },
  get: (saleId: string) => request<SaleResponse>('GET', `/sales/${saleId}`),
}

// ─── Register Sessions ───────────────────────────────────────────────────────

export interface RegisterSessionSummaryItem {
  compensationCashVnd?: string | null
  compensationDenominations?: Record<string, number> | null
  compensationNote?: string | null
  closingMode?: string | null
  handoverFromSessionId?: string | null
  id: string
  storeId: string
  storeName: string
  deviceId: string
  openedByUserId: string
  openedByName: string
  closedByUserId: string | null
  closedByName: string | null
  openingCashVnd: string
  expectedCashVnd: string | null
  actualCashVnd: string | null
  varianceVnd: string | null
  openingDenominations: Record<string, number> | null
  closingDenominations: Record<string, number> | null
  status: string
  openedAt: string
  closedAt: string | null
}

export interface PaginatedRegisterSessionsResponse {
  summary: {
    openCount: number
    openingCashVnd: string
    surplusCount: number
    surplusCashVnd: string
    shortageCount: number
    shortageCashVnd: string
    compensationCashVnd: string
  }
  items: RegisterSessionSummaryItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export const registerSessionsApi = {
  list: (params?: {
    storeId?: string
    status?: string
    variance?: string
    page?: number
    pageSize?: number
  }) => {
    const query = new URLSearchParams()
    if (params?.storeId) query.set('storeId', params.storeId)
    if (params?.status) query.set('status', params.status)
    if (params?.variance) query.set('variance', params.variance)
    if (params?.page) query.set('page', params.page.toString())
    if (params?.pageSize) query.set('pageSize', params.pageSize.toString())
    const qs = query.toString() ? `?${query.toString()}` : ''
    return request<PaginatedRegisterSessionsResponse>('GET', `/register-sessions${qs}`)
  },
  current: () => request<RegisterSessionSummaryItem | null>('GET', '/register-sessions/current'),
}

// ─── Reports & Analytics ─────────────────────────────────────────────────────

export interface HourlyRevenueItem {
  hourLabel: string
  revenueVnd: string
  orderCount: number
}

export interface TopProductItem {
  productId: string
  productName: string
  variantName: string
  quantitySold: number
  totalRevenueVnd: string
}

export interface DashboardResponse {
  kpi: {
    todayRevenueVnd: string
    todayOrderCount: number
    averageOrderValueVnd: string
    stockAlertCount: number
  }
  hourlyRevenue: HourlyRevenueItem[]
  topProducts: TopProductItem[]
}

export const reportsApi = {
  dashboard: (params?: { storeId?: string; date?: string }) => {
    const query = new URLSearchParams()
    if (params?.storeId) query.set('storeId', params.storeId)
    if (params?.date) query.set('date', params.date)
    const qs = query.toString() ? `?${query.toString()}` : ''
    return request<DashboardResponse>('GET', `/reports/dashboard${qs}`)
  },
  topProducts: (params?: { storeId?: string; limit?: number }) => {
    const query = new URLSearchParams()
    if (params?.storeId) query.set('storeId', params.storeId)
    if (params?.limit) query.set('limit', params.limit.toString())
    const qs = query.toString() ? `?${query.toString()}` : ''
    return request<TopProductItem[]>('GET', `/reports/top-products${qs}`)
  },
}


// ─── Devices ─────────────────────────────────────────────────────────────────

export interface ActivationCodeResponse {
  activationCode: string
  expiresAt: string
  storeId: string
}


export const devicesApi = {
  createActivation: (storeId: string, options: { reissue?: boolean; expiresInHours?: number } = {}) =>
    request<ActivationCodeResponse>('POST', '/device-activations', { storeId, ...options }),
  revoke: (deviceId: string) =>
    request<{ success: boolean; deviceId: string; status: string }>('POST', `/devices/${encodeURIComponent(deviceId)}/revoke`),
}

// ─── Employees ───────────────────────────────────────────────────────────────

export interface EmployeeItem {
  id: string
  employeeCode: string
  fullName: string
  role: string
  status: string
  homeStoreId: string | null
  homeStoreName: string | null
  homeStoreCode: string | null
  createdAt: string
}

export interface PaginatedEmployeesResponse {
  items: EmployeeItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface TransferHistoryItem {
  id: string
  userId: string
  fromStoreId: string
  fromStoreName: string
  toStoreId: string
  toStoreName: string
  transferredByUserId: string
  transferredByName: string
  effectiveAt: string
  reason: string | null
  createdAt: string
}

export const employeesApi = {
  create: (payload: {
    fullName: string
    role: 'EMPLOYEE' | 'STORE_MANAGER'
    homeStoreId: string
    pin: string
    email?: string
    webPassword?: string
  }) => request<EmployeeItem>('POST', '/employees', payload),
  resetPin: (employeeId: string, pin: string) =>
    request<{ employeeId: string; pinVersion: number }>(
      'POST',
      `/employees/${employeeId}/reset-pin`,
      { pin },
    ),
  update: (employeeId: string, payload: { fullName?: string; status?: 'ACTIVE' | 'SUSPENDED' | 'TERMINATED' }) =>
    request<EmployeeItem>('PATCH', `/employees/${employeeId}`, payload),
  list: (params?: {
    storeId?: string
    search?: string
    role?: string
    status?: string
    page?: number
    pageSize?: number
  }) => {
    const query = new URLSearchParams()
    if (params?.storeId) query.set('storeId', params.storeId)
    if (params?.search) query.set('search', params.search)
    if (params?.role) query.set('role', params.role)
    if (params?.status) query.set('status', params.status)
    if (params?.page) query.set('page', params.page.toString())
    if (params?.pageSize) query.set('pageSize', params.pageSize.toString())
    const qs = query.toString() ? `?${query.toString()}` : ''
    return request<PaginatedEmployeesResponse>('GET', `/employees${qs}`)
  },
  transfer: (employeeId: string, toStoreId: string, reason?: string) =>
    request<EmployeeItem>('POST', `/employees/${employeeId}/transfer`, { toStoreId, reason }),
  transferHistory: (employeeId: string) =>
    request<TransferHistoryItem[]>('GET', `/employees/${employeeId}/transfers`),
}

// ─── Attendance ─────────────────────────────────────────────────────────────

export interface AttendanceRecordItem {
  id: string
  userId: string
  employeeCode: string
  fullName: string
  role: string
  homeStoreId: string
  homeStoreName: string
  storeId: string
  storeName: string
  checkInAt: string
  checkOutAt: string | null
  isSupport: boolean
  isMissedCheckout: boolean
  isManualEntry: boolean
  note: string
}

export interface PaginatedAttendanceResponse {
  items: AttendanceRecordItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface AttendanceSummaryResponse {
  totalEmployees: number
  activeCount: number
  abnormalCount: number
}

export const attendanceApi = {
  list: (params?: {
    storeId?: string
    date?: string
    fromDate?: string
    toDate?: string
    search?: string
    isSupport?: boolean
    isMissedCheckout?: boolean
    page?: number
    pageSize?: number
  }) => {
    const query = new URLSearchParams()
    if (params?.storeId) query.set('storeId', params.storeId)
    if (params?.date) query.set('date', params.date)
    if (params?.fromDate) query.set('fromDate', params.fromDate)
    if (params?.toDate) query.set('toDate', params.toDate)
    if (params?.search) query.set('search', params.search)
    if (params?.isSupport !== undefined) query.set('isSupport', String(params.isSupport))
    if (params?.isMissedCheckout !== undefined)
      query.set('isMissedCheckout', String(params.isMissedCheckout))
    if (params?.page) query.set('page', params.page.toString())
    if (params?.pageSize) query.set('pageSize', params.pageSize.toString())
    const qs = query.toString() ? `?${query.toString()}` : ''
    return request<PaginatedAttendanceResponse>('GET', `/attendance${qs}`)
  },
  summary: (storeId?: string) => {
    const qs = storeId ? `?storeId=${encodeURIComponent(storeId)}` : ''
    return request<AttendanceSummaryResponse>('GET', `/attendance/summary${qs}`)
  },
  adjust: (
    attendanceId: string,
    payload: { checkInAt?: string; checkOutAt?: string; reason: string },
  ) => request<AttendanceRecordItem>('PATCH', `/attendance/${attendanceId}`, payload),
  createManual: (payload: {
    userId: string
    storeId: string
    checkInAt: string
    checkOutAt: string
    reason: string
  }) => request<AttendanceRecordItem>('POST', '/attendance/manual', payload),
}
