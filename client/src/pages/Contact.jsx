import React, { useState } from 'react';

const GLOBAL_OFFICES = [
  {
    city: 'Dublin, Ireland',
    flag: '🇮🇪',
    region: 'GLOBAL & EU HQ',
    address: 'Five Lamps Place, Amiens Street, Dublin 1, D01 E4X0',
    regulator: 'Central Bank of Ireland (C53877)',
    email: 'dublin@avapartner.com',
  },
  {
    city: 'Sydney, Australia',
    flag: '🇦🇺',
    region: 'APAC HQ',
    address: 'Level 13, 2 Park Street, Sydney NSW 2000',
    regulator: 'ASIC (AFSL 406684)',
    email: 'apac@avapartner.com',
  },
  {
    city: 'Tokyo, Japan',
    flag: '🇯🇵',
    region: 'EAST ASIA',
    address: 'Minato-ku, Roppongi Hills Mori Tower, Tokyo 106-6126',
    regulator: 'FSA #1662 / FFAJ #1574',
    email: 'tokyo@avapartner.com',
  },
  {
    city: 'Abu Dhabi, UAE',
    flag: '🇦🇪',
    region: 'MENA & GCC',
    address: 'Al Maryah Island, Abu Dhabi Global Market Square',
    regulator: 'ADGM FSRA (No. 190018)',
    email: 'mena@avapartner.com',
  },
  {
    city: 'Milan, Italy',
    flag: '🇮🇹',
    region: 'WESTERN EUROPE',
    address: 'Via Mike Bongiorno 13, 20124 Milano MI',
    regulator: 'EU MiFID II Branch',
    email: 'eu@avapartner.com',
  },
  {
    city: 'Johannesburg, South Africa',
    flag: '🇿🇦',
    region: 'AFRICA',
    address: 'Nelson Mandela Square, Sandton, Johannesburg 2196',
    regulator: 'FSCA (FSP 45984)',
    email: 'africa@avapartner.com',
  },
  {
    city: 'Limassol, Cyprus',
    flag: '🇨🇾',
    region: 'EEA OPERATIONS',
    address: 'Porto Bello Business Center, Limassol 3042',
    regulator: 'CySEC (No. 347/17)',
    email: 'cyprus@avapartner.com',
  },
  {
    city: 'Mexico City, Mexico',
    flag: '🇲🇽',
    region: 'LATAM',
    address: 'Paseo de la Reforma 296, Juárez, Cuauhtémoc, CDMX',
    regulator: 'LATAM Regional Hub',
    email: 'latam@avapartner.com',
  },
];

