import { useState, useMemo } from 'react'

const AI_SLOTS = [
  { key: 'starter', label: 'Starter ($10–$100 · 1.5%–2.0%)', defaultAmt: 100, avgPct: 1.75 },
  { key: 'booster', label: 'Booster ($101–$1,000 · 2.0%–2.5%)', defaultAmt: 500, avgPct: 2.25 },
  { key: 'premium', label: 'Premium ($1,001–$5,000 · 2.5%–3.0%)', defaultAmt: 2000, avgPct: 2.75 },
  { key: 'titan',   label: 'Titan Mega ($5,001+ · 3.0%–3.5%)', defaultAmt: 6000, avgPct: 3.25 },
  { key: 'custom',  label: 'Custom Daily %', defaultAmt: 1000, avgPct: 2.0 },
]

const PRESETS = [
  { label: 'Starter (3 L1 + 5 L2)', l1: 3, l2: 5, aiInvest: 250, aiSlot: 'booster', fxLots: 0.5, fxMargin: 500, binStake: 50 },
  { label: 'Active (10 L1 + 25 L2)', l1: 10, l2: 25, aiInvest: 500, aiSlot: 'booster', fxLots: 1.0, fxMargin: 1000, binStake: 100 },
  { label: 'VIP Network (25 L1 + 80 L2)', l1: 25, l2: 80, aiInvest: 1500, aiSlot: 'premium', fxLots: 2.5, fxMargin: 2500, binStake: 250 },
]

