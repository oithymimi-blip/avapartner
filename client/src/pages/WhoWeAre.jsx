import React from 'react';

export default function WhoWeAre() {
  return (
    <div className="max-w-4xl mx-auto py-16 px-4">
      <div className="text-center mb-16">
        <h1 className="text-4xl md:text-5xl font-extrabold mb-4">Who We Are</h1>
        <p className="text-white/60 text-lg max-w-2xl mx-auto">
          Meet the dedicated team of professionals driving the world's premier financial affiliate network.
        </p>
      </div>

      <div className="space-y-12">
        <section className="bg-[#11161d] border border-white/10 rounded-3xl p-8 md:p-12 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-brand/5 rounded-full blur-3xl"></div>
          <h2 className="text-3xl font-bold mb-6 text-brand relative z-10">Our People</h2>
          <div className="prose prose-invert max-w-none text-white/70 relative z-10">
            <p>
              AvaPartner is built by a diverse, multi-disciplinary team of digital marketing experts, financial analysts, and technology developers. With headquarters in Dublin, Ireland, and regional offices in Sydney, Tokyo, Milan, and beyond, our team truly understands the nuances of the global market.
            </p>
            <p>
              Our affiliate managers are not just account handlers; they are seasoned marketing strategists. When you join AvaPartner, you are paired with a dedicated manager who speaks your language—both literally and professionally. They will work with you to optimize your campaigns, increase your conversion rates, and maximize your profitability.
            </p>
          </div>
        </section>

        <section className="grid md:grid-cols-2 gap-8">
          <div className="bg-black/30 border border-white/5 p-8 rounded-3xl hover:border-brand/30 transition-colors">
            <div className="w-12 h-12 bg-brand/20 rounded-xl flex items-center justify-center text-brand mb-6">
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
            </div>
            <h3 className="text-xl font-bold mb-3">Partner-First Mentality</h3>
            <p className="text-white/60 text-sm leading-relaxed">
              We operate on a simple principle: if you don't succeed, we don't succeed. Every tool we build and every material we design is created with the sole purpose of making your job easier and more lucrative.
            </p>
          </div>
          <div className="bg-black/30 border border-white/5 p-8 rounded-3xl hover:border-brand/30 transition-colors">
            <div className="w-12 h-12 bg-brand/20 rounded-xl flex items-center justify-center text-brand mb-6">
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
            </div>
            <h3 className="text-xl font-bold mb-3">Uncompromising Integrity</h3>
            <p className="text-white/60 text-sm leading-relaxed">
              In an industry where trust is everything, we stand out by offering full transparency. From our real-time reporting dashboards to our guaranteed on-time payments, we hold ourselves to the highest ethical standards.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
