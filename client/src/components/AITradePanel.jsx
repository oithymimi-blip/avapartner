import { useEffect, useState, useRef, useCallback } from 'react';
import { api } from '../api';
import { useAuth } from '../store';

const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

const SLOTS = [
  { slot: 1, name: 'Starter',    range: '$10 – $100',        min: 10,   max: 100,  userSplit: 60, dailyRange: '1.0% – 1.5%', gradient: 'from-sky-500 to-blue-600',     border: 'border-sky-500/40',     glow: 'shadow-sky-500/20' },
  { slot: 2, name: 'Booster',    range: '$101 – $1,000',     min: 101,  max: 1000, userSplit: 70, dailyRange: '1.5% – 2.0%', gradient: 'from-violet-500 to-purple-700', border: 'border-violet-500/40',  glow: 'shadow-violet-500/20' },
  { slot: 3, name: 'Premium',    range: '$1,001 – $5,000',   min: 1001, max: 5000, userSplit: 75, dailyRange: '2.0% – 2.5%', gradient: 'from-amber-400 to-orange-600',  border: 'border-amber-500/40',   glow: 'shadow-amber-500/20' },
  { slot: 4, name: 'Titan Mega', range: '$5,001 – $10,000+', min: 5001, max: null, userSplit: 85, dailyRange: '2.5% – 3.0%', gradient: 'from-emerald-400 to-teal-600',  border: 'border-emerald-500/40', glow: 'shadow-emerald-500/20' },
];

// Animated counter for earnings
function AnimatedValue({ value }) {
  const [display, setDisplay] = useState(value);
  const animRef = useRef(null);
  useEffect(() => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    const start = display;
    const diff = value - start;
    if (Math.abs(diff) < 0.0001) { setDisplay(value); return; }
    const duration = 800;
    const startTime = performance.now();
    function step(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(start + diff * eased);
      if (progress < 1) animRef.current = requestAnimationFrame(step);
    }
    animRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animRef.current);
  }, [value]);
  return <span>{fmt.format(display)}</span>;
}

// Live countdown timer
function Countdown({ targetIso }) {
  const [label, setLabel] = useState('');
  useEffect(() => {
    if (!targetIso) { setLabel('--'); return; }
    function update() {
      const diff = new Date(targetIso).getTime() - Date.now();
      if (diff <= 0) { setLabel('Paying out…'); return; }
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1_000);
      setLabel(`${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`);
    }
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [targetIso]);
  return <span className="font-mono text-brand tabular-nums">{label}</span>;
}

const SLOT_COLORS = {
  1: { bg: 'bg-sky-500/15',     border: 'border-sky-500/30',     text: 'text-sky-400' },
  2: { bg: 'bg-violet-500/15',  border: 'border-violet-500/30',  text: 'text-violet-400' },
  3: { bg: 'bg-amber-500/15',   border: 'border-amber-500/30',   text: 'text-amber-400' },
  4: { bg: 'bg-emerald-500/15', border: 'border-emerald-500/30', text: 'text-emerald-400' },
};

