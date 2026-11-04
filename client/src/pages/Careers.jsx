import React from 'react';

export default function Careers() {
  const jobs = [
    { title: "Senior Affiliate Manager (EU & UK)", location: "Dublin, Ireland (HQ)", type: "Full-Time" },
    { title: "Regional Master IB Director", location: "Abu Dhabi, UAE (ADGM)", type: "Full-Time" },
    { title: "APAC Partnerships Executive", location: "Sydney, Australia / Tokyo, Japan", type: "Full-Time" },
    { title: "Performance Media & CPA Strategist", location: "Milan, Italy / Remote (EU)", type: "Full-Time" },
    { title: "LATAM Introducing Broker Manager", location: "Mexico City / Remote", type: "Full-Time" }
  ];

  return (
    <div className="max-w-4xl mx-auto py-16 px-4">
      <div className="text-center mb-16">
        <div className="inline-block px-3.5 py-1 rounded-full bg-brand/10 border border-brand/20 text-brand text-xs font-bold uppercase tracking-widest mb-4">
          Global Careers · 8 Regional Hubs
        </div>
        <h1 className="text-4xl md:text-5xl font-extrabold mb-4">Join the <span className="text-brand">AvaPartner</span> Team</h1>
        <p className="text-white/60 text-lg max-w-2xl mx-auto">
          Build your career with the world's premier financial partner network across our headquarters in Dublin and regional hubs worldwide.
        </p>
      </div>

      <div className="bg-[#0d1421] border border-white/10 rounded-3xl p-8 md:p-12 shadow-2xl mb-12">
        <h2 className="text-3xl font-bold mb-6 text-brand">Why Work at AvaPartner?</h2>
        <div className="prose prose-invert max-w-none text-white/70 mb-8">
          <p>
            Working at AvaPartner means joining an international fintech leader backed by the AvaTrade Group. Across our offices in Dublin, Sydney, Tokyo, Abu Dhabi, Milan, Warsaw, and Johannesburg, we offer competitive compensation, performance bonuses, comprehensive healthcare, and global mobility.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <div className="bg-white/5 p-6 rounded-2xl border border-white/5">
            <h4 className="font-bold text-white mb-2">Global Footprint</h4>
            <p className="text-sm text-white/55">Collaborate with 340+ specialists serving 150,000+ partners across 150+ countries.</p>
          </div>
          <div className="bg-white/5 p-6 rounded-2xl border border-white/5">
            <h4 className="font-bold text-white mb-2">Industry Conferences</h4>
            <p className="text-sm text-white/55">Represent AvaPartner at premier iFX EXPO, Finance Magnates, and Affiliate World events globally.</p>
          </div>
          <div className="bg-white/5 p-6 rounded-2xl border border-white/5">
            <h4 className="font-bold text-white mb-2">Hybrid &amp; Global Hubs</h4>
            <p className="text-sm text-white/55">Flexible hybrid roles across our regulated offices in Europe, APAC, MENA, and LATAM.</p>
          </div>
        </div>
      </div>

      <h3 className="text-2xl font-bold mb-6">Open Positions</h3>
      <div className="space-y-4">
        {jobs.map((job, idx) => (
          <div key={idx} className="bg-[#0d1421] border border-white/10 rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between hover:border-brand/40 transition-colors">
            <div>
              <h4 className="text-xl font-bold text-white mb-1">{job.title}</h4>
              <div className="flex items-center gap-4 text-sm text-white/50">
                <span className="flex items-center gap-1"><svg className="w-4 h-4 text-brand" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg> {job.location}</span>
                <span className="flex items-center gap-1"><svg className="w-4 h-4 text-sky-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> {job.type}</span>
              </div>
            </div>
            <a href="mailto:careers@avapartner.com" className="mt-4 md:mt-0 px-6 py-2.5 bg-brand/15 text-brand hover:bg-brand hover:text-black font-bold rounded-full transition-all text-sm text-center">
              Apply Now
            </a>
          </div>
        ))}
      </div>

      <div className="mt-12 text-center text-white/50 text-sm">
        Don't see a perfect fit? Send your CV to <a href="mailto:careers@avapartner.com" className="text-brand hover:underline font-semibold">careers@avapartner.com</a> and our Dublin HR desk will keep you in mind for upcoming roles.
      </div>
    </div>
  );
}
