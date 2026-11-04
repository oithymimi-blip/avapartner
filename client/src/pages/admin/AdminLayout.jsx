import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAdminAuth } from '../../adminStore'
import { useEffect, useState, useRef, useCallback } from 'react'
import { useAuth } from '../../store'
import { socket } from '../../socket'
import { api } from '../../api'

const navItems = [
  { label: 'Dashboard', icon: '📊', path: '/admin', permission: 'analytics' },
  { label: 'Leaderboard', icon: '🏆', path: '/admin/leaderboard', permission: 'analytics' },
  { label: 'Market Control', icon: '⚙️', path: '/admin/market-control', permission: 'market' },
  { label: 'Spot Markets', icon: '📈', path: '/admin/spot-markets', permission: 'market' },
  { label: 'Users', icon: '👥', path: '/admin/users', permission: 'users' },
  { label: 'IB & Affiliates', icon: '🤝', path: '/admin/ib-affiliates', permission: 'users' },
  { label: 'Deposits', icon: '💳', path: '/admin/deposits', permission: 'users' },
  { label: 'Withdrawals', icon: '💸', path: '/admin/withdrawals', permission: 'users' },
  { label: 'Verifications', icon: '📝', path: '/admin/verifications', permission: 'users' },
  { label: 'Notifications', icon: '🔔', path: '/admin/notifications', permission: 'notifications' },
  { label: 'Roles', icon: '🛡️', path: '/admin/roles', permission: 'admin_manage' },
  { label: 'Features', icon: '✨', path: '/admin/features', permission: 'market' }
]

// Web Audio API Chime Generator for crisp mobile & desktop notification sound
function playNotificationChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    if (ctx.state === 'suspended') {
      ctx.resume()
    }

    const now = ctx.currentTime
    const osc1 = ctx.createOscillator()
    const osc2 = ctx.createOscillator()
    const gain = ctx.createGain()

    osc1.type = 'sine'
    osc2.type = 'sine'

    // Play 2-tone pleasant alert sound (E5 -> A5)
    osc1.frequency.setValueAtTime(659.25, now)
    osc2.frequency.setValueAtTime(880.00, now + 0.12)

    gain.gain.setValueAtTime(0.35, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55)

    osc1.connect(gain)
    osc2.connect(gain)
    gain.connect(ctx.destination)

    osc1.start(now)
    osc1.stop(now + 0.12)
    osc2.start(now + 0.12)
    osc2.stop(now + 0.55)

    // Trigger mobile haptic vibration if supported
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([200, 100, 200])
    }
  } catch (e) {
    console.error('[AUDIO] Failed to play alert chime:', e)
  }
}

