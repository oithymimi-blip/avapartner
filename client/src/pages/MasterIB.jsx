import React from 'react';
import { Link } from 'react-router-dom';

export default function MasterIB() {
  return (
    <div className="max-w-4xl mx-auto py-16 px-4">
      <div className="text-center mb-16">
        <div className="w-20 h-20 bg-brand/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <svg className="w-10 h-10 text-brand" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
        </div>
        <h1 className="text-4xl md:text-5xl font-extrabold mb-4">Master Introducing Broker (<span className="text-brand">Master IB</span>)</h1>
        <p className="text-white/60 text-lg max-w-2xl mx-auto">
          Scale your business exponentially. Refer other affiliates and Introducing Brokers to AvaPartner and earn overriding commissions on their entire network.
        </p>
      </div>

      <div className="bg-[#0d1421] border border-white/10 rounded-3xl p-8 md:p-12 shadow-2xl mb-12 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-brand/10 rounded-full blur-3xl"></div>
        <h2 className="text-3xl font-bold mb-6 text-brand relative z-10">Expand Your Global Sub-IB Network</h2>
        <div className="prose prose-invert max-w-none text-white/75 relative z-10 space-y-4">
          <p>
            The <strong>AvaPartner Master IB</strong> program is a multi-tier partnership structure designed for established financial marketers, regional money managers, and trading educators. As a Master IB, you are not only referring direct traders — you are recruiting sub-affiliates and local IBs to join the AvaPartner network under your umbrella.
          </p>
          <p>
            Every time a sub-affiliate in your downline generates trading volume across Forex, Gold, AI Trade, or Binary Options, you receive automatic Level-2 overriding commissions credited directly to your partner wallet, plus monthly fixed volume bonuses up to $250+/month.
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-8 mb-12">
        <div className="bg-[#0d1421] border border-white/10 p-8 rounded-3xl">
          <h3 className="text-xl font-bold mb-4 text-white">How to Succeed as a Master IB</h3>
          <ul className="space-y-4 text-white/60">
            <li className="flex flex-col gap-1">
              <strong className="text-white">Recruit High-Quality Partners</strong>
              <span className="text-sm">Use your regional influence to onboard signal providers, trading academies, and local IBs.</span>
            </li>
            <li className="flex flex-col gap-1">
              <strong className="text-white">Empower Your Downline</strong>
              <span className="text-sm">Equip your sub-affiliates with AvaPartner's localized marketing materials and 9 global regulatory licenses.</span>
            </li>
            <li className="flex flex-col gap-1">
              <strong className="text-white">Real-Time Multi-Tier Ledger</strong>
              <span className="text-sm">Monitor both Direct (Level 1) and Sub-IB (Level 2) volume and rebates live in your IB Dashboard.</span>
            </li>
          </ul>
        </div>
        <div className="bg-[#0d1421] border border-white/10 p-8 rounded-3xl flex flex-col justify-center text-center border-t-4 border-t-brand">
          <h3 className="text-2xl font-bold mb-2 text-white">White-Glove Institutional Support</h3>
          <p className="text-white/60 mb-6">
            Master IBs receive dedicated VIP support from our senior regional directors in Dublin, Abu Dhabi, Sydney, and Tokyo — including co-branded seminar sponsorship, custom rebate structures, and priority settlements.
          </p>
          <div className="text-brand font-bold uppercase tracking-widest text-sm">Gold Master IB Tier Access</div>
        </div>
      </div>

      <div className="text-center">
        <Link to="/contact" className="btn px-10 py-4 text-lg font-bold shadow-[0_0_25px_rgba(0,223,154,0.4)] hover:-translate-y-1 transition-all duration-300">
          Apply to Become an AvaPartner Master IB
        </Link>
      </div>
    </div>
  );
}
