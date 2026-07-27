import React from 'react';
import { Link } from 'react-router-dom';

export default function WhyUs() {
  return (
    <div className="max-w-4xl mx-auto py-16 px-4">
      <div className="text-center mb-16">
        <h1 className="text-4xl md:text-5xl font-extrabold mb-4">Why Choose AvaPartner?</h1>
        <p className="text-white/60 text-lg max-w-2xl mx-auto">
          We provide the most lucrative, transparent, and technologically advanced affiliate network in the financial trading industry.
        </p>
      </div>

      <div className="space-y-8">
        <section className="bg-[#11161d] border border-white/10 rounded-3xl p-8 md:p-12 shadow-2xl">
          <div className="flex flex-col md:flex-row items-center gap-8">
            <div className="w-16 h-16 bg-brand/10 text-brand rounded-2xl flex items-center justify-center flex-shrink-0">
              <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
            </div>
            <div>
              <h2 className="text-2xl font-bold mb-3">Global Regulatory Trust</h2>
              <p className="text-white/60 leading-relaxed">
                Trust is the highest converting factor in financial marketing. When you promote AvaTrade through AvaPartner, you are promoting a brokerage that is licensed and regulated in 9 major jurisdictions across the globe, including Europe, Australia, Japan, and the UAE.
              </p>
            </div>
          </div>
        </section>

        <section className="bg-[#11161d] border border-white/10 rounded-3xl p-8 md:p-12 shadow-2xl">
          <div className="flex flex-col md:flex-row items-center gap-8">
            <div className="w-16 h-16 bg-brand/10 text-brand rounded-2xl flex items-center justify-center flex-shrink-0">
              <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
            </div>
            <div>
              <h2 className="text-2xl font-bold mb-3">Advanced Tracking Dashboard</h2>
              <p className="text-white/60 leading-relaxed">
                Our proprietary tracking technology ensures you never miss a commission. Our state-of-the-art dashboard provides real-time reporting, detailed analytics, and full transparency over your clicks, conversions, and payouts.
              </p>
            </div>
          </div>
        </section>

        <section className="bg-[#11161d] border border-white/10 rounded-3xl p-8 md:p-12 shadow-2xl">
          <div className="flex flex-col md:flex-row items-center gap-8">
            <div className="w-16 h-16 bg-brand/10 text-brand rounded-2xl flex items-center justify-center flex-shrink-0">
              <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg>
            </div>
            <div>
              <h2 className="text-2xl font-bold mb-3">Guaranteed On-Time Payments</h2>
              <p className="text-white/60 leading-relaxed">
                We know that cash flow is the lifeblood of your marketing business. With over $300,000,000 paid to our partners to date, AvaPartner guarantees fast, reliable, and transparent monthly payouts with zero hidden fees.
              </p>
            </div>
          </div>
        </section>
      </div>

      <div className="mt-16 text-center">
        <Link to="/signup" className="btn px-10 py-4 text-lg font-bold shadow-[0_0_25px_rgba(0,223,154,0.4)] hover:-translate-y-1 transition-all duration-300">
          Partner With Us Today
        </Link>
      </div>
    </div>
  );
}
