import React from 'react';
import { Link } from 'react-router-dom';

export default function Commissions() {
  return (
    <div className="max-w-6xl mx-auto py-16 px-4">
      <div className="text-center mb-16">
        <div className="inline-block px-3.5 py-1 rounded-full bg-brand/10 border border-brand/20 text-brand text-xs font-bold uppercase tracking-widest mb-4">
          Institutional Partner Payouts
        </div>
        <h1 className="text-4xl md:text-5xl font-extrabold mb-4"><span className="text-brand">AvaPartner</span> Commission Plans</h1>
        <p className="text-white/60 text-lg max-w-2xl mx-auto">
          We understand that every affiliate and Introducing Broker business model is unique. Choose from the most lucrative and flexible commission structures in the industry.
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-8 mb-16">
        <div className="bg-gradient-to-b from-[#0d1421] to-[#070b12] border border-brand/25 p-10 rounded-3xl hover:-translate-y-2 transition-transform duration-300">
          <div className="w-16 h-16 bg-brand/10 text-brand rounded-2xl flex items-center justify-center mb-6">
            <span className="text-2xl font-black">CPA</span>
          </div>
          <h2 className="text-2xl font-bold mb-4 text-white">Cost Per Acquisition</h2>
          <p className="text-white/60 mb-8 h-24">
            Earn up to <strong>$1,000 fixed upfront payout</strong> for every qualified trader you introduce across Tier-1 &amp; Tier-2 regulated countries. Ideal for media buyers and SEO publishers.
          </p>
          <Link to="/cpa" className="text-brand font-bold uppercase tracking-wider text-sm flex items-center gap-2 hover:underline">
            Explore CPA Tiers <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
          </Link>
        </div>

        <div className="bg-gradient-to-b from-[#0d1421] to-[#070b12] border border-sky-500/30 p-10 rounded-3xl hover:-translate-y-2 transition-transform duration-300 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-sky-500/10 rounded-full blur-2xl"></div>
          <div className="w-16 h-16 bg-sky-500/10 text-sky-400 rounded-2xl flex items-center justify-center mb-6 relative z-10">
            <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
          </div>
          <h2 className="text-2xl font-bold mb-4 text-white relative z-10">Lifetime Revenue Share</h2>
          <p className="text-white/60 mb-8 h-24 relative z-10">
            Build compounding passive income. Earn up to <strong>50% ongoing spread share</strong> plus automated rebates across Forex, Gold, AI Trade, and Binary Options.
          </p>
          <Link to="/revshare" className="text-sky-400 font-bold uppercase tracking-wider text-sm flex items-center gap-2 hover:underline relative z-10">
            Explore RevShare <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
          </Link>
        </div>

        <div className="bg-gradient-to-b from-[#0d1421] to-[#070b12] border border-amber-500/30 p-10 rounded-3xl hover:-translate-y-2 transition-transform duration-300 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl"></div>
          <div className="w-16 h-16 bg-amber-500/10 text-amber-400 rounded-2xl flex items-center justify-center mb-6 relative z-10">
            <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle></svg>
          </div>
          <h2 className="text-2xl font-bold mb-4 text-white relative z-10">Hybrid &amp; Master IB</h2>
          <p className="text-white/60 mb-8 h-24 relative z-10">
            Combine an upfront CPA payment with an ongoing Revenue Share tail and 2-tier Master IB sub-affiliate overrides. Built for maximum cash flow and lifetime value.
          </p>
          <Link to="/master-ib" className="text-amber-400 font-bold uppercase tracking-wider text-sm flex items-center gap-2 hover:underline relative z-10">
            Explore Master IB <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
          </Link>
        </div>
      </div>

      <div className="bg-[#0d1421] border border-white/10 rounded-3xl p-8 md:p-12 text-center shadow-xl max-w-3xl mx-auto">
        <h3 className="text-2xl font-bold mb-4 text-white">Not sure which AvaPartner model fits your traffic?</h3>
        <p className="text-white/60 mb-8">
          Our regional affiliate managers in Dublin, Sydney, Tokyo, and Abu Dhabi will analyze your audience and structure a bespoke deal to maximize your monthly earnings.
        </p>
        <Link to="/contact" className="btn px-8 py-3 font-bold rounded-full">
          Speak to an AvaPartner Manager
        </Link>
      </div>
    </div>
  );
}
