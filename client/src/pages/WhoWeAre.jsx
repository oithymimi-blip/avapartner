import React from 'react';
import { Link } from 'react-router-dom';

const LEADERSHIP_TEAM = [
  {
    name: 'Dáire Ferguson',
    title: 'Chief Executive Officer (CEO)',
    office: '🇮🇪 Dublin, Ireland (Global HQ)',
    experience: '20+ Years in Institutional FX & Fintech',
    bio: 'Former head of European treasury operations, Dáire has led the strategic growth of the group since 2008, overseeing global licensing across 9 regulatory jurisdictions.',
    initials: 'DF',
    badgeColor: 'from-brand via-emerald-400 to-sky-500',
  },
  {
    name: 'Victoria Sterling',
    title: 'VP of Global Partnerships & Affiliate Network',
    office: '🇮🇪 Dublin & 🇬🇧 London',
    experience: '15+ Years in Performance & Partner Marketing',
    bio: 'Spearheads the global AvaPartner ecosystem, managing CPA, RevShare, and Hybrid structures for over 150,000 partners and media networks worldwide.',
    initials: 'VS',
    badgeColor: 'from-sky-400 via-blue-500 to-indigo-500',
  },
  {
    name: 'Dr. Liam O’Connor',
    title: 'Chief Risk & Regulatory Compliance Officer',
    office: '🇮🇪 Dublin, Ireland',
    experience: '18+ Years in MiFID II & Central Bank Supervision',
    bio: 'Directs global compliance across CBI, ASIC, FSA, ADGM, FSCA, and CySEC entities, ensuring full partner and client fund protection.',
    initials: 'LO',
    badgeColor: 'from-emerald-400 via-teal-500 to-cyan-500',
  },
  {
    name: 'Marcus Vance',
    title: 'Chief Technology & Attribution Officer (CTO)',
    office: '🇮🇱 Tel Aviv & 🇮🇪 Dublin',
    experience: '16+ Years in Algorithmic Trading & AdTech',
    bio: 'Architect of AvaPartner’s real-time tracking engine, AI Trade automated execution infrastructure, and multi-tier Master IB ledger.',
    initials: 'MV',
    badgeColor: 'from-amber-400 via-orange-500 to-rose-500',
  },
  {
    name: 'Kenji Takahashi',
    title: 'Managing Director — APAC & Japan',
    office: '🇯🇵 Tokyo & 🇦🇺 Sydney',
    experience: '17+ Years in Asian Capital Markets',
    bio: 'Leads institutional Introducing Broker partnerships and localized partner support across Japan (FSA), Australia (ASIC), and Southeast Asia.',
    initials: 'KT',
    badgeColor: 'from-brand via-teal-400 to-sky-400',
  },
  {
    name: 'Tariq Al-Mansoor',
    title: 'Regional Director — MENA & GCC',
    office: '🇦🇪 Abu Dhabi, UAE (ADGM)',
    experience: '14+ Years in MENA Wealth & Brokerage',
    bio: 'Heads the Abu Dhabi Global Market (ADGM) regional hub, supporting VIP Master IBs, trading academies, and financial institutions across the Gulf.',
    initials: 'TM',
    badgeColor: 'from-yellow-400 via-amber-500 to-orange-500',
  },
  {
    name: 'Sofia Conti',
    title: 'Head of European Affiliate Desk',
    office: '🇮🇹 Milan & 🇵🇱 Warsaw',
    experience: '12+ Years in European Fintech Acquisition',
    bio: 'Manages multilingual affiliate account managers across Western, Central, and Eastern Europe, optimizing localized conversion funnels in 15+ languages.',
    initials: 'SC',
    badgeColor: 'from-sky-400 via-cyan-400 to-emerald-400',
  },
  {
    name: 'Carlos Mendoza',
    title: 'Director of LATAM & African Partnerships',
    office: '🇲🇽 Mexico City & 🇿🇦 Johannesburg',
    experience: '13+ Years in Emerging Markets IB Networks',
    bio: 'Oversees fast-growing Introducing Broker networks, local trading seminars, and educational partnerships across Latin America and FSCA South Africa.',
    initials: 'CM',
    badgeColor: 'from-emerald-400 via-green-500 to-teal-600',
  },
];

const REGIONAL_DESKS = [
  { region: 'Europe (EU HQ)', city: 'Dublin, Milan, Warsaw & Limassol', languages: 'English, Italian, German, French, Spanish, Polish', staff: '120+ Specialists' },
  { region: 'Asia-Pacific (APAC)', city: 'Sydney & Tokyo', languages: 'English, Japanese, Mandarin, Vietnamese, Thai', staff: '85+ Specialists' },
  { region: 'Middle East (MENA)', city: 'Abu Dhabi (ADGM)', languages: 'Arabic, English, Urdu, Farsi', staff: '60+ Specialists' },
  { region: 'LATAM & Africa', city: 'Mexico City, São Paulo & Johannesburg', languages: 'Spanish, Portuguese, English', staff: '75+ Specialists' },
];