function AITradeHistory({ token, session: parentSession }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalSessions, setTotalSessions] = useState(0);
  const [error, setError] = useState(null);
  const PER_PAGE = 5;

  const loadPage = (p) => {
    if (!token) return;
    setLoading(true);
    setError(null);
    api(token).get('/api/ai-trade/history', { params: { page: p, limit: PER_PAGE } })
      .then(r => {
        const d = r.data || {};
        setData(d);
        // Handle both old format ({sessions, totalEarned}) and new ({sessions, totalEarned, page, totalPages, totalSessions})
        setPage(d.page || p);
        setTotalPages(d.totalPages || 1);
        setTotalSessions(d.totalSessions || (d.sessions?.length || 0));
      })
      .catch(err => {
        console.error('[AITradeHistory] fetch error:', err);
        setError('Failed to load history');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadPage(1); }, [token]);

  const toggle = (ref) => setExpanded(p => ({ ...p, [ref]: !p[ref] }));

  if (loading && !data) return <div className="rounded-3xl border border-white/8 bg-black/20 p-8 text-center text-white/40 text-sm animate-pulse">Loading history…</div>;
  const sessions = data?.sessions ?? [];
  const totalEarned = data?.totalEarned ?? 0;

  // Use active session from API response, or fall back to parent session prop
  const liveSession = data?.activeSession || parentSession;
  const hasActiveInHistory = sessions.some(s => s.status === 'active');
  const showLiveSession = !hasActiveInHistory && liveSession?.ai_trade_status === 'ON';
  const SLOT_NAMES = ['', 'Starter', 'Booster', 'Premium', 'Titan Mega'];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-semibold">Session Logs</div>
          <div className="text-lg font-bold text-white mt-0.5">AI Trade History</div>
        </div>
        {(totalSessions > 0 || totalEarned > 0 || showLiveSession) && (
          <div className="flex gap-3">
            <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/25 px-4 py-2 text-center">
              <div className="text-[10px] text-emerald-400/70 uppercase tracking-wider">Total Earned</div>
              <div className="text-emerald-400 font-bold font-mono">{fmt.format(totalEarned)}</div>
            </div>
            <div className="rounded-xl bg-white/5 border border-white/10 px-4 py-2 text-center">
              <div className="text-[10px] text-white/40 uppercase tracking-wider">Sessions</div>
              <div className="text-white font-bold">{totalSessions || (showLiveSession ? 1 : 0)}</div>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-5 py-3 text-sm text-rose-400">{error}</div>
      )}

      {/* Show current active session from live data if no history entries */}
      {showLiveSession && (
        <div className="rounded-2xl border border-emerald-500/30 bg-black/25 overflow-hidden">
          <div className="p-4 sm:p-5 flex flex-wrap items-start gap-3">
            <div className="shrink-0 w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center font-bold text-sm text-emerald-400">{liveSession.slot}</div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-0.5">
                <span className="font-semibold text-white text-sm">{SLOT_NAMES[liveSession.slot] || `Slot ${liveSession.slot}`} Slot</span>
                <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">● Active</span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-white/50">
                <span>Invested: <span className="text-white/80 font-mono">{fmt.format(liveSession.allocated_amount)}</span></span>
                {liveSession.started_at && <span>Started: <span className="text-white/70">{new Date(liveSession.started_at).toLocaleDateString()}</span></span>}
                <span>Earnings: <span className="text-emerald-400 font-mono">{fmt.format(liveSession.earnings || 0)}</span></span>
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-emerald-400 font-bold font-mono text-base">+{fmt.format(liveSession.earnings || 0)}</div>
              <div className="text-[10px] text-white/35 mt-0.5">pending</div>
            </div>
          </div>
        </div>
      )}

      {sessions.length === 0 && !loading && !showLiveSession && (
        <div className="rounded-3xl border border-white/8 bg-black/20 p-10 text-center space-y-2">
          <div className="text-4xl">📊</div>
          <div className="text-white/60 font-semibold">No history yet</div>
          <div className="text-white/35 text-sm">Activate AI Trade to begin. Payouts will appear here.</div>
        </div>
      )}
      {loading && <div className="text-center text-white/30 text-sm py-4 animate-pulse">Loading…</div>}
      <div className="space-y-3">
        {sessions.map(s => {
          const c = SLOT_COLORS[s.slot] || SLOT_COLORS[1];
          const isOpen = expanded[s.session_ref];
          const payouts = (s.events || []).filter(e => e.action === 'payout');
          const startEv = (s.events || []).find(e => e.action === 'started');
          const stopEv  = (s.events || []).find(e => e.action === 'stopped');
          const startD  = startEv ? new Date(startEv.created_at) : null;
          const stopD   = stopEv  ? new Date(stopEv.created_at)  : null;
          const durMs   = startD && stopD ? stopD - startD : null;
          const durLabel = durMs ? `${Math.floor(durMs/86400000)}d ${Math.floor((durMs%86400000)/3600000)}h` : s.status === 'active' ? 'Running…' : '--';
          return (
            <div key={s.session_ref} className={`rounded-2xl border ${c.border} bg-black/25 overflow-hidden`}>
              <button onClick={() => toggle(s.session_ref)} className="w-full text-left p-4 sm:p-5 flex flex-wrap items-start gap-3">
                <div className={`shrink-0 w-9 h-9 rounded-xl ${c.bg} border ${c.border} flex items-center justify-center font-bold text-sm ${c.text}`}>{s.slot}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-0.5">
                    <span className="font-semibold text-white text-sm">{s.slot_name} Slot</span>
                    <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${
                      s.status === 'active' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-white/5 text-white/40 border border-white/10'
                    }`}>{s.status === 'active' ? '● Active' : '✓ Completed'}</span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-white/50">
                    <span>Invested: <span className="text-white/80 font-mono">{fmt.format(s.allocated_amount)}</span></span>
                    {startD && <span>Started: <span className="text-white/70">{startD.toLocaleDateString()}</span></span>}
                    <span>Duration: <span className="text-white/70">{durLabel}</span></span>
                    <span>Payouts: <span className="text-white/70">{payouts.length}</span></span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-emerald-400 font-bold font-mono text-base">+{fmt.format(s.total_earned)}</div>
                  <div className="text-[10px] text-white/35 mt-0.5">total earned</div>
                </div>
                <svg className={`shrink-0 self-center transition-transform duration-200 text-white/30 ${isOpen ? 'rotate-180' : ''}`} width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
              </button>
              {isOpen && (
                <div className="border-t border-white/5 bg-black/20">
                  {payouts.length === 0 && <div className="px-5 py-4 text-sm text-white/35">No payouts yet for this session.</div>}
                  {payouts.map((ev, i) => (
                    <div key={ev.id} className="flex items-center gap-3 px-5 py-3 border-b border-white/[0.04] last:border-0">
                      <div className={`w-7 h-7 rounded-full ${c.bg} border ${c.border} flex items-center justify-center text-[11px] font-bold ${c.text} shrink-0`}>{ev.day_number || i+1}</div>
                      <div className="flex-1 text-[11px] text-white/60">
                        Day {ev.day_number || i+1} Payout
                        <span className="ml-2 text-white/30">{new Date(ev.created_at).toLocaleDateString()} {new Date(ev.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span>
                      </div>
                      <div className="text-emerald-400 font-mono font-semibold text-sm shrink-0">+{fmt.format(ev.payout_amount)}</div>
                    </div>
                  ))}
                  {stopEv && (
                    <div className="flex items-center gap-3 px-5 py-3 bg-rose-500/5">
                      <div className="w-7 h-7 rounded-full bg-rose-500/15 border border-rose-500/30 flex items-center justify-center shrink-0">
                        <svg className="w-3.5 h-3.5 text-rose-400" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
                      </div>
                      <div className="flex-1 text-[11px] text-white/50">Session stopped · {new Date(stopEv.created_at).toLocaleDateString()} {new Date(stopEv.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</div>
                      {Number(stopEv.payout_amount) > 0 && <div className="text-amber-400 font-mono text-sm shrink-0">+{fmt.format(stopEv.payout_amount)} <span className="text-white/30 text-[10px]">partial</span></div>}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button disabled={page <= 1 || loading} onClick={() => loadPage(page - 1)}
            className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs font-semibold text-white/60 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition">
            ← Prev
          </button>
          <span className="text-xs text-white/40 font-mono">Page {page} of {totalPages}</span>
          <button disabled={page >= totalPages || loading} onClick={() => loadPage(page + 1)}
            className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs font-semibold text-white/60 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition">
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

export default function AITradePanel({ onAccountRefresh }) {
  const { token } = useAuth();
  const [session, setSession] = useState(null);
  const [balance, setBalance] = useState({ available: 0, locked: 0 });
  const [selectedSlot, setSelectedSlot] = useState(1);
  const [amount, setAmount] = useState('');
  const [smartOn, setSmartOn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const pollRef = useRef(null);

  const isActive = session?.ai_trade_status === 'ON';
  const activeSlotDef = SLOTS.find(s => s.slot === (session?.slot ?? selectedSlot)) || SLOTS[0];
  const currentSlotDef = SLOTS.find(s => s.slot === selectedSlot) || SLOTS[0];

  const fetchSession = useCallback(async () => {
    if (!token) return;
    try {
      const res = await api(token).get('/api/ai-trade/session');
      const { session: s, balance: b } = res.data;
      setSession(s);
      setBalance(b || { available: 0, locked: 0 });
      if (s?.ai_trade_status === 'ON') {
        setSelectedSlot(s.slot);
        setSmartOn(s.smart_on === 1);
      }
    } catch (err) {
      console.error('AITrade fetch error', err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchSession();
    pollRef.current = setInterval(fetchSession, 15_000);
    return () => clearInterval(pollRef.current);
  }, [fetchSession]);

  // Auto-dismiss error/success messages after 6 seconds
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 6000);
    return () => clearTimeout(t);
  }, [error]);
  useEffect(() => {
    if (!successMsg) return;
    const t = setTimeout(() => setSuccessMsg(null), 6000);
    return () => clearTimeout(t);
  }, [successMsg]);

  const handleToggle = async () => {
    if (toggling) return;
    setError(null);
    setSuccessMsg(null);
    setToggling(true);
    try {
      if (isActive) {
        const res = await api(token).post('/api/ai-trade/toggle', { action: 'OFF' });
        setSession(res.data.session);
        setBalance(res.data.balance);
        setSuccessMsg('AI Trade stopped. Your funds + earnings have been returned to your wallet.');
        if (onAccountRefresh) onAccountRefresh();
      } else {
        const amt = Number(amount);
        const res = await api(token).post('/api/ai-trade/toggle', {
          action: 'ON', slot: selectedSlot, amount: amt, smart_on: smartOn,
        });
        setSession(res.data.session);
        setBalance(res.data.balance);
        setSuccessMsg('AI Trade activated! Earnings will be credited to your wallet every 24 hours.');
        if (onAccountRefresh) onAccountRefresh();
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed. Please try again.');
    }
    setToggling(false);
  };

  const handleSlotSelect = (slot) => {
    if (isActive) return;
    setSelectedSlot(slot);
    setAmount(String(SLOTS.find(s => s.slot === slot)?.min ?? ''));
    setError(null);
  };

  const earnings = Number(session?.earnings ?? 0);
  const allocated = Number(session?.allocated_amount ?? 0);
  const nextPayoutIso = session?.next_payout_at ?? null;


  return (
    <div className="space-y-5">

      {/* ── Header Card ── */}
      <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-black/40 to-slate-900/60 p-5 sm:p-6 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-semibold">Powered by</span>
              <span className="text-[10px] uppercase tracking-[0.15em] text-brand font-bold">Quantum AI Engine</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white">AI Trade</h2>
            <p className="text-sm text-white/50 mt-1">Automated algorithmic trading — profits paid every 24 hours</p>
          </div>
          <div className={`flex items-center gap-2 px-4 py-2 rounded-full border text-xs font-bold uppercase tracking-widest transition-all ${
            isActive ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400' : 'border-white/10 bg-white/5 text-white/40'
          }`}>
            <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-emerald-400 animate-pulse' : 'bg-white/20'}`} />
            {isActive ? 'Running' : 'Inactive'}
          </div>
        </div>

        {/* Live stats when active */}
        {isActive && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-2xl bg-black/30 border border-white/5 p-4">
              <div className="text-[10px] uppercase tracking-[0.12em] text-white/40 mb-1">Locked</div>
              <div className="text-white font-mono font-semibold">{fmt.format(allocated)}</div>
            </div>
            <div className="rounded-2xl bg-black/30 border border-emerald-500/20 p-4">
              <div className="text-[10px] uppercase tracking-[0.12em] text-emerald-400/70 mb-1">Earnings (pending)</div>
              <div className="text-emerald-400 font-mono font-semibold">
                +<AnimatedValue value={earnings} />
              </div>
            </div>
            <div className="rounded-2xl bg-black/30 border border-white/5 p-4">
              <div className="text-[10px] uppercase tracking-[0.12em] text-white/40 mb-1">Your Split</div>
              <div className="text-white font-semibold">{activeSlotDef.userSplit}% <span className="text-white/40 text-xs font-normal">of profits</span></div>
            </div>
            <div className="rounded-2xl bg-black/30 border border-brand/20 p-4">
              <div className="text-[10px] uppercase tracking-[0.12em] text-brand/60 mb-1">Next Payout In</div>
              <div className="text-sm font-semibold">
                <Countdown targetIso={nextPayoutIso} />
              </div>
            </div>
          </div>
        )}

        {/* Available balance when inactive */}
        {!isActive && (
          <div className="flex items-center justify-between rounded-2xl bg-black/30 border border-white/5 px-5 py-4">
            <div className="text-sm text-white/60">Available Balance</div>
            <div className="font-mono font-semibold text-white text-base">{fmt.format(balance.available)}</div>
          </div>
        )}
      </div>

      {/* ── 24h Payout Info Banner ── */}
      {isActive && (
        <div className="grid sm:grid-cols-2 gap-3">
          {/* Lock Badge */}
          <div className="flex items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-5 py-4 text-amber-300">
            <svg className="w-5 h-5 shrink-0 text-amber-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 1C9.243 1 7 3.243 7 6v2H5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2h-2V6c0-2.757-2.243-5-5-5zm0 2c1.654 0 3 1.346 3 3v2H9V6c0-1.654 1.346-3 3-3zm0 9a2 2 0 1 1 0 4 2 2 0 0 1 0-4z"/>
            </svg>
            <div className="min-w-0">
              <div className="text-sm font-semibold">Funds Locked in Active Trading Session</div>
              <div className="text-xs text-amber-400/70 mt-0.5">Turn off AI Trade to unlock and withdraw.</div>
            </div>
            <span className="ml-auto shrink-0 text-[10px] font-bold uppercase tracking-widest bg-amber-500/20 border border-amber-500/30 px-2.5 py-1 rounded-full">
              {activeSlotDef.name}
            </span>
          </div>
          {/* Payout cycle info */}
          <div className="flex items-center gap-3 rounded-2xl border border-brand/20 bg-brand/5 px-5 py-4">
            <svg className="w-5 h-5 shrink-0 text-brand" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            <div>
              <div className="text-sm font-semibold text-white">Daily Auto-Payout</div>
              <div className="text-xs text-white/50 mt-0.5">
                Earnings credited to your main wallet every 24h. Trade keeps running.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Smart-On banner when active ── */}
      {isActive && session?.smart_on === 1 && (
        <div className="flex items-center gap-3 rounded-2xl border border-brand/20 bg-brand/5 px-5 py-3">
          <svg className="w-4 h-4 text-brand shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/>
          </svg>
          <span className="text-sm text-brand/90 font-medium">Smart AI Trade is ON — session continues automatically after each payout cycle.</span>
        </div>
      )}

      {/* ── Slot Cards ── */}
      <div>
        <div className="text-[11px] uppercase tracking-[0.18em] text-white/40 mb-3 font-semibold px-1">
          {isActive ? 'Active Slot' : 'Select Investment Slot'}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {SLOTS.map(s => {
            const isSelected = selectedSlot === s.slot;
            const isActiveSlot = isActive && session?.slot === s.slot;
            const interactive = !isActive;
            return (
              <button
                key={s.slot}
                onClick={() => handleSlotSelect(s.slot)}
                disabled={isActive}
                className={`relative rounded-2xl border p-4 text-left transition-all duration-200 ${
                  isActiveSlot
                    ? `${s.border} bg-white/5 shadow-lg ${s.glow} ring-1 ring-inset ${s.border}`
                    : isSelected && interactive
                    ? `${s.border} bg-white/5 shadow-lg ${s.glow}`
                    : 'border-white/8 bg-white/[0.03] hover:bg-white/[0.06]'
                } ${isActive && !isActiveSlot ? 'opacity-30 cursor-default' : interactive ? 'cursor-pointer' : 'cursor-default'}`}
              >
                <div className={`inline-flex items-center justify-center w-7 h-7 rounded-xl bg-gradient-to-br ${s.gradient} text-white text-xs font-bold mb-3`}>
                  {s.slot}
                </div>
                <div className="text-white font-semibold text-sm leading-tight">{s.name}</div>
                <div className="text-[11px] text-white/50 mt-0.5 font-mono">{s.range}</div>
                <div className="mt-3 pt-3 border-t border-white/5 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-white/40 uppercase tracking-wider">Daily</span>
                    <span className="text-emerald-400 font-bold text-xs">{s.dailyRange}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-white/40 uppercase tracking-wider">Your split</span>
                    <span className="text-white/80 font-semibold text-xs">{s.userSplit}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                    <div className={`h-full rounded-full bg-gradient-to-r ${s.gradient}`} style={{ width: `${s.userSplit}%` }} />
                  </div>
                </div>
                {isSelected && !isActive && (
                  <div className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-brand animate-pulse" />
                )}
                {isActiveSlot && (
                  <div className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Amount & Smart-On (inactive only) ── */}
      {!isActive && (
        <div className="rounded-3xl border border-white/10 bg-black/20 p-5 sm:p-6 space-y-5">
          <div>
            <label className="block text-[11px] uppercase tracking-[0.18em] text-white/40 mb-2 font-semibold">
              Investment Amount (USD)
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 font-mono text-sm">$</span>
              <input
                id="ai-trade-amount"
                type="number"
                value={amount}
                onChange={e => { setAmount(e.target.value); setError(null); }}
                placeholder={String(currentSlotDef.min)}
                min={currentSlotDef.min}
                max={currentSlotDef.max ?? undefined}
                className="w-full pl-8 pr-4 py-3.5 rounded-xl border border-white/10 bg-black/30 text-white font-mono placeholder-white/25 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand text-base"
              />
            </div>
            <div className="flex items-center justify-between mt-2 text-[11px] text-white/40">
              <span>Range: {currentSlotDef.range} · Daily: <span className="text-emerald-400 font-semibold">{currentSlotDef.dailyRange}</span></span>
              <button type="button" onClick={() => setAmount(String(Math.floor(balance.available)))}
                className="text-brand hover:text-brand/80 font-semibold transition-colors">
                Use Max
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-white/[0.03] px-5 py-4">
            <div>
              <div className="text-sm font-semibold text-white">Smart AI Trade (Always On)</div>
              <div className="text-xs text-white/45 mt-0.5">Automatically continue trading after every 24h payout cycle</div>
            </div>
            <button
              id="smart-on-toggle"
              type="button"
              role="switch"
              aria-checked={smartOn}
              onClick={() => setSmartOn(v => !v)}
              className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-300 focus:outline-none ${smartOn ? 'bg-brand' : 'bg-white/15'}`}
            >
              <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform duration-300 ${smartOn ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
        </div>
      )}

      {/* ── Alerts ── */}
      {error && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-5 py-3 text-sm text-rose-400 flex items-center justify-between gap-3">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="shrink-0 text-rose-400/60 hover:text-rose-300 transition">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
      )}
      {successMsg && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-3 text-sm text-emerald-400">{successMsg}</div>
      )}

      {/* ── Main Toggle Button ── */}
      <button
        id="ai-trade-toggle-btn"
        onClick={handleToggle}
        disabled={toggling || (!isActive && !amount)}
        className={`w-full rounded-2xl py-4 font-bold text-base tracking-wide transition-all duration-300 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed ${
          isActive
            ? 'bg-rose-500/90 hover:bg-rose-500 text-white shadow-[0_8px_24px_rgba(244,63,94,0.3)] hover:shadow-[0_12px_32px_rgba(244,63,94,0.4)]'
            : 'bg-gradient-to-r from-brand to-cyan-400 text-black shadow-[0_8px_24px_rgba(0,223,154,0.35)] hover:shadow-[0_12px_32px_rgba(0,223,154,0.5)]'
        }`}
      >
        {toggling ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            {isActive ? 'Stopping…' : 'Activating…'}
          </span>
        ) : isActive ? '⏹  Stop AI Trade' : '⚡  Activate AI Trade'}
      </button>

      <p className="text-center text-[10px] text-white/25 leading-relaxed px-4">
        AI Trade uses algorithmic strategies. Earnings are credited to your main wallet every 24 hours.
        Funds remain locked during active sessions and are released upon deactivation.
      </p>

      {/* ── AI Trade History ── */}
      <div className="mt-2 pt-6 border-t border-white/8">
        <AITradeHistory token={token} session={session} />
      </div>
    </div>
  );
}
