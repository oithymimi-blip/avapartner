import { useState, useEffect, useRef } from 'react'
import { Routes, Route, Link, useNavigate, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './store'
import { useAdminAuth } from './adminStore'
import { api } from './api'
import { useAccount } from './accountStore'
import { useNotificationsStore } from './notificationsStore'
import { socket } from './socket'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Landing from './pages/Landing'
import FAQ from './pages/FAQ'
import Terms from './pages/Terms'
import AboutCompany from './pages/AboutCompany'
import WhoWeAre from './pages/WhoWeAre'
import Careers from './pages/Careers'
import CPAProgram from './pages/CPAProgram'
import RevShare from './pages/RevShare'
import MasterIB from './pages/MasterIB'
import Contact from './pages/Contact'
import HelpCenter from './pages/HelpCenter'
import PrivacyPolicy from './pages/PrivacyPolicy'
import RiskWarning from './pages/RiskWarning'
import WhyUs from './pages/WhyUs'
import Commissions from './pages/Commissions'
import Partners from './pages/Partners'
import Blog from './pages/Blog'
import UserDashboard from './pages/UserDashboard'
import Profile from './pages/Profile'
import History from './pages/History'
import Referral from './pages/Referral'
import IBDashboard from './pages/IBDashboard'
import ResetPassword from './pages/ResetPassword'
import AdminLogin from './pages/AdminLogin'
import AdminLayout from './pages/admin/AdminLayout'
import AdminDashboard from './pages/AdminDashboard'
import AdminUsersPage from './pages/admin/AdminUsersPage'
import AdminVerificationsPage from './pages/admin/AdminVerificationsPage'
import AdminNotificationsPage from './pages/admin/AdminNotificationsPage'
import AdminRolesPage from './pages/admin/AdminRolesPage'
import AdminMarketControlPage from './pages/admin/MarketControlPage'
import AdminSpotMarketsPage from './pages/admin/AdminSpotMarketsPage'
import AdminLeaderboardPage from './pages/admin/AdminLeaderboardPage'
import WalletDeposit from './pages/WalletDeposit'
import WalletWithdraw from './pages/WalletWithdraw'
import Security from './pages/Security'
import AdminDepositsPage from './pages/admin/AdminDepositsPage'
import AdminWithdrawalsPage from './pages/admin/AdminWithdrawalsPage'
import AdminFeaturesPage from './pages/admin/AdminFeaturesPage'
import AdminIBAffiliatesPage from './pages/admin/AdminIBAffiliatesPage'
import InstallAppButton from './components/InstallAppButton'

const navCurrency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

function BellIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}

function SunIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  )
}

function MoonIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

