import { useMemo, useState } from 'react'
import { buildDetailedFaqs } from '../data/ibFaqContent'

const CATEGORIES = ['All', 'IB & Commissions', 'Lot Size & Forex', 'AI Trade', 'Binary & Payouts', 'Account & Security']

export default function IBFaqSection({ tiers = [], title = 'Detailed IB, Lot Size & Trading FAQ', subtitle = 'Clear A–Z answers explaining lot sizes, Direct & Sub-IB percentages, AI Trade daily ratios, Binary payouts, and withdrawals.' }) {
  const [openIndex, setOpenIndex] = useState(0)
  const [category, setCategory] = useState('All')
  const [query, setQuery] = useState('')

  const allFaqs = useMemo(() => buildDetailedFaqs(tiers), [tiers])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return allFaqs.filter(item => {
      if (category !== 'All' && item.category !== category) return false
      if (!q) return true
      return item.question.toLowerCase().includes(q) || item.answer.toLowerCase().includes(q)
    })
  }, [allFaqs, category, query])

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-brand font-bold">Knowledge Base &amp; FAQ</div>
          <h2 className="text-xl sm:text-2xl font-bold text-white mt-0.5">{title}</h2>
          <p className="text-xs sm:text-sm text-white/55 mt-1">{subtitle}</p>
        </div>

        <input
          type="text"
          placeholder="Search FAQ (e.g. lot size, sub ib, ai trade)…"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpenIndex(0) }}
          className="rounded-xl border border-white/15 bg-black/40 px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder-white/35 w-full md:w-72 focus:border-brand focus:outline-none"
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            type="button"
            onClick={() => { setCategory(cat); setOpenIndex(0) }}
            className={`px-3 py-1.5 rounded-full text-[11px] font-semibold border transition ${
              category === cat
                ? 'border-brand/70 bg-brand/15 text-brand'
                : 'border-white/10 bg-white/5 text-white/55 hover:bg-white/10'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-[#0d1421] p-8 text-center text-sm text-white/45">
            No FAQ entries match your search.
          </div>
        ) : filtered.map((faq, idx) => {
          const isOpen = openIndex === idx
          return (
            <div
              key={faq.question}
              className={`border rounded-2xl overflow-hidden transition-all duration-200 ${
                isOpen
                  ? 'bg-white/[0.04] border-brand/40 shadow-[0_0_20px_rgba(0,223,154,0.08)]'
                  : 'bg-[#0d1421] border-white/10 hover:border-white/20'
              }`}
            >
              <button
                type="button"
                className="w-full text-left px-5 py-4 flex items-center justify-between gap-3 focus:outline-none"
                onClick={() => setOpenIndex(isOpen ? -1 : idx)}
              >
                <div className="space-y-1 min-w-0">
                  <span className="inline-block text-[10px] font-bold uppercase tracking-wider text-brand/85">
                    {faq.category}
                  </span>
                  <div className="font-bold text-sm sm:text-base text-white/95">{faq.question}</div>
                </div>
                <span className={`w-7 h-7 rounded-full flex items-center justify-center transition-transform duration-200 flex-shrink-0 ${
                  isOpen ? 'bg-brand text-black rotate-180' : 'bg-white/5 text-white/50'
                }`}>
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </span>
              </button>

              {isOpen && (
                <div className="px-5 pb-5 pt-3 border-t border-white/8 text-xs sm:text-sm text-white/70 leading-relaxed whitespace-pre-line">
                  {faq.answer}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
