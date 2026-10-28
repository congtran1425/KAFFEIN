export type IconName = 'coffee' | 'dashboard' | 'store' | 'menu' | 'bars' | 'box' | 'users' | 'receipt' | 'wallet' | 'search' | 'plus' | 'arrow' | 'chevron' | 'check' | 'alert' | 'monitor' | 'clock' | 'calendar' | 'close' | 'logout' | 'info' | 'download' | 'eye' | 'eyeOff' | 'trend' | 'wifi' | 'lock'

const paths: Record<IconName, React.ReactNode> = {
  coffee: <><path d="M4 8h13v7a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8Z" /><path d="M17 9h2a3 3 0 0 1 0 6h-2M3 21h16M8 3v2m4-2v2" /></>,
  dashboard: <><rect x="3" y="3" width="7" height="8" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="15" width="7" height="6" rx="1" /></>,
  store: <><path d="M3 10h18l-2-6H5l-2 6Zm1 0v10h16V10M9 20v-7h6v7" /><path d="M7 10v2m5-2v2m5-2v2" /></>,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  bars: <path d="M4 6h16M4 12h16M4 18h16" />,
  box: <><path d="m3 7 9-4 9 4v10l-9 4-9-4V7Zm0 0 9 4 9-4m-9 4v10" /></>,
  users: <><circle cx="9" cy="8" r="3" /><path d="M3 20v-2a6 6 0 0 1 12 0v2H3Zm13-15a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5v1h-3" /></>,
  receipt: <><path d="M5 3h14v18l-3-2-4 2-4-2-3 2V3Zm4 5h6M9 12h6" /></>,
  wallet: <><rect x="3" y="6" width="18" height="14" rx="2" /><path d="M4 6V4h14v2m3 5h-6v4h6" /></>,
  search: <><circle cx="10" cy="10" r="6" /><path d="m14.5 14.5 6 6" /></>,
  plus: <path d="M12 4v16M4 12h16" />,
  arrow: <path d="M4 12h16m-7-7 7 7-7 7" />,
  chevron: <path d="m9 5 7 7-7 7" />,
  check: <path d="m4 12 5 5L20 6" />,
  alert: <><path d="m12 3 10 18H2L12 3Z" /><path d="M12 9v5m0 3h.01" /></>,
  monitor: <><rect x="3" y="4" width="18" height="14" rx="2" /><path d="M8 21h8m-4-3v3" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l4 2" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4m10-4v4M3 10h18" /></>,
  close: <path d="M5 5 19 19M19 5 5 19" />,
  logout: <><path d="M9 3H4v18h5m5-4 5-5-5-5m-9 5h14" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6m0-10h.01" /></>,
  download: <><path d="M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4" /></>,
  eye: <><path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12Z" /><circle cx="12" cy="12" r="2.5" /></>,
  eyeOff: <><path d="M2 2 22 22M9 6.4A11 11 0 0 1 12 6c6 0 10 6 10 6a16 16 0 0 1-3 3.3M6 8A16 16 0 0 0 2 12s4 6 10 6a10 10 0 0 0 4-.8" /></>,
  trend: <path d="M3 18 9 12l4 4 8-9m-5 0h5v5" />,
  wifi: <><path d="M3 9a14 14 0 0 1 18 0M6 12a10 10 0 0 1 12 0m-9 3a5 5 0 0 1 6 0M12 19h.01" /></>,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
}

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}
