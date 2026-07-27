import React from 'react';
import { Link } from 'react-router-dom';

export default function HelpCenter() {
  const guides = [
    { title: "Getting Started", icon: "rocket", desc: "A complete guide to setting up your account, generating your first tracking link, and understanding the dashboard." },
    { title: "Marketing Assets", icon: "image", desc: "How to locate, download, and properly embed our high-converting banners and landing pages on your site." },
    { title: "Commission Models", icon: "dollar-sign", desc: "Detailed breakdown of CPA, RevShare, and Hybrid models, and how to track your earnings." },
    { title: "Compliance & Regulations", icon: "shield", desc: "Essential guidelines to ensure your marketing campaigns comply with international financial regulations." },
    { title: "Reporting & Analytics", icon: "bar-chart", desc: "How to run custom reports, analyze click-through rates, and optimize your traffic sources." },
    { title: "Payment Methods", icon: "credit-card", desc: "Instructions on configuring your payment details, withdrawal minimums, and payout schedules." }
  ];

  return (
    <div className="max-w-6xl mx-auto py-16 px-4">
      <div className="text-center mb-16">
        <h1 className="text-4xl md:text-5xl font-extrabold mb-4">Help Center</h1>
        <p className="text-white/60 text-lg max-w-2xl mx-auto">
          Everything you need to know about the AvaPartner network. Explore our guides, tutorials, and best practices.
        </p>
      </div>

      {/* Search Bar Placeholder */}
      <div className="max-w-2xl mx-auto mb-16 relative">
        <input 
          type="text" 
          className="w-full bg-[#11161d] border border-white/20 rounded-full px-6 py-4 pl-14 text-white focus:outline-none focus:border-brand/50 transition-colors shadow-lg" 
          placeholder="Search for articles, guides, or keywords..." 
        />
        <svg className="w-6 h-6 text-white/40 absolute left-5 top-1/2 transform -translate-y-1/2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
        {guides.map((guide, idx) => (
          <div key={idx} className="bg-[#11161d] border border-white/10 rounded-2xl p-8 hover:border-brand/40 hover:-translate-y-1 transition-all duration-300 cursor-pointer group">
            <div className="w-12 h-12 bg-white/5 group-hover:bg-brand/10 rounded-xl flex items-center justify-center mb-6 transition-colors">
              {guide.icon === 'rocket' && <svg className="w-6 h-6 text-white/70 group-hover:text-brand" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 14.899A7 7 0 1 1 15.62 9.378a5 5 0 1 1 7.5 6.572M4 14.899l-2 2M15.62 9.378l2-2"></path></svg>}
              {guide.icon === 'image' && <svg className="w-6 h-6 text-white/70 group-hover:text-brand" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>}
              {guide.icon === 'dollar-sign' && <svg className="w-6 h-6 text-white/70 group-hover:text-brand" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>}
              {guide.icon === 'shield' && <svg className="w-6 h-6 text-white/70 group-hover:text-brand" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>}
              {guide.icon === 'bar-chart' && <svg className="w-6 h-6 text-white/70 group-hover:text-brand" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>}
              {guide.icon === 'credit-card' && <svg className="w-6 h-6 text-white/70 group-hover:text-brand" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg>}
            </div>
            <h3 className="text-xl font-bold mb-3 text-white">{guide.title}</h3>
            <p className="text-white/60 text-sm leading-relaxed mb-4">{guide.desc}</p>
            <span className="text-brand text-sm font-bold flex items-center gap-1 group-hover:underline">
              Read Articles <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </span>
          </div>
        ))}
      </div>

      <div className="bg-gradient-to-r from-brand/10 to-transparent border border-brand/20 p-8 md:p-10 rounded-3xl flex flex-col md:flex-row items-center justify-between gap-6 text-center md:text-left">
        <div>
          <h3 className="text-2xl font-bold text-white mb-2">Can't find what you're looking for?</h3>
          <p className="text-white/60">Our affiliate managers are ready to help you with personalized support.</p>
        </div>
        <Link to="/contact" className="btn px-8 py-3 bg-brand text-black font-bold rounded-full hover:bg-brand-dark transition-colors flex-shrink-0 shadow-[0_0_15px_rgba(0,223,154,0.3)]">
          Contact Support
        </Link>
      </div>
    </div>
  );
}