export default function AdminLayout() {
  const { token, admin, logout } = useAdminAuth()
  const { token: userToken } = useAuth()
  const nav = useNavigate()
  const location = useLocation()
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isNotifDropdownOpen, setIsNotifDropdownOpen] = useState(false)
  const [activeToast, setActiveToast] = useState(null)
  const [pushPermission, setPushPermission] = useState(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission
    }
    return 'default'
  })

  // Load existing admin notifications from backend
  const fetchAdminNotifications = useCallback(async () => {
    if (!token) return
    try {
      const res = await api(token).get('/api/admin/admin-notifications')
      setNotifications(res.data?.notifications || [])
      setUnreadCount(res.data?.unreadCount || 0)
    } catch (e) {
      // ignore
    }
  }, [token])

  useEffect(() => {
    if (!token) {
      nav('/admin/login', { replace: true })
    } else {
      fetchAdminNotifications()
    }
  }, [token, nav, fetchAdminNotifications])

  useEffect(() => {
    setIsSidebarOpen(false)
  }, [location.pathname])

  // Request native mobile browser push notifications
  const requestPushPermission = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        const perm = await Notification.requestPermission()
        setPushPermission(perm)
        if (perm === 'granted') {
          new Notification('Admin Notifications Active 🔔', {
            body: 'You will now receive push notifications for new signups, deposits, and withdrawals on mobile.',
            icon: '/icon-192.png'
          })
          playNotificationChime()
        }
      } catch (e) {
        console.error('Permission error:', e)
      }
    }
  }

  // Handle incoming real-time admin notification
  const handleAdminNotification = useCallback((notif) => {
    // 1. Play alert sound + vibrate
    playNotificationChime()

    // 2. Add to list and increment unread
    setNotifications(prev => [notif, ...prev])
    setUnreadCount(prev => prev + 1)

    // 3. Show floating toast banner at top of mobile screen
    setActiveToast(notif)
    setTimeout(() => {
      setActiveToast(prev => (prev?.id === notif.id ? null : prev))
    }, 6000)

    // 4. Trigger native mobile browser push notification if permitted
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        const nativeNotif = new Notification(notif.title || 'New Admin Activity', {
          body: notif.message,
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          tag: notif.type || 'admin_notif'
        })
        nativeNotif.onclick = () => {
          window.focus()
          if (notif.link) nav(notif.link)
        }
      } catch (e) {
        console.error('Push error:', e)
      }
    }
  }, [nav])

  useEffect(() => {
    socket.on('admin_notification', handleAdminNotification)
    return () => {
      socket.off('admin_notification', handleAdminNotification)
    }
  }, [handleAdminNotification])

  const markAllRead = async () => {
    if (!token) return
    try {
      await api(token).post('/api/admin/admin-notifications/read')
      setUnreadCount(0)
      setNotifications(prev => prev.map(n => ({ ...n, read: 1 })))
    } catch (e) {
      // ignore
    }
  }

  const can = (perm) => {
    if (admin?.role === 'admin') return true
    if (!perm) return !!admin
    const permissions = admin?.permissions || []
    return permissions.includes('all') || permissions.includes(perm)
  }

  if (!token) return null

  const navLinkBaseClasses = 'flex items-center gap-3 px-3 py-2 rounded-2xl text-sm font-medium transition'
  const activeNavLinkClasses = 'bg-white/10 text-white shadow-lg font-semibold ring-1 ring-white/20'
  const inactiveNavLinkClasses = 'text-slate-200 hover:bg-white/5'

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-950 to-indigo-950 text-slate-50 flex overflow-hidden relative">
      
      {/* Real-time Floating Mobile Toast Banner */}
      {activeToast && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-[100] w-[92%] max-w-md bg-slate-900/95 backdrop-blur-md border border-indigo-500/50 shadow-2xl rounded-2xl p-4 text-white flex items-start justify-between gap-3 animate-bounce">
          <div className="flex items-start gap-3 flex-1 cursor-pointer" onClick={() => { if (activeToast.link) nav(activeToast.link); setActiveToast(null) }}>
            <span className="text-2xl p-2 rounded-xl bg-indigo-500/20 border border-indigo-500/30 shrink-0">
              {activeToast.type === 'deposit' ? '💳' : activeToast.type === 'withdrawal' ? '💸' : activeToast.type === 'signup' ? '👤' : activeToast.type === 'verification' ? '📝' : '🔔'}
            </span>
            <div>
              <div className="font-bold text-sm text-indigo-300">{activeToast.title}</div>
              <div className="text-xs text-slate-200 mt-0.5">{activeToast.message}</div>
              <div className="text-[10px] text-slate-400 mt-1">Tap to open section →</div>
            </div>
          </div>
          <button className="text-slate-400 hover:text-white p-1" onClick={() => setActiveToast(null)}>
            ✕
          </button>
        </div>
      )}

      {/* Mobile Backdrop */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-900/95 backdrop-blur border-r border-white/10 flex flex-col transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold text-lg text-white">
            <span className="w-9 h-9 rounded-2xl bg-gradient-to-br from-brand via-emerald-400 to-sky-500 text-black flex items-center justify-center font-black">AP</span>
            AvaPartner Admin
          </div>
          <button className="md:hidden text-slate-300 hover:text-white" onClick={() => setIsSidebarOpen(false)}>
            ✕
          </button>
        </div>
        <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
          {navItems.filter(item => can(item.permission)).map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/admin'}
              className={({ isActive }) => `${navLinkBaseClasses} ${isActive ? activeNavLinkClasses : inactiveNavLinkClasses}`}
            >
              <span className="text-lg">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="px-4 py-4 border-t border-white/10">
          <button
            className="w-full rounded-xl border border-white/20 py-2 text-sm font-semibold text-slate-100 hover:bg-white/10"
            onClick={() => { logout(); nav('/admin/login', { replace: true }) }}
          >
            Log out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-slate-900/70 backdrop-blur border-b border-white/10 flex items-center justify-between px-4 md:px-6 shrink-0 relative z-30">
          <div className="flex items-center gap-3 text-sm text-slate-300">
            <button 
              className="md:hidden p-2 -ml-2 text-slate-200 hover:bg-white/10 rounded-xl"
              onClick={() => setIsSidebarOpen(true)}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
            </button>
            <span className="text-slate-200 text-lg hidden sm:block">🔎</span>
            <span className="hidden sm:block">Search the admin console</span>
          </div>

          <div className="flex items-center gap-3">
            {/* Enable Push Notifications Button */}
            {pushPermission !== 'granted' && (
              <button
                onClick={requestPushPermission}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-500/40 text-xs font-semibold transition animate-pulse"
                title="Enable Push Notifications on Mobile"
              >
                <span>🔔</span>
                <span className="hidden sm:inline">Enable Push Notifications</span>
              </button>
            )}

            {/* Notification Bell Icon & Dropdown */}
            <div className="relative">
              <button
                onClick={() => {
                  setIsNotifDropdownOpen(prev => !prev)
                  if (!isNotifDropdownOpen && unreadCount > 0) {
                    markAllRead()
                  }
                }}
                className="relative p-2 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 transition"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full animate-bounce">
                    {unreadCount}
                  </span>
                )}
              </button>

              {/* Notification Dropdown Drawer */}
              {isNotifDropdownOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50">
                  <div className="p-3 border-b border-white/10 flex items-center justify-between bg-slate-950">
                    <div className="font-bold text-sm text-white flex items-center gap-2">
                      <span>🔔</span> Notifications
                    </div>
                    {unreadCount > 0 && (
                      <button onClick={markAllRead} className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold">
                        Mark all as read
                      </button>
                    )}
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-white/5">
                    {notifications.length === 0 ? (
                      <div className="p-4 text-center text-xs text-slate-400">No recent notifications.</div>
                    ) : (
                      notifications.map(n => (
                        <div
                          key={n.id || Math.random()}
                          onClick={() => {
                            if (n.link) nav(n.link)
                            setIsNotifDropdownOpen(false)
                          }}
                          className={`p-3 hover:bg-white/5 transition cursor-pointer flex items-start gap-3 ${!n.read ? 'bg-indigo-950/40' : ''}`}
                        >
                          <span className="text-xl shrink-0">
                            {n.type === 'deposit' ? '💳' : n.type === 'withdrawal' ? '💸' : n.type === 'signup' ? '👤' : n.type === 'verification' ? '📝' : '🔔'}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold text-white flex items-center justify-between">
                              <span className="truncate">{n.title}</span>
                              <span className="text-[10px] text-slate-400 font-normal ml-2">
                                {n.created_at ? new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'now'}
                              </span>
                            </div>
                            <div className="text-xs text-slate-300 mt-0.5 break-words">{n.message}</div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="hidden sm:block rounded-full bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold text-emerald-200 border border-emerald-400/30">
              {admin?.permissions?.includes('all') ? 'Super Admin' : 'Sub Admin'}
            </div>
            <div className="flex items-center gap-2">
              <div className="text-right hidden sm:block">
                <div className="text-sm font-semibold text-white">{admin?.name || admin?.email}</div>
                <div className="text-xs text-slate-300">{admin?.email}</div>
              </div>
              <div className="w-10 h-10 rounded-full bg-white text-slate-900 flex items-center justify-center font-black shrink-0">
                {(admin?.name || admin?.email || 'A').charAt(0).toUpperCase()}
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-slate-50 md:rounded-tl-3xl">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
