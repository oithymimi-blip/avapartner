import { useEffect, useState } from 'react'
import { api } from '../../api'
import { useAdminAuth } from '../../adminStore'
import { socket } from '../../socket'

const currency = (value = 0) => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(Number(value) || 0)
const IB_LEVELS = ['BRONZE', 'SILVER', 'GOLD']
const IB_LEVEL_COLORS = { BRONZE: 'bg-amber-100 text-amber-700', SILVER: 'bg-slate-200 text-slate-700', GOLD: 'bg-yellow-100 text-yellow-700' }
const IB_ASSET_LABELS = { AI_TRADE: 'AI Trade', MANUAL_TRADING: 'Manual', BINARY_OPTIONS: 'Binary', MONTHLY_BONUS: 'Bonus', MANUAL_CREDIT: 'Manual Credit' }
const VERIFICATION_LABELS = {
  awaiting_approval: 'Awaiting approval',
  pending: 'Pending documentation',
  approved: 'Approved',
  rejected: 'Rejected',
  not_started: 'Not started'
}
const VERIFICATION_CLASSES = {
  awaiting_approval: 'bg-amber-50 text-amber-600',
  pending: 'bg-slate-50 text-slate-500',
  approved: 'bg-emerald-50 text-emerald-600',
  rejected: 'bg-rose-50 text-rose-600',
  not_started: 'bg-slate-50 text-slate-500'
}

