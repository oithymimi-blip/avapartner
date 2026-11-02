import React from 'react';

export default function AboutCompany() {
  return (
    <div className="max-w-4xl mx-auto py-16 px-4">
      <div className="text-center mb-16">
        <h1 className="text-4xl md:text-5xl font-extrabold mb-4">About Fexova</h1>
        <p className="text-white/60 text-lg max-w-2xl mx-auto">
          The leading affiliate network for the online financial trading industry, backed by the global reputation of Fexova.
        </p>
      </div>

      <div className="space-y-12">
        <section className="bg-[#11161d] border border-white/10 rounded-3xl p-8 md:p-12 shadow-2xl">
          <h2 className="text-3xl font-bold mb-6 text-brand">Our Legacy of Excellence</h2>
          <div className="prose prose-invert max-w-none text-white/70">
            <p>
              Since our inception, Fexova has been a pioneer in the online trading industry, offering clients worldwide an exceptional trading experience. Fexova was created to extend that excellence to digital marketers, introducing brokers, and financial influencers across the globe. 
            </p>
            <p>
              Today, Fexova stands as one of the most successful and trusted affiliate programs in the financial sector. With over $300,000,000 paid out in commissions to over 150,000 partners globally, our track record speaks for itself. We believe that our success is intrinsically tied to the success of our partners.
            </p>
          </div>
        </section>

        <div className="grid md:grid-cols-3 gap-8">
          <div className="bg-black/30 border border-white/5 p-8 rounded-2xl text-center">
            <div className="text-4xl font-black text-white mb-2">$300M+</div>
            <div className="text-sm text-white/50 uppercase tracking-widest font-bold">Paid to Partners</div>
          </div>
          <div className="bg-black/30 border border-white/5 p-8 rounded-2xl text-center">
            <div className="text-4xl font-black text-white mb-2">150,000+</div>
            <div className="text-sm text-white/50 uppercase tracking-widest font-bold">Active Partners</div>
          </div>
          <div className="bg-black/30 border border-white/5 p-8 rounded-2xl text-center">
            <div className="text-4xl font-black text-white mb-2">9</div>
            <div className="text-sm text-white/50 uppercase tracking-widest font-bold">Regulated Jurisdictions</div>
          </div>
        </div>

        <section className="bg-[#11161d] border border-white/10 rounded-3xl p-8 md:p-12 shadow-2xl">
          <h2 className="text-3xl font-bold mb-6 text-brand">Why We Lead the Industry</h2>
          <div className="prose prose-invert max-w-none text-white/70">
            <p>
              At Fexova, we provide more than just a referral link. We provide a comprehensive business infrastructure. When you partner with us, you are promoting a brokerage that is heavily regulated across 5 continents, offering your referrals unparalleled security and trust.
            </p>
            <ul>
              <li><strong>Regulatory Trust:</strong> Fexova is licensed and regulated in major international jurisdictions globally.</li>
              <li><strong>Cutting-Edge Technology:</strong> We invest heavily in our bespoke tracking technology, ensuring that every click and conversion is accurately attributed to you.</li>
              <li><strong>Global Localization:</strong> Our platforms and marketing materials are translated into more than 20 languages, allowing you to target traffic anywhere in the world.</li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}
