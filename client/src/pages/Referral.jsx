import { Link } from 'react-router-dom'
import ReferralWidget from '../components/ReferralWidget'

const tiers = [
  {
    level: '1',
    name: 'Bronze Partner',
    badge: '🥉',
    color: 'from-amber-700 via-amber-600 to-yellow-500',
    border: 'border-amber-500/30',
    glow: 'shadow-[0_0_30px_rgba(217,169,78,0.15)]',
    text: 'text-amber-400',
    ai: '5%',
    aiSub: '—',
    manual: '$2',
    manualSub: '—',
    binary: '1%',
    binarySub: '—',
    bonus: '—',
    requirement: 'Default — all new affiliates',
  },
  {
    level: '2',
    name: 'Silver Leader',
    badge: '🥈',
    color: 'from-slate-400 via-slate-300 to-white',
    border: 'border-slate-400/30',
    glow: 'shadow-[0_0_30px_rgba(203,213,225,0.15)]',
    text: 'text-slate-300',
    ai: '8%',
    aiSub: '+2% Sub-IB',
    manual: '$4',
    manualSub: '+$1 Sub-IB',
    binary: '2%',
    binarySub: '+0.5% Sub-IB',
    bonus: '$50 / month',
    requirement: '$5,000+ monthly team volume',
  },
  {
    level: '3',
    name: 'Gold Master',
    badge: '🥇',
    color: 'from-yellow-500 via-amber-400 to-orange-400',
    border: 'border-yellow-400/40',
    glow: 'shadow-[0_0_35px_rgba(250,204,21,0.2)]',
    text: 'text-yellow-400',
    ai: '12%',
    aiSub: '+5% Sub-IB',
    manual: '$8',
    manualSub: '+$2 Sub-IB',
    binary: '3.5%',
    binarySub: '—',
    bonus: '$250 / month',
    requirement: '$25,000+ monthly team volume',
  },
]

const steps = [
  {
    num: '01',
    title: 'Sign Up & Get Your Link',
    desc: 'Register on the platform and receive your unique affiliate referral link instantly.',
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
        <line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" />
      </svg>
    ),
  },
  {
    num: '02',
    title: 'Share With Your Network',
    desc: 'Promote your link across social media, communities, websites, or directly to friends.',
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
      </svg>
    ),
  },
  {
    num: '03',
    title: 'Referrals Start Trading',
    desc: 'When your referrals sign up, deposit, and begin trading across AI Trade, Forex, or Binary — you earn.',
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" />
      </svg>
    ),
  },
  {
    num: '04',
    title: 'Earn Commissions Automatically',
    desc: 'Every trade your referrals make generates real-time commission — credited directly to your wallet balance.',
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
  },
]

