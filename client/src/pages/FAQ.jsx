import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import IBFaqSection from '../components/IBFaqSection'

export default function FAQ() {
  const [tiers, setTiers] = useState([])

  useEffect(() => {
    api().get('/api/ib/config')
      .then(res => {
        if (Array.isArray(res.data?.tiers)) setTiers(res.data.tiers)
      })
      .catch(() => {})
  }, [])

  return (
    <div className="max-w-4xl mx-auto py-12 px-4 space-y-10">
      <div className="text-center space-y-3">
        <div className="inline-block px-3.5 py-1 bg-brand/10 border border-brand/20 text-brand text-xs font-bold uppercase tracking-widest rounded-full">
          AvaPartner Support &amp; Partner Guide
        </div>
        <h1 className="text-3xl md:text-5xl font-extrabold text-white">Frequently Asked Questions</h1>
        <p className="text-white/60 text-base md:text-lg max-w-2xl mx-auto">
          Everything explained clearly A to Z — IB Commissions, Direct &amp; Sub-IB levels, Forex Lot Sizes, AI Trade daily profit ratios, Binary Options, and Withdrawals.
        </p>
      </div>

      <IBFaqSection
        tiers={tiers}
        title="All IB, Trading &amp; Affiliate Questions"
        subtitle="Filter by topic or search for any keyword (lot size, sub-IB, AI trade, bonus, withdraw, 2FA)."
      />

      <div className="text-center bg-gradient-to-r from-[#0d1421] to-[#070b12] border border-white/10 p-8 rounded-3xl space-y-4">
        <h3 className="text-2xl font-bold text-white">Want to Calculate Your Exact Commission Profit?</h3>
        <p className="text-white/60 max-w-xl mx-auto text-sm">
          Open the Affiliate Program or IB Dashboard to use the live Direct + Sub-IB Profit Calculator and view real-time tracking.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link to="/referral" className="btn px-7 py-3 bg-brand text-black font-bold rounded-full hover:bg-emerald-400 transition-colors">
            View Commission Calculator
          </Link>
          <Link to="/contact" className="btn px-7 py-3 bg-white/10 text-white font-bold rounded-full hover:bg-white/20 transition-colors">
            Contact AvaPartner Support
          </Link>
        </div>
      </div>
    </div>
  )
}