export default function WhoWeAre() {
  return (
    <div className="max-w-6xl mx-auto py-16 px-4 space-y-16">
      <div className="text-center space-y-4">
        <div className="inline-block px-3.5 py-1 rounded-full bg-brand/10 border border-brand/20 text-brand text-xs font-bold uppercase tracking-widest">
          Executive Leadership &amp; Global Desks
        </div>
        <h1 className="text-4xl md:text-5xl font-extrabold">Who We Are &amp; <span className="text-brand">Our Team</span></h1>
        <p className="text-white/60 text-lg max-w-3xl mx-auto">
          Meet the executive leadership, regulatory specialists, and regional partnership directors powering AvaPartner across 9 regulated jurisdictions.
        </p>
      </div>

      <section className="bg-[#0d1421] border border-white/10 rounded-3xl p-8 md:p-12 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-brand/5 rounded-full blur-3xl"></div>
        <h2 className="text-3xl font-bold mb-6 text-brand relative z-10">A Global Team Built for Partner Success</h2>
        <div className="space-y-4 text-white/75 leading-relaxed relative z-10">
          <p>
            <strong>AvaPartner</strong> is built by a diverse, multi-disciplinary organization of over 340+ digital marketing strategists, institutional financial analysts, compliance officers, and fintech engineers. With our official global headquarters in <strong>Dublin, Ireland</strong>, and regional offices in <strong>Sydney, Tokyo, Abu Dhabi, Milan, Warsaw, Limassol, Johannesburg, and Mexico City</strong>, our team understands the local nuances of every market.
          </p>
          <p>
            Our affiliate managers are not mere account handlers — they are senior performance marketing strategists. When you join AvaPartner, you are paired with a dedicated manager who speaks your native language and works hands-on with you to optimize conversions, structure custom CPA/RevShare deals, and scale your monthly payouts.
          </p>
        </div>
      </section>

      {/* Executive Team Grid */}
      <section className="space-y-8">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="text-3xl font-bold text-white mb-2">Executive Leadership &amp; Regional Directors</h2>
          <p className="text-white/60 text-sm">Decades of combined leadership in regulated financial services and global affiliate marketing.</p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {LEADERSHIP_TEAM.map((member, idx) => (
            <div key={idx} className="rounded-3xl bg-[#0d1421] border border-white/10 p-6 hover:border-brand/40 transition-all duration-300 flex flex-col justify-between shadow-xl">
              <div>
                <div className="flex items-center gap-3.5 mb-4">
                  <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${member.badgeColor} flex items-center justify-center text-black font-black text-lg shadow-md flex-shrink-0`}>
                    {member.initials}
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-base leading-snug">{member.name}</h3>
                    <div className="text-xs text-brand font-semibold">{member.title}</div>
                  </div>
                </div>
                <div className="inline-block px-2.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-[10px] text-white/70 font-mono mb-3">
                  {member.experience}
                </div>
                <p className="text-xs text-white/60 leading-relaxed mb-4">{member.bio}</p>
              </div>
              <div className="pt-3 border-t border-white/10 text-xs text-white/55 font-medium flex items-center justify-between">
                <span>{member.office}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Regional Partner Desks */}
      <section className="space-y-6">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="text-3xl font-bold text-white mb-2">Global Regional Partner Desks</h2>
          <p className="text-white/60 text-sm">24/5 localized partner support and multilingual sales conversion teams.</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-6">
          {REGIONAL_DESKS.map((desk, i) => (
            <div key={i} className="rounded-3xl bg-[#0d1421] border border-white/10 p-6 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-white">{desk.region}</h3>
                <span className="px-3 py-1 rounded-full bg-brand/10 text-brand text-xs font-bold">{desk.staff}</span>
              </div>
              <div className="text-xs text-white/65">
                <strong className="text-white">Hub Cities:</strong> {desk.city}
              </div>
              <div className="text-xs text-white/65">
                <strong className="text-white">Supported Languages:</strong> {desk.languages}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid md:grid-cols-2 gap-8">
        <div className="bg-[#0d1421] border border-white/10 p-8 rounded-3xl hover:border-brand/30 transition-colors">
          <div className="w-12 h-12 bg-brand/15 rounded-xl flex items-center justify-center text-brand mb-6">
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
          </div>
          <h3 className="text-xl font-bold mb-3">Partner-First Mentality</h3>
          <p className="text-white/60 text-sm leading-relaxed">
            We operate on a simple principle: when our partners thrive, AvaPartner thrives. Every attribution tool, localized landing page, and custom commission plan we build is engineered to maximize your ROI.
          </p>
        </div>
        <div className="bg-[#0d1421] border border-white/10 p-8 rounded-3xl hover:border-brand/30 transition-colors">
          <div className="w-12 h-12 bg-brand/15 rounded-xl flex items-center justify-center text-brand mb-6">
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
          </div>
          <h3 className="text-xl font-bold mb-3">Uncompromising Regulatory Integrity</h3>
          <p className="text-white/60 text-sm leading-relaxed">
            In an industry where trust drives conversions, our 9 international regulatory licenses and real-time transparent reporting set the gold standard for ethical financial partnership programs.
          </p>
        </div>
      </section>

      <div className="text-center">
        <Link to="/contact" className="btn px-10 py-4 text-lg font-bold">
          Connect With a Regional Partner Manager
        </Link>
      </div>
    </div>
  );
}