export default function Contact() {
  const [submitted, setSubmitted] = useState(false);

  return (
    <div className="max-w-6xl mx-auto py-16 px-4 space-y-16">
      <div className="text-center space-y-4">
        <div className="inline-block px-3.5 py-1 rounded-full bg-brand/10 border border-brand/20 text-brand text-xs font-bold uppercase tracking-widest">
          24/5 Multilingual Partner Desk
        </div>
        <h1 className="text-4xl md:text-5xl font-extrabold">Contact <span className="text-brand">AvaPartner</span></h1>
        <p className="text-white/60 text-lg max-w-2xl mx-auto">
          Connect with our Global Headquarters in Dublin, Ireland or reach out directly to our regional partner offices across 5 continents.
        </p>
      </div>

      <div className="grid lg:grid-cols-5 gap-12">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-[#0d1421] border border-brand/30 p-8 rounded-3xl shadow-xl">
            <div className="inline-block px-3 py-1 rounded-full bg-brand/10 text-brand text-[10px] font-bold uppercase tracking-wider mb-3">
              Official Global Headquarters
            </div>
            <h3 className="text-2xl font-bold mb-6 text-white">🇮🇪 AvaPartner Dublin HQ</h3>
            <div className="space-y-4 text-white/75 text-sm">
              <div className="flex items-start gap-4">
                <svg className="w-5 h-5 text-brand mt-1 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                <div>
                  <p className="font-bold text-white">AVA Trade EU Ltd / AvaPartner</p>
                  <p>Five Lamps Place, Amiens Street</p>
                  <p>Dublin 1, D01 E4X0, Ireland</p>
                  <p className="text-xs text-brand mt-1">Central Bank of Ireland License #C53877</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <svg className="w-5 h-5 text-brand flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                <a href="mailto:partners@avapartner.com" className="hover:text-brand transition-colors font-semibold">partners@avapartner.com</a>
              </div>
              <div className="flex items-center gap-4">
                <svg className="w-5 h-5 text-brand flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                <span>+353 1 513 7860 (Mon–Fri, 24/5 Desk)</span>
              </div>
            </div>
          </div>

          <div className="bg-[#0d1421] border border-white/10 p-8 rounded-3xl shadow-xl space-y-4">
            <h3 className="text-xl font-bold text-white">Direct Department Contacts</h3>
            <ul className="space-y-3 text-sm text-white/65">
              <li className="flex justify-between items-center border-b border-white/5 pb-2">
                <span>CPA &amp; Media Buying</span>
                <a href="mailto:cpa@avapartner.com" className="text-brand hover:underline font-mono text-xs">cpa@avapartner.com</a>
              </li>
              <li className="flex justify-between items-center border-b border-white/5 pb-2">
                <span>Master IB &amp; Institutional</span>
                <a href="mailto:ib@avapartner.com" className="text-brand hover:underline font-mono text-xs">ib@avapartner.com</a>
              </li>
              <li className="flex justify-between items-center border-b border-white/5 pb-2">
                <span>Payouts &amp; Finance</span>
                <a href="mailto:finance@avapartner.com" className="text-brand hover:underline font-mono text-xs">finance@avapartner.com</a>
              </li>
              <li className="flex justify-between items-center">
                <span>Compliance &amp; Legal</span>
                <a href="mailto:compliance@avapartner.com" className="text-brand hover:underline font-mono text-xs">compliance@avapartner.com</a>
              </li>
            </ul>
          </div>
        </div>

        <div className="lg:col-span-3">
          <div className="bg-[#0d1421] border border-white/10 p-8 md:p-12 rounded-3xl shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-brand/5 rounded-full blur-3xl pointer-events-none"></div>
            <h2 className="text-2xl font-bold mb-6 relative z-10">Send Us a Partnership Inquiry</h2>
            
            {submitted ? (
              <div className="p-8 rounded-2xl bg-brand/10 border border-brand/30 text-center space-y-3">
                <div className="text-3xl">✅</div>
                <h3 className="text-xl font-bold text-white">Inquiry Received</h3>
                <p className="text-sm text-white/70">
                  Thank you for contacting AvaPartner. A dedicated regional affiliate manager will respond to your inquiry within 2 business hours.
                </p>
                <button onClick={() => setSubmitted(false)} className="btn mt-2 text-xs px-5 py-2">Send Another Message</button>
              </div>
            ) : (
              <form className="space-y-6 relative z-10" onSubmit={(e) => { e.preventDefault(); setSubmitted(true); }}>
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm text-white/70 font-bold">First Name</label>
                    <input type="text" required className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand/50 transition-colors" placeholder="John" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-white/70 font-bold">Last Name</label>
                    <input type="text" required className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand/50 transition-colors" placeholder="Doe" />
                  </div>
                </div>
                
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm text-white/70 font-bold">Email Address</label>
                    <input type="email" required className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand/50 transition-colors" placeholder="partner@company.com" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-white/70 font-bold">Target Country / Region</label>
                    <input type="text" className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand/50 transition-colors" placeholder="e.g. Ireland, UK, UAE, Australia, Japan" />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm text-white/70 font-bold">Partnership Inquiry Type</label>
                  <select className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand/50 transition-colors appearance-none">
                    <option>CPA Affiliate Partnership (Up to $1,000 CPA)</option>
                    <option>Lifetime Revenue Share / Introducing Broker (IB)</option>
                    <option>Master IB Multi-Tier Network Application</option>
                    <option>Custom Hybrid Deal &amp; Media Buying</option>
                    <option>Technical &amp; API Attribution Support</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm text-white/70 font-bold">Message</label>
                  <textarea rows="4" required className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand/50 transition-colors resize-none" placeholder="Tell us about your traffic sources, primary countries, and partnership goals..."></textarea>
                </div>

                <button type="submit" className="btn w-full py-4 text-lg font-bold bg-brand text-black rounded-xl hover:bg-brand-dark transition-colors shadow-[0_0_15px_rgba(0,223,154,0.3)]">
                  Submit Inquiry to AvaPartner Desk
                </button>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* Global Regional Offices Grid */}
      <section className="space-y-8">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="text-3xl font-bold text-white mb-2">Official Global Offices</h2>
          <p className="text-white/60 text-sm">Reach out to our regulated regional branches across Europe, Asia-Pacific, Middle East, Africa, and the Americas.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {GLOBAL_OFFICES.map((office, idx) => (
            <div key={idx} className="rounded-2xl bg-[#0d1421] border border-white/10 p-5 hover:border-brand/40 transition-colors flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-2xl">{office.flag}</span>
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-brand/10 text-brand px-2.5 py-0.5 rounded-full">
                    {office.region}
                  </span>
                </div>
                <h4 className="font-bold text-white text-base mb-1">{office.city}</h4>
                <p className="text-xs text-white/55 leading-relaxed mb-2">{office.address}</p>
                <p className="text-[11px] text-emerald-400 font-medium">{office.regulator}</p>
              </div>
              <div className="pt-3 border-t border-white/10 text-xs">
                <a href={`mailto:${office.email}`} className="text-white/70 hover:text-brand font-mono transition-colors">{office.email}</a>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
