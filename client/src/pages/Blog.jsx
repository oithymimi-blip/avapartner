import React from 'react';

export default function Blog() {
  const posts = [
    {
      title: "How to Scale Your Forex & AI Trade Affiliate Campaigns in 2026",
      category: "Marketing Strategies",
      date: "October 18, 2026",
      excerpt: "Discover how top-performing AvaPartner affiliates combine localized landing pages, AI-driven market signals, and short-form video to boost Tier-1 CPA conversions.",
      image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=800"
    },
    {
      title: "Maximizing Multi-Tier Overrides with the AvaPartner Master IB Program",
      category: "Program Updates",
      date: "October 04, 2026",
      excerpt: "A complete breakdown of how Introducing Brokers across Dublin, Abu Dhabi, and Sydney scale recurring revenue by recruiting Sub-IB networks.",
      image: "https://images.unsplash.com/photo-1556761175-5973dc0f32e7?auto=format&fit=crop&q=80&w=800"
    },
    {
      title: "AvaPartner Named Best Global Financial Affiliate Program at Forex Expo Dubai",
      category: "Company News",
      date: "September 15, 2026",
      excerpt: "We are proud to announce that AvaPartner has been recognized globally as the Best Financial Affiliate Network, celebrating $300M+ in partner payouts.",
      image: "https://images.unsplash.com/photo-1561489413-985b06da5bee?auto=format&fit=crop&q=80&w=800"
    }
  ];

  return (
    <div className="max-w-6xl mx-auto py-16 px-4">
      <div className="text-center mb-16">
        <div className="inline-block px-3.5 py-1 rounded-full bg-brand/10 border border-brand/20 text-brand text-xs font-bold uppercase tracking-widest mb-4">
          Partner Intelligence &amp; News
        </div>
        <h1 className="text-4xl md:text-5xl font-extrabold mb-4"><span className="text-brand">AvaPartner</span> Blog</h1>
        <p className="text-white/60 text-lg max-w-2xl mx-auto">
          Insights, conversion strategies, and official announcements from the world's leading regulated financial affiliate network.
        </p>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
        {posts.map((post, idx) => (
          <div key={idx} className="bg-[#0d1421] border border-white/10 rounded-3xl overflow-hidden hover:border-brand/40 hover:-translate-y-2 transition-all duration-300 group cursor-pointer flex flex-col">
            <div className="h-48 overflow-hidden relative">
              <div className="absolute inset-0 bg-brand/20 group-hover:bg-transparent transition-colors z-10"></div>
              <img src={post.image} alt={post.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
            </div>
            <div className="p-8 flex-1 flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold text-brand uppercase tracking-wider">{post.category}</span>
                <span className="text-xs text-white/40">{post.date}</span>
              </div>
              <h2 className="text-xl font-bold mb-3 text-white group-hover:text-brand transition-colors line-clamp-2">{post.title}</h2>
              <p className="text-white/60 text-sm leading-relaxed mb-6 line-clamp-3 flex-1">{post.excerpt}</p>
              <div className="text-brand font-bold text-sm flex items-center gap-2 group-hover:gap-3 transition-all">
                Read Article <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-16 text-center">
        <button className="px-8 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full font-bold transition-colors">
          Load More Articles
        </button>
      </div>
    </div>
  );
}
