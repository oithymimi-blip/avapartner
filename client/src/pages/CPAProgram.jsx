import React from 'react';
import { Link } from 'react-router-dom';

export default function CPAProgram() {
  return (
    <div className="max-w-4xl mx-auto py-16 px-4">
      <div className="text-center mb-16">
        <div className="w-20 h-20 bg-brand/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <span className="text-3xl font-black text-brand">CPA</span>
        </div>
        <h1 className="text-4xl md:text-5xl font-extrabold mb-4">Cost Per Acquisition Program</h1>
        <p className="text-white/60 text-lg max-w-2xl mx-auto">
          Maximize your immediate cash flow. Earn a high, fixed commission for every qualified trader you introduce to Fexova.
        </p>
      </div>

      <div className="bg-[#11161d] border border-white/10 rounded-3xl p-8 md:p-12 shadow-2xl mb-12">
        <h2 className="text-3xl font-bold mb-6 text-brand">How It Works</h2>
        <div className="prose prose-invert max-w-none text-white/70">
          <p>
            The CPA (Cost Per Acquisition) model is designed for affiliates who prefer a fixed, upfront payment for their marketing efforts. Unlike revenue share, which pays out over time, the CPA model delivers a lump sum commission as soon as your referred client meets our qualification criteria.
          </p>
          <div className="grid md:grid-cols-3 gap-6 my-8">
            <div className="bg-white/5 p-6 rounded-2xl text-center border border-white/5">
              <div className="w-10 h-10 bg-brand/20 text-brand rounded-full flex items-center justify-center mx-auto font-bold mb-4">1</div>
              <h4 className="font-bold text-white mb-2">Refer</h4>
              <p className="text-sm text-white/50">Send traffic using your unique tracking links and high-converting creatives.</p>
            </div>
            <div className="bg-white/5 p-6 rounded-2xl text-center border border-white/5">
              <div className="w-10 h-10 bg-brand/20 text-brand rounded-full flex items-center justify-center mx-auto font-bold mb-4">2</div>
              <h4 className="font-bold text-white mb-2">Qualify</h4>
              <p className="text-sm text-white/50">Your referral registers, deposits the minimum required amount, and executes their first trades.</p>
            </div>
            <div className="bg-white/5 p-6 rounded-2xl text-center border border-white/5 border-b-4 border-b-brand">
              <div className="w-10 h-10 bg-brand text-black rounded-full flex items-center justify-center mx-auto font-bold mb-4">3</div>
              <h4 className="font-bold text-white mb-2">Earn</h4>
              <p className="text-sm text-white/50">Receive a substantial, fixed CPA payout at the end of the billing cycle.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-8 mb-12">
        <div className="bg-black/30 border border-white/5 p-8 rounded-3xl">
          <h3 className="text-xl font-bold mb-4 text-white">Who is this for?</h3>
          <ul className="space-y-3 text-white/60">
            <li className="flex items-start gap-2"><div className="w-1.5 h-1.5 bg-brand rounded-full mt-2 flex-shrink-0"></div> Media buyers running paid ad campaigns.</li>
            <li className="flex items-start gap-2"><div className="w-1.5 h-1.5 bg-brand rounded-full mt-2 flex-shrink-0"></div> Affiliates with high-volume, top-of-funnel traffic.</li>
            <li className="flex items-start gap-2"><div className="w-1.5 h-1.5 bg-brand rounded-full mt-2 flex-shrink-0"></div> Marketers looking for fast ROI to reinvest in ad spend.</li>
          </ul>
        </div>
        <div className="bg-black/30 border border-white/5 p-8 rounded-3xl">
          <h3 className="text-xl font-bold mb-4 text-white">The Fexova Advantage</h3>
          <ul className="space-y-3 text-white/60">
            <li className="flex items-start gap-2"><div className="w-1.5 h-1.5 bg-brand rounded-full mt-2 flex-shrink-0"></div> Industry-leading conversion rates.</li>
            <li className="flex items-start gap-2"><div className="w-1.5 h-1.5 bg-brand rounded-full mt-2 flex-shrink-0"></div> Flexible CPA tiers based on the trader's country of origin.</li>
            <li className="flex items-start gap-2"><div className="w-1.5 h-1.5 bg-brand rounded-full mt-2 flex-shrink-0"></div> Transparent reporting on exactly when a lead qualifies.</li>
          </ul>
        </div>
      </div>

      <div className="text-center">
        <Link to="/signup" className="btn px-10 py-4 text-lg font-bold shadow-[0_0_25px_rgba(0,223,154,0.4)] hover:-translate-y-1 transition-all duration-300">
          Apply For A CPA Account
        </Link>
      </div>
    </div>
  );
}
