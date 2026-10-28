import { registerMoney, RegisterVariance, RegisterSessionDenominationModal } from './RegisterDetails'
import { useCallback, useEffect, useRef, useState } from 'react'
import { CancelledQrReceipts } from './CancelledQrReceipts'
import type { FormEvent, ReactNode } from 'react'
import { Icon, type IconName } from './Icon'
import loginHero from './assets/login-hero.png'
import kaffeinLogo from './assets/kaffein-logo.png'
import './App.css'
import { rowsForStore } from './inventorySnapshot'
import { StockReceiptsPage } from './StockReceipts'
import { StoreLifecyclePage } from './StoreLifecyclePage'
import { useAuth, type Role } from './context/AuthContext'
import {
  storesApi,
  catalogApi,
  salesApi,
  registerSessionsApi,
  reportsApi,
  employeesApi,
  attendanceApi,
  inventoryApi,
  type StoreResponse,
  type ProductResponse,
  type CategoryResponse,
  type ToppingResponse,
  type StockBalanceResponse,
  type IngredientResponse,
  type RecipeResponse,
  type DashboardResponse,
  type SaleSummaryItem,
  type SaleResponse as ApiSaleDetail,
  type RegisterSessionSummaryItem,
  type EmployeeItem,
  type AttendanceRecordItem,
  type AttendanceSummaryResponse,
} from './services/api'



type Page = 'dashboard' | 'stores' | 'menu-products' | 'menu-categories' | 'menu-toppings' | 'inventory-balances' | 'inventory-ingredients' | 'inventory-recipes' | 'inventory-receipts' | 'hr-attendance' | 'hr-employees' | 'sales' | 'register'
type Modal = 'transfer' | 'stock' | 'attendance' | 'create-employee' | 'reset-pin' | 'edit-employee' | null

const pageTitle: Record<Page, string> = {
  dashboard: 'Tổng quan',
  stores: 'Chi nhánh & POS',
  'menu-products': 'Món & biến thể giá',
  'menu-categories': 'Danh mục & VAT',
  'menu-toppings': 'Topping bán kèm',
  'inventory-balances': 'Tồn kho chi nhánh',
  'inventory-ingredients': 'Nguyên liệu',
  'inventory-recipes': 'Định mức công thức',
  'inventory-receipts': 'Phiếu nhập hàng',
  'hr-attendance': 'Chấm công',
  'hr-employees': 'Nhân viên',
  sales: 'Hóa đơn',
  register: 'Phiên tiền mặt',
}

interface NavGroup {
  id: string
  label: string
  icon: IconName
  items: { page: Page; icon: IconName }[]
}

const navGroups: NavGroup[] = [
  { id: 'stores', label: 'Điều hành chuỗi', icon: 'store', items: [
    { page: 'stores', icon: 'store' },
  ] },
  { id: 'menu', label: 'Thực đơn & Bán lẻ', icon: 'coffee', items: [
    { page: 'menu-products', icon: 'coffee' },
    { page: 'menu-categories', icon: 'menu' },
    { page: 'menu-toppings', icon: 'plus' },
  ] },
  { id: 'recipes', label: 'Nguyên liệu & Công thức', icon: 'receipt', items: [
    { page: 'inventory-ingredients', icon: 'bars' },
    { page: 'inventory-recipes', icon: 'receipt' },
  ] },
  { id: 'inventory', label: 'Quản lý kho', icon: 'box', items: [
    { page: 'inventory-balances', icon: 'box' },
    { page: 'inventory-receipts', icon: 'box' },
  ] },
  { id: 'hr', label: 'Nhân sự & Chấm công', icon: 'users', items: [
    { page: 'hr-employees', icon: 'users' },
    { page: 'hr-attendance', icon: 'clock' },
  ] },
  { id: 'finance', label: 'Tài chính & Báo cáo', icon: 'wallet', items: [
    { page: 'sales', icon: 'receipt' },
    { page: 'register', icon: 'wallet' },
  ] },
]

const getGroupIdForPage = (targetPage: Page): string | null =>
  navGroups.find(group => group.items.some(item => item.page === targetPage))?.id ?? null

const formatMoney = (amount: number) => new Intl.NumberFormat('vi-VN').format(amount) + ' đ'
const formatDateTimeVN = (isoString?: string | null) => {
  if (!isoString) return '—'
  const date = new Date(isoString)
  if (isNaN(date.getTime())) return isoString
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}
const getPage = (): Page => {
  const path = window.location.pathname.slice(1)
  if (path === 'hr') return 'hr-attendance'
  if (path === 'menu') return 'menu-products'
  if (path === 'recipes') return 'inventory-recipes'
  if (path === 'ingredients') return 'inventory-ingredients'
  if (path === 'inventory') return 'inventory-balances'
  if (path === 'inventory-adjustments') return 'inventory-balances'
  return path in pageTitle ? (path as Page) : 'dashboard'
}

function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'green' | 'red' | 'amber' | 'blue'
  children: ReactNode
}) {
  return <span className={'badge badge--' + tone}>{children}</span>
}

function Button({
  children,
  icon,
  onClick,
  variant = 'primary',
  disabled,
  title,
}: {
  children: ReactNode
  icon?: IconName
  onClick?: () => void
  variant?: 'primary' | 'secondary' | 'text'
  disabled?: boolean
  title?: string
}) {
  return (
    <button
      type="button"
      className={'button button--' + variant}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {icon && <Icon name={icon} size={17} />}
      {children}
    </button>
  )
}

function Head({
  title,
  subtitle,
  eyebrow = 'KAFFEIN / QUẢN TRỊ',
}: {
  title: string
  subtitle: string
  eyebrow?: string
}) {
  return (
    <div className="page-head">
      <span className="eyebrow">{eyebrow}</span>
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </div>
  )
}

function SectionHead({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children?: ReactNode
}) {
  return (
    <div className="section-head">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

function Stat({
  title,
  value,
  detail,
  icon,
  tone = 'neutral',
}: {
  title: string
  value: string
  detail: string
  icon: IconName
  tone?: 'neutral' | 'amber' | 'green' | 'red'
}) {
  return (
    <article className="stat">
      <div className="stat__top">
        <span>{title}</span>
        <span className={'stat__icon stat__icon--' + tone}>
          <Icon name={icon} size={19} />
        </span>
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  )
}

function Search({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  return (
    <label className="search">
      <Icon name="search" size={17} />
      <span className="sr-only">{placeholder}</span>
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  )
}

function Empty({ query }: { query: string }) {
  return (
    <div className="empty">
      <Icon name="search" size={28} />
      <strong>Không có kết quả phù hợp</strong>
      <p>Không tìm thấy mục nào cho “{query}”. Hãy thử từ khóa khác.</p>
    </div>
  )
}

function Login() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!email.trim() || !password) {
      setErrorMsg('Vui lòng nhập đầy đủ email và mật khẩu.')
      return
    }
    setLoading(true)
    setErrorMsg(null)
    try {
      await login(email.trim(), password)
    } catch (err: any) {
      setErrorMsg(err.message || 'Email hoặc mật khẩu không chính xác.')
    } finally {
      setLoading(false)
    }
  }

  const fillDemo = (demoEmail: string) => {
    setEmail(demoEmail)
    setPassword('123456')
    setErrorMsg(null)
  }

  return (
    <div className="login">
      <section className="login__story">
        <div className="brand">
          <span className="brand__mark">
            <img src={kaffeinLogo} alt="KAFFEIN" style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'contain' }} />
          </span>
          <span>
            <strong>KAFFEIN</strong>
            <small>QUẢN TRỊ CHUỖI CÀ PHÊ</small>
          </span>
        </div>
        <div className="login__story-copy">
          <span className="eyebrow">ĐIỀU HÀNH TINH GỌN</span>
          <h1>Một góc nhìn rõ ràng cho mọi chi nhánh.</h1>
          <p>
            Từ thực đơn đến nguyên liệu, từ ca làm đến doanh thu — mọi thứ ở đúng nơi để bạn ra quyết định.
          </p>
        </div>
        <div className="login__hero-media" aria-hidden="true">
          <img src={loginHero} alt="" className="login__hero-img" />
          <div className="login__hero-overlay" />
        </div>
        <small>KAFFEIN · HỆ THỐNG QUẢN TRỊ CHUỖI CÀ PHÊ</small>
      </section>

      <main className="login__main">
        <div className="login__card">
          <span className="eyebrow">BẢNG ĐIỀU KHIỂN QUẢN TRỊ</span>
          <h2>Đăng nhập hệ thống</h2>
          <p>Hệ thống tự động nhận diện quyền Chủ chuỗi hoặc Cửa hàng trưởng.</p>

          <form onSubmit={submit}>
            <label htmlFor="email">Email quản trị</label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              placeholder="owner@kaffein.vn"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              required
            />

            <label htmlFor="password">Mật khẩu</label>
            <div className="password">
              <input
                id="password"
                type={show ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Nhập mật khẩu"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                required
              />
              <button
                type="button"
                aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                onClick={() => setShow(!show)}
              >
                <Icon name={show ? 'eyeOff' : 'eye'} />
              </button>
            </div>

            {errorMsg && (
              <div className="login__error-box" role="alert">
                <Icon name="alert" size={16} />
                <span>{errorMsg}</span>
              </div>
            )}

            <button
              className="button button--primary login__submit"
              type="submit"
              disabled={loading}
            >
              {loading ? 'Đang xác thực...' : 'Đăng nhập hệ thống'}
              {!loading && <Icon name="arrow" size={18} />}
            </button>
          </form>

          <div className="quick-accounts">
            <span className="eyebrow">TÀI KHOẢN MẪU KHẢO SÁT</span>
            <div className="quick-accounts__list">
              <button
                type="button"
                className="quick-account-btn"
                onClick={() => fillDemo('owner@kaffein.vn')}
              >
                <strong>Chủ chuỗi (Owner)</strong>
                <small>owner@kaffein.vn</small>
              </button>
              <button
                type="button"
                className="quick-account-btn"
                onClick={() => fillDemo('manager.q1@kaffein.vn')}
              >
                <strong>Cửa hàng trưởng (SM)</strong>
                <small>manager.q1@kaffein.vn</small>
              </button>
            </div>
            <small className="quick-accounts__hint">
              Mật khẩu mặc định: <code>123456</code> · Nhấn để điền nhanh
            </small>
          </div>
        </div>
        <small className="login__foot">
          Bảo mật JWT · Tự động phân quyền theo vai trò (Owner / Store Manager)
        </small>
      </main>
    </div>
  )
}

