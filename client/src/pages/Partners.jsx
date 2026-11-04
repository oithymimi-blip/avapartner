import React from 'react';
import { Link } from 'react-router-dom';

export default function Partners() {
  return (
    <div className="max-w-5xl mx-auto py-16 px-4">
      <div className="text-center mb-16">
        <div className="inline-block px-3.5 py-1 rounded-full bg-brand/10 border border-brand/20 text-brand text-xs font-bold uppercase tracking-widest mb-4">
          150,000+ Global Partners
        </div>
        <h1 className="text-4xl md:text-5xl font-extrabold mb-4"><span className="text-brand">AvaPartner</span> Partnership Programs</h1>
        <p className="text-white/60 text-lg max-w-2xl mx-auto">
          Whether you are a financial publisher, media buying agency, trading academy, or institutional Introducing Broker, AvaPartner has a dedicated tier for you.
        </p>
      </div>

      <div className="space-y-12">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div className="order-2 md:order-1">
            <h2 className="text-3xl font-bold mb-4 text-white">Digital Affiliates &amp; Publishers</h2>
            <p className="text-white/60 leading-relaxed mb-6">
              Engineered for website owners, SEO comparison sites, media buyers, and social media educators. Monetize your financial, Forex, or crypto audience with CPA payouts up to $1,000 and localized conversion funnels across 150+ countries.
            </p>
            <Link to="/signup" className="text-brand font-bold uppercase tracking-widest text-sm hover:underline">Apply as Digital Affiliate &rarr;</Link>
          </div>
          <div className="order-1 md:order-2 bg-[#0d1421] border border-brand/20 p-8 rounded-3xl shadow-[0_0_30px_rgba(0,223,154,0.1)]">
            <div className="w-16 h-16 bg-brand/10 text-brand rounded-2xl flex items-center justify-center mb-6">
              <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
            </div>
            <ul className="space-y-3 text-white/80">
              <li className="flex items-center gap-3"><div className="w-2 h-2 bg-brand rounded-full"></div> Tier-1 CPA payouts up to $1,000</li>
              <li className="flex items-center gap-3"><div className="w-2 h-2 bg-brand rounded-full"></div> Multilingual marketing creatives in 20+ languages</li>
              <li className="flex items-center gap-3"><div className="w-2 h-2 bg-brand rounded-full"></div> Real-time conversion attribution &amp; API postbacks</li>
            </ul>
          </div>
        </div>

        <div className="w-full h-px bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>

        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div className="bg-[#0d1421] border border-sky-500/20 p-8 rounded-3xl shadow-[0_0_30px_rgba(14,165,233,0.1)]">
            <div className="w-16 h-16 bg-sky-500/10 text-sky-400 rounded-2xl flex items-center justify-center mb-6">
              <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
            </div>
            <ul className="space-y-3 text-white/80">
              <li className="flex items-center gap-3"><div className="w-2 h-2 bg-sky-400 rounded-full"></div> Lifetime Revenue Share &amp; Per-Lot Rebates</li>
              <li className="flex items-center gap-3"><div className="w-2 h-2 bg-sky-400 rounded-full"></div> Multi-tier Master IB Sub-Affiliate overrides</li>
              <li className="flex items-center gap-3"><div className="w-2 h-2 bg-sky-400 rounded-full"></div> Dedicated VIP regional account management</li>
            </ul>
          </div>
          <div>
            <h2 className="text-3xl font-bold mb-4 text-white">Introducing Brokers (IBs &amp; Master IBs)</h2>
            <p className="text-white/60 leading-relaxed mb-6">
              Ideal for trading academies, signal groups, money managers, and regional financial representatives. Earn continuous rebates on every lot traded across Forex, Gold, AI Trade, and Binary Options, and scale exponentially through our 2-tier Master IB network.
            </p>
            <Link to="/master-ib" className="text-sky-400 font-bold uppercase tracking-widest text-sm hover:underline">Explore Master IB Program &rarr;</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
