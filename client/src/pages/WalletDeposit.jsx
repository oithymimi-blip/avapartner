import { useEffect, useState } from 'react';
import { useAuth } from '../store';
import { api } from '../api';
import { useAccount } from '../accountStore';
import QRCode from 'react-qr-code';
import { Copy, CheckCircle2, AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { socket } from '../socket';

export default function WalletDeposit() {
  const { token, user } = useAuth();
  const account = useAccount(state => state.summary);
  const [depositAddress, setDepositAddress] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const balance = account?.balance?.total ?? 0;

  const fetchHistory = async () => {
    if (!token) return;
    try {
      const res = await api(token).get('/api/payments/requests');
      setHistory(res.data.filter(r => r.type === 'deposit'));
    } catch (err) {
      console.error('Failed to fetch history', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const fetchAddress = async (forceRefresh = false) => {
    if (!token || !user?.id) return;
    try {
      if (forceRefresh) setRefreshing(true);
      else setLoading(true);
      setError('');
      const ts = Date.now();
      const url = `/api/payments/deposit-address?_t=${ts}${forceRefresh ? '&refresh=1' : ''}`;
      const res = await api(token).get(url);
      if (res.data?.address) {
        setDepositAddress(res.data.address);
      }
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to fetch deposit address. Please try again later.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    setDepositAddress('');
    fetchAddress();
  }, [user?.id, token]);

  useEffect(() => {
    fetchHistory();
  }, [token]);

  useEffect(() => {
    if (!user?.id) return;
    const handleUpdate = (payload) => {
      if (payload?.user_id === user.id && payload?.type === 'deposit_credited') {
        fetchHistory();
      }
    };
    socket.on('user_data_update', handleUpdate);
    return () => socket.off('user_data_update', handleUpdate);
  }, [user?.id, token]);

  const handleCopy = async () => {
    if (!depositAddress) return;
    try {
      await navigator.clipboard.writeText(depositAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = depositAddress;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto w-full overflow-x-hidden pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-cyan-400/80 mb-1">Wallet</div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white">Crypto Deposit</h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">Send USDT (BEP-20) to your unique address below to fund your account.</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 sm:px-5 py-3 text-sm font-mono text-white flex flex-col items-start sm:items-end w-full sm:w-auto">
          <span className="text-xs text-slate-400">Available Balance</span>
          <span className="text-lg sm:text-xl font-bold text-cyan-400">${balance.toFixed(2)}</span>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl bg-rose-500/10 border border-rose-500/20 p-4 flex items-start gap-3 text-rose-300">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      <div className="card border-cyan-500/20 bg-slate-900/50 backdrop-blur-md p-5 sm:p-8 relative overflow-hidden w-full">
        {/* Decorative background gradients */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2 pointer-events-none"></div>

        <div className="relative z-10 flex flex-col items-center justify-center space-y-8">
          <div className="text-center space-y-2">
            <div className="flex items-center justify-center gap-2">
              <h2 className="text-xl font-semibold text-white">USDT Deposit Address</h2>
              <button
                type="button"
                onClick={() => fetchAddress(true)}
                disabled={loading || refreshing}
                title="Generate / Refresh Unique Address"
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-cyan-400 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-cyan-400' : ''}`} />
              </button>
            </div>
            <div className="inline-block rounded-full bg-cyan-500/20 px-3 py-1 text-xs font-semibold text-cyan-300 border border-cyan-500/30">
              Binance Smart Chain (BEP-20)
            </div>
          </div>

          {loading ? (
            <div className="h-48 w-48 bg-white/5 rounded-2xl border border-white/10 flex items-center justify-center flex-col gap-3">
              <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
              <span className="text-xs text-slate-400">Generating Address...</span>
            </div>
          ) : depositAddress ? (
            <>
              {/* QR Code Container */}
              <div className="bg-white p-4 rounded-2xl shadow-xl shadow-cyan-900/20 ring-4 ring-white/10 transition-transform hover:scale-[1.02] duration-300">
                <QRCode 
                  value={depositAddress} 
                  size={200}
                  level="H"
                  className="rounded-lg"
                />
              </div>

              {/* Address Display & Copy */}
              <div className="w-full space-y-3 min-w-0">
                <label className="text-xs font-medium text-slate-400 pl-1 block text-center sm:text-left">Your Unique Address</label>
                <div 
                  onClick={handleCopy}
                  className="group relative flex flex-col sm:flex-row items-center justify-between w-full bg-black/40 border border-white/10 rounded-xl p-3 sm:p-4 cursor-pointer hover:border-cyan-500/50 hover:bg-black/60 transition-all duration-200 gap-3 sm:gap-4 min-w-0"
                >
                  <span className="font-mono text-[11px] sm:text-sm text-slate-200 break-all text-center sm:text-left w-full leading-relaxed min-w-0">
                    {depositAddress}
                  </span>
                  
                  <div className={`shrink-0 p-2 rounded-lg transition-colors duration-200 flex items-center gap-2 ${copied ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/5 text-slate-400 group-hover:bg-cyan-500/20 group-hover:text-cyan-400'}`}>
                    {copied ? (
                      <><CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5" /><span className="text-xs sm:hidden">Copied</span></>
                    ) : (
                      <><Copy className="w-4 h-4 sm:w-5 sm:h-5" /><span className="text-xs sm:hidden">Copy</span></>
                    )}
                  </div>
                </div>
              </div>

              <div className="w-full rounded-xl bg-cyan-950/30 border border-cyan-900/50 p-4 text-xs sm:text-sm text-cyan-200/70 text-center min-w-0 break-words">
                <p>Send only <strong className="text-cyan-400">USDT</strong> via <strong className="text-cyan-400">BNB Smart Chain (BEP-20)</strong> to this address.</p>
                <p className="mt-1 text-xs opacity-75">Deposits will automatically credit to your balance after network confirmation.</p>
              </div>
            </>
          ) : !error ? (
            <div className="text-slate-400 text-sm">No deposit address available.</div>
          ) : null}
        </div>
      </div>

      {/* Deposit History */}
      <div className="mt-8">
        <h2 className="text-xl font-bold text-white mb-4">Deposit History</h2>
        <div className="card p-0 overflow-hidden bg-slate-900/50 backdrop-blur-md border border-white/10">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-400 uppercase bg-white/5 border-b border-white/10">
                <tr>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {loadingHistory ? (
                  <tr>
                    <td colSpan="4" className="px-4 py-8 text-center text-slate-400">
                      <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                      Loading history...
                    </td>
                  </tr>
                ) : history.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="px-4 py-8 text-center text-slate-400 text-sm">
                      No deposits found.
                    </td>
                  </tr>
                ) : (
                  history.map((req) => (
                    <tr key={req.id} className="hover:bg-white/5 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap text-slate-300">
                        {new Date(req.created_at).toLocaleString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          timeZoneName: 'short'
                        })}
                      </td>
                      <td className="px-4 py-3 font-mono text-cyan-400 font-medium whitespace-nowrap">
                        ${Number(req.amount).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-medium uppercase tracking-wider ${
                          req.status === 'approved' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                          req.status === 'pending' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                          'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        }`}>
                          {req.status === 'approved' ? 'Credited' : req.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-xs font-mono text-slate-500 whitespace-nowrap">
                        {req.tx_ref ? (
                          <div className="flex flex-col items-end">
                            <span className="text-[10px] uppercase text-slate-600 mb-0.5">TX Hash</span>
                            <span className="truncate max-w-[120px] sm:max-w-[150px] block" title={req.tx_ref}>
                              {req.tx_ref.slice(0, 8)}...{req.tx_ref.slice(-6)}
                            </span>
                          </div>
                        ) : '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