function Shell({ children }) {
  const location = useLocation()
  const { user, token, logout } = useAuth()
  const accountSummary = useAccount(state => state.summary)
  const setAccountSummary = useAccount(state => state.setSummary)
  const notifications = useNotificationsStore(state => state.notifications)
  const unread = useNotificationsStore(state => state.unread)
  const setNotifications = useNotificationsStore(state => state.setNotifications)
  const appendNotification = useNotificationsStore(state => state.appendNotification)
  const markAllRead = useNotificationsStore(state => state.markAllRead)
  const [menuOpen, setMenuOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [balanceHidden, setBalanceHidden] = useState(() => localStorage.getItem('balance_hidden') === '1')
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark')
  const nav = useNavigate()
  const menuRef = useRef(null)
  const notifRef = useRef(null)

  useEffect(() => {
    const root = document.documentElement
    const bodyEl = document.body
    const applied = theme === 'light' ? 'theme-light' : 'theme-dark'

    root.classList.remove('theme-light', 'theme-dark')
    bodyEl.classList.remove('theme-light', 'theme-dark')

    root.classList.add(applied)
    bodyEl.classList.add(applied)

    localStorage.setItem('theme', theme)
  }, [theme])



  useEffect(() => {
    if (!token) return
    if (accountSummary) return
    api(token).get('/api/trades/overview', { params: { limit: 1 } })
      .then(res => setAccountSummary(res.data))
      .catch(err => console.error('Failed to load account summary', err))
  }, [token, accountSummary, setAccountSummary])

  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false)
      }
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setNotifOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (!token) return
    api(token).get('/api/notifications')
      .then(res => setNotifications(res.data.notifications || [], res.data.unread || 0))
      .catch(err => console.error('Failed to load notifications', err))
  }, [token, setNotifications])

  useEffect(() => {
    if (!token) return

    const playNotificationSound = () => {
      if (typeof window === 'undefined') return
      const AudioContext = window.AudioContext || window.webkitAudioContext
      if (!AudioContext) return
      try {
        const ctx = new AudioContext()
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.value = 880
        osc.connect(gain)
        gain.connect(ctx.destination)
        const now = ctx.currentTime
        gain.gain.setValueAtTime(0.0001, now)
        gain.gain.exponentialRampToValueAtTime(0.1, now + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4)
        osc.start(now)
        osc.stop(now + 0.4)
        setTimeout(() => ctx.close(), 500)
      } catch (err) {
        // ignore sound errors
      }
    }

    const handleNotification = ({ notification }) => {
      if (!notification) return
      if (notification.user_id && user?.id && notification.user_id !== user.id) return
      const alreadyOpen = notifOpen
      appendNotification(notification, { read: alreadyOpen })
      if (alreadyOpen) {
        api(token).post('/api/notifications/read', { ids: [notification.id] }).catch(() => {})
      } else {
        playNotificationSound()
      }
    }

    const handleDataUpdate = (payload) => {
      if (payload?.user_id === user?.id && payload?.type === 'deposit_credited') {
        // Globally refresh balance when a deposit credits
        api(token).get('/api/trades/overview', { params: { limit: 1 } })
          .then(res => setAccountSummary(res.data))
          .catch(err => console.error('Failed to refresh balance globally', err))
      }
    }

    socket.on('notification', handleNotification)
    socket.on('user_data_update', handleDataUpdate)
    return () => {
      socket.off('notification', handleNotification)
      socket.off('user_data_update', handleDataUpdate)
    }
  }, [token, user?.id, appendNotification, notifOpen, setAccountSummary])

  const balanceValue = accountSummary?.equity ?? accountSummary?.balance?.total ?? 0
  const formattedBalance = balanceHidden ? '•••••' : navCurrency.format(balanceValue)

  const toggleBalance = () => {
    setBalanceHidden(prev => {
      const next = !prev
      localStorage.setItem('balance_hidden', next ? '1' : '0')
      return next
    })
  }

  const handleNavigate = (path) => {
    setMenuOpen(false)
    nav(path)
  }

  const toggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'))
  }

  const menuItems = []
  if (user) {
    menuItems.push({ label: 'Trade', path: '/dashboard' })
    menuItems.push({ label: 'History', path: '/history' })
    menuItems.push({ label: 'Profile', path: '/profile' })
    menuItems.push({ label: 'Affiliate Program', path: '/referral' })
    menuItems.push({ label: 'IB Dashboard', path: '/ib-dashboard' })
    menuItems.push({ label: 'Deposit', path: '/wallet/deposit' })
    menuItems.push({ label: 'Withdraw', path: '/wallet/withdraw' })
    menuItems.push({ label: 'Security', path: '/security' })
  }

  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden w-full max-w-full">
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#070b12]/95 backdrop-blur-md border-b border-white/10 w-full">
        <div className="max-w-6xl mx-auto flex flex-nowrap items-center justify-between gap-2 px-2 sm:px-4 py-2 sm:py-3">
          <div className="flex items-center gap-2 sm:gap-6 flex-shrink-0">
            <Link to={user ? '/dashboard?tab=ai_trade' : '/'} className="flex items-center gap-2.5 flex-shrink-0 group">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand via-emerald-400 to-sky-500 flex items-center justify-center font-black text-black text-sm shadow-soft shadow-brand/25 group-hover:scale-105 transition-transform">
                AP
              </div>
              <div className="hidden sm:flex flex-col leading-none">
                <span className="font-extrabold text-white tracking-tight text-lg">Ava<span className="text-brand">Partner</span></span>
                <span className="text-[9px] uppercase tracking-[0.2em] text-white/45 font-semibold">Official Network</span>
              </div>
            </Link>
            
            {/* Desktop Nav */}
            {!user && (
              <nav className="hidden md:flex items-center gap-3 text-[11px] font-bold tracking-wider text-white/60 uppercase">
                <Link to="/why-us" className="hover:text-white transition-colors">Why Us?</Link>
                <div className="w-px h-3 bg-white/20"></div>
                <Link to="/about" className="hover:text-white transition-colors">About</Link>
                <div className="w-px h-3 bg-white/20"></div>
                <Link to="/who-we-are" className="hover:text-white transition-colors">Team</Link>
                <div className="w-px h-3 bg-white/20"></div>
                <Link to="/master-ib" className="hover:text-white transition-colors">IB</Link>
                <div className="w-px h-3 bg-white/20"></div>
                <Link to="/commissions" className="hover:text-white transition-colors">Commissions</Link>
                <div className="w-px h-3 bg-white/20"></div>
                <Link to="/partners" className="text-brand hover:text-brand-light transition-colors">Partners</Link>
                <div className="w-px h-3 bg-white/20"></div>
                <Link to="/blog" className="hover:text-white transition-colors">Blog</Link>
              </nav>
            )}
          </div>
          
          {user && (
            <div className="flex-1 flex items-center justify-center gap-2 px-1 overflow-hidden">
              <Link to="/wallet/deposit" className="bg-brand text-black font-bold px-3.5 sm:px-4 py-1.5 rounded-full text-[11px] sm:text-xs shadow-md shadow-brand/20 hover:bg-emerald-400 transition-colors whitespace-nowrap">
                Add Funds
              </Link>
              <InstallAppButton variant="nav" />
            </div>
          )}

          <div className={`flex items-center gap-1.5 sm:gap-3 flex-nowrap justify-end flex-shrink-0 ${!user ? 'flex-1' : ''}`}>
            {user && (
              <div className="balance-chip flex items-center gap-2 bg-black/30 border border-white/10 rounded-full px-4 py-1.5 text-xs sm:text-sm font-mono">
                <span className="tracking-tight">{formattedBalance}</span>
                <button onClick={toggleBalance} className="text-brand hover:text-brand-dark transition-colors">
                  {balanceHidden ? <EyeClosedIcon className="w-4 h-4" /> : <EyeOpenIcon className="w-4 h-4" />}
                </button>
              </div>
            )}
            {!user && (
              <div className="flex items-center gap-2 text-xs sm:text-sm">
                <InstallAppButton variant="nav" />
                <Link to="/login" className="btn px-3 py-1.5 sm:px-4 sm:py-2">Login</Link>
                <Link to="/signup" className="btn bg-white text-black px-3 py-1.5 sm:px-4 sm:py-2">Sign up</Link>
              </div>
            )}
            {user && (
              <div className="relative" ref={notifRef}>
                <button
                  className="nav-icon relative flex items-center justify-center w-9 h-9 rounded-full bg-black/30 border border-white/10 text-white/80 hover:text-white transition-colors"
                  onClick={() => {
                    const next = !notifOpen
                    setNotifOpen(next)
                    if (next && unread > 0) {
                      api(token).post('/api/notifications/read-all').then(() => markAllRead()).catch(() => {})
                    }
                  }}
                  aria-label="Toggle notifications"
                >
                  <BellIcon className="w-4 h-4" />
                  {unread > 0 && (
                    <span className="absolute -top-1 -right-1 bg-brand text-black text-[10px] font-semibold rounded-full px-1 min-w-[16px] h-4 flex items-center justify-center">
                      {unread > 9 ? '9+' : unread}
                    </span>
                  )}
                </button>
                {notifOpen && (
                  <div className="fixed inset-0 z-[75] flex items-start justify-center sm:absolute sm:inset-auto sm:top-full sm:right-0 sm:z-50 sm:block sm:flex-none">
                    <button
                      type="button"
                      className="absolute inset-0 bg-black/60 backdrop-blur-sm sm:hidden"
                      onClick={() => setNotifOpen(false)}
                      aria-label="Close notifications overlay"
                    />
                    <div className="notification-panel relative mt-16 w-[min(420px,calc(100%-2rem))] sm:mt-2 mx-auto sm:mx-0 sm:w-72 md:w-80 max-h-[70vh] sm:max-h-[55vh] overflow-hidden rounded-3xl sm:rounded-2xl border border-white/10 bg-[#0b0f13]/95 shadow-soft backdrop-blur text-[11px]">
                      <div className="px-4 py-3 border-b border-white/10 font-semibold flex items-center justify-between sticky top-0 bg-[#0b0f13]/95 z-10 text-[10px] uppercase tracking-wide">
                        <span className="truncate">Notifications</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] text-white/45 flex-shrink-0">{notifications.length} total</span>
                          <button
                            type="button"
                            onClick={() => setNotifOpen(false)}
                            className="text-[10px] text-white/60 hover:text-white transition-colors sm:hidden"
                          >
                            Close
                          </button>
                        </div>
                      </div>
                      <div className="divide-y divide-white/5 max-h-[calc(70vh-72px)] sm:max-h-[calc(55vh-56px)] overflow-y-auto px-1">
                        {notifications.length === 0 && (
                          <div className="px-4 py-8 text-white/50 text-[11px] text-center space-y-2">
                            <div className="w-10 h-10 mx-auto mb-2 rounded-full bg-white/5 flex items-center justify-center">
                              <BellIcon className="w-5 h-5 text-white/30" />
                            </div>
                            No notifications yet
                          </div>
                        )}
                        {notifications.map(n => (
                          <div key={n.id} className={`px-2 py-2.5 hover:bg-white/5 transition-colors ${n.is_read ? 'bg-transparent' : 'bg-brand/10 border-l-[3px] border-brand/70'}`}>
                            <div className="w-full space-y-1">
                              <div className="flex items-center gap-1.5 text-[9px] text-white/40 font-mono">
                                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${n.is_read ? 'bg-white/20' : 'bg-brand'}`}></div>
                                <span>{new Date(n.created_at).toLocaleDateString()} {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                              </div>
                              <div className="font-semibold text-white leading-tight text-[11px] notification-content break-words whitespace-pre-wrap">{n.title}</div>
                              <div className="text-white/65 text-[10px] leading-snug notification-message break-words whitespace-pre-wrap">{n.message}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                      {notifications.length > 0 && (
                        <div className="px-4 py-3 border-t border-white/10">
                          <button
                            onClick={() => {
                              api(token).post('/api/notifications/read-all').then(() => markAllRead()).catch(() => {})
                            }}
                            className="text-[10px] text-brand hover:text-brand-dark transition-colors notification-content"
                          >
                            Mark all as read
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
            {user && (
              <div className="relative" ref={menuRef}>
                <button
                  className="nav-icon flex items-center gap-2 bg-black/30 border border-white/10 rounded-full px-3 py-1 text-sm"
                  onClick={() => setMenuOpen(o => !o)}
                >
                  <div className="w-8 h-8 rounded-full bg-brand/20 flex items-center justify-center text-brand font-semibold">
                    {user.name?.[0]?.toUpperCase?.() || user.email?.[0]?.toUpperCase?.() || 'U'}
                  </div>
                  <span className="hidden sm:block">{user.name || user.email}</span>
                </button>
                {menuOpen && (
                  <div className="absolute right-0 mt-2 w-56 rounded-xl border border-white/10 bg-[#0b0f13] shadow-soft p-2 space-y-1 text-sm">
                    <div className="pb-1 mb-1 border-b border-white/10">
                      <InstallAppButton variant="menu" />
                    </div>
                    {menuItems.map(item => (
                      <button
                        key={item.path}
                        onClick={() => handleNavigate(item.path)}
                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/10"
                      >{item.label}</button>
                    ))}
                    <button
                      onClick={toggleTheme}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/10 flex items-center gap-2"
                    >
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-white text-slate-900">
                        {theme === 'light' ? <MoonIcon className="w-3.5 h-3.5" /> : <SunIcon className="w-3.5 h-3.5" />}
                      </span>
                      <span>{theme === 'light' ? 'Night mode' : 'Day mode'}</span>
                    </button>
                    <button
                      onClick={() => { setMenuOpen(false); logout(); nav('/'); }}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/10 text-rose-400"
                    >Log out</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-6xl mx-auto w-full px-3 sm:px-4 pb-6 mt-[52px] sm:mt-[60px] min-w-0">
        {children}
      </main>
      {!user && (
        <footer className="border-t border-white/10 bg-[#05080e]">
          <div className="max-w-6xl mx-auto px-4 py-14">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-10 mb-10">
              <div className="md:col-span-4 space-y-4">
                <Link to="/" className="inline-flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand via-emerald-400 to-sky-500 flex items-center justify-center font-black text-black text-sm shadow-soft">
                    AP
                  </div>
                  <div className="flex flex-col leading-none">
                    <span className="font-extrabold text-white tracking-tight text-lg">Ava<span className="text-brand">Partner</span></span>
                    <span className="text-[9px] uppercase tracking-[0.2em] text-white/45 font-semibold">Official Partner Network</span>
                  </div>
                </Link>
                <p className="text-xs text-white/55 leading-relaxed">
                  AvaPartner is the official global partner, affiliate, and Introducing Broker (IB) network of the AvaTrade Group (est. 2006). Regulated across 9 international jurisdictions with over $300,000,000 paid out to 150,000+ partners worldwide.
                </p>
                <div className="text-xs text-white/50 space-y-1 pt-1">
                  <div className="font-semibold text-white/75">🇮🇪 Official Global Headquarters</div>
                  <div>Five Lamps Place, Amiens Street, Dublin 1, D01 E4X0, Ireland</div>
                  <div>Regulated by the Central Bank of Ireland (No. C53877)</div>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 md:col-span-8 gap-8">
                <div>
                  <h4 className="text-white font-bold mb-4 text-sm uppercase tracking-wider">Company</h4>
                  <ul className="space-y-2.5 text-sm text-white/60">
                    <li><Link to="/about" className="hover:text-brand transition-colors">About AvaPartner</Link></li>
                    <li><Link to="/who-we-are" className="hover:text-brand transition-colors">Leadership & Team</Link></li>
                    <li><Link to="/why-us" className="hover:text-brand transition-colors">Why Choose Us</Link></li>
                    <li><Link to="/careers" className="hover:text-brand transition-colors">Global Careers</Link></li>
                    <li><Link to="/blog" className="hover:text-brand transition-colors">Partner Insights</Link></li>
                  </ul>
                </div>
                <div>
                  <h4 className="text-white font-bold mb-4 text-sm uppercase tracking-wider">Partnership</h4>
                  <ul className="space-y-2.5 text-sm text-white/60">
                    <li><Link to="/cpa" className="hover:text-brand transition-colors">CPA Program</Link></li>
                    <li><Link to="/revshare" className="hover:text-brand transition-colors">RevShare Model</Link></li>
                    <li><Link to="/master-ib" className="hover:text-brand transition-colors">Master IB Network</Link></li>
                    <li><Link to="/commissions" className="hover:text-brand transition-colors">Commission Plans</Link></li>
                    <li><Link to="/partners" className="hover:text-brand transition-colors">Partner Tiers</Link></li>
                  </ul>
                </div>
                <div>
                  <h4 className="text-white font-bold mb-4 text-sm uppercase tracking-wider">Support</h4>
                  <ul className="space-y-2.5 text-sm text-white/60">
                    <li><Link to="/contact" className="hover:text-brand transition-colors">Global Offices</Link></li>
                    <li><Link to="/faq" className="hover:text-brand transition-colors">Partner FAQ</Link></li>
                    <li><Link to="/help-center" className="hover:text-brand transition-colors">Help Center</Link></li>
                  </ul>
                </div>
                <div>
                  <h4 className="text-white font-bold mb-4 text-sm uppercase tracking-wider">Legal & Compliance</h4>
                  <ul className="space-y-2.5 text-sm text-white/60">
                    <li><Link to="/terms" className="hover:text-brand transition-colors">Terms & Conditions</Link></li>
                    <li><Link to="/privacy" className="hover:text-brand transition-colors">Privacy Policy</Link></li>
                    <li><Link to="/risk" className="hover:text-brand transition-colors">Risk Disclosure</Link></li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="border-t border-white/10 pt-6 pb-4 flex flex-wrap items-center justify-center gap-2 text-[11px] text-white/45">
              <span className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10">🇮🇪 Ireland (CBI)</span>
              <span className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10">🇦🇺 Australia (ASIC)</span>
              <span className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10">🇯🇵 Japan (FSA & FFAJ)</span>
              <span className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10">🇦🇪 UAE (ADGM FSRA)</span>
              <span className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10">🇿🇦 South Africa (FSCA)</span>
              <span className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10">🇨🇾 Cyprus (CySEC)</span>
              <span className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10">🇻🇬 BVI (FSC)</span>
              <span className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10">🇮🇱 Israel (ISA)</span>
              <span className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10">🇵🇱 Poland (KNF)</span>
            </div>

            <div className="text-center text-xs text-white/40 pt-4 border-t border-white/5">
              © {new Date().getFullYear()} AvaPartner — Official Partner Network of AvaTrade Group. All rights reserved.
            </div>
          </div>
        </footer>
      )}
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Shell><Landing /></Shell>} />
      <Route path="/why-us" element={<Shell><WhyUs /></Shell>} />
      <Route path="/commissions" element={<Shell><Commissions /></Shell>} />
      <Route path="/partners" element={<Shell><Partners /></Shell>} />
      <Route path="/blog" element={<Shell><Blog /></Shell>} />
      <Route path="/about" element={<Shell><AboutCompany /></Shell>} />
      <Route path="/who-we-are" element={<Shell><WhoWeAre /></Shell>} />
      <Route path="/careers" element={<Shell><Careers /></Shell>} />
      <Route path="/cpa" element={<Shell><CPAProgram /></Shell>} />
      <Route path="/revshare" element={<Shell><RevShare /></Shell>} />
      <Route path="/master-ib" element={<Shell><MasterIB /></Shell>} />
      <Route path="/contact" element={<Shell><Contact /></Shell>} />
      <Route path="/help-center" element={<Shell><HelpCenter /></Shell>} />
      <Route path="/faq" element={<Shell><FAQ /></Shell>} />
      <Route path="/terms" element={<Shell><Terms /></Shell>} />
      <Route path="/privacy" element={<Shell><PrivacyPolicy /></Shell>} />
      <Route path="/risk" element={<Shell><RiskWarning /></Shell>} />
      <Route path="/login" element={<Shell><Login /></Shell>} />
      <Route path="/signup" element={<Shell><Signup /></Shell>} />
      <Route path="/reset-password" element={<Shell><ResetPassword /></Shell>} />
      <Route path="/dashboard" element={<Shell><UserDashboard /></Shell>} />
      <Route path="/profile" element={<Shell><Profile /></Shell>} />
      <Route path="/history" element={<Shell><History /></Shell>} />
      <Route path="/referral" element={<Shell><Referral /></Shell>} />
      <Route path="/ib-dashboard" element={<Shell><IBDashboard /></Shell>} />
      <Route path="/security" element={<Shell><Security /></Shell>} />
      <Route path="/wallet" element={<Navigate to="/wallet/deposit" replace />} />
      <Route path="/wallet/deposit" element={<Shell><WalletDeposit /></Shell>} />
      <Route path="/wallet/withdraw" element={<Shell><WalletWithdraw /></Shell>} />
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin" element={<AdminProtectedRoute><AdminLayout /></AdminProtectedRoute>}>
        <Route index element={<AdminDashboard />} />
        <Route path="leaderboard" element={<AdminLeaderboardPage />} />
        <Route path="deposits" element={<AdminDepositsPage />} />
        <Route path="withdrawals" element={<AdminWithdrawalsPage />} />
        <Route path="market-control" element={<AdminMarketControlPage />} />
        <Route path="spot-markets" element={<AdminSpotMarketsPage />} />
        <Route path="users" element={<AdminUsersPage />} />
        <Route path="verifications" element={<AdminVerificationsPage />} />
        <Route path="notifications" element={<AdminNotificationsPage />} />
        <Route path="roles" element={<AdminRolesPage />} />
        <Route path="features" element={<AdminFeaturesPage />} />
        <Route path="ib-affiliates" element={<AdminIBAffiliatesPage />} />
      </Route>
    </Routes>
  )
}

function AdminProtectedRoute({ children }) {
  const { token } = useAdminAuth()
  if (!token) {
    return <Navigate to="/admin/login" replace />
  }
  return children
}
function EyeOpenIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function EyeClosedIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 19c-7 0-11-7-11-7a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M3 3l18 18" />
      <path d="M9.88 9.88A3 3 0 0 0 12 15a3 3 0 0 0 2.12-.88" />
    </svg>
  )
}
