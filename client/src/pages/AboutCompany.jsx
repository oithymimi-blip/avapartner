import React from 'react';
import { Link } from 'react-router-dom';

const JURISDICTIONS = [
  { flag: '🇮🇪', country: 'Ireland (Global HQ)', entity: 'AVA Trade EU Ltd', regulator: 'Central Bank of Ireland (CBI)', license: 'No. C53877' },
  { flag: '🇦🇺', country: 'Australia', entity: 'Ava Capital Markets Australia Pty Ltd', regulator: 'ASIC', license: 'AFSL No. 406684' },
  { flag: '🇯🇵', country: 'Japan', entity: 'Ava Trade Japan K.K.', regulator: 'FSA & FFAJ', license: 'FSA #1662 / FFAJ #1574' },
  { flag: '🇦🇪', country: 'United Arab Emirates', entity: 'Ava Trade Middle East Ltd', regulator: 'ADGM FSRA', license: 'FSP No. 190018' },
  { flag: '🇿🇦', country: 'South Africa', entity: 'Ava Capital Markets Pty Ltd', regulator: 'FSCA', license: 'FSP No. 45984' },
  { flag: '🇨🇾', country: 'Cyprus (EU)', entity: 'DT Direct Investment Hub Ltd', regulator: 'CySEC', license: 'No. 347/17' },
  { flag: '🇻🇬', country: 'British Virgin Islands', entity: 'Ava Trade Markets Ltd', regulator: 'BVI Financial Services Commission', license: 'SIBA/L/13/1049' },
  { flag: '🇮🇱', country: 'Israel', entity: 'AvaTrade Ltd', regulator: 'Israel Securities Authority (ISA)', license: 'No. 514666577' },
  { flag: '🇵🇱', country: 'Poland', entity: 'AVA Trade EU Ltd (Polish Branch)', regulator: 'KNF Supervision', license: 'EU MiFID II Passport' },
];

const MILESTONES = [
  { year: '2006', title: 'Founded in Dublin, Ireland', desc: 'AvaTrade Group was established in Dublin with a mission to empower retail and institutional traders worldwide.' },
  { year: '2009', title: 'Launch of AvaPartner Network', desc: 'Created a dedicated global partner ecosystem for Introducing Brokers (IBs), digital media buyers, and financial educators.' },
  { year: '2015', title: 'Multi-Continent Regulatory Expansion', desc: 'Secured tier-1 regulatory licenses across Europe (CBI), Australia (ASIC), Japan (FSA), and South Africa (FSCA).' },
  { year: '2020', title: 'ADGM Middle East & AvaTradeGO', desc: 'Expanded into Abu Dhabi Global Market (ADGM) and launched proprietary mobile and risk-management platforms.' },
  { year: '2026', title: '$300M+ Partner Commissions Paid', desc: 'Surpassed 150,000+ registered partners across 150+ countries with real-time AI Trade, Forex, and Binary IB attribution.' },
];