export default function Referral() {
  return (
    <div className="max-w-5xl mx-auto py-8 space-y-10 px-1">
      {/* ─── Hero ─── */}
      <section className="text-center space-y-4">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand/10 border border-brand/20 text-brand text-[11px] font-bold uppercase tracking-wider">
          ✦ Affiliate Program
        </div>
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white leading-tight">
          Earn Real Money From<br />
          <span className="bg-gradient-to-r from-brand via-emerald-400 to-sky-400 bg-clip-text text-transparent">
            Every Trade Your Referrals Make
          </span>
        </h1>
        <p className="text-white/55 text-base sm:text-lg max-w-2xl mx-auto">
          Our multi-stream IB commission engine pays you automatically on AI Trade profits, Forex lot volumes, and Binary Options turnover — with up to 2 levels of depth.
        </p>
      </section>

      {/* ─── Referral Widget ─── */}
      <section className="max-w-md mx-auto">
        <ReferralWidget />
      </section>

      {/* ─── How It Works ─── */}
      <section>
        <div className="text-center mb-8">
          <div className="text-[10px] uppercase tracking-[0.25em] text-white/40 mb-2">How It Works</div>
          <h2 className="text-2xl font-bold text-white">4 Simple Steps to Start Earning</h2>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {steps.map(s => (
            <div key={s.num} className="rounded-2xl border border-white/8 bg-[#0e1218] p-5 hover:-translate-y-1 transition-transform duration-300">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-brand/10 text-brand flex items-center justify-center flex-shrink-0">
                  {s.icon}
                </div>
                <span className="text-[10px] font-black text-white/20 tracking-wider">{s.num}</span>
              </div>
              <h3 className="text-sm font-bold text-white mb-1.5">{s.title}</h3>
              <p className="text-[11px] text-white/45 leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Commission Distribution Table ─── */}
      <section>
        <div className="text-center mb-8">
          <div className="text-[10px] uppercase tracking-[0.25em] text-white/40 mb-2">Commission Structure</div>
          <h2 className="text-2xl font-bold text-white">Multi-Stream IB Commission Rates</h2>
          <p className="text-white/45 text-sm mt-2 max-w-xl mx-auto">
            Earn across all 3 trading products simultaneously. Higher tiers unlock Sub-IB (Level 2) commissions and fixed monthly bonuses.
          </p>
        </div>

        {/* Desktop table */}
        <div className="hidden md:block rounded-2xl border border-white/10 bg-[#0b0f13] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left p-4 text-[10px] uppercase tracking-[0.15em] text-white/40 font-semibold">IB Level</th>
                <th className="text-center p-4 text-[10px] uppercase tracking-[0.15em] text-white/40 font-semibold">
                  <div className="flex items-center justify-center gap-1.5">
                    <svg className="w-3.5 h-3.5 text-violet-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M12 2a4 4 0 0 1 4 4v1a3 3 0 0 1 3 3v1a2 2 0 0 1-2 2h-1v3l-4 4-4-4v-3H7a2 2 0 0 1-2-2v-1a3 3 0 0 1 3-3V6a4 4 0 0 1 4-4z" />
                    </svg>
                    AI Trade Commission
                  </div>
                </th>
                <th className="text-center p-4 text-[10px] uppercase tracking-[0.15em] text-white/40 font-semibold">
                  <div className="flex items-center justify-center gap-1.5">
                    <svg className="w-3.5 h-3.5 text-sky-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" />
                    </svg>
                    Manual Forex / Gold (Per Lot)
                  </div>
                </th>
                <th className="text-center p-4 text-[10px] uppercase tracking-[0.15em] text-white/40 font-semibold">
                  <div className="flex items-center justify-center gap-1.5">
                    <svg className="w-3.5 h-3.5 text-rose-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <circle cx="12" cy="12" r="10" /><path d="M8 12h8M12 8v8" />
                    </svg>
                    Binary Options (On Turnover)
                  </div>
                </th>
                <th className="text-center p-4 text-[10px] uppercase tracking-[0.15em] text-white/40 font-semibold">Monthly Fixed Bonus</th>
              </tr>
            </thead>
            <tbody>
              {tiers.map((t, i) => (
                <tr key={t.level} className={`border-b border-white/5 ${i === 2 ? 'bg-yellow-500/[0.03]' : ''} hover:bg-white/[0.02] transition-colors`}>
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${t.color} flex items-center justify-center text-lg shadow-md flex-shrink-0`}>
                        {t.badge}
                      </div>
                      <div>
                        <div className={`font-bold text-sm ${t.text}`}>{t.name}</div>
                        <div className="text-[10px] text-white/30">{t.requirement}</div>
                      </div>
                    </div>
                  </td>
                  <td className="p-4 text-center">
                    <div className="text-white font-bold text-base">{t.ai}</div>
                    {t.aiSub !== '—' && <div className="text-violet-400/70 text-[10px] font-semibold mt-0.5">{t.aiSub}</div>}
                    {t.aiSub === '—' && <div className="text-white/20 text-[10px]">Direct only</div>}
                  </td>
                  <td className="p-4 text-center">
                    <div className="text-white font-bold text-base">{t.manual}</div>
                    {t.manualSub !== '—' && <div className="text-sky-400/70 text-[10px] font-semibold mt-0.5">{t.manualSub}</div>}
                    {t.manualSub === '—' && <div className="text-white/20 text-[10px]">Direct only</div>}
                  </td>
                  <td className="p-4 text-center">
                    <div className="text-white font-bold text-base">{t.binary}</div>
                    {t.binarySub !== '—' && <div className="text-rose-400/70 text-[10px] font-semibold mt-0.5">{t.binarySub}</div>}
                    {t.binarySub === '—' && <div className="text-white/20 text-[10px]">Direct only</div>}
                  </td>
                  <td className="p-4 text-center">
                    {t.bonus !== '—' ? (
                      <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full ${t.level === '3' ? 'bg-yellow-500/15 text-yellow-400' : 'bg-brand/10 text-brand'} text-xs font-bold`}>
                        {t.bonus}
                      </span>
                    ) : (
                      <span className="text-white/25 text-sm">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden space-y-4">
          {tiers.map(t => (
            <div key={t.level} className={`rounded-2xl border ${t.border} bg-[#0e1218] p-5 ${t.glow}`}>
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${t.color} flex items-center justify-center text-2xl shadow-lg`}>
                  {t.badge}
                </div>
                <div>
                  <div className={`font-bold text-lg ${t.text}`}>{t.name}</div>
                  <div className="text-[10px] text-white/35">{t.requirement}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-black/20 border border-white/5 p-3">
                  <div className="text-[9px] uppercase tracking-[0.15em] text-violet-400/60 mb-1">AI Trade</div>
                  <div className="text-white font-bold">{t.ai}</div>
                  {t.aiSub !== '—' && <div className="text-violet-400/60 text-[10px]">{t.aiSub}</div>}
                </div>
                <div className="rounded-xl bg-black/20 border border-white/5 p-3">
                  <div className="text-[9px] uppercase tracking-[0.15em] text-sky-400/60 mb-1">Forex / Gold</div>
                  <div className="text-white font-bold">{t.manual} /lot</div>
                  {t.manualSub !== '—' && <div className="text-sky-400/60 text-[10px]">{t.manualSub}</div>}
                </div>
                <div className="rounded-xl bg-black/20 border border-white/5 p-3">
                  <div className="text-[9px] uppercase tracking-[0.15em] text-rose-400/60 mb-1">Binary Options</div>
                  <div className="text-white font-bold">{t.binary}</div>
                  {t.binarySub !== '—' && <div className="text-rose-400/60 text-[10px]">{t.binarySub}</div>}
                </div>
                <div className="rounded-xl bg-black/20 border border-white/5 p-3">
                  <div className="text-[9px] uppercase tracking-[0.15em] text-white/35 mb-1">Monthly Bonus</div>
                  <div className={`font-bold ${t.bonus !== '—' ? 'text-brand' : 'text-white/25'}`}>{t.bonus}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Key Features ─── */}
      <section className="grid sm:grid-cols-3 gap-4">
        {[
          {
            title: 'Real-Time Payouts',
            desc: 'Commissions are credited to your wallet balance instantly — no waiting for monthly payouts.',
            icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>,
          },
          {
            title: '2-Level Depth',
            desc: 'Silver and Gold tiers earn from Sub-IB referrals — build a team and earn from their activity too.',
            icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
          },
          {
            title: 'Auto Level-Up',
            desc: 'Your IB level upgrades automatically when you hit volume targets — no manual application needed.',
            icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>,
          },
        ].map((f, i) => (
          <div key={i} className="rounded-2xl border border-white/8 bg-[#0e1218] p-5">
            <div className="w-10 h-10 rounded-xl bg-brand/10 text-brand flex items-center justify-center mb-3">
              {f.icon}
            </div>
            <h3 className="text-sm font-bold text-white mb-1">{f.title}</h3>
            <p className="text-[11px] text-white/45 leading-relaxed">{f.desc}</p>
          </div>
        ))}
      </section>

      {/* ─── CTA ─── */}
      <section className="rounded-3xl border border-brand/20 bg-gradient-to-br from-brand/5 to-transparent p-8 text-center space-y-4">
        <h3 className="text-xl font-bold text-white">Ready to Track Your Commissions?</h3>
        <p className="text-white/50 text-sm max-w-md mx-auto">
          View your real-time IB level, commission history, team performance, and monthly bonus status.
        </p>
        <Link
          to="/ib-dashboard"
          className="inline-flex items-center gap-2 bg-brand text-black font-bold px-6 py-3 rounded-full text-sm shadow-[0_8px_24px_rgba(0,223,154,0.3)] hover:bg-emerald-400 transition-all hover:scale-105 active:scale-95"
        >
          Open IB Dashboard
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
        </Link>
      </section>
    </div>
  )
}