function Dashboard({
  role,
  store,
  go,
  realStores,
}: {
  role: Role
  store: string
  go: (page: Page) => void
  realStores: StoreResponse[]
}) {
  const owner = role === 'OWNER'
  const chain = owner && store === 'Toàn chuỗi'
  const selectedStoreObj = realStores.find((s) => s.name === store)
  const storeIdParam = chain ? undefined : selectedStoreObj?.id

  const [dashboardData, setDashboardData] = useState<DashboardResponse | null>(null)

  useEffect(() => {
    reportsApi
      .dashboard({ storeId: storeIdParam })
      .then(setDashboardData)
      .catch((err) => console.error('Lỗi tải báo cáo dashboard:', err))
  }, [storeIdParam])

  const displayStores = realStores.map((s) => ({
    name: s.name,
    code: s.code,
    online: s.posOnline,
    pending: s.posHasPendingOutbox,
    deviceId: s.posDeviceId,
  }))

  const visible = displayStores.filter((item) => chain || item.name === store)

  const kpiTodayRevenue = dashboardData ? formatMoney(Number(dashboardData.kpi.todayRevenueVnd)) : '—'
  const kpiOrderCount = dashboardData ? String(dashboardData.kpi.todayOrderCount) : '—'
  const kpiAov = dashboardData ? formatMoney(Number(dashboardData.kpi.averageOrderValueVnd)) : '—'
  const kpiAlertCount = dashboardData ? String(dashboardData.kpi.stockAlertCount).padStart(2, '0') : '—'

  const topProductsList = dashboardData?.topProducts.map((p) => [
          p.productName,
          `${p.quantitySold} ly · ${p.variantName}`,
          formatMoney(Number(p.totalRevenueVnd)),
        ]) ?? []
  const hourlySales = dashboardData?.hourlyRevenue.filter((item) => item.orderCount > 0) ?? []
  const posWarnings = visible.filter((item) => !item.online || item.pending)

  return (
    <>
      <Head
        title={chain ? 'Tổng quan chuỗi' : 'Tổng quan ' + store}
        subtitle="Theo dõi hoạt động trong ngày theo dữ liệu API tại lần tải trang."
        eyebrow="KHÔNG GIAN ĐIỀU HÀNH"
      />
      <CancelledQrReceipts />
      <div className="stats">
        <Stat
          title="Doanh thu hôm nay"
          value={kpiTodayRevenue}
          detail="Đơn hàng đã hoàn tất"
          icon="trend"
          tone="amber"
        />
        <Stat
          title="Đơn đã thanh toán"
          value={kpiOrderCount}
          detail="Tiền mặt & QR"
          icon="receipt"
          tone="green"
        />
        <Stat
          title="Giá trị trung bình"
          value={kpiAov}
          detail="Trên mỗi đơn"
          icon="wallet"
        />
        <Stat
          title="Nguyên liệu hết tồn"
          value={kpiAlertCount}
          detail="Số dư bằng 0; chưa có ngưỡng sắp hết"
          icon="alert"
          tone="red"
        />
      </div>


      <div className="dashboard-grid">
        <section className="panel chart-panel">
          <SectionHead
            title="Doanh thu trong ngày"
            subtitle="Doanh thu đã thanh toán theo giờ từ API"
          >
            <Badge>06:00 – 22:00</Badge>
          </SectionHead>
          {hourlySales.length ? hourlySales.map((item) => (
            <div className="top-product" key={item.hourLabel}>
              <strong>{item.hourLabel}</strong>
              <span>{item.orderCount} đơn</span>
              <strong>{formatMoney(Number(item.revenueVnd))}</strong>
            </div>
          )) : <p className="muted-copy">Chưa có đơn thanh toán trong ngày.</p>}
        </section>

        <section className="panel pos-panel">
          <SectionHead
            title="Tình trạng máy POS"
            subtitle="Một máy hoạt động cho mỗi chi nhánh"
          >
            <Button variant="text" onClick={() => go('stores')}>
              Xem tất cả <Icon name="arrow" size={15} />
            </Button>
          </SectionHead>
          {visible.map((item) => (
            <div className="pos-row" key={item.code}>
              <span className="pos-row__icon">
                <Icon name="monitor" size={20} />
              </span>
              <span>
                <strong>{item.name}</strong>
                <small>
                  {item.deviceId ?? 'Chưa kích hoạt POS'} · {item.online ? 'Trực tuyến' : 'Ngoại tuyến'}
                </small>
              </span>
              <Badge tone={item.online ? 'green' : 'red'}>
                {item.online ? 'Trực tuyến' : 'Ngoại tuyến'}
              </Badge>
            </div>
          ))}
        </section>
      </div>

      <div className="dashboard-grid dashboard-grid--bottom">
        <section className="panel">
          <SectionHead
            title="Món được chọn nhiều"
            subtitle="Theo đơn đã thanh toán hôm nay"
          >
            <Button variant="text" onClick={() => go('menu-products')}>
              Thực đơn <Icon name="arrow" size={15} />
            </Button>
          </SectionHead>
          {topProductsList.map(([name, count, revenue], index) => (
            <div className="top-product" key={name}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <span className="top-product__icon">
                <Icon name="coffee" size={17} />
              </span>
              <span>
                <strong>{name}</strong>
                <small>{count}</small>
              </span>
              <strong>{revenue}</strong>
            </div>
          ))}
          {topProductsList.length === 0 && <p className="muted-copy">Chưa có món bán trong ngày.</p>}
        </section>

        <section className="panel">
          <SectionHead
            title="Cần xử lý hôm nay"
            subtitle="Những điểm cần kiểm tra trước ca tiếp theo"
          />
          {posWarnings.map((item) => <div className="attention" key={item.code}>
            <span className="attention__icon attention__icon--red">
              <Icon name="monitor" />
            </span>
            <span>
              <strong>Thiết bị POS cần kiểm tra</strong>
              <small>{item.name} · {item.online ? 'Còn outbox chờ' : 'Ngoại tuyến'}</small>
            </span>
            <Button variant="text" onClick={() => go('stores')}>
              Xem
            </Button>
          </div>)}
          {posWarnings.length === 0 && <p className="muted-copy">Không có POS cần kiểm tra theo dữ liệu hiện tại.</p>}
        </section>
      </div>
    </>
  )
}

type CatalogEdit = {
  kind: 'variant' | 'category' | 'topping'
  id: string
  label: string
  currentValue: string
}

