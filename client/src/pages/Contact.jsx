import React from 'react';

export default function Contact() {
  return (
    <div className="max-w-6xl mx-auto py-16 px-4">
      <div className="text-center mb-16">
        <h1 className="text-4xl md:text-5xl font-extrabold mb-4">Contact Us</h1>
        <p className="text-white/60 text-lg max-w-2xl mx-auto">
          Our global support team and dedicated affiliate managers are here to assist you 24/5. Get in touch with us today.
        </p>
      </div>

      <div className="grid lg:grid-cols-5 gap-12">
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-[#11161d] border border-white/10 p-8 rounded-3xl shadow-xl">
            <h3 className="text-xl font-bold mb-6 text-brand">Global Headquarters</h3>
            <div className="space-y-4 text-white/70">
              <div className="flex items-start gap-4">
                <svg className="w-6 h-6 text-white/40 mt-1 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                <div>
                  <p className="font-bold text-white">Fexova Headquarters</p>
                  <p>Financial Center Tower 1</p>
                  <p>London, EC2N 2DB, United Kingdom</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <svg className="w-6 h-6 text-white/40 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                <a href="mailto:partners@fexova.com" className="hover:text-brand transition-colors">partners@fexova.com</a>
              </div>
            </div>
          </div>

          <div className="bg-[#11161d] border border-white/10 p-8 rounded-3xl shadow-xl">
            <h3 className="text-xl font-bold mb-6 text-white">Regional Offices</h3>
            <ul className="space-y-4 text-white/60">
              <li className="flex justify-between items-center border-b border-white/5 pb-2">
                <span>Sydney, Australia</span>
                <span className="text-xs uppercase tracking-wider bg-white/5 px-2 py-1 rounded">APAC</span>
              </li>
              <li className="flex justify-between items-center border-b border-white/5 pb-2">
                <span>Tokyo, Japan</span>
                <span className="text-xs uppercase tracking-wider bg-white/5 px-2 py-1 rounded">ASIA</span>
              </li>
              <li className="flex justify-between items-center border-b border-white/5 pb-2">
                <span>Milan, Italy</span>
                <span className="text-xs uppercase tracking-wider bg-white/5 px-2 py-1 rounded">EU</span>
              </li>
              <li className="flex justify-between items-center">
                <span>Abu Dhabi, UAE</span>
                <span className="text-xs uppercase tracking-wider bg-white/5 px-2 py-1 rounded">MENA</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="lg:col-span-3">
          <div className="bg-[#11161d] border border-white/10 p-8 md:p-12 rounded-3xl shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-brand/5 rounded-full blur-3xl pointer-events-none"></div>
            <h2 className="text-2xl font-bold mb-6 relative z-10">Send Us a Message</h2>
            
            <form className="space-y-6 relative z-10" onSubmit={(e) => e.preventDefault()}>
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm text-white/70 font-bold">First Name</label>
                  <input type="text" className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand/50 transition-colors" placeholder="John" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-white/70 font-bold">Last Name</label>
                  <input type="text" className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand/50 transition-colors" placeholder="Doe" />
                </div>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm text-white/70 font-bold">Email Address</label>
                <input type="email" className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand/50 transition-colors" placeholder="john@example.com" />
              </div>

              <div className="space-y-2">
                <label className="text-sm text-white/70 font-bold">Inquiry Type</label>
                <select className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand/50 transition-colors appearance-none">
                  <option>General Partnership Inquiry</option>
                  <option>CPA / RevShare Deals</option>
                  <option>Master IB Program</option>
                  <option>Technical Support</option>
                  <option>Marketing Materials</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm text-white/70 font-bold">Message</label>
                <textarea rows="5" className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand/50 transition-colors resize-none" placeholder="How can we help you?"></textarea>
              </div>

              <button type="button" className="btn w-full py-4 text-lg font-bold bg-brand text-black rounded-xl hover:bg-brand-dark transition-colors shadow-[0_0_15px_rgba(0,223,154,0.3)]">
                Send Message
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