export default function AboutCompany() {
  return (
    <div className="max-w-5xl mx-auto py-16 px-4 space-y-16">
      <div className="text-center space-y-4">
        <div className="inline-block px-3.5 py-1 rounded-full bg-brand/10 border border-brand/20 text-brand text-xs font-bold uppercase tracking-widest">
          Official Corporate Profile · Est. 2006
        </div>
        <h1 className="text-4xl md:text-5xl font-extrabold">About <span className="text-brand">AvaPartner</span></h1>
        <p className="text-white/60 text-lg max-w-3xl mx-auto">
          The premier global affiliate and Introducing Broker network for the online financial trading industry, backed by the institutional heritage and 9 regulatory licenses of the AvaTrade Group.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <div className="bg-[#0d1421] border border-white/10 p-6 rounded-2xl text-center">
          <div className="text-3xl md:text-4xl font-black text-brand mb-2">$300M+</div>
          <div className="text-xs text-white/50 uppercase tracking-widest font-bold">Paid to Partners</div>
        </div>
        <div className="bg-[#0d1421] border border-white/10 p-6 rounded-2xl text-center">
          <div className="text-3xl md:text-4xl font-black text-white mb-2">150,000+</div>
          <div className="text-xs text-white/50 uppercase tracking-widest font-bold">Active Partners</div>
        </div>
        <div className="bg-[#0d1421] border border-white/10 p-6 rounded-2xl text-center">
          <div className="text-3xl md:text-4xl font-black text-sky-400 mb-2">9</div>
          <div className="text-xs text-white/50 uppercase tracking-widest font-bold">Regulated Jurisdictions</div>
        </div>
        <div className="bg-[#0d1421] border border-white/10 p-6 rounded-2xl text-center">
          <div className="text-3xl md:text-4xl font-black text-amber-400 mb-2">150+</div>
          <div className="text-xs text-white/50 uppercase tracking-widest font-bold">Countries Served</div>
        </div>
      </div>

      <section className="bg-[#0d1421] border border-white/10 rounded-3xl p-8 md:p-12 shadow-2xl space-y-6">
        <h2 className="text-3xl font-bold text-brand">Our Legacy of Financial Excellence</h2>
        <div className="space-y-4 text-white/75 leading-relaxed">
          <p>
            Since 2006, the <strong>AvaTrade Group</strong> — headquartered at Five Lamps Place, Amiens Street, Dublin 1, Ireland — has been a global pioneer in online multi-asset trading. <strong>AvaPartner</strong> was founded as the official partnership division to extend that institutional excellence to digital affiliates, Introducing Brokers (IBs), trading academies, and fintech influencers worldwide.
          </p>
          <p>
            Today, AvaPartner stands as one of the largest and most trusted financial affiliate networks in the world. With over <strong>$300,000,000 paid out in commissions</strong> to more than <strong>150,000 partners globally</strong>, our reputation is built on uncompromising transparency, high conversion rates, and punctual payouts.
          </p>
        </div>
      </section>

      {/* Official Countries & Regulatory Licenses */}
      <section className="space-y-6">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="text-3xl font-bold text-white mb-2">Official Countries &amp; Regulatory Licenses</h2>
          <p className="text-white/60 text-sm">
            AvaPartner promotes licensed brokerage entities regulated across 9 international jurisdictions.
          </p>
        </div>
        <div className="overflow-x-auto rounded-3xl border border-white/10 bg-[#0d1421]">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-white/10 bg-black/30 text-xs uppercase tracking-wider text-white/50">
              <tr>
                <th className="p-4">Country / Jurisdiction</th>
                <th className="p-4">Official Legal Entity</th>
                <th className="p-4">Regulatory Authority</th>
                <th className="p-4">License Number</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-white/80">
              {JURISDICTIONS.map((j, i) => (
                <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                  <td className="p-4 font-bold text-white whitespace-nowrap">
                    <span className="mr-2 text-lg">{j.flag}</span>{j.country}
                  </td>
                  <td className="p-4 text-white/70">{j.entity}</td>
                  <td className="p-4 text-brand font-medium">{j.regulator}</td>
                  <td className="p-4 font-mono text-xs text-emerald-400">{j.license}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Corporate Timeline */}
      <section className="bg-[#0d1421] border border-white/10 rounded-3xl p-8 md:p-12 shadow-2xl space-y-8">
        <h2 className="text-3xl font-bold text-white">Corporate Milestones (2006 – 2026)</h2>
        <div className="space-y-6">
          {MILESTONES.map((m, idx) => (
            <div key={idx} className="flex flex-col sm:flex-row gap-4 sm:items-start border-l-2 border-brand/40 pl-5 relative">
              <div className="px-3 py-1 rounded-full bg-brand text-black font-black text-xs w-fit flex-shrink-0">
                {m.year}
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">{m.title}</h3>
                <p className="text-sm text-white/60 mt-1 leading-relaxed">{m.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-gradient-to-r from-brand/15 via-[#0d1421] to-sky-500/10 border border-brand/25 rounded-3xl p-8 md:p-12 text-center space-y-6">
        <h2 className="text-3xl font-bold text-white">Partner With an Industry Leader</h2>
        <p className="text-white/65 max-w-2xl mx-auto">
          Join 150,000+ global partners promoting a trusted, multi-regulated brokerage across 150+ countries.
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <Link to="/signup" className="btn px-8 py-3.5 font-bold">Become a Partner</Link>
          <Link to="/who-we-are" className="btn bg-white/10 hover:bg-white/20 text-white px-8 py-3.5 font-bold">Meet Our Team</Link>
        </div>
      </section>
    </div>
  );
}
