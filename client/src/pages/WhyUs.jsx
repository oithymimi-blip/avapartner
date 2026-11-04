import React from 'react';
import { Link } from 'react-router-dom';

export default function WhyUs() {
  return (
    <div className="max-w-5xl mx-auto py-16 px-4 space-y-14">
      <div className="text-center space-y-4">
        <div className="inline-block px-3.5 py-1 rounded-full bg-brand/10 border border-brand/20 text-brand text-xs font-bold uppercase tracking-widest">
          The AvaPartner Advantage
        </div>
        <h1 className="text-4xl md:text-5xl font-extrabold">Why Choose <span className="text-brand">AvaPartner?</span></h1>
        <p className="text-white/60 text-lg max-w-2xl mx-auto">
          We provide the most lucrative, transparent, and regulated affiliate and Introducing Broker network in the global financial trading industry.
        </p>
      </div>

      <div className="space-y-8">
        <section className="bg-[#0d1421] border border-white/10 rounded-3xl p-8 md:p-12 shadow-2xl">
          <div className="flex flex-col md:flex-row items-center gap-8">
            <div className="w-16 h-16 bg-brand/10 text-brand rounded-2xl flex items-center justify-center flex-shrink-0">
              <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
            </div>
            <div>
              <h2 className="text-2xl font-bold mb-3">9 Global Regulatory Licenses Across 5 Continents</h2>
              <p className="text-white/65 leading-relaxed">
                Regulatory trust is the single highest converting factor in financial marketing. When you promote AvaTrade through AvaPartner, you represent an international brokerage regulated by the <strong>Central Bank of Ireland (CBI)</strong>, <strong>ASIC (Australia)</strong>, <strong>FSA (Japan)</strong>, <strong>ADGM FSRA (UAE)</strong>, <strong>FSCA (South Africa)</strong>, <strong>CySEC (Cyprus)</strong>, <strong>BVI FSC</strong>, <strong>ISA (Israel)</strong>, and <strong>KNF (Poland)</strong>.
              </p>
            </div>
          </div>
        </section>

        <section className="bg-[#0d1421] border border-white/10 rounded-3xl p-8 md:p-12 shadow-2xl">
          <div className="flex flex-col md:flex-row items-center gap-8">
            <div className="w-16 h-16 bg-sky-500/10 text-sky-400 rounded-2xl flex items-center justify-center flex-shrink-0">
              <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
            </div>
            <div>
              <h2 className="text-2xl font-bold mb-3">Real-Time Attribution &amp; Multi-Stream IB Dashboard</h2>
              <p className="text-white/65 leading-relaxed">
                Our proprietary tracking technology ensures you never miss a single lead or lot rebate. Monitor real-time clicks, registrations, qualified FTDs, AI Trade profits, Forex lot volumes, and Binary Options turnover — plus automatic 2-tier Sub-IB overrides.
              </p>
            </div>
          </div>
        </section>

        <section className="bg-[#0d1421] border border-white/10 rounded-3xl p-8 md:p-12 shadow-2xl">
          <div className="flex flex-col md:flex-row items-center gap-8">
            <div className="w-16 h-16 bg-amber-500/10 text-amber-400 rounded-2xl flex items-center justify-center flex-shrink-0">
              <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg>
            </div>
            <div>
              <h2 className="text-2xl font-bold mb-3">$300,000,000+ Paid Out On Time Since 2006</h2>
              <p className="text-white/65 leading-relaxed">
                Cash flow is the lifeblood of your marketing business. With over $300M paid to 150,000+ partners worldwide, AvaPartner guarantees fast, reliable, and transparent settlements via USDT/USDC crypto rails, bank wire, and instant wallet transfers with zero hidden fees.
              </p>
            </div>
          </div>
        </section>
      </div>

      <div className="mt-16 text-center">
        <Link to="/signup" className="btn px-10 py-4 text-lg font-bold shadow-[0_0_25px_rgba(0,223,154,0.4)] hover:-translate-y-1 transition-all duration-300">
          Partner With AvaPartner Today
        </Link>
      </div>
    </div>
  );
}