function Menu({ role, view }: { role: Role; view: 'products' | 'categories' | 'toppings' }) {
  const tab = view === 'products' ? 'Sản phẩm & size' : view === 'categories' ? 'Danh mục & VAT' : 'Topping'
  const [query, setQuery] = useState('')
  const [liveProducts, setLiveProducts] = useState<ProductResponse[]>([])
  const [categories, setCategories] = useState<CategoryResponse[]>([])
  const [toppings, setToppings] = useState<ToppingResponse[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [editing, setEditing] = useState<CatalogEdit | null>(null)

  const reloadProducts = () => {
    catalogApi
      .webProducts()
      .then(setLiveProducts)
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Không tải được sản phẩm.'))
  }

  useEffect(() => {
    reloadProducts()
    catalogApi.categories().then(setCategories).catch((err) => setLoadError(err.message))
    catalogApi.toppings().then(setToppings).catch((err) => setLoadError(err.message))
  }, [])

  const displayItems = liveProducts.map((p) => ({
          id: p.id,
          code: p.code,
          name: p.name,
          category: p.category.name,
          variants: p.variants,
          active: p.isActive,
        }))

  const visible = displayItems.filter((item) =>
    (item.name + item.code + item.category).toLowerCase().includes(query.toLowerCase()),
  )

  const toggleStatus = async (item: (typeof displayItems)[0]) => {
    if (role !== 'OWNER') return
    try {
      await catalogApi.toggleStatus(item.id, !item.active)
      reloadProducts()
    } catch (err: any) {
      alert(err.message || 'Không thể đổi trạng thái sản phẩm.')
    }
  }

  const saveCatalogEdit = async (rawValue: string) => {
    if (!editing || role !== 'OWNER') return
    if (editing.kind === 'category') {
      const percent = Number(rawValue)
      const taxRateBps = Math.round(percent * 100)
      if (!Number.isFinite(percent) || percent < 0 || percent > 100 ||
          Math.abs(percent * 100 - taxRateBps) > 0.000001) {
        throw new Error('VAT phải từ 0 đến 100%, tối đa hai chữ số thập phân.')
      }
      await catalogApi.updateCategoryTax(editing.id, taxRateBps)
      setCategories(await catalogApi.categories())
    } else {
      if (!/^(0|[1-9]\d*)$/.test(rawValue) || Number(rawValue) > 1_000_000_000) {
        throw new Error('Giá phải là số VND nguyên từ 0 đến 1.000.000.000.')
      }
      if (editing.kind === 'variant') {
        await catalogApi.updateVariantPrice(editing.id, rawValue)
        setLiveProducts(await catalogApi.webProducts())
      } else {
        await catalogApi.updateToppingPrice(editing.id, rawValue)
        setToppings(await catalogApi.toppings())
        setLiveProducts(await catalogApi.webProducts())
      }
    }
    setLoadError(null)
    setEditing(null)
  }

  return (
    <>
      <Head
        title="Thực đơn & thuế VAT"
        subtitle="Cấu hình dùng chung cho toàn bộ chuỗi. Dữ liệu nạp trực tiếp từ API."
      />
      <div className="menu-layout">
        <section className="panel table-panel">
          <div className="table-toolbar">
            <span className="table-toolbar__title">{tab}</span>
            <div className="toolbar-actions">
              <Search value={query} onChange={setQuery} placeholder="Tìm món" />
            </div>
          </div>

          <div className="table-scroll">
            <table>
              {tab === 'Sản phẩm & size' ? (
                <>
                  <thead>
                    <tr>
                      <th>Sản phẩm</th>
                      <th>Danh mục</th>
                      <th>Biến thể & giá</th>
                      <th>Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((item) => (
                      <tr key={item.code}>
                        <td>
                          <span className="product-cell">
                            <span>
                              <Icon name="coffee" size={20} />
                            </span>
                            <span>
                              <strong>{item.name}</strong>
                              <small>{item.code}</small>
                            </span>
                          </span>
                        </td>
                        <td>{item.category}</td>
                        <td>
                          <div className="catalog-price-list">
                            {item.variants.map((variant) => (
                              <span key={variant.id}>
                                {variant.sizeLabel ?? 'M'}: {formatMoney(Number(variant.priceVnd))}
                                {role === 'OWNER' && (
                                  <button type="button" className="catalog-edit-button"
                                    aria-label={`Sửa giá ${item.name} size ${variant.sizeLabel ?? 'M'}`}
                                    onClick={() => setEditing({ kind: 'variant', id: variant.id,
                                      label: `${item.name} · size ${variant.sizeLabel ?? 'M'}`,
                                      currentValue: variant.priceVnd })}>Sửa</button>
                                )}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td>
                          <button
                            type="button"
                            onClick={() => toggleStatus(item)}
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: role === 'OWNER' ? 'pointer' : 'default',
                            }}
                          >
                            <Badge tone={item.active ? 'green' : 'amber'}>
                              {item.active ? 'Đang bán' : 'Tạm hết'}
                            </Badge>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </>
              ) : tab === 'Danh mục & VAT' ? (
                <>
                  <thead>
                    <tr>
                      <th>Danh mục</th>
                      <th>VAT</th>
                      <th>Phạm vi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categories.map((category) => (
                      <tr key={category.id}>
                        <td>
                          <strong>{category.name}</strong>
                        </td>
                        <td>
                          {(category.taxRateBps / 100).toLocaleString('vi-VN')}%
                          {role === 'OWNER' && (
                            <button type="button" className="catalog-edit-button"
                              aria-label={`Sửa VAT danh mục ${category.name}`}
                              onClick={() => setEditing({ kind: 'category', id: category.id,
                                label: category.name,
                                currentValue: String(category.taxRateBps / 100) })}>Sửa</button>
                          )}
                        </td>
                        <td>Toàn chuỗi</td>
                      </tr>
                    ))}
                  </tbody>
                </>
              ) : (
                <>
                  <thead>
                    <tr>
                      <th>Topping</th>
                      <th>Mã</th>
                      <th>Giá thêm</th>
                      <th>Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {toppings.map((topping) => (
                      <tr key={topping.id}>
                        <td><strong>{topping.name}</strong></td>
                        <td>{topping.code}</td>
                        <td>
                          {formatMoney(Number(topping.priceVnd))}
                          {role === 'OWNER' && (
                            <button type="button" className="catalog-edit-button"
                              aria-label={`Sửa giá topping ${topping.name}`}
                              onClick={() => setEditing({ kind: 'topping', id: topping.id,
                                label: topping.name, currentValue: topping.priceVnd })}>Sửa</button>
                          )}
                        </td>
                        <td><Badge tone={topping.isActive ? 'green' : 'amber'}>{topping.isActive ? 'Đang bán' : 'Tạm ẩn'}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </>
              )}
            </table>
            {tab === 'Sản phẩm & size' && visible.length === 0 && <Empty query={query} />}
            {loadError && <p role="alert" className="form-error">{loadError}</p>}
          </div>
        </section>

        <aside className="panel menu-aside">
          <span className="menu-aside__icon">
            <Icon name="receipt" size={24} />
          </span>
          <h2>Giá & thuế trong chuỗi</h2>
          <p>
            Giá niêm yết, size và topping do Chủ chuỗi (Owner) quản lý. Cửa hàng trưởng xem và áp dụng bán tại quầy POS.
          </p>
          <div>
            <span>VAT theo danh mục</span>
            <strong>{categories.length ? Array.from(new Set(categories.map((item) => `${item.taxRateBps / 100}%`))).join(' · ') : 'Chưa có dữ liệu'}</strong>
          </div>
          <div>
            <span>Cách tính giá</span>
            <strong>Đã gồm VAT</strong>
          </div>
          <small>
            Hóa đơn hoàn tất là bất biến. Thay đổi giá hoặc công thức chỉ áp dụng cho đơn bán mới.
          </small>
        </aside>
      </div>
      {editing && (
        <CatalogEditModal key={`${editing.kind}-${editing.id}`} item={editing}
          onClose={() => setEditing(null)} onSave={saveCatalogEdit} />
      )}
    </>
  )
}

function CatalogEditModal({ item, onClose, onSave }: {
  item: CatalogEdit
  onClose: () => void
  onSave: (value: string) => Promise<void>
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const [value, setValue] = useState(item.currentValue)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ref.current?.showModal()
  }, [])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setSaving(true)
    try {
      await onSave(value.trim())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không lưu được thay đổi.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <dialog ref={ref} className="dialog" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="dialog__head">
          <h2>{item.kind === 'category' ? 'Điều chỉnh VAT' : 'Điều chỉnh giá'}</h2>
          <button type="button" className="catalog-edit-button" onClick={onClose}>Đóng</button>
        </div>
        <p>{item.label} · Áp dụng cho đơn mới sau khi POS đồng bộ.</p>
        <div className="dialog__fields">
          <label htmlFor="catalog-edit-value">
            {item.kind === 'category' ? 'Thuế VAT (%)' : 'Giá bán (VND)'}
          </label>
          <input id="catalog-edit-value" type="number" required min="0"
            max={item.kind === 'category' ? '100' : '1000000000'}
            step={item.kind === 'category' ? '0.01' : '1'} value={value}
            onChange={(event) => setValue(event.target.value)} />
        </div>
        {item.kind === 'category' && <p>Giá bán đang là giá đã gồm VAT; thay đổi này không sửa hóa đơn cũ.</p>}
        {error && <p role="alert" className="form-error">{error}</p>}
        <div className="dialog__foot">
          <span>Chỉ Owner được chỉnh sửa.</span>
          <div>
            <button type="button" className="button button--secondary" onClick={onClose} disabled={saving}>Hủy</button>
            <button type="submit" className="button button--primary" disabled={saving}>
              {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
            </button>
          </div>
        </div>
      </form>
    </dialog>
  )
}

function Inventory({
  role,
  store,
  onAdjust,
  realStores,
  refreshKey,
  view,
}: {
  role: Role
  store: string
  onAdjust: (storeId: string) => void
  realStores: StoreResponse[]
  refreshKey: number
  view: 'balances' | 'ingredients' | 'recipes'
}) {
  const tab = view === 'balances' ? 'Tồn kho' : view === 'ingredients' ? 'Nguyên liệu' : 'Công thức'
  const showBalances = view === 'balances'
  const [query, setQuery] = useState('')
  const [branch, setBranch] = useState('')
  const [stockSnapshot, setStockSnapshot] = useState<{ storeId: string; rows: StockBalanceResponse[] } | null>(null)
  const [liveIngredients, setLiveIngredients] = useState<IngredientResponse[]>([])
  const [recipes, setRecipes] = useState<RecipeResponse[]>([])
  const [recipeProducts, setRecipeProducts] = useState<ProductResponse[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const currentStore = realStores.find((s) => s.name === branch)
    ?? realStores.find((s) => s.name === store)
    ?? realStores[0]
  const currentStoreId = currentStore?.id
  const balances = rowsForStore(stockSnapshot, currentStoreId)
  const blocked = !currentStore?.posOnline || currentStore.posHasPendingOutbox

  useEffect(() => {
    inventoryApi.ingredients().then(setLiveIngredients).catch((err) => setLoadError(err.message))
    inventoryApi.recipes().then(setRecipes).catch((err) => setLoadError(err.message))
    catalogApi.webProducts().then(setRecipeProducts).catch((err) => setLoadError(err.message))
  }, [])

  useEffect(() => {
    if (!currentStoreId) return
    let active = true
    inventoryApi.stockBalances(currentStoreId)
      .then((rows) => {
        if (active) {
          setStockSnapshot({ storeId: currentStoreId, rows })
          setLoadError(null)
        }
      })
      .catch((err) => { if (active) setLoadError(err.message) })
    return () => { active = false }
  }, [currentStoreId, refreshKey])

  const visibleBalances = balances.filter((item) => item.ingredientName.toLowerCase().includes(query.toLowerCase()))
  const visibleIngredients = liveIngredients.filter((item) => item.name.toLowerCase().includes(query.toLowerCase()))
  const variantLabels = new Map(recipeProducts.flatMap((product) =>
    product.variants.map((variant) => [variant.id, `${product.name} · ${variant.sizeLabel ?? 'Mặc định'}`] as const),
  ))

  return (
    <>
      <Head
        title="Kho nguyên liệu & công thức"
        subtitle="Tồn kho theo chi nhánh; định mức pha chế theo phiên bản công thức."
      />
      <div className={blocked ? 'readiness readiness--blocked' : 'readiness'}>
        <span>
          <Icon name={blocked ? 'alert' : 'check'} size={21} />
        </span>
        <div>
          <strong>{blocked ? 'Tạm khóa điều chỉnh kho' : 'Kho sẵn sàng cập nhật'}</strong>
          <small>
            {blocked
              ? `POS ${currentStore?.name ?? 'chi nhánh'} chưa sẵn sàng. Cần chờ thiết bị online và đồng bộ trước khi điều chỉnh kho.`
              : `POS ${currentStore.name} trực tuyến và không báo outbox tồn đọng.`}
          </small>
        </div>
        <Badge tone={blocked ? 'red' : 'green'}>{blocked ? 'Bị khóa' : 'Sẵn sàng'}</Badge>
      </div>

      <div className="inventory-bar">
        <span className="table-toolbar__title">{tab}</span>
        <div className="toolbar-actions">
          {role === 'OWNER' && (
            <label className="branch-select">
              <span>Chi nhánh</span>
              <select value={currentStore?.name ?? ''} onChange={(event) => setBranch(event.target.value)}>
                {realStores.map((item) => (
                  <option key={item.id} value={item.name}>{item.name}</option>
                ))}
              </select>
            </label>
          )}
          {showBalances && (
            <Button
              icon="plus"
              disabled={blocked || !currentStore}
              title={blocked ? 'POS ngoại tuyến: chưa thể điều chỉnh kho' : undefined}
              onClick={() => currentStore && onAdjust(currentStore.id)}
            >
              Kiểm kê / hao hụt
            </Button>
          )}
        </div>
      </div>

      {tab === 'Công thức' ? (
        <div className="recipe-grid">
          {recipes.map((recipe) => (
            <section className="panel" key={recipe.id}>
              <SectionHead title={variantLabels.get(recipe.productVariantId) ?? `Biến thể ${recipe.productVariantId}`} subtitle={`Công thức v${recipe.versionNo}`} />
              {recipe.items.map((item) => (
                <div className="recipe-line" key={item.ingredientId}>
                  <span>{item.ingredientName}</span>
                  <strong>{item.quantity} {item.baseUnit.toLowerCase()}</strong>
                </div>
              ))}
            </section>
          ))}
          {recipes.length === 0 && <p className="muted-copy">Chưa có công thức đang áp dụng.</p>}
        </div>
      ) : (
        <section className="panel table-panel">
          <div className="table-toolbar">
            <SectionHead
              title={showBalances ? 'Tồn kho · ' + (currentStore?.name ?? 'Chưa có chi nhánh') : 'Danh mục nguyên liệu'}
              subtitle="Số lượng theo đơn vị cơ sở (g, ml, chiếc)"
            />
            <Search value={query} onChange={setQuery} placeholder="Tìm nguyên liệu" />
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Nguyên liệu</th>
                  <th>Đơn vị</th>
                  {showBalances && <th>Tồn hiện tại</th>}
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {(showBalances ? visibleBalances : visibleIngredients).map((item) => (
                  <tr key={'ingredientCode' in item ? item.ingredientCode : item.code}>
                    <td>
                      <strong>{'ingredientName' in item ? item.ingredientName : item.name}</strong>
                      <small>{'ingredientCode' in item ? item.ingredientCode : item.code}</small>
                    </td>
                    <td>{item.baseUnit}</td>
                    {showBalances && <td>{'quantity' in item ? item.quantity : '—'}</td>}
                    <td>
                      <Badge tone={'isActive' in item && !item.isActive ? 'amber' : 'green'}>
                        {'isActive' in item && !item.isActive ? 'Tạm ẩn' : 'Đang dùng'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(showBalances ? visibleBalances : visibleIngredients).length === 0 && <Empty query={query} />}
            {loadError && <p role="alert" className="form-error">{loadError}</p>}
          </div>
        </section>
      )}
    </>
  )
}

function HR({
  role,
  store,
  open,
  onEditEmployee,
  realStores,
  refreshKey,
  view,
}: {
  role: Role
  store: string
  open: (modal: Modal) => void
  onEditEmployee: (employee: EmployeeItem) => void
  realStores: StoreResponse[]
  refreshKey: number
  view: 'attendance' | 'employees'
}) {
  const tab = view === 'attendance' ? 'Chấm công' : 'Nhân viên'
  const [query, setQuery] = useState('')
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecordItem[]>([])
  const [employeesList, setEmployeesList] = useState<EmployeeItem[]>([])
  const [summary, setSummary] = useState<AttendanceSummaryResponse | null>(null)
  const [loading, setLoading] = useState(false)

  const owner = role === 'OWNER'
  const chain = owner && store === 'Toàn chuỗi'
  const selectedStoreObj = realStores.find((s) => s.name === store)
  const storeIdParam = chain ? undefined : selectedStoreObj?.id

  useEffect(() => {
    attendanceApi
      .summary(storeIdParam)
      .then(setSummary)
      .catch((err) => console.error('Lỗi tải tóm tắt chấm công:', err))
  }, [storeIdParam, refreshKey])

  useEffect(() => {
    let active = true
    setLoading(true)

    if (tab === 'Chấm công') {
      attendanceApi
        .list({
          storeId: storeIdParam,
          search: query.trim() || undefined,
          pageSize: 50,
        })
        .then((res) => {
          if (active) setAttendanceRecords(res.items)
        })
        .catch((err) => {
          console.error('Lỗi nạp danh sách chấm công:', err)
          if (active) setAttendanceRecords([])
        })
        .finally(() => {
          if (active) setLoading(false)
        })
    } else {
      employeesApi
        .list({
          storeId: storeIdParam,
          search: query.trim() || undefined,
          pageSize: 50,
        })
        .then((res) => {
          if (active) setEmployeesList(res.items)
        })
        .catch((err) => {
          console.error('Lỗi nạp danh sách nhân viên:', err)
          if (active) setEmployeesList([])
        })
        .finally(() => {
          if (active) setLoading(false)
        })
    }

    return () => {
      active = false
    }
  }, [tab, storeIdParam, query, refreshKey])

  return (
    <>
      <Head
        title="Nhân sự & chấm công"
        subtitle="Điểm danh đa chi nhánh. Thu ngân chỉ đăng nhập bán tại chi nhánh nhà."
      />
      <div className="stats stats--three">
        <Stat
          title="Tổng nhân sự"
          value={String(summary?.totalEmployees ?? employeesList.length).padStart(2, '0')}
          detail="Mã nhân viên 7 chữ số"
          icon="users"
        />
        <Stat
          title="Đang làm việc"
          value={String(summary?.activeCount ?? 0).padStart(2, '0')}
          detail="Đã check-in"
          icon="clock"
          tone="green"
        />
        <Stat
          title="Cần kiểm tra"
          value={String(summary?.abnormalCount ?? 0).padStart(2, '0')}
          detail="Lượt chấm công bất thường"
          icon="alert"
          tone={summary && summary.abnormalCount > 0 ? 'amber' : 'green'}
        />
      </div>

      <section className="panel table-panel">
        <div className="table-toolbar">
          <span className="table-toolbar__title">{tab}</span>
          <div className="toolbar-actions">
            <Search value={query} onChange={setQuery} placeholder="Tìm tên hoặc mã" />
            {tab === 'Nhân viên' && role === 'OWNER' && (
              <>
                <Button icon="plus" onClick={() => open('create-employee')}>
                  Thêm nhân viên
                </Button>
                <Button icon="arrow" onClick={() => open('transfer')}>
                  Điều chuyển
                </Button>
                <Button onClick={() => open('reset-pin')}>
                  Đặt lại PIN
                </Button>
              </>
            )}
            {tab === 'Chấm công' && (
              <Button icon="plus" onClick={() => open('attendance')}>
                Bổ sung ca
              </Button>
            )}
          </div>
        </div>

        <div className="table-scroll">
          <table>
            <thead>
              {tab === 'Chấm công' ? (
                <tr>
                  <th>Nhân viên</th>
                  <th>Chi nhánh nhà</th>
                  <th>Chấm công tại</th>
                  <th>Check-in</th>
                  <th>Check-out</th>
                  <th>Ghi nhận</th>
                </tr>
              ) : (
                <tr>
                  <th>Nhân viên</th>
                  <th>Chi nhánh nhà</th>
                  <th>Vai trò</th>
                  <th>Mã nhân viên</th>
                  <th>Trạng thái</th>
                  {owner && <th>Thao tác</th>}
                </tr>
              )}
            </thead>
            <tbody>
              {tab === 'Chấm công'
                ? attendanceRecords.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <span className="employee-cell">
                          <span className="avatar avatar--small">
                            {item.fullName
                              .split(' ')
                              .slice(-2)
                              .map((part) => part[0])
                              .join('')}
                          </span>
                          <span>
                            <strong>{item.fullName}</strong>
                            <small>{item.employeeCode}</small>
                          </span>
                        </span>
                      </td>
                      <td>{item.homeStoreName}</td>
                      <td>{item.storeName}</td>
                      <td>{formatDateTimeVN(item.checkInAt)}</td>
                      <td>{item.checkOutAt ? formatDateTimeVN(item.checkOutAt) : '—'}</td>
                      <td>
                        <Badge
                          tone={
                            item.note === 'Quên check-out'
                              ? 'amber'
                              : item.note === 'Làm hỗ trợ'
                                ? 'blue'
                                : item.note === 'Đang làm'
                                  ? 'green'
                                  : 'neutral'
                          }
                        >
                          {item.note}
                        </Badge>
                      </td>
                    </tr>
                  ))
                : employeesList.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <span className="employee-cell">
                          <span className="avatar avatar--small">
                            {item.fullName
                              .split(' ')
                              .slice(-2)
                              .map((part) => part[0])
                              .join('')}
                          </span>
                          <span>
                            <strong>{item.fullName}</strong>
                            <small>{item.employeeCode}</small>
                          </span>
                        </span>
                      </td>
                      <td>{item.homeStoreName || 'Toàn chuỗi'}</td>
                      <td>
                        {item.role === 'OWNER'
                          ? 'Chủ chuỗi'
                          : item.role === 'STORE_MANAGER'
                            ? 'Cửa hàng trưởng'
                            : 'Nhân viên'}
                      </td>
                      <td>
                        <strong>{item.employeeCode}</strong>
                      </td>
                      <td>
                        <Badge tone={item.status === 'ACTIVE' ? 'green' : 'neutral'}>
                          {item.status === 'ACTIVE' ? 'Đang làm việc' : item.status === 'SUSPENDED' ? 'Tạm khóa' : 'Nghỉ việc'}
                        </Badge>
                      </td>
                      {owner && <td><Button variant="secondary" onClick={() => onEditEmployee(item)}>Chỉnh sửa</Button></td>}
                    </tr>
                  ))}
            </tbody>
          </table>
          {loading && (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-muted)' }}>
              Đang tải dữ liệu...
            </div>
          )}
          {!loading &&
            (tab === 'Chấm công'
              ? attendanceRecords.length === 0
              : employeesList.length === 0) && <Empty query={query} />}
        </div>

        {tab === 'Chấm công' && (
          <div className="table-foot">
            <span>
              Chấm công ở chi nhánh khác được ghi nhận hỗ trợ; đăng nhập thu ngân bị cấm nếu khác chi nhánh nhà.
            </span>
            <Button variant="text" onClick={() => open('attendance')}>
              Xem & Bổ sung ca
            </Button>
          </div>
        )}
      </section>
    </>
  )
}

function Sales({
  role,
  store,
  realStores,
}: {
  role: Role
  store: string
  realStores: StoreResponse[]
}) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('Tất cả')
  const [sales, setSales] = useState<SaleSummaryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedDetail, setSelectedDetail] = useState<ApiSaleDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const owner = role === 'OWNER'
  const chain = owner && store === 'Toàn chuỗi'
  const selectedStoreObj = realStores.find((s) => s.name === store)
  const storeIdParam = chain ? undefined : selectedStoreObj?.id

  useEffect(() => {
    let active = true
    setLoading(true)

    const paymentMethodParam =
      filter === 'Tiền mặt' ? 'CASH' : filter === 'ZaloPay' ? 'ZALOPAY' : filter === 'MoMo' ? 'MOMO' : undefined

    salesApi
      .list({
        storeId: storeIdParam,
        search: query.trim() || undefined,
        paymentMethod: paymentMethodParam,
        pageSize: 50,
      })
      .then((res) => {
        if (!active) return
        setSales(res.items)
      })
      .catch((err) => {
        console.error('Lỗi tải danh sách hóa đơn:', err)
        if (!active) return
        setSales([])
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [storeIdParam, filter, query])

  useEffect(() => {
    if (!selectedId) {
      setSelectedDetail(null)
      return
    }
    let active = true
    setDetailLoading(true)
    salesApi
      .get(selectedId)
      .then((detail) => {
        if (active) setSelectedDetail(detail)
      })
      .catch((err) => {
        console.error('Lỗi nạp chi tiết hóa đơn:', err)
      })
      .finally(() => {
        if (active) setDetailLoading(false)
      })

    return () => {
      active = false
    }
  }, [selectedId])

  const formatPaymentMethod = (m: string) => {
    if (m === 'CASH') return 'Tiền mặt'
    if (m === 'ZALOPAY') return 'ZaloPay'
    if (m === 'MOMO') return 'MoMo'
    return m
  }

  return (
    <>
      <Head
        title="Lịch sử hóa đơn"
        subtitle="Tra cứu giao dịch đã thanh toán. Hóa đơn hoàn tất là bất biến theo quy chuẩn."
      />
      <section className="panel table-panel">
        <div className="table-toolbar">
          <div className="toolbar-actions">
            <Search value={query} onChange={setQuery} placeholder="Mã đơn, thu ngân..." />
            <label className="filter-select">
              <span className="sr-only">Lọc phương thức</span>
              <select value={filter} onChange={(event) => setFilter(event.target.value)}>
                <option>Tất cả</option>
                <option>Tiền mặt</option>
                <option>ZaloPay</option>
                <option>MoMo</option>
              </select>
            </label>
          </div>
          <span className="result-count">{sales.length} hóa đơn</span>
        </div>

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Mã hóa đơn</th>
                <th>Thời gian</th>
                <th>Chi nhánh</th>
                <th>Thu ngân</th>
                <th>Thanh toán</th>
                <th>Tổng tiền</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sales.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.saleNumber}</strong>
                  </td>
                  <td>{formatDateTimeVN(item.completedAt || item.createdAt)}</td>
                  <td>{item.storeName}</td>
                  <td>{item.cashierName}</td>
                  <td>
                    <Badge tone={item.paymentMethod === 'CASH' ? 'neutral' : 'blue'}>
                      {formatPaymentMethod(item.paymentMethod)}
                    </Badge>
                  </td>
                  <td>
                    <strong>{formatMoney(Number(item.totalVnd))}</strong>
                  </td>
                  <td>
                    <Button variant="text" onClick={() => setSelectedId(item.id)}>
                      Chi tiết <Icon name="arrow" size={14} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {loading && (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-muted)' }}>
              Đang tải danh sách hóa đơn...
            </div>
          )}
          {!loading && sales.length === 0 && <Empty query={query} />}
        </div>
      </section>

      {selectedId && (
        <div className="drawer-overlay" onClick={() => setSelectedId(null)}>
          <aside
            className="receipt-drawer"
            onClick={(event) => event.stopPropagation()}
            aria-label={'Chi tiết hóa đơn ' + (selectedDetail?.saleNumber || selectedId)}
          >
            <div className="drawer-head">
              <div>
                <span className="eyebrow">CHI TIẾT GIAO DỊCH</span>
                <h2>{selectedDetail?.saleNumber || 'Đang tải...'}</h2>
              </div>
              <button
                className="icon-button"
                aria-label="Đóng chi tiết"
                onClick={() => setSelectedId(null)}
              >
                <Icon name="close" size={20} />
              </button>
            </div>

            {detailLoading ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-muted)' }}>
                Đang nạp dữ liệu chi tiết hóa đơn...
              </div>
            ) : selectedDetail ? (
              <>
                <div className="receipt-meta">
                  <span>Mã hóa đơn</span>
                  <strong>{selectedDetail.saleNumber}</strong>
                  <span>Ngày kinh doanh</span>
                  <strong>{selectedDetail.businessDate}</strong>
                  <span>Thời gian hoàn tất</span>
                  <strong>
                    {formatDateTimeVN(selectedDetail.completedAt || selectedDetail.createdAt)}
                  </strong>
                  <span>Trạng thái</span>
                  <Badge tone={selectedDetail.status === 'COMPLETED' ? 'green' : 'amber'}>
                    {selectedDetail.status === 'COMPLETED' ? 'Đã hoàn tất' : selectedDetail.status}
                  </Badge>
                  <span>Phương thức</span>
                  <strong>
                    {selectedDetail.payments
                      .map(
                        (p) =>
                          `${formatPaymentMethod(p.method)} (${formatMoney(Number(p.amountVnd))})`,
                      )
                      .join(', ') || 'Chưa ghi nhận'}
                  </strong>
                </div>

                <div className="receipt-items" style={{ maxHeight: '360px', overflowY: 'auto' }}>
                  <div
                    style={{
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      color: 'var(--color-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      marginBottom: '0.5rem',
                    }}
                  >
                    Danh sách món ({selectedDetail.items.length})
                  </div>
                  {selectedDetail.items.map((it) => (
                    <div
                      key={it.id}
                      style={{
                        padding: '0.6rem 0',
                        borderBottom: '1px solid var(--color-border)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'baseline',
                        }}
                      >
                        <div>
                          <strong>{it.productName}</strong>
                          <span style={{ color: 'var(--color-muted)', marginLeft: '0.35rem' }}>
                            ({it.variantName})
                          </span>{' '}
                          × {it.quantity}
                        </div>
                        <strong>{formatMoney(Number(it.lineTotalVnd))}</strong>
                      </div>

                      {it.toppings && it.toppings.length > 0 && (
                        <div
                          style={{
                            paddingLeft: '0.75rem',
                            marginTop: '0.2rem',
                            fontSize: '0.8rem',
                            color: 'var(--color-muted)',
                          }}
                        >
                          {it.toppings.map((tp) => (
                            <div key={tp.id}>
                              + {tp.toppingName} (x{tp.quantityPerItem}) ·{' '}
                              {formatMoney(Number(tp.unitPriceVnd))}
                            </div>
                          ))}
                        </div>
                      )}

                      {it.consumptions && it.consumptions.length > 0 && (
                        <div
                          style={{
                            paddingLeft: '0.75rem',
                            marginTop: '0.25rem',
                            fontSize: '0.75rem',
                            color: 'var(--color-text-subtle)',
                            fontStyle: 'italic',
                          }}
                        >
                          Tiêu hao: {it.consumptions.map((c) => `${c.ingredientName} ${c.quantityTotal} ${c.baseUnit}`).join(', ')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="receipt-total" style={{ marginTop: '1rem' }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '0.875rem',
                      color: 'var(--color-muted)',
                      marginBottom: '0.25rem',
                    }}
                  >
                    <span>Tạm tính</span>
                    <span>{formatMoney(Number(selectedDetail.subtotalVnd))}</span>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '0.875rem',
                      color: 'var(--color-muted)',
                      marginBottom: '0.5rem',
                    }}
                  >
                    <span>Thuế VAT</span>
                    <span>{formatMoney(Number(selectedDetail.taxVnd))}</span>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontWeight: 700,
                      fontSize: '1.1rem',
                      borderTop: '1px dashed var(--color-border)',
                      paddingTop: '0.5rem',
                    }}
                  >
                    <span>Tổng đã thanh toán</span>
                    <strong>{formatMoney(Number(selectedDetail.totalVnd))}</strong>
                  </div>
                </div>

                <Button
                  variant="secondary"
                  icon="download"
                  onClick={() => window.print()}
                >
                  In / lưu PDF bằng trình duyệt
                </Button>
              </>
            ) : (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-muted)' }}>
                Không tìm thấy dữ liệu hóa đơn này.
              </div>
            )}
          </aside>
        </div>
      )}
    </>
  )
}

function Register({ role, store, realStores }: { role: Role; store: string; realStores: StoreResponse[] }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof registerSessionsApi.list>> | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [varianceFilter, setVarianceFilter] = useState('')
  const [page, setPage] = useState(1)
  const [viewingSession, setViewingSession] = useState<RegisterSessionSummaryItem | null>(null)
  const chain = role === 'OWNER' && store === 'Toàn chuỗi'
  const storeId = chain ? undefined : realStores.find((s) => s.name === store)?.id
  useEffect(() => { setPage(1) }, [storeId])
  useEffect(() => {
    let active = true
    if (!chain && !storeId) { setData(null); return }
    setLoading(true); setError(''); setData(null)
    registerSessionsApi.list({ storeId, status: statusFilter || undefined, variance: varianceFilter || undefined, page, pageSize: 50 })
      .then((result) => { if (active) setData(result) })
      .catch(() => { if (active) setError('Chưa tải được phiên quỹ. Vui lòng thử lại.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [chain, storeId, statusFilter, varianceFilter, page])
  const summary = data?.summary
  return <>
    <Head title="Phiên tiền mặt & bàn giao" subtitle="Theo dõi thực đếm, tiền nộp bù và chênh lệch quỹ theo chi nhánh." />
    <div className="stats">
      <Stat title="Phiên đang mở" value={String(summary?.openCount ?? 0)} detail="Theo chi nhánh đã chọn" icon="wallet" tone="amber" />
      <Stat title="Tiền trong két hiện tại" value={registerMoney(summary?.openingCashVnd)} detail="Tiền đầu các phiên đang mở" icon="wallet" tone="green" />
      <Stat title="Thừa quỹ phát hiện (+)" value={`+${registerMoney(summary?.surplusCashVnd)}`} detail={`${summary?.surplusCount ?? 0} phiên thừa quỹ`} icon="alert" tone="green" />
      <Stat title="Thiếu quỹ bồi hoàn (-)" value={`-${registerMoney(summary?.shortageCashVnd)}`} detail={`${summary?.shortageCount ?? 0} phiên · Đã nộp bù ${registerMoney(summary?.compensationCashVnd)}`} icon="alert" tone="red" />
    </div>
    {error && <p role="alert">{error}</p>}
    <section className="panel table-panel">
      <div className="table-toolbar">
        <SectionHead title="Lịch sử phiên quỹ" subtitle="Tổng thống kê theo toàn bộ chi nhánh đã chọn, không chỉ trang hiện tại" />
        <div className="toolbar-actions">
          <label className="filter-select"><span className="sr-only">Lọc trạng thái</span>
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}>
              <option value="">Tất cả trạng thái</option><option value="OPEN">Đang mở</option><option value="CLOSED">Đã đóng</option>
            </select>
          </label>
          <label className="filter-select"><span className="sr-only">Lọc chênh lệch</span>
            <select value={varianceFilter} onChange={(e) => { setVarianceFilter(e.target.value); setPage(1) }}>
              <option value="">Tất cả chênh lệch</option><option value="BALANCED">Khớp quỹ (0 đ)</option>
              <option value="SURPLUS">Thừa quỹ (&gt; 0 đ)</option><option value="SHORTAGE">Thiếu quỹ (&lt; 0 đ)</option>
            </select>
          </label>
          <span className="result-count">{data?.total ?? 0} phiên</span>
        </div>
      </div>
      <div className="table-scroll"><table><thead><tr>
        <th>Phiên</th><th>Chi nhánh</th><th>Người mở</th><th>Thời gian</th><th>Tiền đầu ca</th><th>Thực đếm ban đầu</th><th>Chênh lệch</th><th>Trạng thái</th><th>Bảng kê</th>
      </tr></thead><tbody>{data?.items.map((item) => <tr key={item.id}>
        <td><strong title={item.id}>{item.id.slice(0, 8).toUpperCase()}</strong></td><td>{item.storeName}</td><td>{item.openedByName}</td>
        <td>{formatDateTimeVN(item.openedAt)}{item.closedAt ? ` → ${formatDateTimeVN(item.closedAt)}` : ' (Đang mở)'}</td>
        <td>{registerMoney(item.openingCashVnd)}</td><td>{item.actualCashVnd == null ? '—' : registerMoney(item.actualCashVnd)}</td>
        <td><RegisterVariance session={item} /></td>
        <td><Badge tone={item.status === 'OPEN' ? 'blue' : 'green'}>{item.status === 'OPEN' ? 'Đang mở' : item.closingMode === 'HANDOVER' ? 'Đã bàn giao' : 'Đã đóng'}</Badge></td>
        <td><button type="button" className="button button--secondary" onClick={() => setViewingSession(item)}>Chi tiết</button></td>
      </tr>)}</tbody></table>
        {loading && <p>Đang tải danh sách phiên quỹ…</p>}
        {!loading && !error && !data?.items.length && <Empty query="" />}
      </div>
      <div className="table-toolbar">
        <button className="button button--secondary" disabled={loading || page <= 1} onClick={() => setPage((p) => p - 1)}>Trang trước</button>
        <span>Trang {page} / {data?.totalPages ?? 1}</span>
        <button className="button button--secondary" disabled={loading || page >= (data?.totalPages ?? 1)} onClick={() => setPage((p) => p + 1)}>Trang sau</button>
      </div>
    </section>
    {viewingSession && <RegisterSessionDenominationModal session={viewingSession} onClose={() => setViewingSession(null)} />}
  </>
}
function ActionModal({
  type,
  close,
  realStores,
  onSuccess,
  selectedEmployee,
  targetStoreId,
}: {
  type: Exclude<Modal, null>
  close: () => void
  realStores: StoreResponse[]
  onSuccess?: () => void
  selectedEmployee?: EmployeeItem | null
  targetStoreId?: string
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const [employeeName, setEmployeeName] = useState('')
  const [employeeRole, setEmployeeRole] = useState<'EMPLOYEE' | 'STORE_MANAGER'>('EMPLOYEE')
  const [employeeStoreId, setEmployeeStoreId] = useState(realStores[0]?.id ?? '')
  const effectiveEmployeeStoreId = realStores.some((store) => store.id === employeeStoreId)
    ? employeeStoreId
    : (realStores[0]?.id ?? '')
  const [employeePin, setEmployeePin] = useState('')
  const [employeeEmail, setEmployeeEmail] = useState('')
  const [employeeWebPassword, setEmployeeWebPassword] = useState('')
  const [editEmployeeName, setEditEmployeeName] = useState(selectedEmployee?.fullName ?? '')
  const [editEmployeeStatus, setEditEmployeeStatus] = useState<'ACTIVE' | 'SUSPENDED' | 'TERMINATED'>(
    selectedEmployee?.status === 'SUSPENDED' || selectedEmployee?.status === 'TERMINATED'
      ? selectedEmployee.status : 'ACTIVE',
  )
  const [pinEmployeeId, setPinEmployeeId] = useState('')
  const [newPin, setNewPin] = useState('')
  const [stockIngredients, setStockIngredients] = useState<IngredientResponse[]>([])
  const [stockIngredientId, setStockIngredientId] = useState('')
  const [stockMovementType, setStockMovementType] = useState<'ADJUSTMENT' | 'WASTE'>('ADJUSTMENT')
  const [stockQuantity, setStockQuantity] = useState('')
  const [stockReason, setStockReason] = useState('')

  // Transfer state
  const [realEmployees, setRealEmployees] = useState<EmployeeItem[]>([])
  const [transferEmpId, setTransferEmpId] = useState<string>('')
  const [transferToStoreId, setTransferToStoreId] = useState<string>(
    realStores[0]?.id ?? '',
  )
  const [transferReason, setTransferReason] = useState<string>('')

  // Attendance state
  const [attUserId, setAttUserId] = useState<string>('')
  const [attStoreId, setAttStoreId] = useState<string>(
    realStores[0]?.id ?? '',
  )
  const [attCheckIn, setAttCheckIn] = useState<string>('')
  const [attCheckOut, setAttCheckOut] = useState<string>('')
  const [attReason, setAttReason] = useState<string>('')

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (!dialog.open) dialog.showModal()
  }, [])

  useEffect(() => {
    if (type === 'transfer' || type === 'attendance' || type === 'reset-pin') {
      employeesApi
        .list({ pageSize: 100 })
        .then((res) => {
          setRealEmployees(res.items)
          if (res.items.length > 0) {
            setTransferEmpId(res.items[0].id)
            setAttUserId(res.items[0].id)
            setPinEmployeeId(res.items.find((employee) => employee.role !== 'OWNER')?.id ?? '')
          }
        })
        .catch((err) => console.error('Lỗi nạp danh sách nhân viên cho modal:', err))
    }
  }, [type])

  useEffect(() => {
    if (type !== 'stock') return
    inventoryApi.ingredients()
      .then((rows) => {
        setStockIngredients(rows)
        setStockIngredientId(rows[0]?.id ?? '')
      })
      .catch((err) => setErrorMsg(err instanceof Error ? err.message : 'Không tải được nguyên liệu.'))
  }, [type])

  const titles: Record<Exclude<Modal, null>, string> = {
    'create-employee': 'Thêm nhân viên',
    'reset-pin': 'Đặt lại PIN máy POS',
    'edit-employee': 'Chỉnh sửa nhân viên',
    transfer: 'Điều chuyển nhân viên',
    stock: 'Kiểm kê / hao hụt kho',
    attendance: 'Bổ sung ca làm việc (Chấm công)',
  }

  const handleCreateEmployee = async () => {
    if (!effectiveEmployeeStoreId || employeeName.trim().length < 2 || !/^\d{4}$/.test(employeePin)) {
      setErrorMsg('Nhập tên, chi nhánh và PIN đúng 4 chữ số.')
      return
    }
    if (employeeRole === 'STORE_MANAGER' && (!employeeEmail.trim() || employeeWebPassword.length < 12)) {
      setErrorMsg('Cửa hàng trưởng cần email và mật khẩu web tối thiểu 12 ký tự.')
      return
    }
    setLoading(true)
    setErrorMsg(null)
    try {
      await employeesApi.create({
        fullName: employeeName.trim(),
        role: employeeRole,
        homeStoreId: effectiveEmployeeStoreId,
        pin: employeePin,
        ...(employeeRole === 'STORE_MANAGER'
          ? { email: employeeEmail.trim(), webPassword: employeeWebPassword }
          : {}),
      })
      onSuccess?.()
      close()
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể tạo nhân viên.')
    } finally {
      setLoading(false)
    }
  }

  const handleResetPin = async () => {
    if (!pinEmployeeId || !/^\d{4}$/.test(newPin)) {
      setErrorMsg('Chọn nhân viên và nhập PIN mới đúng 4 chữ số.')
      return
    }
    setLoading(true)
    setErrorMsg(null)
    try {
      await employeesApi.resetPin(pinEmployeeId, newPin)
      onSuccess?.()
      close()
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể đặt lại PIN.')
    } finally {
      setLoading(false)
    }
  }

  const handleEditEmployee = async () => {
    if (!selectedEmployee || editEmployeeName.trim().length < 2) {
      setErrorMsg('Vui lòng nhập họ tên hợp lệ.')
      return
    }
    if (editEmployeeStatus === 'TERMINATED' && selectedEmployee.status !== 'TERMINATED' &&
        !window.confirm('Nghỉ việc là trạng thái không thể khôi phục. Tiếp tục?')) return
    setLoading(true)
    setErrorMsg(null)
    try {
      await employeesApi.update(selectedEmployee.id, {
        fullName: editEmployeeName.trim(),
        status: editEmployeeStatus,
      })
      onSuccess?.()
      close()
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể cập nhật nhân viên.')
    } finally {
      setLoading(false)
    }
  }

  const handleStockAdjustment = async () => {
    const quantity = Number(stockQuantity)
    if (!targetStoreId || !stockIngredientId || !Number.isFinite(quantity) || quantity === 0 || !stockReason.trim()) {
      setErrorMsg('Chọn nguyên liệu, nhập số lượng khác 0 và lý do kiểm kê.')
      return
    }
    if (stockMovementType === 'WASTE' && quantity >= 0) {
      setErrorMsg('Hao hụt phải là số âm.')
      return
    }
    setLoading(true)
    setErrorMsg(null)
    try {
      await inventoryApi.adjust(targetStoreId, stockMovementType, [{ ingredientId: stockIngredientId, quantityDelta: quantity }], stockReason.trim())
      onSuccess?.()
      close()
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể điều chỉnh kho.')
    } finally {
      setLoading(false)
    }
  }

  const handleTransfer = async () => {
    if (!transferEmpId || !transferToStoreId) {
      setErrorMsg('Vui lòng chọn nhân viên và chi nhánh đích.')
      return
    }
    setLoading(true)
    setErrorMsg(null)
    try {
      await employeesApi.transfer(transferEmpId, transferToStoreId, transferReason)
      alert('Điều chuyển nhân viên thành công!')
      if (onSuccess) onSuccess()
      close()
    } catch (err: any) {
      setErrorMsg(err.message || 'Không thể điều chuyển nhân viên.')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateManualAttendance = async () => {
    if (!attUserId || !attStoreId || !attCheckIn || !attCheckOut || !attReason) {
      setErrorMsg('Vui lòng điền đầy đủ các thông tin ca làm việc và lý do.')
      return
    }
    setLoading(true)
    setErrorMsg(null)
    try {
      await attendanceApi.createManual({
        userId: attUserId,
        storeId: attStoreId,
        checkInAt: new Date(attCheckIn).toISOString(),
        checkOutAt: new Date(attCheckOut).toISOString(),
        reason: attReason,
      })
      alert('Bổ sung ca chấm công thành công!')
      if (onSuccess) onSuccess()
      close()
    } catch (err: any) {
      setErrorMsg(err.message || 'Không thể bổ sung ca chấm công.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <dialog
      ref={ref}
      className="dialog"
      onClose={close}
      onClick={(event) => {
        if (event.target === ref.current) ref.current?.close()
      }}
    >
      <div className="dialog__head">
        <div>
          <span className="eyebrow">THAO TÁC NGHIỆP VỤ</span>
          <h2>{titles[type]}</h2>
        </div>
        <button
          className="icon-button"
          onClick={() => ref.current?.close()}
          aria-label="Đóng"
        >
          <Icon name="close" size={20} />
        </button>
      </div>

      <div className="dialog__fields">
        {errorMsg && (
          <p className="form-error" role="alert" style={{ color: 'var(--color-red)' }}>
            {errorMsg}
          </p>
        )}

        {type === 'create-employee' && (
          <>
            <label>
              Họ và tên
              <input value={employeeName} onChange={(event) => setEmployeeName(event.target.value)} maxLength={120} />
            </label>
            <label>
              Vai trò
              <select
                value={employeeRole}
                onChange={(event) => setEmployeeRole(event.target.value as 'EMPLOYEE' | 'STORE_MANAGER')}
              >
                <option value="EMPLOYEE">Nhân viên</option>
                <option value="STORE_MANAGER">Cửa hàng trưởng</option>
              </select>
            </label>
            <label>
              Chi nhánh nhà
              <select value={effectiveEmployeeStoreId} onChange={(event) => setEmployeeStoreId(event.target.value)}>
                {realStores.length === 0 && <option value="">Chưa có chi nhánh</option>}
                {realStores.map((store) => (
                  <option key={store.id} value={store.id}>{store.name} ({store.code})</option>
                ))}
              </select>
            </label>
            <label>
              PIN POS (4 chữ số)
              <input
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                maxLength={4}
                value={employeePin}
                onChange={(event) => setEmployeePin(event.target.value)}
              />
            </label>
            {employeeRole === 'STORE_MANAGER' && (
              <>
                <label>
                  Email đăng nhập web
                  <input
                    type="email"
                    autoComplete="off"
                    value={employeeEmail}
                    onChange={(event) => setEmployeeEmail(event.target.value)}
                  />
                </label>
                <label>
                  Mật khẩu web ban đầu (ít nhất 12 ký tự)
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={employeeWebPassword}
                    onChange={(event) => setEmployeeWebPassword(event.target.value)}
                  />
                </label>
              </>
            )}
          </>
        )}

        {type === 'reset-pin' && (
          <>
            <label>
              Nhân viên
              <select value={pinEmployeeId} onChange={(event) => setPinEmployeeId(event.target.value)}>
                {realEmployees.filter((employee) => employee.role !== 'OWNER').map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.employeeCode} · {employee.fullName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              PIN mới (4 chữ số)
              <input
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                maxLength={4}
                value={newPin}
                onChange={(event) => setNewPin(event.target.value)}
              />
            </label>
            <p>Đặt lại PIN sẽ thu hồi phiên thu ngân đang hoạt động của nhân viên.</p>
          </>
        )}

        {type === 'edit-employee' && selectedEmployee && (
          <>
            <p>Mã nhân viên: <strong>{selectedEmployee.employeeCode}</strong> · Chi nhánh nhà: {selectedEmployee.homeStoreName}</p>
            <label>
              Họ và tên
              <input value={editEmployeeName} maxLength={120} onChange={(event) => setEditEmployeeName(event.target.value)} />
            </label>
            <label>
              Trạng thái
              <select value={editEmployeeStatus} onChange={(event) => setEditEmployeeStatus(event.target.value as 'ACTIVE' | 'SUSPENDED' | 'TERMINATED')}>
                <option value="ACTIVE" disabled={selectedEmployee.status === 'TERMINATED'}>Đang làm việc</option>
                <option value="SUSPENDED" disabled={selectedEmployee.status === 'TERMINATED'}>Tạm khóa</option>
                <option value="TERMINATED">Nghỉ việc (không thể khôi phục)</option>
              </select>
            </label>
            <p>Tạm khóa/nghỉ việc sẽ thu hồi phiên thu ngân đang hoạt động. Đổi chi nhánh nhà dùng chức năng Điều chuyển.</p>
          </>
        )}

        {type === 'transfer' && (
          <>
            <label>
              Nhân viên cần chuyển:
              <select
                value={transferEmpId}
                onChange={(e) => setTransferEmpId(e.target.value)}
              >
                {realEmployees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.employeeCode} · {emp.fullName} ({emp.homeStoreName || 'Chưa có store'})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Chi nhánh mới tiếp nhận:
              <select
                value={transferToStoreId}
                onChange={(e) => setTransferToStoreId(e.target.value)}
              >
                {realStores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Lý do điều chuyển:
              <input
                value={transferReason}
                onChange={(e) => setTransferReason(e.target.value)}
                placeholder="Ví dụ: Tăng cường nhân sự chi nhánh mới"
              />
            </label>
          </>
        )}

        {type === 'stock' && (
          <>
            <p>Chi nhánh: <strong>{realStores.find((item) => item.id === targetStoreId)?.name ?? 'Chưa chọn'}</strong></p>
            <label>
              Loại ghi nhận
              <select value={stockMovementType} onChange={(event) => setStockMovementType(event.target.value as 'ADJUSTMENT' | 'WASTE')}>
                <option value="ADJUSTMENT">Chênh lệch kiểm kê (+/-)</option>
                <option value="WASTE">Hao hụt (-)</option>
              </select>
            </label>
            <label>
              Nguyên liệu
              <select value={stockIngredientId} onChange={(event) => setStockIngredientId(event.target.value)}>
                {stockIngredients.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.baseUnit})</option>)}
              </select>
            </label>
            <label>
              Biến động số lượng (đơn vị cơ sở)
              <input type="number" step="any" value={stockQuantity} onChange={(event) => setStockQuantity(event.target.value)} placeholder="Ví dụ: -10" />
            </label>
            <label>
              Lý do
              <input value={stockReason} onChange={(event) => setStockReason(event.target.value)} placeholder="Ví dụ: Hao hụt khi pha chế" />
            </label>
          </>
        )}

        {type === 'attendance' && (
          <>
            <label>
              Nhân viên:
              <select
                value={attUserId}
                onChange={(e) => setAttUserId(e.target.value)}
              >
                {realEmployees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.employeeCode} · {emp.fullName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Chi nhánh làm việc:
              <select
                value={attStoreId}
                onChange={(e) => setAttStoreId(e.target.value)}
              >
                {realStores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Thời gian vào ca (Check-in):
              <input
                type="datetime-local"
                value={attCheckIn}
                onChange={(e) => setAttCheckIn(e.target.value)}
              />
            </label>
            <label>
              Thời gian ra ca (Check-out):
              <input
                type="datetime-local"
                value={attCheckOut}
                onChange={(e) => setAttCheckOut(e.target.value)}
              />
            </label>
            <label>
              Lý do bổ sung ca:
              <input
                value={attReason}
                onChange={(e) => setAttReason(e.target.value)}
                placeholder="Ví dụ: Quên mang thẻ / máy chấm công bận"
              />
            </label>
          </>
        )}

      </div>

      <div className="dialog__foot">
        <div>
          <Button variant="secondary" onClick={() => ref.current?.close()}>
            Đóng
          </Button>
          {type === 'create-employee' ? (
            <Button onClick={handleCreateEmployee} disabled={loading || !effectiveEmployeeStoreId}>
              {loading ? 'Đang tạo...' : 'Tạo nhân viên'}
            </Button>
          ) : type === 'reset-pin' ? (
            <Button onClick={handleResetPin} disabled={loading || !pinEmployeeId}>
              {loading ? 'Đang lưu...' : 'Đặt lại PIN'}
            </Button>
          ) : type === 'edit-employee' ? (
            <Button onClick={handleEditEmployee} disabled={loading || !selectedEmployee}>
              {loading ? 'Đang lưu...' : 'Lưu thay đổi'}
            </Button>
          ) : type === 'transfer' ? (
            <Button
              onClick={handleTransfer}
              disabled={loading}
            >
              {loading ? 'Đang xử lý...' : 'Xác nhận điều chuyển'}
            </Button>
          ) : type === 'attendance' ? (
            <Button
              onClick={handleCreateManualAttendance}
              disabled={loading}
            >
              {loading ? 'Đang lưu...' : 'Lưu ca bổ sung'}
            </Button>
          ) : type === 'stock' ? (
            <Button onClick={handleStockAdjustment} disabled={loading || !targetStoreId || !stockIngredientId}>
              {loading ? 'Đang lưu...' : 'Lưu kiểm kê'}
            </Button>
          ) : (
            <Button onClick={() => ref.current?.close()}>
              Lưu thay đổi
            </Button>
          )}
        </div>
      </div>
    </dialog>
  )
}

function App() {
  const { user, status, logout } = useAuth()
  const [page, setPage] = useState<Page>(getPage)
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(() => getGroupIdForPage(getPage()))
  const [selectedStore, setSelectedStore] = useState<string>('Toàn chuỗi')
  const [realStores, setRealStores] = useState<StoreResponse[]>([])
  const storeListVersion = useRef(0)
  const onStoresUpdated = useCallback((items: StoreResponse[]) => {
    storeListVersion.current++
    setRealStores(items)
    setSelectedStore(previous => user?.role === 'STORE_MANAGER'
      ? (items[0]?.name ?? 'Toàn chuỗi')
      : items.some(item => item.name === previous) ? previous : 'Toàn chuỗi')
  }, [user?.role])
  const [modal, setModal] = useState<Modal>(null)
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeItem | null>(null)
  const [selectedAdjustmentStoreId, setSelectedAdjustmentStoreId] = useState('')
  const [dataRevision, setDataRevision] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const pop = () => {
      const next = getPage()
      setPage(next)
      setExpandedGroupId(getGroupIdForPage(next))
    }
    window.addEventListener('popstate', pop)
    return () => window.removeEventListener('popstate', pop)
  }, [])

  useEffect(() => {
    let current = true
    const version = storeListVersion.current
    if (status === 'authenticated' && user) {
      storesApi
        .list()
        .then((items) => {
          if (!current || version !== storeListVersion.current) return
          onStoresUpdated(items)
        })
        .catch((err) => {
          console.error('Lỗi nạp danh sách chi nhánh:', err)
        })
    }
    return () => { current = false }
  }, [status, user, onStoresUpdated])

  const go = (next: Page) => {
    window.history.pushState({}, '', '/' + next)
    setPage(next)
    setExpandedGroupId(getGroupIdForPage(next))
    setMenuOpen(false)
    window.scrollTo(0, 0)
  }

  const toggleGroup = (groupId: string) => {
    setExpandedGroupId(previous => previous === groupId ? null : groupId)
  }

  if (status === 'loading') {
    return (
      <div className="login-loading-screen">
        <Icon name="coffee" size={36} />
        <p>Đang tải phiên làm việc...</p>
      </div>
    )
  }

  if (status === 'unauthenticated' || !user) {
    return <Login />
  }

  const role = user.role
  const userInitials = user.fullName
    .split(' ')
    .slice(-2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()

  return (
    <div className="shell">
      <button
        className={menuOpen ? 'scrim scrim--open' : 'scrim'}
        aria-label="Đóng menu"
        onClick={() => setMenuOpen(false)}
        tabIndex={menuOpen ? 0 : -1}
      />
      <aside className={menuOpen ? 'sidebar sidebar--open' : 'sidebar'}>
        <div className="brand">
          <span className="brand__mark">
            <img src={kaffeinLogo} alt="KAFFEIN" style={{ width: 26, height: 26, borderRadius: 6, objectFit: 'contain' }} />
          </span>
          <span>
            <strong>KAFFEIN</strong>
            <small>MANAGEMENT</small>
          </span>
        </div>
        <div className="sidebar__caption">KHÔNG GIAN LÀM VIỆC</div>
        <nav aria-label="Điều hướng chính" className="sidebar__nav">
          <button
            type="button"
            className={page === 'dashboard' ? 'nav-item nav-item--active' : 'nav-item'}
            aria-current={page === 'dashboard' ? 'page' : undefined}
            onClick={() => go('dashboard')}
          >
            <Icon name="dashboard" size={18} />
            <span>{pageTitle.dashboard}</span>
          </button>
          <div className="sidebar__divider" aria-hidden="true" />
          {navGroups.map(group => {
            const isExpanded = expandedGroupId === group.id
            const hasActiveChild = group.items.some(item => item.page === page)
            const triggerId = `sidebar-${group.id}-trigger`
            const contentId = `sidebar-${group.id}-items`
            return (
              <div key={group.id} className="nav-group-wrapper">
                <button
                  id={triggerId}
                  type="button"
                  className={[
                    'nav-group-trigger',
                    isExpanded && 'nav-group-trigger--open',
                    hasActiveChild && !isExpanded && 'nav-group-trigger--child-active',
                  ].filter(Boolean).join(' ')}
                  onClick={() => toggleGroup(group.id)}
                  aria-expanded={isExpanded}
                  aria-controls={contentId}
                >
                  <span className="nav-group-trigger__left">
                    <Icon name={group.icon} size={18} />
                    <span>{group.label}</span>
                  </span>
                  <span className={isExpanded ? 'nav-group-chevron nav-group-chevron--open' : 'nav-group-chevron'}>
                    <Icon name="chevron" size={14} />
                  </span>
                </button>
                <div
                  id={contentId}
                  className={isExpanded ? 'nav-group-collapse nav-group-collapse--open' : 'nav-group-collapse'}
                  role="region"
                  aria-labelledby={triggerId}
                  aria-hidden={!isExpanded}
                >
                  <div className="nav-group-collapse__inner">
                    <div className="nav-group-subitems">
                      {group.items.map(item => (
                        <button
                          key={item.page}
                          type="button"
                          tabIndex={isExpanded ? 0 : -1}
                          className={page === item.page ? 'nav-item nav-subitem nav-item--active' : 'nav-item nav-subitem'}
                          aria-current={page === item.page ? 'page' : undefined}
                          onClick={() => go(item.page)}
                        >
                          <Icon name={item.icon} size={16} />
                          <span>{pageTitle[item.page]}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </nav>
        <div className="sidebar__bottom">
          <div className="sidebar__user-badge">
            <span className="avatar avatar--small">{userInitials}</span>
            <div>
              <strong>{user.fullName}</strong>
              <small>{role === 'OWNER' ? 'Chủ chuỗi' : 'Cửa hàng trưởng'}</small>
            </div>
          </div>
          <button className="nav-item nav-item--logout" onClick={logout}>
            <Icon name="logout" size={18} />
            <span>Đăng xuất</span>
          </button>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <button
            className="icon-button topbar__menu"
            aria-label="Mở menu"
            onClick={() => setMenuOpen(true)}
          >
            <Icon name="menu" size={20} />
          </button>
          <div className="topbar__path">
            Không gian quản trị <Icon name="chevron" size={14} />{' '}
            <strong>{pageTitle[page]}</strong>
          </div>
          <div className="topbar__right">
            {role === 'OWNER' ? (
              <label className="topbar__store">
                <Icon name="store" size={17} />
                <span className="sr-only">Chọn chi nhánh</span>
                <select
                  value={selectedStore}
                  onChange={(event) => setSelectedStore(event.target.value)}
                >
                  <option value="Toàn chuỗi">Toàn chuỗi</option>
                  {realStores.map((item) => (
                    <option key={item.id} value={item.name}>{item.name}</option>
                  ))}
                </select>
              </label>
            ) : (
              <span
                className="topbar__store"
                title="Cửa hàng trưởng bị khóa vào chi nhánh nhà theo quy định hệ thống"
              >
                <Icon name="store" size={17} />{' '}
                {realStores.length > 0 ? realStores[0].name : selectedStore}
              </span>
            )}
            <span className="topbar__divider" />
            <span className="avatar">{userInitials}</span>
            <span className="topbar__profile">
              <strong>{user.fullName}</strong>
              <small>{role === 'OWNER' ? 'Chủ chuỗi' : 'Cửa hàng trưởng'}</small>
            </span>
          </div>
        </header>

        <main className="content">
          {page === 'dashboard' && (
            <Dashboard
              role={role}
              store={selectedStore}
              go={go}
              realStores={realStores}
            />
          )}
          {page === 'stores' && (
            <StoreLifecyclePage
              role={role}
              homeStoreId={user.homeStoreId}
              store={selectedStore}
              realStores={realStores}
              onStoresChange={onStoresUpdated}
            />
          )}
          {(page === 'menu-products' || page === 'menu-categories' || page === 'menu-toppings') && (
            <Menu role={role} view={page === 'menu-products' ? 'products' : page === 'menu-categories' ? 'categories' : 'toppings'} />
          )}
          {(page === 'inventory-balances' || page === 'inventory-ingredients' || page === 'inventory-recipes') && (
            <Inventory
              role={role}
              store={selectedStore}
              onAdjust={(storeId) => {
                setSelectedAdjustmentStoreId(storeId)
                setModal('stock')
              }}
              realStores={realStores}
              refreshKey={dataRevision}
              view={page === 'inventory-balances' ? 'balances' : page === 'inventory-ingredients' ? 'ingredients' : 'recipes'}
            />
          )}
          {page === 'inventory-receipts' && (
            <StockReceiptsPage key={selectedStore} role={role} homeStoreId={user.homeStoreId} store={selectedStore} stores={realStores} />
          )}
          {(page === 'hr-attendance' || page === 'hr-employees') && (
            <HR
              role={role}
              store={selectedStore}
              open={setModal}
              onEditEmployee={(employee) => {
                setSelectedEmployee(employee)
                setModal('edit-employee')
              }}
              realStores={realStores}
              refreshKey={dataRevision}
              view={page === 'hr-attendance' ? 'attendance' : 'employees'}
            />
          )}
          {page === 'sales' && (
            <Sales role={role} store={selectedStore} realStores={realStores} />
          )}
          {page === 'register' && (
            <Register role={role} store={selectedStore} realStores={realStores} />
          )}
        </main>
      </div>

      {modal && (
        <ActionModal
          type={modal}
          close={() => setModal(null)}
          realStores={realStores}
          onSuccess={() => setDataRevision((revision) => revision + 1)}
          selectedEmployee={selectedEmployee}
          targetStoreId={selectedAdjustmentStoreId}
        />
      )}
    </div>
  )
}

export default App