export default function AdminUsersPage() {
  const { token, admin } = useAdminAuth()
  const canManage = admin?.role === 'admin' || (admin?.permissions || []).includes('all') || (admin?.permissions || []).includes('users')
  const [users, setUsers] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [balanceForm, setBalanceForm] = useState({ email: '', amount: '' })
  const [message, setMessage] = useState('')
  const [selectedUser, setSelectedUser] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [userDetail, setUserDetail] = useState(null)
  const [userActivity, setUserActivity] = useState([])
  const [userHistory, setUserHistory] = useState([])
  const [openTrades, setOpenTrades] = useState([])
  const [marketPrices, setMarketPrices] = useState({})
  const [editForm, setEditForm] = useState({ role: '', verification_status: '', note: '', balance: '', password: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [showUpdatePassword, setShowUpdatePassword] = useState(false)
  const [newPasswordInput, setNewPasswordInput] = useState('')
  const [activeTab, setActiveTab] = useState('overview')
  const [editingTime, setEditingTime] = useState(null)
  const [editingPaymentId, setEditingPaymentId] = useState(null)
  const [editingPaymentAmount, setEditingPaymentAmount] = useState('')
  // IB / Affiliate states
  const [ibProfile, setIbProfile] = useState(null)
  const [ibLedger, setIbLedger] = useState({ rows: [], total: 0 })
  const [ibTeam, setIbTeam] = useState([])
  const [ibSubTab, setIbSubTab] = useState('overview')
  const [ibEditingLevel, setIbEditingLevel] = useState('BRONZE')
  const [ibEditingEntry, setIbEditingEntry] = useState(null)
  const [ibCreditForm, setIbCreditForm] = useState({ amount: '', asset_class: 'MANUAL_CREDIT', note: '' })
  const [ibShowCreditModal, setIbShowCreditModal] = useState(false)
  // AI Trade states
  const [aiTradeSession, setAiTradeSession] = useState(null)
  const [aiTradeHistory, setAiTradeHistory] = useState({ sessions: [], totalEarned: 0, page: 1, totalPages: 1, totalSessions: 0 })
  const [aiTradePage, setAiTradePage] = useState(1)
  // Binary Options states
  const [binaryTrades, setBinaryTrades] = useState({ open: [], history: [], stats: { total: 0, win: 0, lose: 0, push: 0, netPnL: 0 } })
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000))

  useEffect(() => {
    const timer = setInterval(() => {
      setNowSec(Math.floor(Date.now() / 1000))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const handleTick = (msg) => {
      setMarketPrices(prev => ({ ...prev, [msg.symbol]: msg.price }))
    }
    socket.on('tick', handleTick)
    
    async function loadStates() {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_BASE || ''}/api/market/states`)
        const data = await res.json()
        const prices = {}
        data.forEach(s => {
          if (s.currentPrice != null) prices[s.symbol] = s.currentPrice
        })
        setMarketPrices(prev => ({ ...prev, ...prices }))
      } catch(e) {}
    }
    loadStates()
    
    const interval = setInterval(loadStates, 10000)
    
    return () => {
      socket.off('tick', handleTick)
      clearInterval(interval)
    }
  }, [])

  const loadUsers = async (search = '') => {
    if (!token) return []
    setLoading(true)
    try {
      const res = await api(token).get('/api/admin/users', { params: { q: search } })
      setUsers(res.data)
      return res.data
    } catch (err) {
      setMessage(err?.response?.data?.error || 'Failed to load users')
      return []
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (canManage) loadUsers()
  }, [token, canManage])

  const updateBalance = async () => {
    if (!token) return
    setMessage('')
    try {
      await api(token).post('/api/admin/users/set-balance', {
        email: balanceForm.email,
        amount: Number(balanceForm.amount)
      })
      setBalanceForm({ email: '', amount: '' })
      setMessage('Balance updated')
      loadUsers(query)
    } catch (err) {
      setMessage(err?.response?.data?.error || 'Failed to update balance')
    }
  }

  const deleteUser = async (id) => {
    if (!token || !canManage || !window.confirm('Delete this user?')) return
    try {
      await api(token).delete(`/api/admin/users/${id}`)
      loadUsers(query)
    } catch (err) {
      setMessage(err?.response?.data?.error || 'Delete failed')
    }
  }

  const openUserDetail = async (user) => {
    if (!token) return
    setSelectedUser(user)
    setDetailLoading(true)
    setUserDetail(null)
    setUserActivity([])
    setUserHistory([])
    setOpenTrades([])
    setIbProfile(null)
    setIbLedger({ rows: [], total: 0 })
    setIbTeam([])
    setIbSubTab('overview')
    setAiTradeSession(null)
    setAiTradeHistory({ sessions: [], totalEarned: 0, page: 1, totalPages: 1, totalSessions: 0 })
    setAiTradePage(1)
    setBinaryTrades({ open: [], history: [], stats: { total: 0, win: 0, lose: 0, push: 0, netPnL: 0 } })
    try {
      const [detailRes, activityRes, historyRes, openTradesRes, ibRes, ibLedgerRes, ibTeamRes, aiTradeRes, binaryRes] = await Promise.all([
        api(token).get(`/api/admin/users/${user.id}`).catch(() => ({ data: user })),
        api(token).get(`/api/admin/users/${user.id}/activity`).catch(() => ({ data: [] })),
        api(token).get(`/api/admin/users/${user.id}/history`).catch(() => ({ data: [] })),
        api(token).get(`/api/admin/users/${user.id}/open-trades`).catch(() => ({ data: [] })),
        api(token).get(`/api/ib/admin/user/${user.id}`).catch(() => ({ data: null })),
        api(token).get(`/api/ib/admin/user/${user.id}/ledger`).catch(() => ({ data: { rows: [], total: 0 } })),
        api(token).get(`/api/ib/admin/user/${user.id}/team`).catch(() => ({ data: [] })),
        api(token).get(`/api/admin/users/${user.id}/ai-trade`).catch(() => ({ data: null })),
        api(token).get(`/api/admin/users/${user.id}/binary-trades`).catch(() => ({ data: { open: [], history: [], stats: {} } }))
      ])
      const detailData = detailRes?.data || user
      setUserDetail(detailData)
      setShowPassword(false)
      setShowUpdatePassword(false)
      setNewPasswordInput('')
      setEditForm({
        role: detailData.role || 'user',
        verification_status: detailData.verification_status || 'not_started',
        note: detailData.note || '',
        balance: detailData.available != null || detailData.locked != null
          ? ((detailData.available || 0) + (detailData.locked || 0)).toString()
          : '',
        password: ''
      })
      setUserActivity(Array.isArray(activityRes?.data) ? activityRes.data : [])
      setUserHistory(Array.isArray(historyRes?.data) ? historyRes.data : [])
      setOpenTrades(Array.isArray(openTradesRes?.data) ? openTradesRes.data : [])
      if (ibRes?.data) { setIbProfile(ibRes.data); setIbEditingLevel(ibRes.data.level || 'BRONZE') }
      if (ibLedgerRes?.data) setIbLedger(ibLedgerRes.data)
      if (ibTeamRes?.data) setIbTeam(Array.isArray(ibTeamRes.data) ? ibTeamRes.data : [])
      if (aiTradeRes?.data) { setAiTradeSession(aiTradeRes.data.session); setAiTradeHistory(aiTradeRes.data.history || { sessions: [], totalEarned: 0, page: 1, totalPages: 1, totalSessions: 0 }) }
      if (binaryRes?.data) setBinaryTrades(binaryRes.data)
    } catch (err) {
      setMessage(err?.response?.data?.error || 'Failed to load user details')
    } finally {
      setDetailLoading(false)
    }
  }

  const saveUserEdits = async () => {
    if (!token || !selectedUser) return
    setMessage('')
    setDetailLoading(true)
    try {
      const payload = {
        role: editForm.role,
        verification_status: editForm.verification_status,
        note: editForm.note
      }
      if (editForm.password && editForm.password.trim()) {
        payload.password = editForm.password.trim()
      }
      await api(token).put(`/api/admin/users/${selectedUser.id}`, payload).catch(() => null)

      if (editForm.balance && !Number.isNaN(Number(editForm.balance))) {
        await api(token).post('/api/admin/users/set-balance', {
          email: selectedUser.email,
          amount: Number(editForm.balance)
        }).catch(() => null)
      }

      setEditForm(prev => ({ ...prev, password: '' }))
      setMessage('User updated')
      await loadUsers(query)
      if (selectedUser) {
        openUserDetail(selectedUser)
      }
    } catch (err) {
      setMessage(err?.response?.data?.error || 'Failed to save user')
    } finally {
      setDetailLoading(false)
    }
  }

  const handleDirectPasswordUpdate = async () => {
    if (!token || !selectedUser || !newPasswordInput.trim()) return
    setMessage('')
    setDetailLoading(true)
    try {
      await api(token).put(`/api/admin/users/${selectedUser.id}`, {
        password: newPasswordInput.trim()
      })
      setMessage('User password updated successfully')
      setShowUpdatePassword(false)
      setNewPasswordInput('')
      await loadUsers(query)
      openUserDetail(selectedUser)
    } catch (err) {
      setMessage(err?.response?.data?.error || 'Failed to update password')
    } finally {
      setDetailLoading(false)
    }
  }

  const saveTimestamp = async () => {
    if (!token || !editingTime) return
    setDetailLoading(true)
    try {
      await api(token).put('/api/admin/records/timestamp', {
        table: editingTime.table,
        id: editingTime.id,
        field: editingTime.field,
        value: editingTime.value
      })
      setEditingTime(null)
      setMessage('Timestamp updated successfully')
      if (selectedUser) openUserDetail(selectedUser)
    } catch (err) {
      setMessage(err?.response?.data?.error || 'Failed to update timestamp')
    } finally {
      setDetailLoading(false)
    }
  }

  const handleManualPayment = async (type) => {
    if (!token || !selectedUser) return
    const amtStr = window.prompt(`Enter ${type} amount for ${selectedUser.email}:`)
    if (!amtStr) return
    const amt = Number(amtStr)
    if (!Number.isFinite(amt) || amt <= 0) {
      return setMessage('Invalid amount entered')
    }
    setDetailLoading(true)
    try {
      await api(token).post(`/api/admin/payments/users/${selectedUser.id}/manual`, { type, amount: amt })
      setMessage(`${type} added successfully`)
      await loadUsers(query)
      openUserDetail(selectedUser)
    } catch (err) {
      setMessage(err?.response?.data?.error || `Failed to add ${type}`)
    } finally {
      setDetailLoading(false)
    }
  }

  const updatePaymentAmount = async (paymentId) => {
    if (!token || !selectedUser) return
    const amt = Number(editingPaymentAmount)
    if (!Number.isFinite(amt) || amt < 0) return setMessage('Invalid amount')
    setDetailLoading(true)
    try {
      await api(token).put(`/api/admin/payments/requests/${paymentId}/amount`, { amount: amt })
      setMessage('Payment amount updated successfully')
      setEditingPaymentId(null)
      await loadUsers(query)
      openUserDetail(selectedUser)
    } catch (err) {
      setMessage(err?.response?.data?.error || 'Failed to update amount')
    } finally {
      setDetailLoading(false)
    }
  }

  useEffect(() => {
    const handleTradeUpdate = (msg) => {
      if (canManage) {
        loadUsers(query)
        if (selectedUser && selectedUser.id === msg.userId) {
          openUserDetail(selectedUser)
        }
      }
    }
    socket.on('admin_trade_update', handleTradeUpdate)
    return () => socket.off('admin_trade_update', handleTradeUpdate)
  }, [canManage, query, selectedUser])

  if (!canManage) {
    return <div className="rounded-3xl bg-white border border-dashed border-slate-200 p-6 text-slate-500">You do not have permission to manage users.</div>
  }

  if (selectedUser) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setSelectedUser(null)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
          </button>
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-slate-400">User Profile</div>
            <h1 className="text-3xl font-semibold text-slate-900">{selectedUser.name || selectedUser.email}</h1>
          </div>
        </div>

        {message && (
          <div className="rounded-2xl bg-indigo-50 border border-indigo-200 px-4 py-2 text-sm text-indigo-700">{message}</div>
        )}

        <div className="flex gap-2 border-b border-slate-200">
          <button 
            className={`px-4 py-2 text-sm font-semibold border-b-2 transition ${activeTab === 'overview' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
            onClick={() => setActiveTab('overview')}
          >
            Overview
          </button>
          <button 
            className={`px-4 py-2 text-sm font-semibold border-b-2 transition ${activeTab === 'history' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
            onClick={() => setActiveTab('history')}
          >
            Financial History
          </button>
          <button 
            className={`px-4 py-2 text-sm font-semibold border-b-2 transition ${activeTab === 'activity' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
            onClick={() => setActiveTab('activity')}
          >
            Activity Log
          </button>
          <button 
            className={`px-4 py-2 text-sm font-semibold border-b-2 transition ${activeTab === 'deposits' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
            onClick={() => setActiveTab('deposits')}
          >
            Deposits
          </button>
          <button 
            className={`px-4 py-2 text-sm font-semibold border-b-2 transition ${activeTab === 'withdrawals' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
            onClick={() => setActiveTab('withdrawals')}
          >
            Withdrawals
          </button>
          <button 
            className={`px-4 py-2 text-sm font-semibold border-b-2 transition ${activeTab === 'live_trades' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
            onClick={() => setActiveTab('live_trades')}
          >
            Live Trades
            {openTrades.length > 0 && <span className="ml-2 bg-rose-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">{openTrades.length}</span>}
          </button>
          <button 
            className={`px-4 py-2 text-sm font-semibold border-b-2 transition ${activeTab === 'binary_trades' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
            onClick={() => setActiveTab('binary_trades')}
          >
            Binary Options
            {(binaryTrades?.open?.length || 0) > 0 && (
              <span className="ml-2 bg-emerald-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                {binaryTrades.open.length}
              </span>
            )}
          </button>
          <button 
            className={`px-4 py-2 text-sm font-semibold border-b-2 transition ${activeTab === 'ib_affiliate' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
            onClick={() => setActiveTab('ib_affiliate')}
          >
            IB / Affiliate
            {ibProfile?.level && <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full font-bold ${IB_LEVEL_COLORS[ibProfile.level] || 'bg-slate-100 text-slate-500'}`}>{ibProfile.level}</span>}
          </button>
          <button 
            className={`px-4 py-2 text-sm font-semibold border-b-2 transition ${activeTab === 'ai_trade' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
            onClick={() => setActiveTab('ai_trade')}
          >
            AI Trade
            {aiTradeSession?.ai_trade_status === 'ON' && <span className="ml-2 bg-emerald-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">Active</span>}
          </button>
        </div>

        {activeTab === 'overview' && (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)] items-start">
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-soft">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400 mb-1">Role</div>
                  <div className="text-lg font-semibold text-slate-900 capitalize">{userDetail?.role || selectedUser.role}</div>
                </div>
                <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-soft">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400 mb-1">Balance</div>
                  <div className="text-lg font-semibold text-slate-900">
                    {currency((userDetail?.available || selectedUser.available || 0) + (userDetail?.locked || selectedUser.locked || 0))}
                  </div>
                </div>
                <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-soft">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400 mb-1">Trades</div>
                  <div className="text-lg font-semibold text-slate-900">{userDetail?.trade_count ?? selectedUser.trade_count ?? 0}</div>
                </div>
                <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-soft relative group">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400 mb-1">Joined</div>
                  <div className="text-lg font-semibold text-slate-900 truncate pr-6">
                    {userDetail?.created_at ? new Date(userDetail.created_at).toLocaleDateString() : '—'}
                  </div>
                  <button 
                    onClick={() => setEditingTime({ table: 'users', id: selectedUser.id, field: 'created_at', value: userDetail?.created_at || '' })}
                    className="absolute right-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 text-indigo-500 hover:text-indigo-700 transition"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                  </button>
                </div>
              </div>

              <div className="rounded-3xl bg-white shadow-soft border border-slate-100 p-6 space-y-5">
                <div className="text-sm font-bold text-slate-800 uppercase tracking-[0.1em]">Edit User Details</div>
                <div className="grid md:grid-cols-2 gap-5">
                  <label className="text-[12px] font-semibold uppercase tracking-[0.1em] text-slate-500 space-y-1.5 block">
                    <span>Role</span>
                    <select
                      value={editForm.role}
                      onChange={(e) => setEditForm(prev => ({ ...prev, role: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-800 font-medium focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none"
                    >
                      <option value="admin">Admin</option>
                      <option value="user">User</option>
                      <option value="subadmin">Subadmin</option>
                    </select>
                  </label>
                  <label className="text-[12px] font-semibold uppercase tracking-[0.1em] text-slate-500 space-y-1.5 block">
                    <span>Verification</span>
                    <select
                      value={editForm.verification_status}
                      onChange={(e) => setEditForm(prev => ({ ...prev, verification_status: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-800 font-medium focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none"
                    >
                      <option value="not_started">Not started</option>
                      <option value="pending">Pending documentation</option>
                      <option value="awaiting_approval">Awaiting approval</option>
                      <option value="approved">Approved</option>
                      <option value="rejected">Rejected</option>
                    </select>
                  </label>
                  <label className="text-[12px] font-semibold uppercase tracking-[0.1em] text-slate-500 space-y-1.5 block">
                    <span>Balance (Set Exact)</span>
                    <input
                      type="number"
                      value={editForm.balance}
                      onChange={(e) => setEditForm(prev => ({ ...prev, balance: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-800 font-medium focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none"
                    />
                  </label>
                  <label className="text-[12px] font-semibold uppercase tracking-[0.1em] text-slate-500 space-y-1.5 block">
                    <span>Password (Set New)</span>
                    <input
                      type="text"
                      placeholder="Leave blank to keep unchanged"
                      value={editForm.password || ''}
                      onChange={(e) => setEditForm(prev => ({ ...prev, password: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-800 font-medium focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none font-mono text-xs"
                    />
                  </label>
                  <label className="text-[12px] font-semibold uppercase tracking-[0.1em] text-slate-500 space-y-1.5 block md:col-span-2">
                    <span>Admin Note</span>
                    <textarea
                      value={editForm.note}
                      onChange={(e) => setEditForm(prev => ({ ...prev, note: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-800 font-medium focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none min-h-[46px]"
                    />
                  </label>
                </div>
                <div className="pt-2 flex flex-wrap gap-3">
                  <button
                    className="btn px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-600/20"
                    onClick={saveUserEdits}
                    disabled={detailLoading}
                  >
                    {detailLoading ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button
                    className="btn px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold"
                    onClick={() => handleManualPayment('deposit')}
                    disabled={detailLoading}
                  >
                    Add Deposit
                  </button>
                  <button
                    className="btn px-6 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold"
                    onClick={() => handleManualPayment('withdraw')}
                    disabled={detailLoading}
                  >
                    Add Withdraw
                  </button>
                  <button
                    className="btn px-6 py-2.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl font-bold"
                    onClick={() => openUserDetail(selectedUser)}
                    disabled={detailLoading}
                  >
                    Refresh
                  </button>
                </div>
              </div>
            </div>
            
            <div className="rounded-3xl bg-slate-900 shadow-soft border border-slate-800 p-6 text-white space-y-4">
              <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center text-2xl font-black mb-4">
                {selectedUser.name?.[0]?.toUpperCase() || selectedUser.email?.[0]?.toUpperCase() || 'U'}
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-white/50 mb-1">Email Address</div>
                <div className="font-mono text-sm break-all">{selectedUser.email}</div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="text-xs uppercase tracking-[0.2em] text-white/50">User Password</div>
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-[11px] text-indigo-400 hover:text-indigo-300 transition font-medium flex items-center gap-1"
                  >
                    {showPassword ? (
                      <>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858-5.908a8.962 8.962 0 012.122-.363c4.478 0 8.268 2.943 9.542 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21f-9-9" /></svg>
                        Hide
                      </>
                    ) : (
                      <>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                        Show
                      </>
                    )}
                  </button>
                </div>
                <div className="font-mono text-sm break-all bg-slate-800/90 px-3.5 py-2.5 rounded-xl border border-slate-700/70 flex items-center justify-between gap-2">
                  <span className="truncate selection:bg-indigo-500 selection:text-white">
                    {showPassword 
                      ? (userDetail?.raw_password || selectedUser?.raw_password || 'Password123!')
                      : '••••••••••••'}
                  </span>
                  {showPassword && (
                    <button
                      type="button"
                      onClick={() => {
                        const activePass = userDetail?.raw_password || selectedUser?.raw_password || 'Password123!';
                        navigator.clipboard.writeText(activePass);
                        setMessage('Password copied to clipboard');
                      }}
                      className="text-slate-400 hover:text-white transition p-1 shrink-0"
                      title="Copy Password"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 012-2v-8a2 2 0 01-2-2h-8a2 2 0 01-2 2v8a2 2 0 012 2z" /></svg>
                    </button>
                  )}
                </div>
                
                {showUpdatePassword ? (
                  <div className="mt-3 space-y-2 border-t border-slate-800 pt-3">
                    <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Set New Password</div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="New password..."
                        value={newPasswordInput}
                        onChange={(e) => setNewPasswordInput(e.target.value)}
                        className="flex-1 rounded-xl bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
                      />
                      <button
                        type="button"
                        disabled={detailLoading || !newPasswordInput.trim()}
                        onClick={handleDirectPasswordUpdate}
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition disabled:opacity-50"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowUpdatePassword(false); setNewPasswordInput('') }}
                        className="px-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowUpdatePassword(true)}
                    className="mt-2 text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition flex items-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                    Update Password
                  </button>
                )}
              </div>
              {userDetail?.handle && (
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-white/50 mb-1">Handle</div>
                  <div className="font-semibold text-indigo-400">@{userDetail.handle}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="rounded-3xl bg-white shadow-soft border border-slate-100 p-6">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-slate-500">
                  <tr>
                    <th className="py-2 text-left font-semibold uppercase tracking-wider text-[11px]">Date</th>
                    <th className="py-2 text-left font-semibold uppercase tracking-wider text-[11px]">Type</th>
                    <th className="py-2 text-left font-semibold uppercase tracking-wider text-[11px]">Details</th>
                    <th className="py-2 text-right font-semibold uppercase tracking-wider text-[11px]">Amount</th>
                    <th className="py-2 text-right font-semibold uppercase tracking-wider text-[11px]">P/L</th>
                    <th className="py-2 text-right font-semibold uppercase tracking-wider text-[11px]">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {detailLoading ? (
                    <tr><td colSpan={6} className="py-8 text-center text-slate-500">Loading history...</td></tr>
                  ) : userHistory.length === 0 ? (
                    <tr><td colSpan={6} className="py-8 text-center text-slate-500">No financial history found.</td></tr>
                  ) : (
                    userHistory.map((item, idx) => {
                      const isPositive = item.category === 'deposit' || item.category === 'sell';
                      const tableMap = { 'Trade': 'trades', 'Binary': 'binary_trades', 'Payment': 'payment_requests' };
                      const timeFieldMap = { 'Trade': 'created_at', 'Binary': 'created_ts', 'Payment': 'created_at' };
                      return (
                        <tr key={`${item.source}-${item.id}-${idx}`} className="text-slate-700 hover:bg-slate-50 transition group">
                          <td className="py-3 whitespace-nowrap relative">
                            <span className="text-slate-500">{new Date(item.timestamp).toLocaleString()}</span>
                            <button 
                              onClick={() => setEditingTime({ table: tableMap[item.source], id: item.id, field: timeFieldMap[item.source], value: item.timestamp })}
                              className="ml-2 opacity-0 group-hover:opacity-100 text-indigo-500 hover:text-indigo-700 transition inline-flex align-middle"
                              title="Edit Timestamp"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                            </button>
                          </td>
                          <td className="py-3">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600">
                              {item.source}
                            </span>
                          </td>
                          <td className="py-3 capitalize font-medium">{item.category}</td>
                          <td className={`py-3 text-right font-mono font-semibold ${isPositive ? 'text-emerald-600' : 'text-slate-900'}`}>
                            {editingPaymentId === item.id && item.source === 'Payment' ? (
                              <div className="flex items-center justify-end gap-2">
                                <input 
                                  type="number" 
                                  step="0.01" 
                                  className="input w-20 px-2 py-0.5 text-xs font-mono text-right" 
                                  value={editingPaymentAmount} 
                                  onChange={e => setEditingPaymentAmount(e.target.value)} 
                                />
                                <button className="text-[10px] text-indigo-600 font-bold" onClick={() => updatePaymentAmount(item.id)}>Save</button>
                                <button className="text-[10px] text-slate-500 font-bold" onClick={() => setEditingPaymentId(null)}>Cancel</button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-end gap-2">
                                {currency(item.amount)}
                                {item.source === 'Payment' && (
                                  <button 
                                    className="opacity-0 group-hover:opacity-100 text-[10px] text-indigo-500 hover:text-indigo-700 transition" 
                                    onClick={() => { setEditingPaymentId(item.id); setEditingPaymentAmount(item.amount); }}
                                    title="Edit Amount"
                                  >
                                    Edit
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="py-3 text-right font-mono font-semibold">
                            {item.pnl != null && item.status !== 'open' ? (
                              <span className={item.pnl >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                                {item.pnl > 0 ? '+' : ''}{currency(item.pnl)}
                              </span>
                            ) : '-'}
                          </td>
                          <td className="py-3 text-right">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              item.status === 'filled' || item.status === 'approved' || item.status === 'won' ? 'bg-emerald-50 text-emerald-600' :
                              item.status === 'rejected' || item.status === 'lost' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'
                            }`}>
                              {item.status}
                            </span>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {(activeTab === 'deposits' || activeTab === 'withdrawals') && (
          <div className="rounded-3xl bg-white shadow-soft border border-slate-100 p-6">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-slate-500">
                  <tr>
                    <th className="py-2 text-left font-semibold uppercase tracking-wider text-[11px]">Date</th>
                    <th className="py-2 text-right font-semibold uppercase tracking-wider text-[11px]">Amount</th>
                    <th className="py-2 text-left font-semibold uppercase tracking-wider text-[11px]">Address</th>
                    <th className="py-2 text-left font-semibold uppercase tracking-wider text-[11px]">TX Ref</th>
                    <th className="py-2 text-right font-semibold uppercase tracking-wider text-[11px]">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {detailLoading ? (
                    <tr><td colSpan={5} className="py-8 text-center text-slate-500">Loading {activeTab}...</td></tr>
                  ) : (
                    userHistory.filter(item => item.source === 'Payment' && item.category === (activeTab === 'deposits' ? 'deposit' : 'withdraw')).length === 0 ? (
                      <tr><td colSpan={5} className="py-8 text-center text-slate-500">No {activeTab} found.</td></tr>
                    ) : (
                      userHistory
                        .filter(item => item.source === 'Payment' && item.category === (activeTab === 'deposits' ? 'deposit' : 'withdraw'))
                        .map((item, idx) => (
                          <tr key={item.id} className="text-slate-700 hover:bg-slate-50 transition group">
                            <td className="py-3 whitespace-nowrap">
                              <span className="text-slate-500">{new Date(item.timestamp).toLocaleString()}</span>
                            </td>
                            <td className={`py-3 text-right font-mono font-semibold ${activeTab === 'deposits' ? 'text-emerald-600' : 'text-slate-900'}`}>
                              {editingPaymentId === item.id ? (
                                <div className="flex items-center justify-end gap-2">
                                  <input 
                                    type="number" 
                                    step="0.01" 
                                    className="input w-20 px-2 py-0.5 text-xs font-mono text-right" 
                                    value={editingPaymentAmount} 
                                    onChange={e => setEditingPaymentAmount(e.target.value)} 
                                  />
                                  <button className="text-[10px] text-indigo-600 font-bold" onClick={() => updatePaymentAmount(item.id)}>Save</button>
                                  <button className="text-[10px] text-slate-500 font-bold" onClick={() => setEditingPaymentId(null)}>Cancel</button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-end gap-2">
                                  {currency(item.amount)}
                                  <button 
                                    className="opacity-0 group-hover:opacity-100 text-[10px] text-indigo-500 hover:text-indigo-700 transition" 
                                    onClick={() => { setEditingPaymentId(item.id); setEditingPaymentAmount(item.amount); }}
                                    title="Edit Amount"
                                  >
                                    Edit
                                  </button>
                                </div>
                              )}
                            </td>
                            <td className="py-3 font-mono text-[10px] break-all">{item.address || '—'}</td>
                            <td className="py-3 font-mono text-[10px] break-all">{item.tx_ref || '—'}</td>
                            <td className="py-3 text-right">
                              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                item.status === 'approved' ? 'bg-emerald-50 text-emerald-600' :
                                item.status === 'rejected' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'
                              }`}>
                                {item.status}
                              </span>
                            </td>
                          </tr>
                        ))
                    )
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'activity' && (
          <div className="rounded-3xl bg-white shadow-soft border border-slate-100 p-6">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-slate-500">
                  <tr>
                    <th className="py-2 text-left font-semibold uppercase tracking-wider text-[11px] w-48">Timestamp</th>
                    <th className="py-2 text-left font-semibold uppercase tracking-wider text-[11px] w-48">Action</th>
                    <th className="py-2 text-left font-semibold uppercase tracking-wider text-[11px]">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {detailLoading ? (
                    <tr><td colSpan={3} className="py-8 text-center text-slate-500">Loading activity...</td></tr>
                  ) : userActivity.length === 0 ? (
                    <tr><td colSpan={3} className="py-8 text-center text-slate-500">No activity recorded.</td></tr>
                  ) : (
                    userActivity.map((item, idx) => (
                      <tr key={idx} className="text-slate-700 hover:bg-slate-50 transition group">
                        <td className="py-3 whitespace-nowrap text-slate-500 relative">
                          {new Date(item.timestamp).toLocaleString()}
                        </td>
                        <td className="py-3 font-medium text-slate-900">{item.action}</td>
                        <td className="py-3 text-slate-500 font-mono text-xs break-all">{item.description}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'live_trades' && (
          <div className="rounded-3xl bg-white shadow-soft border border-slate-100 p-6">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-slate-500">
                  <tr>
                    <th className="py-2 text-left font-semibold uppercase tracking-wider text-[11px]">Time</th>
                    <th className="py-2 text-left font-semibold uppercase tracking-wider text-[11px]">Symbol</th>
                    <th className="py-2 text-left font-semibold uppercase tracking-wider text-[11px]">Side</th>
                    <th className="py-2 text-right font-semibold uppercase tracking-wider text-[11px]">Lots</th>
                    <th className="py-2 text-right font-semibold uppercase tracking-wider text-[11px]">Entry</th>
                    <th className="py-2 text-right font-semibold uppercase tracking-wider text-[11px]">Current</th>
                    <th className="py-2 text-right font-semibold uppercase tracking-wider text-[11px]">Live P/L</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {detailLoading ? (
                    <tr><td colSpan={7} className="py-8 text-center text-slate-500">Loading live trades...</td></tr>
                  ) : openTrades.length === 0 ? (
                    <tr><td colSpan={7} className="py-8 text-center text-slate-500">No live trades right now.</td></tr>
                  ) : (
                    openTrades.map(trade => {
                      const qty = Number(trade.remaining_qty || trade.qty || 0);
                      const entryPrice = Number(trade.price || 0);
                      const currentPrice = marketPrices[trade.symbol] ?? entryPrice;
                      const direction = trade.side === 'sell' ? -1 : 1;
                      const livePnl = (currentPrice - entryPrice) * direction * qty;
                      const pnlClass = livePnl >= 0 ? 'text-emerald-600' : 'text-rose-600';
                      return (
                        <tr key={trade.id} className="text-slate-700 hover:bg-slate-50 transition">
                          <td className="py-3 font-medium text-slate-500">{new Date(trade.created_at).toLocaleTimeString()}</td>
                          <td className="py-3 font-semibold text-slate-900">{trade.symbol}</td>
                          <td className={`py-3 font-bold uppercase text-[11px] ${trade.side === 'buy' ? 'text-emerald-500' : 'text-rose-500'}`}>{trade.side}</td>
                          <td className="py-3 text-right font-mono">{qty.toFixed(2)}</td>
                          <td className="py-3 text-right font-mono">{entryPrice.toFixed(2)}</td>
                          <td className="py-3 text-right font-mono">{currentPrice.toFixed(2)}</td>
                          <td className={`py-3 text-right font-mono font-semibold ${pnlClass}`}>{currency(livePnl)}</td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Binary Options Tab */}
        {activeTab === 'binary_trades' && (
          <div className="space-y-6">
            {/* Stats Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-soft">
                <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400 mb-1">Total Binary Trades</div>
                <div className="text-2xl font-bold text-slate-900">{binaryTrades.stats?.total || 0}</div>
              </div>
              <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-soft">
                <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400 mb-1">Wins / Losses / Pushes</div>
                <div className="text-lg font-bold flex items-center gap-2">
                  <span className="text-emerald-600">{binaryTrades.stats?.win || 0}W</span>
                  <span className="text-slate-300">/</span>
                  <span className="text-rose-600">{binaryTrades.stats?.lose || 0}L</span>
                  <span className="text-slate-300">/</span>
                  <span className="text-amber-600">{binaryTrades.stats?.push || 0}P</span>
                </div>
              </div>
              <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-soft">
                <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400 mb-1">Total Stake Volume</div>
                <div className="text-2xl font-bold text-slate-900">{currency(binaryTrades.stats?.totalStake || 0)}</div>
              </div>
              <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-soft">
                <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400 mb-1">Net Binary P/L</div>
                <div className={`text-2xl font-bold ${(binaryTrades.stats?.netPnL || 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {(binaryTrades.stats?.netPnL || 0) > 0 ? '+' : ''}{currency(binaryTrades.stats?.netPnL || 0)}
                </div>
              </div>
            </div>

            {/* Live Open Binary Positions */}
            <div className="rounded-3xl bg-white shadow-soft border border-slate-100 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <span>Live Binary Positions</span>
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                </div>
                <span className="text-xs font-semibold text-slate-400">
                  {binaryTrades.open?.length || 0} Open Position{(binaryTrades.open?.length || 0) !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-slate-500">
                    <tr>
                      <th className="py-2 text-left font-semibold uppercase tracking-wider text-[11px]">Time</th>
                      <th className="py-2 text-left font-semibold uppercase tracking-wider text-[11px]">Symbol</th>
                      <th className="py-2 text-left font-semibold uppercase tracking-wider text-[11px]">Direction</th>
                      <th className="py-2 text-right font-semibold uppercase tracking-wider text-[11px]">Stake</th>
                      <th className="py-2 text-right font-semibold uppercase tracking-wider text-[11px]">Entry Price</th>
                      <th className="py-2 text-right font-semibold uppercase tracking-wider text-[11px]">Current Price</th>
                      <th className="py-2 text-right font-semibold uppercase tracking-wider text-[11px]">Expiry In</th>
                      <th className="py-2 text-right font-semibold uppercase tracking-wider text-[11px]">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {detailLoading ? (
                      <tr><td colSpan={8} className="py-8 text-center text-slate-500">Loading open binary positions...</td></tr>
                    ) : (binaryTrades.open || []).length === 0 ? (
                      <tr><td colSpan={8} className="py-8 text-center text-slate-500">No active binary trades right now.</td></tr>
                    ) : (
                      (binaryTrades.open || []).map(trade => {
                        const entryPrice = Number(trade.entry_price || 0);
                        const sym = trade.symbol || 'BTCUSD';
                        const currentPrice = marketPrices[sym] ?? marketPrices[`${sym}USD`] ?? marketPrices[`${sym}USDT`] ?? marketPrices[sym.replace('USDT', '')] ?? entryPrice;
                        const direction = trade.direction?.toLowerCase();
                        const isCall = direction === 'call';
                        const isWinning = isCall ? currentPrice > entryPrice : currentPrice < entryPrice;
                        const remainingSec = Math.max(0, Number(trade.expiry_ts || 0) - nowSec);
                        const m = Math.floor(remainingSec / 60);
                        const s = remainingSec % 60;
                        const formattedTimeLeft = remainingSec <= 0 ? 'Settling...' : (m > 0 ? `${m}m ${s.toString().padStart(2, '0')}s` : `${s}s`);
                        
                        return (
                          <tr key={trade.id} className="text-slate-700 hover:bg-slate-50 transition">
                            <td className="py-3 font-medium text-slate-500">
                              {trade.created_ts ? new Date(trade.created_ts * 1000).toLocaleTimeString() : '—'}
                            </td>
                            <td className="py-3 font-semibold text-slate-900">{trade.symbol}</td>
                            <td className="py-3 font-bold uppercase text-[11px]">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${isCall ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                {isCall ? 'CALL ⬆' : 'PUT ⬇'}
                              </span>
                            </td>
                            <td className="py-3 text-right font-mono font-semibold text-slate-900">{currency(trade.stake)}</td>
                            <td className="py-3 text-right font-mono">{entryPrice.toFixed(2)}</td>
                            <td className={`py-3 text-right font-mono font-semibold ${isWinning ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {currentPrice.toFixed(2)}
                            </td>
                            <td className="py-3 text-right font-mono text-indigo-600 font-bold">
                              {formattedTimeLeft}
                            </td>
                            <td className="py-3 text-right">
                              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-600">
                                Open
                              </span>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Complete Binary Trade History */}
            <div className="rounded-3xl bg-white shadow-soft border border-slate-100 p-6 space-y-4">
              <div className="text-sm font-bold text-slate-800 uppercase tracking-wider">All Binary Trade History</div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-slate-500">
                    <tr>
                      <th className="py-2 text-left font-semibold uppercase tracking-wider text-[11px]">Created / Settled</th>
                      <th className="py-2 text-left font-semibold uppercase tracking-wider text-[11px]">Symbol</th>
                      <th className="py-2 text-left font-semibold uppercase tracking-wider text-[11px]">Direction</th>
                      <th className="py-2 text-right font-semibold uppercase tracking-wider text-[11px]">Stake</th>
                      <th className="py-2 text-right font-semibold uppercase tracking-wider text-[11px]">Entry Price</th>
                      <th className="py-2 text-right font-semibold uppercase tracking-wider text-[11px]">Settle Price</th>
                      <th className="py-2 text-right font-semibold uppercase tracking-wider text-[11px]">Outcome</th>
                      <th className="py-2 text-right font-semibold uppercase tracking-wider text-[11px]">Payout</th>
                      <th className="py-2 text-right font-semibold uppercase tracking-wider text-[11px]">Net P/L</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {detailLoading ? (
                      <tr><td colSpan={9} className="py-8 text-center text-slate-500">Loading binary trade history...</td></tr>
                    ) : (binaryTrades.history || []).length === 0 ? (
                      <tr><td colSpan={9} className="py-8 text-center text-slate-500">No binary trade history recorded.</td></tr>
                    ) : (
                      (binaryTrades.history || []).map((trade, idx) => {
                        const isCall = trade.direction?.toLowerCase() === 'call';
                        const isWin = trade.result === 'win';
                        const isPush = trade.result === 'push';
                        const netPnl = trade.status === 'settled' ? (Number(trade.payout || 0) - Number(trade.stake || 0)) : 0;
                        const createdDate = trade.created_ts ? new Date(trade.created_ts * 1000).toLocaleString() : '—';

                        return (
                          <tr key={trade.id || idx} className="text-slate-700 hover:bg-slate-50 transition group">
                            <td className="py-3 whitespace-nowrap text-slate-500 relative">
                              <span>{createdDate}</span>
                              <button 
                                onClick={() => setEditingTime({ table: 'binary_trades', id: trade.id, field: 'created_ts', value: createdDate })}
                                className="ml-2 opacity-0 group-hover:opacity-100 text-indigo-500 hover:text-indigo-700 transition inline-flex align-middle"
                                title="Edit Timestamp"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                              </button>
                            </td>
                            <td className="py-3 font-semibold text-slate-900">{trade.symbol}</td>
                            <td className="py-3 font-bold uppercase text-[11px]">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${isCall ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                {isCall ? 'CALL ⬆' : 'PUT ⬇'}
                              </span>
                            </td>
                            <td className="py-3 text-right font-mono font-semibold text-slate-900">{currency(trade.stake)}</td>
                            <td className="py-3 text-right font-mono">{Number(trade.entry_price || 0).toFixed(2)}</td>
                            <td className="py-3 text-right font-mono">{trade.settlement_price != null ? Number(trade.settlement_price).toFixed(2) : '—'}</td>
                            <td className="py-3 text-right">
                              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                isWin ? 'bg-emerald-50 text-emerald-600' :
                                isPush ? 'bg-amber-50 text-amber-600' :
                                trade.status === 'open' ? 'bg-slate-100 text-slate-600' : 'bg-rose-50 text-rose-600'
                              }`}>
                                {trade.status === 'open' ? 'Open' : (trade.result || 'Settled')}
                              </span>
                            </td>
                            <td className="py-3 text-right font-mono text-slate-900">{currency(trade.payout || 0)}</td>
                            <td className={`py-3 text-right font-mono font-semibold ${netPnl > 0 ? 'text-emerald-600' : netPnl < 0 ? 'text-rose-600' : 'text-slate-500'}`}>
                              {trade.status === 'settled' ? `${netPnl > 0 ? '+' : ''}${currency(netPnl)}` : '—'}
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* AI Trade Tab */}
        {activeTab === 'ai_trade' && (
          <div className="space-y-5">
            {/* Current Session Status */}
            {aiTradeSession && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-soft">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Status</div>
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${aiTradeSession.ai_trade_status === 'ON' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {aiTradeSession.ai_trade_status === 'ON' ? '● Active' : 'Inactive'}
                  </span>
                </div>
                {aiTradeSession.ai_trade_status === 'ON' && (
                  <>
                    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-soft">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Slot</div>
                      <div className="text-lg font-semibold text-slate-900">{aiTradeSession.slot ? ['', 'Starter', 'Booster', 'Premium', 'Titan Mega'][aiTradeSession.slot] || `Slot ${aiTradeSession.slot}` : '—'}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-soft">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Allocated</div>
                      <div className="text-lg font-semibold text-slate-900">{currency(aiTradeSession.allocated_amount)}</div>
                    </div>
                    <div className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-soft">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-500 mb-1">Pending Earnings</div>
                      <div className="text-lg font-semibold text-emerald-600">{currency(aiTradeSession.earnings)}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-soft">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Started</div>
                      <div className="text-sm font-semibold text-slate-700">{aiTradeSession.started_at ? new Date(aiTradeSession.started_at).toLocaleString() : '—'}</div>
                    </div>
                  </>
                )}
              </div>
            )}
            {!aiTradeSession && (
              <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-soft text-center text-slate-400 text-sm">
                No AI Trade session data available for this user.
              </div>
            )}

            {/* Summary Stats */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="rounded-2xl border border-slate-100 bg-white p-4">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Total Earned (All Time)</div>
                <div className="text-lg font-semibold text-emerald-600">{currency(aiTradeHistory.totalEarned)}</div>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-white p-4">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Total Sessions</div>
                <div className="text-lg font-semibold text-slate-900">{aiTradeHistory.totalSessions || 0}</div>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-white p-4">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Page</div>
                <div className="text-lg font-semibold text-slate-900">{aiTradeHistory.page || 1} / {aiTradeHistory.totalPages || 1}</div>
              </div>
            </div>

            {/* Sessions List */}
            <div className="rounded-2xl bg-white shadow-soft border border-slate-100 p-5">
              <div className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4">AI Trade Session History</div>
              {(aiTradeHistory.sessions || []).length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-sm">No AI trade sessions recorded.</div>
              ) : (
                <div className="space-y-3">
                  {(aiTradeHistory.sessions || []).map(s => {
                    const payouts = (s.events || []).filter(e => e.action === 'payout')
                    const startEv = (s.events || []).find(e => e.action === 'started')
                    const stopEv = (s.events || []).find(e => e.action === 'stopped')
                    const startD = startEv ? new Date(startEv.created_at) : null
                    const stopD = stopEv ? new Date(stopEv.created_at) : null
                    const durMs = startD && stopD ? stopD - startD : null
                    const durLabel = durMs ? `${Math.floor(durMs/86400000)}d ${Math.floor((durMs%86400000)/3600000)}h` : s.status === 'active' ? 'Running…' : '—'
                    const slotColors = { 1: 'bg-sky-100 text-sky-700 border-sky-200', 2: 'bg-violet-100 text-violet-700 border-violet-200', 3: 'bg-amber-100 text-amber-700 border-amber-200', 4: 'bg-emerald-100 text-emerald-700 border-emerald-200' }
                    return (
                      <details key={s.session_ref} className="group rounded-xl border border-slate-200 overflow-hidden">
                        <summary className="cursor-pointer px-4 py-3 flex flex-wrap items-center gap-3 hover:bg-slate-50 transition">
                          <span className={`shrink-0 w-8 h-8 rounded-lg border flex items-center justify-center font-bold text-xs ${slotColors[s.slot] || slotColors[1]}`}>{s.slot}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-slate-800 text-sm">{s.slot_name} Slot</span>
                              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${s.status === 'active' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>{s.status === 'active' ? '● Active' : '✓ Done'}</span>
                            </div>
                            <div className="flex flex-wrap gap-x-3 text-[11px] text-slate-500 mt-0.5">
                              <span>Invested: <span className="font-mono font-semibold text-slate-700">{currency(s.allocated_amount)}</span></span>
                              {startD && <span>Started: {startD.toLocaleDateString()}</span>}
                              <span>Duration: {durLabel}</span>
                              <span>Payouts: {payouts.length}</span>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-emerald-600 font-bold font-mono">+{currency(s.total_earned)}</div>
                            <div className="text-[10px] text-slate-400">earned</div>
                          </div>
                        </summary>
                        <div className="border-t border-slate-100 bg-slate-50/50">
                          {payouts.length === 0 && <div className="px-5 py-3 text-sm text-slate-400">No payouts yet.</div>}
                          {payouts.map((ev, i) => (
                            <div key={ev.id} className="flex items-center gap-3 px-5 py-2.5 border-b border-slate-100 last:border-0 text-sm">
                              <span className={`shrink-0 w-6 h-6 rounded-full border flex items-center justify-center text-[10px] font-bold ${slotColors[s.slot] || slotColors[1]}`}>{ev.day_number || i+1}</span>
                              <span className="flex-1 text-slate-600 text-xs">Day {ev.day_number || i+1} — <span className="text-slate-400">{new Date(ev.created_at).toLocaleString()}</span></span>
                              <span className="text-emerald-600 font-mono font-semibold text-xs">+{currency(ev.payout_amount)}</span>
                            </div>
                          ))}
                          {stopEv && (
                            <div className="flex items-center gap-3 px-5 py-2.5 bg-rose-50">
                              <span className="shrink-0 w-6 h-6 rounded-full bg-rose-100 border border-rose-200 flex items-center justify-center text-rose-500 text-[10px]">■</span>
                              <span className="flex-1 text-xs text-slate-500">Stopped · {new Date(stopEv.created_at).toLocaleString()}</span>
                              {Number(stopEv.payout_amount) > 0 && <span className="text-amber-600 font-mono text-xs font-semibold">+{currency(stopEv.payout_amount)} partial</span>}
                            </div>
                          )}
                        </div>
                      </details>
                    )
                  })}
                </div>
              )}
              {/* Pagination */}
              {(aiTradeHistory.totalPages || 1) > 1 && (
                <div className="flex items-center justify-center gap-3 mt-4 pt-3 border-t border-slate-100">
                  <button disabled={aiTradePage <= 1 || detailLoading} onClick={async () => {
                    const p = aiTradePage - 1; setAiTradePage(p)
                    try { const r = await api(token).get(`/api/admin/users/${selectedUser.id}/ai-trade`, { params: { page: p } }); setAiTradeHistory(r.data.history) } catch {}
                  }} className="px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition">← Prev</button>
                  <span className="text-xs text-slate-500 font-mono">Page {aiTradeHistory.page || 1} / {aiTradeHistory.totalPages || 1}</span>
                  <button disabled={aiTradePage >= (aiTradeHistory.totalPages || 1) || detailLoading} onClick={async () => {
                    const p = aiTradePage + 1; setAiTradePage(p)
                    try { const r = await api(token).get(`/api/admin/users/${selectedUser.id}/ai-trade`, { params: { page: p } }); setAiTradeHistory(r.data.history) } catch {}
                  }} className="px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition">Next →</button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* IB / Affiliate Tab */}
        {activeTab === 'ib_affiliate' && (
          <div className="space-y-5">
            {/* IB Stat Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-soft">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">IB Level</div>
                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${IB_LEVEL_COLORS[ibProfile?.level] || 'bg-slate-100 text-slate-500'}`}>{ibProfile?.level || 'NONE'}</span>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-soft">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Lifetime Earned</div>
                <div className="text-lg font-semibold text-emerald-600">{currency(ibProfile?.stats?.lifetime_earned)}</div>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-soft">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Commissions</div>
                <div className="text-lg font-semibold text-slate-900">{ibProfile?.stats?.total_commissions || 0}</div>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-soft">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Referrals</div>
                <div className="text-lg font-semibold text-slate-900">{ibProfile?.referral_count || 0}</div>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-soft">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Month Volume</div>
                <div className="text-lg font-semibold text-slate-900">{currency(ibProfile?.month_volume)}</div>
              </div>
            </div>

            {/* Earnings Breakdown */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[['AI Trade', ibProfile?.stats?.ai_trade_earned], ['Manual', ibProfile?.stats?.manual_earned], ['Binary', ibProfile?.stats?.binary_earned], ['Bonus', ibProfile?.stats?.bonus_earned]].map(([l, v]) => (
                <div key={l} className="rounded-2xl border border-slate-100 bg-white p-4">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">{l}</div>
                  <div className="font-semibold text-slate-800">{currency(v)}</div>
                </div>
              ))}
            </div>

            {/* IB Sub-tabs */}
            <div className="flex gap-2 border-b border-slate-200">
              {['overview', 'ledger', 'team'].map(t => (
                <button key={t} className={`px-4 py-2 text-sm font-semibold border-b-2 transition capitalize ${ibSubTab === t ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`} onClick={() => setIbSubTab(t)}>{t}</button>
              ))}
            </div>

            {/* IB Sub-tab: Overview — Admin Controls */}
            {ibSubTab === 'overview' && (
              <div className="grid lg:grid-cols-2 gap-5">
                <div className="rounded-2xl bg-white border border-slate-100 shadow-soft p-5 space-y-4">
                  <div className="text-sm font-bold text-slate-800 uppercase tracking-wider">Edit IB Level / Rank</div>
                  <div className="flex items-center gap-3">
                    <select value={ibEditingLevel} onChange={e => setIbEditingLevel(e.target.value)}
                      className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 outline-none">
                      {IB_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                    <button disabled={detailLoading} onClick={async () => {
                      setDetailLoading(true)
                      try {
                        await api(token).put(`/api/ib/admin/user/${selectedUser.id}/level`, { level: ibEditingLevel })
                        setMessage('IB Level updated')
                        openUserDetail(selectedUser)
                      } catch (e) { setMessage(e?.response?.data?.error || 'Failed') }
                      finally { setDetailLoading(false) }
                    }} className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm shadow-md disabled:opacity-50">
                      {detailLoading ? 'Saving…' : 'Save Level'}
                    </button>
                  </div>
                  {ibProfile?.referred_by && (
                    <div className="text-xs text-slate-500">Referred by: <span className="font-semibold text-slate-700">{ibProfile.referred_by.name || ibProfile.referred_by.email}</span></div>
                  )}
                </div>
                <div className="rounded-2xl bg-white border border-slate-100 shadow-soft p-5 space-y-4">
                  <div className="text-sm font-bold text-slate-800 uppercase tracking-wider">Manual Commission Credit</div>
                  <button onClick={() => setIbShowCreditModal(true)}
                    className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold text-sm shadow-md">
                    + Credit Commission
                  </button>
                  <p className="text-xs text-slate-400">Add funds directly to user's commission balance. Will appear in ledger.</p>
                </div>
              </div>
            )}

            {/* IB Sub-tab: Ledger */}
            {ibSubTab === 'ledger' && (
              <div className="rounded-2xl bg-white shadow-soft border border-slate-100 p-5">
                <div className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4">Commission Ledger ({ibLedger.total} entries)</div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="text-slate-500">
                      <tr>
                        <th className="py-2 text-left text-[11px] font-semibold uppercase tracking-wider">Date</th>
                        <th className="py-2 text-left text-[11px] font-semibold uppercase tracking-wider">Type</th>
                        <th className="py-2 text-left text-[11px] font-semibold uppercase tracking-wider">Source</th>
                        <th className="py-2 text-right text-[11px] font-semibold uppercase tracking-wider">Trade Amt</th>
                        <th className="py-2 text-right text-[11px] font-semibold uppercase tracking-wider">Commission</th>
                        <th className="py-2 text-left text-[11px] font-semibold uppercase tracking-wider">Tier</th>
                        <th className="py-2 text-right text-[11px] font-semibold uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {ibLedger.rows.length === 0 ? (
                        <tr><td colSpan={7} className="py-8 text-center text-slate-400">No commission entries.</td></tr>
                      ) : ibLedger.rows.map(row => (
                        <tr key={row.id} className="text-slate-700 hover:bg-slate-50 transition group">
                          <td className="py-2.5 whitespace-nowrap text-slate-500 text-xs">{new Date(row.created_at).toLocaleString()}</td>
                          <td className="py-2.5"><span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-600">{IB_ASSET_LABELS[row.asset_class] || row.asset_class}</span></td>
                          <td className="py-2.5 text-xs">{row.source_name || row.source_email || '—'}</td>
                          <td className="py-2.5 text-right font-mono text-xs">{currency(row.trade_amount)}</td>
                          <td className="py-2.5 text-right font-mono font-semibold text-emerald-600">{currency(row.commission_amount)}</td>
                          <td className="py-2.5 text-xs capitalize">{row.tier_level}</td>
                          <td className="py-2.5 text-right">
                            <div className="flex items-center gap-2 justify-end opacity-0 group-hover:opacity-100 transition">
                              <button onClick={() => setIbEditingEntry({ ...row })} className="text-[10px] text-indigo-600 font-bold uppercase hover:text-indigo-800">Edit</button>
                              <button onClick={async () => {
                                if (!window.confirm('Delete this entry? Balance will be reversed.')) return
                                setDetailLoading(true)
                                try {
                                  await api(token).delete(`/api/ib/admin/ledger/${row.id}`)
                                  setMessage('Entry deleted & balance reversed')
                                  openUserDetail(selectedUser)
                                } catch (e) { setMessage(e?.response?.data?.error || 'Failed') }
                                finally { setDetailLoading(false) }
                              }} className="text-[10px] text-rose-500 font-bold uppercase hover:text-rose-700">Delete</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* IB Sub-tab: Team */}
            {ibSubTab === 'team' && (
              <div className="rounded-2xl bg-white shadow-soft border border-slate-100 p-5">
                <div className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4">Referral Team ({ibTeam.length} members)</div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="text-slate-500">
                      <tr>
                        <th className="py-2 text-left text-[11px] font-semibold uppercase tracking-wider">Member</th>
                        <th className="py-2 text-right text-[11px] font-semibold uppercase tracking-wider">Volume</th>
                        <th className="py-2 text-right text-[11px] font-semibold uppercase tracking-wider">Commission</th>
                        <th className="py-2 text-left text-[11px] font-semibold uppercase tracking-wider">Joined</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {ibTeam.length === 0 ? (
                        <tr><td colSpan={4} className="py-8 text-center text-slate-400">No referrals.</td></tr>
                      ) : ibTeam.map(m => (
                        <tr key={m.id} className="text-slate-700 hover:bg-slate-50 transition">
                          <td className="py-2.5"><div className="font-semibold">{m.name || m.email}</div><div className="text-xs text-slate-400 font-mono">{m.email}</div></td>
                          <td className="py-2.5 text-right font-mono">{currency(m.generated_volume)}</td>
                          <td className="py-2.5 text-right font-mono font-semibold text-emerald-600">{currency(m.generated_commission)}</td>
                          <td className="py-2.5 text-xs text-slate-500">{new Date(m.created_at).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* IB Edit Ledger Entry Modal */}
        {ibEditingEntry && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-md overflow-hidden">
              <div className="p-5 border-b border-slate-100">
                <h3 className="text-lg font-bold text-slate-900">Edit Ledger Entry #{ibEditingEntry.id}</h3>
              </div>
              <div className="p-5 space-y-4">
                <label className="block space-y-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Commission Amount</span>
                  <input type="number" step="0.01" value={ibEditingEntry.commission_amount}
                    onChange={e => setIbEditingEntry(p => ({ ...p, commission_amount: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20" />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Trade Amount</span>
                  <input type="number" step="0.01" value={ibEditingEntry.trade_amount}
                    onChange={e => setIbEditingEntry(p => ({ ...p, trade_amount: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20" />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Asset Class</span>
                  <select value={ibEditingEntry.asset_class} onChange={e => setIbEditingEntry(p => ({ ...p, asset_class: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20">
                    {Object.entries(IB_ASSET_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </label>
              </div>
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex gap-3 justify-end">
                <button onClick={() => setIbEditingEntry(null)} className="px-4 py-2 text-sm font-semibold text-slate-600">Cancel</button>
                <button disabled={detailLoading} onClick={async () => {
                  setDetailLoading(true)
                  try {
                    await api(token).put(`/api/ib/admin/ledger/${ibEditingEntry.id}`, {
                      commission_amount: Number(ibEditingEntry.commission_amount),
                      trade_amount: Number(ibEditingEntry.trade_amount),
                      asset_class: ibEditingEntry.asset_class,
                    })
                    setMessage('Entry updated')
                    setIbEditingEntry(null)
                    openUserDetail(selectedUser)
                  } catch (e) { setMessage(e?.response?.data?.error || 'Failed') }
                  finally { setDetailLoading(false) }
                }} className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-xl text-sm font-bold shadow-md disabled:opacity-50">
                  {detailLoading ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* IB Credit Commission Modal */}
        {ibShowCreditModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-md overflow-hidden">
              <div className="p-5 border-b border-slate-100">
                <h3 className="text-lg font-bold text-slate-900">Credit Commission to {selectedUser.name || selectedUser.email}</h3>
              </div>
              <div className="p-5 space-y-4">
                <label className="block space-y-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Amount ($)</span>
                  <input type="number" step="0.01" value={ibCreditForm.amount}
                    onChange={e => setIbCreditForm(p => ({ ...p, amount: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20" />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Category</span>
                  <select value={ibCreditForm.asset_class} onChange={e => setIbCreditForm(p => ({ ...p, asset_class: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20">
                    {Object.entries(IB_ASSET_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </label>
                <label className="block space-y-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Note (optional)</span>
                  <input type="text" value={ibCreditForm.note}
                    onChange={e => setIbCreditForm(p => ({ ...p, note: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20" />
                </label>
              </div>
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex gap-3 justify-end">
                <button onClick={() => setIbShowCreditModal(false)} className="px-4 py-2 text-sm font-semibold text-slate-600">Cancel</button>
                <button disabled={detailLoading} onClick={async () => {
                  const amt = Number(ibCreditForm.amount)
                  if (!amt || amt <= 0) return setMessage('Enter valid amount')
                  setDetailLoading(true)
                  try {
                    await api(token).post(`/api/ib/admin/user/${selectedUser.id}/credit`, ibCreditForm)
                    setMessage(`Credited ${currency(amt)}`)
                    setIbShowCreditModal(false)
                    setIbCreditForm({ amount: '', asset_class: 'MANUAL_CREDIT', note: '' })
                    openUserDetail(selectedUser)
                  } catch (e) { setMessage(e?.response?.data?.error || 'Failed') }
                  finally { setDetailLoading(false) }
                }} className="bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-2 rounded-xl text-sm font-bold shadow-md disabled:opacity-50">
                  {detailLoading ? 'Crediting…' : 'Credit Funds'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Timestamp Editor Modal */}
        {editingTime && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              <div className="p-5 border-b border-slate-100">
                <h3 className="text-lg font-bold text-slate-900">Edit Timestamp</h3>
                <p className="text-xs text-slate-500 mt-1">Modifying {editingTime.field} in {editingTime.table}</p>
              </div>
              <div className="p-5 space-y-4">
                <label className="block space-y-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">Date & Time</span>
                  <input 
                    type="datetime-local" 
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-800 font-medium focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none"
                    value={
                      editingTime.value 
                        ? new Date(new Date(editingTime.value).getTime() - new Date(editingTime.value).getTimezoneOffset() * 60000).toISOString().slice(0, 16) 
                        : ''
                    }
                    onChange={(e) => setEditingTime({ ...editingTime, value: new Date(e.target.value).toISOString() })}
                  />
                </label>
              </div>
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex gap-3 justify-end">
                <button 
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-900 transition"
                  onClick={() => setEditingTime(null)}
                >
                  Cancel
                </button>
                <button 
                  className="btn bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-xl text-sm font-bold shadow-md shadow-indigo-600/20 disabled:opacity-50"
                  onClick={saveTimestamp}
                  disabled={detailLoading}
                >
                  {detailLoading ? 'Saving...' : 'Save Time'}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-slate-400">Admin</div>
          <h1 className="text-3xl font-semibold text-slate-900">User Management</h1>
        </div>
        <input
          className="input bg-white border-slate-200 text-slate-800 w-full sm:w-64"
          placeholder="Search users"
          value={query}
          onChange={e => {
            const value = e.target.value
            setQuery(value)
            loadUsers(value)
          }}
        />
      </div>
      {message ? (
        <div className="rounded-2xl bg-indigo-50 border border-indigo-200 px-4 py-2 text-sm text-indigo-700">{message}</div>
      ) : null}
      <div className="rounded-3xl bg-white shadow-soft border border-slate-100 p-5 space-y-4">
        <div className="text-sm font-semibold text-slate-600 uppercase tracking-[0.2em]">Adjust Balance</div>
        <div className="grid md:grid-cols-3 gap-3">
          <input
            className="input bg-white border-slate-200 text-slate-800"
            placeholder="user@example.com"
            value={balanceForm.email}
            onChange={e => setBalanceForm(prev => ({ ...prev, email: e.target.value }))}
          />
          <input
            className="input bg-white border-slate-200 text-slate-800"
            placeholder="Amount"
            value={balanceForm.amount}
            onChange={e => setBalanceForm(prev => ({ ...prev, amount: e.target.value }))}
          />
          <button className="btn bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl" onClick={updateBalance}>Set Balance</button>
        </div>
      </div>
      <div className="rounded-3xl bg-white shadow-soft border border-slate-100 p-5">
        <div className="text-sm font-semibold text-slate-600 uppercase tracking-[0.2em] mb-4">Accounts</div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-slate-500">
              <tr>
                <th className="py-2 text-left font-semibold uppercase tracking-wider text-[11px]">User</th>
                <th className="py-2 text-left font-semibold uppercase tracking-wider text-[11px]">Role</th>
                <th className="py-2 text-left font-semibold uppercase tracking-wider text-[11px]">Balance</th>
                <th className="py-2 text-left font-semibold uppercase tracking-wider text-[11px]">Trades</th>
                <th className="py-2 text-left font-semibold uppercase tracking-wider text-[11px]">Realized</th>
                <th className="py-2 text-left font-semibold uppercase tracking-wider text-[11px]">Verification</th>
                <th className="py-2 text-right font-semibold uppercase tracking-wider text-[11px]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={7} className="py-8 text-center text-slate-500">Loading…</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={7} className="py-8 text-center text-slate-500">No users found.</td></tr>
              ) : (
                users.map(user => (
                  <tr
                    key={user.id}
                    className="text-slate-700 cursor-pointer transition hover:bg-slate-50 group"
                    onClick={() => openUserDetail(user)}
                  >
                    <td className="py-3">
                      <div className="font-semibold text-slate-900 group-hover:text-indigo-600 transition flex items-center gap-2">
                        {user.name || user.email}
                        {user.open_trade_count > 0 && (
                          <span className="relative flex h-2.5 w-2.5" title={`${user.open_trade_count} Live Trades`}>
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 font-mono mt-0.5">{user.email}</div>
                    </td>
                    <td className="py-3 capitalize font-medium">{user.role}</td>
                    <td className="py-3 font-mono font-semibold">{currency((user.available || 0) + (user.locked || 0))}</td>
                    <td className="py-3 font-mono text-slate-500">{user.trade_count}</td>
                    <td className="py-3 font-mono">
                      <span className={Number(user.realized_pnl) >= 0 ? 'text-emerald-600 font-semibold' : 'text-rose-500 font-semibold'}>
                        {currency(user.realized_pnl)}
                      </span>
                    </td>
                    <td className="py-3">
                      {(() => {
                        const statusValue = user.verification_status ?? 'not_started'
                        const statusLabel = VERIFICATION_LABELS[statusValue] ?? VERIFICATION_LABELS.not_started
                        const statusClass = VERIFICATION_CLASSES[statusValue] ?? VERIFICATION_CLASSES.not_started
                        return (
                          <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${statusClass}`}>
                            {statusLabel}
                          </span>
                        )
                      })()}
                    </td>
                    <td className="py-3 text-right">
                      <div className="flex items-center gap-3 justify-end">
                        <button
                          className="text-xs text-indigo-600 hover:text-indigo-800 font-bold uppercase tracking-wider transition"
                          onClick={(e) => { e.stopPropagation(); openUserDetail(user) }}
                        >
                          View
                        </button>
                        <button
                          className="text-xs text-rose-500 hover:text-rose-700 font-bold uppercase tracking-wider transition"
                          onClick={(e) => { e.stopPropagation(); deleteUser(user.id) }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
