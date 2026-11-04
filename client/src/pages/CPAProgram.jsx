import React from 'react';
import { Link } from 'react-router-dom';

const COUNTRY_TIERS = [
  {
    tier: 'Tier 1 — Premier Regulated Markets',
    countries: '🇮🇪 Ireland, 🇬🇧 United Kingdom, 🇦🇺 Australia, 🇦🇪 UAE (ADGM), 🇯🇵 Japan, 🇩🇪 Germany, 🇨🇭 Switzerland, 🇳🇱 Netherlands',
    cpa: 'Up to $1,000',
    badge: 'text-brand bg-brand/10 border-brand/30',
  },
  {
    tier: 'Tier 2 — High-Growth Regulated Hubs',
    countries: '🇮🇹 Italy, 🇪🇸 Spain, 🇵🇱 Poland, 🇨🇾 Cyprus, 🇿🇦 South Africa, 🇸🇬 Singapore, 🇲🇾 Malaysia, 🇲🇽 Mexico',
    cpa: 'Up to $650',
    badge: 'text-sky-400 bg-sky-500/10 border-sky-500/30',
  },
  {
    tier: 'Tier 3 — Global Emerging Markets',
    countries: '🇧🇷 Brazil, 🇨🇴 Colombia, 🇳🇬 Nigeria, 🇻🇳 Vietnam, 🇹🇭 Thailand, 🇮🇳 India & 120+ International Countries',
    cpa: 'Up to $400',
    badge: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  },
];

export default function CPAProgram() {
  return (
    <div className="max-w-5xl mx-auto py-16 px-4 space-y-14">
      <div className="text-center">
        <div className="w-20 h-20 bg-brand/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <span className="text-3xl font-black text-brand">CPA</span>
        </div>
        <h1 className="text-4xl md:text-5xl font-extrabold mb-4">Cost Per Acquisition (<span className="text-brand">CPA</span>) Program</h1>
        <p className="text-white/60 text-lg max-w-2xl mx-auto">
          Maximize your immediate cash flow. Earn a high, fixed commission up to $1,000 for every qualified trader you introduce to AvaPartner &amp; AvaTrade.
        </p>
      </div>

      <div className="bg-[#0d1421] border border-white/10 rounded-3xl p-8 md:p-12 shadow-2xl">
        <h2 className="text-3xl font-bold mb-6 text-brand">How the AvaPartner CPA Model Works</h2>
        <div className="prose prose-invert max-w-none text-white/75">
          <p>
            The CPA (Cost Per Acquisition) model is engineered for digital marketers, SEO publishers, and media buyers who prefer a substantial, upfront payout for every qualified First-Time Depositor (FTD) referred to AvaTrade.
          </p>
          <div className="grid md:grid-cols-3 gap-6 my-8">
            <div className="bg-white/5 p-6 rounded-2xl text-center border border-white/5">
              <div className="w-10 h-10 bg-brand/20 text-brand rounded-full flex items-center justify-center mx-auto font-bold mb-4">1</div>
              <h4 className="font-bold text-white mb-2">Refer</h4>
              <p className="text-sm text-white/50">Drive targeted traffic using your unique AvaPartner tracking link and localized creatives.</p>
            </div>
            <div className="bg-white/5 p-6 rounded-2xl text-center border border-white/5">
              <div className="w-10 h-10 bg-brand/20 text-brand rounded-full flex items-center justify-center mx-auto font-bold mb-4">2</div>
              <h4 className="font-bold text-white mb-2">Qualify</h4>
              <p className="text-sm text-white/50">Your referral registers, completes verification, deposits, and opens their first trades.</p>
            </div>
            <div className="bg-white/5 p-6 rounded-2xl text-center border border-white/5 border-b-4 border-b-brand">
              <div className="w-10 h-10 bg-brand text-black rounded-full flex items-center justify-center mx-auto font-bold mb-4">3</div>
              <h4 className="font-bold text-white mb-2">Earn Up to $1,000</h4>
              <p className="text-sm text-white/50">Receive your fixed CPA payout automatically with full conversion attribution.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Country Tiers Section */}
      <div className="space-y-6">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="text-3xl font-bold text-white mb-2">Official Country CPA Commission Tiers</h2>
          <p className="text-white/60 text-sm">Payout rates scale according to your referral's regulated country of residence and monthly FTD volume.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {COUNTRY_TIERS.map((item, i) => (
            <div key={i} className="rounded-3xl bg-[#0d1421] border border-white/10 p-6 flex flex-col justify-between space-y-4">
              <div>
                <span className={`inline-block px-3 py-1 rounded-full border text-xs font-bold mb-3 ${item.badge}`}>
                  {item.cpa} / FTD
                </span>
                <h3 className="text-lg font-bold text-white mb-2">{item.tier}</h3>
                <p className="text-xs text-white/60 leading-relaxed">{item.countries}</p>
              </div>
              <div className="pt-3 border-t border-white/10 text-[11px] text-white/45 font-mono">
                Custom volume bumps available
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        <div className="bg-[#0d1421] border border-white/10 p-8 rounded-3xl">
          <h3 className="text-xl font-bold mb-4 text-white">Who is this for?</h3>
          <ul className="space-y-3 text-white/60">
            <li className="flex items-start gap-2"><div className="w-1.5 h-1.5 bg-brand rounded-full mt-2 flex-shrink-0"></div> Media buyers running paid search, native, and social ad campaigns.</li>
            <li className="flex items-start gap-2"><div className="w-1.5 h-1.5 bg-brand rounded-full mt-2 flex-shrink-0"></div> Financial comparison portals &amp; SEO review sites.</li>
            <li className="flex items-start gap-2"><div className="w-1.5 h-1.5 bg-brand rounded-full mt-2 flex-shrink-0"></div> Marketers looking for fast ROI to scale monthly ad spend.</li>
          </ul>
        </div>
        <div className="bg-[#0d1421] border border-white/10 p-8 rounded-3xl">
          <h3 className="text-xl font-bold mb-4 text-white">The AvaPartner Advantage</h3>
          <ul className="space-y-3 text-white/60">
            <li className="flex items-start gap-2"><div className="w-1.5 h-1.5 bg-brand rounded-full mt-2 flex-shrink-0"></div> Industry-leading conversion rates backed by 9 regulatory licenses.</li>
            <li className="flex items-start gap-2"><div className="w-1.5 h-1.5 bg-brand rounded-full mt-2 flex-shrink-0"></div> Flexible CPA tiers based on the trader's country of origin.</li>
            <li className="flex items-start gap-2"><div className="w-1.5 h-1.5 bg-brand rounded-full mt-2 flex-shrink-0"></div> Transparent real-time reporting on every qualified lead.</li>
          </ul>
        </div>
      </div>

      <div className="text-center">
        <Link to="/signup" className="btn px-10 py-4 text-lg font-bold shadow-[0_0_25px_rgba(0,223,154,0.4)] hover:-translate-y-1 transition-all duration-300">
          Apply For an AvaPartner CPA Account
        </Link>
      </div>
    </div>
  );
}