function fmt2(v) {
  return (Number(v) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function IBProfitCalculator({
  tiers = [],
  activeLevel = 'BRONZE',
  effectiveNumeric = null,
  hasCustomRates = false,
}) {
  const [rateSource, setRateSource] = useState(effectiveNumeric ? 'ACTIVE' : 'BRONZE')
  const [l1Count, setL1Count] = useState('5')
  const [l2Count, setL2Count] = useState('10')
  const [aiSlot, setAiSlot] = useState('booster')
  const [aiInvest, setAiInvest] = useState('500')
  const [aiDailyPct, setAiDailyPct] = useState('2.25')
  const [fxLots, setFxLots] = useState('1.00')
  const [fxMargin, setFxMargin] = useState('500')
  const [binStake, setBinStake] = useState('100')

  const applyPreset = (p) => {
    setL1Count(String(p.l1))
    setL2Count(String(p.l2))
    setAiSlot(p.aiSlot)
    setAiInvest(String(p.aiInvest))
    const found = AI_SLOTS.find(s => s.key === p.aiSlot)
    if (found) setAiDailyPct(String(found.avgPct))
    setFxLots(String(p.fxLots))
    setFxMargin(String(p.fxMargin))
    setBinStake(String(p.binStake))
  }

  const handleSlotChange = (key) => {
    setAiSlot(key)
    const found = AI_SLOTS.find(s => s.key === key)
    if (found && key !== 'custom') {
      setAiDailyPct(String(found.avgPct))
    }
  }

  const tierMap = useMemo(() => {
    const map = {
      BRONZE: { level: 'BRONZE', display_name: 'Bronze Partner', ai_trade_direct_pct: 5, ai_trade_sub_pct: 0, manual_mode: 'per_lot', manual_direct_rate: 2, manual_sub_rate: 0, binary_direct_pct: 1, binary_sub_pct: 0, min_monthly_volume: 0, monthly_bonus: 0 },
      SILVER: { level: 'SILVER', display_name: 'Silver Leader', ai_trade_direct_pct: 8, ai_trade_sub_pct: 2, manual_mode: 'per_lot', manual_direct_rate: 4, manual_sub_rate: 1, binary_direct_pct: 2, binary_sub_pct: 0.5, min_monthly_volume: 5000, monthly_bonus: 50 },
      GOLD:   { level: 'GOLD',   display_name: 'Gold Master',   ai_trade_direct_pct: 12, ai_trade_sub_pct: 5, manual_mode: 'per_lot', manual_direct_rate: 8, manual_sub_rate: 2, binary_direct_pct: 3.5, binary_sub_pct: 0, min_monthly_volume: 25000, monthly_bonus: 250 },
    }
    for (const t of tiers) {
      if (t?.level && map[t.level]) map[t.level] = { ...map[t.level], ...t }
    }
    return map
  }, [tiers])

  const selectedRates = useMemo(() => {
    if (rateSource === 'ACTIVE' && effectiveNumeric) {
      return {
        ...tierMap[activeLevel],
        ...effectiveNumeric,
        label: `${tierMap[activeLevel]?.display_name || activeLevel}${hasCustomRates ? ' (Custom VIP)' : ' (Your Current Level)'}`,
      }
    }
    const t = tierMap[rateSource] || tierMap[activeLevel] || tierMap.BRONZE
    return { ...t, label: t.display_name || t.level }
  }, [rateSource, effectiveNumeric, tierMap, activeLevel, hasCustomRates])

  const calc = useMemo(() => {
    const n1 = Math.max(0, Number(l1Count) || 0)
    const n2 = Math.max(0, Number(l2Count) || 0)
    const inv = Math.max(0, Number(aiInvest) || 0)
    const pct = Math.max(0, Number(aiDailyPct) || 0)
    const lots = Math.max(0, Number(fxLots) || 0)
    const margin = Math.max(0, Number(fxMargin) || 0)
    const bin = Math.max(0, Number(binStake) || 0)

    const aiProfitPerUser = inv * (pct / 100)

    const runForRate = (r) => {
      const mode = r.manual_mode === 'percent' ? 'percent' : 'per_lot'
      const fxUnit = mode === 'percent' ? margin : lots
      const fxUnitScale = mode === 'percent' ? 1 / 100 : 1

      const l1Ai = n1 * aiProfitPerUser * ((Number(r.ai_trade_direct_pct) || 0) / 100)
      const l1Fx = n1 * fxUnit * (Number(r.manual_direct_rate) || 0) * fxUnitScale
      const l1Bin = n1 * bin * ((Number(r.binary_direct_pct) || 0) / 100)
      const l1Daily = l1Ai + l1Fx + l1Bin

      const l2Ai = n2 * aiProfitPerUser * ((Number(r.ai_trade_sub_pct) || 0) / 100)
      const l2Fx = n2 * fxUnit * (Number(r.manual_sub_rate) || 0) * fxUnitScale
      const l2Bin = n2 * bin * ((Number(r.binary_sub_pct) || 0) / 100)
      const l2Daily = l2Ai + l2Fx + l2Bin

      const totalDaily = l1Daily + l2Daily
      const monthlyComm = totalDaily * 30
      const simMonthlyVol = 30 * (
        (n1 * (aiProfitPerUser + (mode === 'percent' ? margin : lots) + bin)) +
        (n2 * ((Number(r.ai_trade_sub_pct) > 0 ? aiProfitPerUser : 0) + (Number(r.manual_sub_rate) > 0 ? (mode === 'percent' ? margin : lots) : 0) + (Number(r.binary_sub_pct) > 0 ? bin : 0)))
      )
      const bonusTarget = Number(r.min_monthly_volume || 0)
      const bonusAmt = Number(r.monthly_bonus || 0)
      const bonusEarned = bonusAmt > 0 && (simMonthlyVol >= bonusTarget || bonusTarget === 0) ? bonusAmt : 0

      return {
        mode,
        l1Ai, l1Fx, l1Bin, l1Daily,
        l2Ai, l2Fx, l2Bin, l2Daily,
        totalDaily,
        monthlyComm,
        simMonthlyVol,
        bonusAmt,
        bonusTarget,
        bonusEarned,
        monthlyGrandTotal: monthlyComm + bonusEarned,
      }
    }

    const active = runForRate(selectedRates)
    const comparison = ['BRONZE', 'SILVER', 'GOLD'].map(lvl => ({
      level: lvl,
      name: tierMap[lvl]?.display_name || lvl,
      ...runForRate(tierMap[lvl]),
    }))

    return { n1, n2, inv, pct, lots, margin, bin, aiProfitPerUser, active, comparison }
  }, [l1Count, l2Count, aiInvest, aiDailyPct, fxLots, fxMargin, binStake, selectedRates, tierMap])

  const r = selectedRates

  return (
    <div className="rounded-3xl border border-brand/25 bg-gradient-to-br from-[#0f1720] to-[#0b0f13] p-5 sm:p-6 space-y-6">
      {/* Header & Rate Preview Selector */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-brand font-bold">Detailed IB Profit Calculator</div>
          <h2 className="text-xl sm:text-2xl font-bold text-white mt-0.5">
            Estimate Direct (L1) + Sub-IB (L2) Daily &amp; Monthly Commissions
          </h2>
          <p className="text-xs text-white/55 mt-1">
            Simulate how much commission profit your network generates across AI Trade, Forex Lot Size, and Binary Options — plus monthly salary bonuses.
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {effectiveNumeric && (
            <button
              type="button"
              onClick={() => setRateSource('ACTIVE')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
                rateSource === 'ACTIVE'
                  ? 'bg-brand text-black border-brand'
                  : 'bg-white/5 text-white/70 border-white/10 hover:bg-white/10'
              }`}
            >
              Your Rates
            </button>
          )}
          {['BRONZE', 'SILVER', 'GOLD'].map(lvl => (
            <button
              key={lvl}
              type="button"
              onClick={() => setRateSource(lvl)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
                rateSource === lvl
                  ? 'bg-brand text-black border-brand'
                  : 'bg-white/5 text-white/70 border-white/10 hover:bg-white/10'
              }`}
            >
              {lvl.charAt(0) + lvl.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Quick Team Presets */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] uppercase tracking-wider text-white/40 font-semibold">Quick Presets:</span>
        {PRESETS.map(p => (
          <button
            key={p.label}
            type="button"
            onClick={() => applyPreset(p)}
            className="px-3 py-1 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] text-white/80 font-medium transition"
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Input Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Team Size */}
        <div className="rounded-2xl border border-white/10 bg-black/30 p-4 space-y-3">
          <div className="text-xs font-bold text-brand uppercase tracking-wider">1 · Referral Team Size</div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-[11px] text-white/60">Direct Users (L1)</span>
              <input
                type="number"
                min="0"
                value={l1Count}
                onChange={e => setL1Count(e.target.value)}
                className="w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-sm font-mono text-white focus:border-brand focus:outline-none"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] text-white/60">Sub-IB Users (L2)</span>
              <input
                type="number"
                min="0"
                value={l2Count}
                onChange={e => setL2Count(e.target.value)}
                className="w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-sm font-mono text-white focus:border-brand focus:outline-none"
              />
            </label>
          </div>
          <div className="text-[11px] text-white/45 leading-relaxed">
            L1 = people you invited directly. L2 = people invited by your L1 referrals.
          </div>
        </div>

        {/* AI Trade Per User */}
        <div className="rounded-2xl border border-violet-500/25 bg-black/30 p-4 space-y-3">
          <div className="text-xs font-bold text-violet-300 uppercase tracking-wider">2 · AI Trade (Per User / Day)</div>
          <select
            value={aiSlot}
            onChange={e => handleSlotChange(e.target.value)}
            className="w-full rounded-xl border border-white/15 bg-black/50 px-3 py-2 text-xs text-white focus:border-brand focus:outline-none"
          >
            {AI_SLOTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-[11px] text-white/60">Investment ($)</span>
              <input
                type="number"
                min="0"
                value={aiInvest}
                onChange={e => setAiInvest(e.target.value)}
                className="w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-sm font-mono text-white focus:border-brand focus:outline-none"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] text-white/60">Daily AI %</span>
              <input
                type="number"
                min="0"
                step="0.05"
                value={aiDailyPct}
                onChange={e => { setAiSlot('custom'); setAiDailyPct(e.target.value) }}
                className="w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-sm font-mono text-white focus:border-brand focus:outline-none"
              />
            </label>
          </div>
          <div className="text-[11px] text-violet-200/80">
            Referral daily profit: <span className="font-mono font-bold">{fmt2(calc.aiProfitPerUser)}/day</span> · IB: {r.ai_trade_direct_pct}% L1 / {r.ai_trade_sub_pct}% L2
          </div>
        </div>

        {/* Forex & Binary Per User */}
        <div className="rounded-2xl border border-sky-500/25 bg-black/30 p-4 space-y-3">
          <div className="text-xs font-bold text-sky-300 uppercase tracking-wider">3 · Forex Lots &amp; Binary (Per User / Day)</div>
          {calc.active.mode === 'percent' ? (
            <label className="block space-y-1">
              <span className="text-[11px] text-white/60">Forex Margin Volume ($/day)</span>
              <input
                type="number"
                min="0"
                value={fxMargin}
                onChange={e => setFxMargin(e.target.value)}
                className="w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-sm font-mono text-white focus:border-brand focus:outline-none"
              />
            </label>
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-white/60">Forex Lot Size / Day</span>
                <span className="text-[10px] text-sky-300 font-mono">${r.manual_direct_rate}/lot L1 · ${r.manual_sub_rate}/lot L2</span>
              </div>
              <input
                type="number"
                min="0"
                step="0.01"
                value={fxLots}
                onChange={e => setFxLots(e.target.value)}
                className="w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-sm font-mono text-white focus:border-brand focus:outline-none"
              />
              <div className="flex flex-wrap gap-1">
                {[['0.01', '0.01 Micro'], ['0.10', '0.10 Mini'], ['0.50', '0.50'], ['1.00', '1.00 Std'], ['5.00', '5.00']].map(([val, lbl]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setFxLots(val)}
                    className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                      Number(fxLots) === Number(val) ? 'bg-sky-500/25 border-sky-400 text-sky-200' : 'bg-white/5 border-white/10 text-white/60'
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>
          )}

          <label className="block space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-white/60">Binary Options Stake ($/day)</span>
              <span className="text-[10px] text-rose-300 font-mono">{r.binary_direct_pct}% L1 · {r.binary_sub_pct}% L2</span>
            </div>
            <input
              type="number"
              min="0"
              value={binStake}
              onChange={e => setBinStake(e.target.value)}
              className="w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-sm font-mono text-white focus:border-brand focus:outline-none"
            />
          </label>
        </div>
      </div>

      {/* Grand Summary Banners */}
      <div className="grid sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-brand/40 bg-brand/10 p-4">
          <div className="text-[10px] uppercase tracking-wider text-brand font-bold">Total Daily IB Commission</div>
          <div className="text-2xl sm:text-3xl font-black text-brand font-mono mt-1">+{fmt2(calc.active.totalDaily)}</div>
          <div className="text-[11px] text-white/65 mt-1">
            Using <strong className="text-white">{r.label}</strong>
          </div>
        </div>

        <div className="rounded-2xl border border-emerald-500/35 bg-emerald-500/10 p-4">
          <div className="text-[10px] uppercase tracking-wider text-emerald-300 font-bold">Projected 30-Day IB Profit</div>
          <div className="text-2xl sm:text-3xl font-black text-white font-mono mt-1">+{fmt2(calc.active.monthlyGrandTotal)}</div>
          <div className="text-[11px] text-white/65 mt-1">
            Commissions: {fmt2(calc.active.monthlyComm)} + Bonus: {fmt2(calc.active.bonusEarned)}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/35 p-4">
          <div className="text-[10px] uppercase tracking-wider text-white/50 font-bold">Simulated Monthly Team Volume</div>
          <div className="text-2xl font-black text-amber-300 font-mono mt-1">{fmt2(calc.active.simMonthlyVol)}</div>
          <div className="text-[11px] text-white/60 mt-1">
            {calc.active.bonusAmt > 0
              ? (calc.active.bonusEarned > 0
                ? `Qualifies for +${fmt2(calc.active.bonusAmt)} monthly bonus ✓`
                : `Need ${fmt2(calc.active.bonusTarget)} for +${fmt2(calc.active.bonusAmt)} bonus`)
              : 'Silver ($5k+) & Gold ($25k+) unlock monthly salary bonuses'}
          </div>
        </div>
      </div>

      {/* Detailed Direct L1 vs Sub-IB L2 Breakdown */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-emerald-500/25 bg-black/35 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-emerald-300 font-bold">Direct Referrals (Level 1 · {calc.n1} users)</div>
              <div className="text-xl font-black text-brand font-mono">+{fmt2(calc.active.l1Daily)} / day <span className="text-xs font-normal text-white/50">({fmt2(calc.active.l1Daily * 30)} / 30d)</span></div>
            </div>
          </div>
          <div className="space-y-1.5 text-xs border-t border-white/10 pt-2.5">
            <div className="flex justify-between text-white/75">
              <span>AI Trade ({calc.n1} × {fmt2(calc.aiProfitPerUser)} × {r.ai_trade_direct_pct}%)</span>
              <span className="font-mono text-white font-semibold">{fmt2(calc.active.l1Ai)}/d</span>
            </div>
            <div className="flex justify-between text-white/75">
              <span>
                Forex ({calc.n1} × {calc.active.mode === 'percent' ? `${fmt2(calc.margin)} × ${r.manual_direct_rate}%` : `${calc.lots} lots × $${r.manual_direct_rate}`})
              </span>
              <span className="font-mono text-white font-semibold">{fmt2(calc.active.l1Fx)}/d</span>
            </div>
            <div className="flex justify-between text-white/75">
              <span>Binary ({calc.n1} × {fmt2(calc.bin)} × {r.binary_direct_pct}%)</span>
              <span className="font-mono text-white font-semibold">{fmt2(calc.active.l1Bin)}/d</span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-violet-500/25 bg-black/35 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-violet-300 font-bold">Sub-IB Network (Level 2 · {calc.n2} users)</div>
              <div className="text-xl font-black text-violet-300 font-mono">+{fmt2(calc.active.l2Daily)} / day <span className="text-xs font-normal text-white/50">({fmt2(calc.active.l2Daily * 30)} / 30d)</span></div>
            </div>
          </div>
          <div className="space-y-1.5 text-xs border-t border-white/10 pt-2.5">
            <div className="flex justify-between text-white/75">
              <span>AI Trade ({calc.n2} × {fmt2(calc.aiProfitPerUser)} × {r.ai_trade_sub_pct}%)</span>
              <span className="font-mono text-white font-semibold">{fmt2(calc.active.l2Ai)}/d</span>
            </div>
            <div className="flex justify-between text-white/75">
              <span>
                Forex ({calc.n2} × {calc.active.mode === 'percent' ? `${fmt2(calc.margin)} × ${r.manual_sub_rate}%` : `${calc.lots} lots × $${r.manual_sub_rate}`})
              </span>
              <span className="font-mono text-white font-semibold">{fmt2(calc.active.l2Fx)}/d</span>
            </div>
            <div className="flex justify-between text-white/75">
              <span>Binary ({calc.n2} × {fmt2(calc.bin)} × {r.binary_sub_pct}%)</span>
              <span className="font-mono text-white font-semibold">{fmt2(calc.active.l2Bin)}/d</span>
            </div>
            {calc.active.l2Daily === 0 && (
              <div className="text-[11px] text-amber-300/80 pt-1">
                Tip: Sub-IB (Level 2) commissions unlock at Silver Leader &amp; Gold Master (or via Custom VIP Rates). Switch preview above to compare!
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 30-Day Side-by-Side Comparison Across All Tiers */}
      <div className="rounded-2xl border border-white/10 bg-black/30 p-4 space-y-3">
        <div className="text-[11px] uppercase tracking-wider text-white/55 font-bold">
          30-Day Earnings Comparison for This Exact Team ({calc.n1} L1 + {calc.n2} L2)
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          {calc.comparison.map(c => (
            <div key={c.level} className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
              <div className="text-xs font-bold text-white">{c.name}</div>
              <div className="text-lg font-black text-brand font-mono mt-1">{fmt2(c.monthlyGrandTotal)} <span className="text-[10px] font-normal text-white/45">/ 30d</span></div>
              <div className="text-[10px] text-white/50 mt-1">
                L1: {fmt2(c.l1Daily * 30)} · L2: {fmt2(c.l2Daily * 30)} · Bonus: {fmt2(c.bonusEarned)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
