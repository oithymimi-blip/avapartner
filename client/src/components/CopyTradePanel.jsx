import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../store';

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
});

const DEFAULT_MASTERS = [
  { id: 1, name: 'Alex Carter', avatar: 'A', roi_percentage: 412.5, win_rate: 92.4, followers: 15420, risk_score: 4, aum: 2540000 },
  { id: 2, name: 'Sarah Chen', avatar: 'S', roi_percentage: 305.2, win_rate: 88.1, followers: 8930, risk_score: 3, aum: 1200500 },
  { id: 3, name: 'CryptoNinja', avatar: 'C', roi_percentage: 840.1, win_rate: 74.5, followers: 34200, risk_score: 8, aum: 8900000 },
  { id: 4, name: 'Quantum Fund', avatar: 'Q', roi_percentage: 150.8, win_rate: 95.0, followers: 4500, risk_score: 2, aum: 5400000 },
  { id: 5, name: 'Elena R.', avatar: 'E', roi_percentage: 215.4, win_rate: 85.2, followers: 6210, risk_score: 5, aum: 850000 }
];

export default function CopyTradePanel({ onAccountRefresh }) {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState('discover'); // discover, portfolio
  const [masters, setMasters] = useState(DEFAULT_MASTERS);
  const [portfolio, setPortfolio] = useState([]);
  const [loading, setLoading] = useState(false);

  // Copy modal state
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [selectedMaster, setSelectedMaster] = useState(null);
  const [copyAmount, setCopyAmount] = useState('');
  const [copying, setCopying] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchData();
  }, [token]);

  const fetchData = async () => {
    try {
      const [mastersRes, portfolioRes] = await Promise.all([
        api(token).get('/api/copytrading/masters').catch(() => ({ data: [] })),
        token ? api(token).get('/api/copytrading/portfolio').catch(() => ({ data: [] })) : Promise.resolve({ data: [] })
      ]);
      if (mastersRes.data && mastersRes.data.length > 0) {
        setMasters(mastersRes.data);
      }
      setPortfolio(portfolioRes.data || []);
    } catch (err) {
      console.error('Failed to load copy trading data', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCopy = (master) => {
    setSelectedMaster(master);
    setCopyAmount('');
    setError(null);
    setShowCopyModal(true);
  };

  const handleConfirmCopy = async () => {
    const amount = Number(copyAmount);
    if (!amount || amount <= 0) {
      setError('Enter a valid amount');
      return;
    }
    setCopying(true);
    setError(null);
    try {
      await api(token).post('/api/copytrading/start', {
        master_trader_id: selectedMaster.id,
        amount
      });
      setShowCopyModal(false);
      await fetchData();
      if (onAccountRefresh) onAccountRefresh();
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to start copying');
    } finally {
      setCopying(false);
    }
  };

  const handleStopCopy = async (id) => {
    if (!window.confirm('Are you sure you want to stop copying this trader? Your allocated funds will be returned to your balance.')) return;
    try {
      await api(token).post('/api/copytrading/stop', { id });
      await fetchData();
      if (onAccountRefresh) onAccountRefresh();
    } catch (err) {
      console.error('Failed to stop copying', err);
      alert(err.response?.data?.error || err.message || 'Failed to stop copying');
    }
  };

  return (
    <div className="rounded-3xl border border-white/10 bg-black/20 p-4 sm:p-5 lg:p-6 text-sm text-white/80 space-y-6">
      
      <div className="flex items-center gap-6 border-b border-white/10 pb-3">
        <button
          onClick={() => setActiveTab('discover')}
          className={`font-semibold uppercase tracking-wider text-xs pb-3 -mb-[13px] border-b-2 transition-colors ${activeTab === 'discover' ? 'border-brand text-brand' : 'border-transparent text-white/50 hover:text-white/80'}`}
        >
          Discover
        </button>
        <button
          onClick={() => setActiveTab('portfolio')}
          className={`font-semibold uppercase tracking-wider text-xs pb-3 -mb-[13px] border-b-2 transition-colors ${activeTab === 'portfolio' ? 'border-brand text-brand' : 'border-transparent text-white/50 hover:text-white/80'}`}
        >
          My Portfolio ({portfolio.length})
        </button>
      </div>

      {activeTab === 'discover' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {masters.length === 0 && <div className="col-span-full text-center text-white/50 py-10">No master traders found.</div>}
          {masters.map(master => (
            <div key={master.id} className="rounded-2xl bg-white/5 border border-white/10 p-5 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-brand to-cyan-400 flex items-center justify-center text-black font-bold text-lg">
                    {master.avatar}
                  </div>
                  <div>
                    <div className="font-semibold text-white">{master.name}</div>
                    <div className="text-[10px] text-white/50 uppercase tracking-widest">{master.followers.toLocaleString()} followers</div>
                  </div>
                </div>
                <div className="bg-white/10 text-white/80 text-[10px] font-mono px-2 py-1 rounded">Risk: {master.risk_score}/10</div>
              </div>
              
              <div className="grid grid-cols-2 gap-3 bg-black/20 rounded-xl p-3">
                <div>
                  <div className="text-[10px] uppercase text-white/40 tracking-wider">ROI (All Time)</div>
                  <div className="text-emerald-400 font-semibold">+{master.roi_percentage.toFixed(2)}%</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-white/40 tracking-wider">Win Rate</div>
                  <div className="text-white/90 font-semibold">{master.win_rate.toFixed(1)}%</div>
                </div>
              </div>

              <button 
                onClick={() => handleOpenCopy(master)}
                className="w-full rounded-xl bg-brand/10 text-brand hover:bg-brand/20 transition-colors py-2 font-semibold text-xs tracking-wider uppercase border border-brand/20"
              >
                Copy
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {portfolio.length === 0 && <div className="text-center text-white/50 py-10">You are not copying anyone yet.</div>}
          <div className="grid grid-cols-1 gap-4">
            {portfolio.map(rel => {
              const profit = rel.current_value - rel.allocated_margin;
              const pnlClass = profit >= 0 ? 'text-emerald-400' : 'text-rose-400';
              return (
                <div key={rel.id} className="rounded-2xl bg-white/5 border border-white/10 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-brand to-cyan-400 flex items-center justify-center text-black font-bold text-xl">
                      {rel.avatar}
                    </div>
                    <div>
                      <div className="font-semibold text-white">{rel.name}</div>
                      <div className="text-[11px] text-white/50 mt-0.5">Started {new Date(rel.created_at).toLocaleDateString()}</div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-6 sm:gap-10">
                    <div>
                      <div className="text-[10px] uppercase text-white/40 tracking-wider">Allocated</div>
                      <div className="font-mono text-white/90">{currencyFormatter.format(rel.allocated_margin)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-white/40 tracking-wider">Current Value</div>
                      <div className="font-mono text-white">{currencyFormatter.format(rel.current_value)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-white/40 tracking-wider">P/L</div>
                      <div className={`font-mono ${pnlClass}`}>{profit >= 0 ? '+' : ''}{currencyFormatter.format(profit)}</div>
                    </div>
                  </div>

                  <button 
                    onClick={() => handleStopCopy(rel.id)}
                    className="rounded-xl border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 transition-colors px-4 py-2 text-xs font-semibold uppercase tracking-wider whitespace-nowrap"
                  >
                    Stop
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showCopyModal && selectedMaster && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-2">Copy {selectedMaster.name}</h3>
            <p className="text-sm text-white/60 mb-6">Enter the amount of margin you wish to allocate for copying trades from this master trader.</p>
            
            <div className="mb-6">
              <label className="block text-xs uppercase tracking-wider text-white/40 mb-2">Amount to Allocate (USD)</label>
              <input
                type="number"
                value={copyAmount}
                onChange={e => setCopyAmount(e.target.value)}
                placeholder="100.00"
                min="10"
                className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white placeholder-white/30 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand font-mono"
              />
              {error && <div className="text-rose-400 text-xs mt-2">{error}</div>}
            </div>
            
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowCopyModal(false)}
                className="rounded-xl px-4 py-2 text-sm font-medium text-white/60 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmCopy}
                disabled={copying}
                className="rounded-xl bg-brand px-5 py-2 text-sm font-semibold text-black hover:bg-brand/90 transition-colors disabled:opacity-50"
              >
                {copying ? 'Confirming...' : 'Confirm Copy'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
