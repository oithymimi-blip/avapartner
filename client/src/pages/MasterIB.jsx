import React from 'react';
import { Link } from 'react-router-dom';

export default function MasterIB() {
  return (
    <div className="max-w-4xl mx-auto py-16 px-4">
      <div className="text-center mb-16">
        <div className="w-20 h-20 bg-purple-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <svg className="w-10 h-10 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
        </div>
        <h1 className="text-4xl md:text-5xl font-extrabold mb-4">Master Introducing Broker</h1>
        <p className="text-white/60 text-lg max-w-2xl mx-auto">
          Scale your business exponentially. Refer other affiliates and Introducing Brokers to AvaPartner and earn a percentage of their success.
        </p>
      </div>

      <div className="bg-[#11161d] border border-white/10 rounded-3xl p-8 md:p-12 shadow-2xl mb-12 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl"></div>
        <h2 className="text-3xl font-bold mb-6 text-purple-400 relative z-10">Expand Your Network</h2>
        <div className="prose prose-invert max-w-none text-white/70 relative z-10">
          <p>
            The Master IB (Introducing Broker) program is a multi-tier affiliate structure designed for established marketers and networkers. As a Master IB, you are not just referring traders; you are recruiting sub-affiliates to join the AvaPartner network under your umbrella.
          </p>
          <p>
            Every time a sub-affiliate in your network generates a commission—whether through CPA or RevShare—you receive an overriding percentage of their earnings. This allows you to build a massive, decentralized marketing machine that generates revenue around the clock.
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-8 mb-12">
        <div className="bg-black/30 border border-white/5 p-8 rounded-3xl">
          <h3 className="text-xl font-bold mb-4 text-white">How to Succeed as a Master IB</h3>
          <ul className="space-y-4 text-white/60">
            <li className="flex flex-col gap-1">
              <strong className="text-white">Recruit High-Quality Partners</strong>
              <span className="text-sm">Use your influence and network to bring in capable marketers and local IBs.</span>
            </li>
            <li className="flex flex-col gap-1">
              <strong className="text-white">Provide Support</strong>
              <span className="text-sm">Train your sub-affiliates, share winning strategies, and help them scale their campaigns.</span>
            </li>
            <li className="flex flex-col gap-1">
              <strong className="text-white">Track Your Network</strong>
              <span className="text-sm">Use our advanced dashboard to monitor the performance of your entire downline in real-time.</span>
            </li>
          </ul>
        </div>
        <div className="bg-black/30 border border-white/5 p-8 rounded-3xl flex flex-col justify-center text-center border-t-4 border-t-purple-500">
          <h3 className="text-2xl font-bold mb-2 text-white">White-Glove Support</h3>
          <p className="text-white/60 mb-6">
            Master IBs receive dedicated VIP support from our senior management team to help facilitate large network migrations, host local seminars, and provide bespoke marketing materials for your sub-affiliates.
          </p>
          <div className="text-purple-400 font-bold uppercase tracking-widest text-sm">VIP Tier Access</div>
        </div>
      </div>

      <div className="text-center">
        <Link to="/contact" className="btn px-10 py-4 text-lg font-bold bg-purple-600 hover:bg-purple-500 text-white shadow-[0_0_25px_rgba(168,85,247,0.4)] hover:-translate-y-1 transition-all duration-300">
          Contact Us to Become a Master IB
        </Link>
      </div>
    </div>
  );
}
