import React, { useState } from 'react';
import { Link } from 'react-router-dom';

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState(0);

  const faqs = [
    {
      question: "What is the AvaPartner Affiliate Program?",
      answer: "The AvaPartner Affiliate Program (avapartner.com) is the official global partnership network of the AvaTrade Group (est. 2006 in Dublin, Ireland). We empower digital marketers, Introducing Brokers (IBs), trading academies, and financial influencers to earn high CPA, RevShare, and Master IB commissions by referring clients to our globally regulated trading platforms."
    },
    {
      question: "Which countries and regulatory licenses does AvaPartner cover?",
      answer: "AvaTrade Group is licensed across 9 official jurisdictions: Ireland (Central Bank of Ireland #C53877), Australia (ASIC #406684), Japan (FSA #1662 & FFAJ #1574), UAE / Abu Dhabi (ADGM FSRA #190018), South Africa (FSCA #45984), Cyprus (CySEC #347/17), British Virgin Islands (BVI FSC #SIBA/L/13/1049), Israel (ISA #514666577), and Poland (KNF). Partners can refer traffic from over 150+ supported countries."
    },
    {
      question: "How much does it cost to join AvaPartner?",
      answer: "Joining the AvaPartner Affiliate Program is 100% free. There are no setup fees, hidden charges, or monthly subscriptions. Simply register, access your unique tracking link in the dashboard, and start earning."
    },
    {
      question: "What commission structures are available?",
      answer: "We offer flexible, tailor-made commission plans: CPA (up to $1,000 per qualified trader), Lifetime Revenue Share (up to 50% of net spread & multi-stream IB rebates across AI Trade, Forex, and Binary), Hybrid plans, and Multi-Tier Master IB sub-affiliate overrides."
    },
    {
      question: "When and how do I get paid?",
      answer: "IB commissions are credited in real time to your partner wallet, and monthly CPA/bonus settlements are paid automatically with zero delays. You can withdraw via USDT/USDC (BEP20/TRC20), international bank wire transfer, or directly to your trading account."
    },
    {
      question: "What marketing materials do you provide?",
      answer: "We provide a comprehensive suite of high-converting marketing assets in 20+ languages, including localized landing pages, HTML5 banners, economic widgets, email templates, and educational videos — all accessible with your embedded referral code."
    },
    {
      question: "Can I promote assets other than Forex?",
      answer: "Yes! AvaPartner lets you promote over 1,250+ instruments including 60+ Forex pairs, global stocks, indices, commodities, precious metals, cryptocurrencies, ETFs, vanilla options, and automated AI Trade strategies."
    },
    {
      question: "Do I get a dedicated Affiliate Manager?",
      answer: "Yes. Every partner is assigned a dedicated, native-speaking AvaPartner Affiliate Manager from one of our 8 global offices (Dublin, Sydney, Tokyo, Abu Dhabi, Milan, Limassol, Johannesburg, or Mexico City) to help optimize conversions and negotiate custom tier upgrades."
    }
  ];

  return (
    <div className="max-w-4xl mx-auto py-16 px-4">
      <div className="text-center mb-12">
        <div className="inline-block px-3.5 py-1 bg-brand/10 border border-brand/20 text-brand text-xs font-bold uppercase tracking-widest rounded-full mb-4"> AvaPartner Support Center</div>
        <h1 className="text-4xl md:text-5xl font-extrabold mb-4">Frequently Asked Questions</h1>
        <p className="text-white/60 text-lg">Find answers to the most common questions about the official AvaPartner network.</p>
      </div>

      <div className="space-y-4">
        {faqs.map((faq, idx) => (
          <div 
            key={idx} 
            className={`border border-white/10 rounded-2xl overflow-hidden transition-all duration-300 ${openIndex === idx ? 'bg-white/5 border-brand/30 shadow-[0_0_15px_rgba(0,223,154,0.1)]' : 'bg-[#0d1421] hover:border-white/20'}`}
          >
            <button 
              className="w-full text-left px-6 py-5 flex items-center justify-between focus:outline-none"
              onClick={() => setOpenIndex(openIndex === idx ? -1 : idx)}
            >
              <span className="font-bold text-lg text-white/90">{faq.question}</span>
              <span className={`w-8 h-8 rounded-full flex items-center justify-center transition-transform duration-300 flex-shrink-0 ml-3 ${openIndex === idx ? 'bg-brand text-black rotate-180' : 'bg-white/5 text-white/50'}`}>
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
              </span>
            </button>
            
            <div 
              className={`px-6 overflow-hidden transition-all duration-300 ease-in-out ${openIndex === idx ? 'max-h-96 pb-6 opacity-100' : 'max-h-0 opacity-0'}`}
            >
              <p className="text-white/65 leading-relaxed pt-2 border-t border-white/5">{faq.answer}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-16 text-center bg-gradient-to-r from-[#0d1421] to-[#070b12] border border-white/10 p-8 rounded-3xl">
        <h3 className="text-2xl font-bold mb-3">Still have questions?</h3>
        <p className="text-white/60 mb-6">Our dedicated support team and regional affiliate managers are available 24/5 to assist you.</p>
        <Link to="/contact" className="btn px-8 py-3 bg-brand text-black font-bold rounded-full hover:bg-brand-dark transition-colors">
          Contact AvaPartner Support
        </Link>
      </div>
    </div>
  );
}
