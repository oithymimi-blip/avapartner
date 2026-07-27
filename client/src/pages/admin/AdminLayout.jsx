import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAdminAuth } from '../../adminStore'
import { useEffect, useState } from 'react'
import { useAuth } from '../../store'

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

export default function AdminLayout() {
  const { token, admin, logout } = useAdminAuth()
  const { token: userToken } = useAuth()
  const nav = useNavigate()
  const location = useLocation()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  useEffect(() => {
    if (!token) {
      if (userToken) {
        nav('/dashboard', { replace: true })
      } else {
        nav('/admin/login', { replace: true })
      }
    }
  }, [token, nav, userToken])

  useEffect(() => {
    // Close sidebar on navigation on mobile
    setIsSidebarOpen(false)
  }, [location.pathname])

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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-950 to-indigo-950 text-slate-50 flex overflow-hidden">
      
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
            <span className="w-9 h-9 rounded-2xl bg-white text-slate-900 flex items-center justify-center">FX</span>
            Admin Console
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
        <header className="h-16 bg-slate-900/70 backdrop-blur border-b border-white/10 flex items-center justify-between px-4 md:px-6 shrink-0">
          <div className="flex items-center gap-2 text-sm text-slate-300">
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
            <div className="hidden sm:block rounded-full bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold text-emerald-200 border border-emerald-400/30">
              {admin?.permissions?.includes('all') ? 'Super Admin' : 'Sub Admin'}
            </div>
            <div className="flex items-center gap-2">
              <div className="text-right hidden sm:block">
                <div className="text-sm font-semibold text-white">{admin?.name || admin?.email}</div>
                <div className="text-xs text-slate-300">{admin?.email}</div>
              </div>
              <div className="w-10 h-10 rounded-full bg-white text-slate-900 flex items-center justify-center font-semibold shrink-0">
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
