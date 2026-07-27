import React from 'react';

export default function RiskWarning() {
  return (
    <div className="max-w-4xl mx-auto py-16 px-4">
      <div className="text-center mb-12">
        <div className="w-16 h-16 bg-rose-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-rose-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
        </div>
        <h1 className="text-4xl md:text-5xl font-extrabold mb-4">Risk Warning</h1>
        <p className="text-white/60 text-lg">Important regulatory information regarding trading risks.</p>
      </div>

      <div className="bg-[#11161d] border border-rose-500/20 rounded-3xl p-8 md:p-12 shadow-2xl prose prose-invert prose-brand max-w-none">
        
        <div className="bg-rose-500/10 border border-rose-500/30 p-6 rounded-2xl mb-8">
          <p className="text-rose-400 font-bold m-0 text-lg">
            CFDs are complex instruments and come with a high risk of losing money rapidly due to leverage. Between 71% and 89% of retail investor accounts lose money when trading CFDs. You should consider whether you understand how CFDs work and whether you can afford to take the high risk of losing your money.
          </p>
        </div>

        <h2>General Risk Disclosure</h2>
        <p>
          Trading in Forex and Contracts for Difference (CFDs) is highly speculative and involves a significant risk of loss. Such trading is not suitable for all investors. You may lose all your initial capital, and in some circumstances, your losses may exceed your initial investment. Before deciding to trade Forex/CFDs, you should carefully consider your investment objectives, level of experience, and risk appetite.
        </p>

        <h2>Leverage Risk</h2>
        <p>
          The high degree of leverage that is often obtainable in CFD trading can work against you as well as for you. The use of leverage can lead to large losses as well as gains. Even a small market movement can have a proportionately larger impact on the funds you have deposited or will have to deposit: this may work against you as well as for you.
        </p>

        <h2>Market Volatility</h2>
        <p>
          Financial markets may fluctuate rapidly, and the prices of CFDs and Forex instruments are influenced by a wide variety of global events, economic indicators, and market sentiment. During times of high volatility, order execution may be delayed, and slippage can occur, meaning your order may be filled at a different price than requested.
        </p>

        <h2>Affiliate Disclaimer</h2>
        <p>
          AvaPartner (avapartner.marketing) is an affiliate marketing network. The materials and information provided on this site are for marketing and promotional purposes only and should not be construed as investment advice, financial advice, trading advice, or any other sort of advice. 
        </p>
        <p>
          As an affiliate, it is your strict legal obligation to ensure that all marketing materials you distribute contain the appropriate risk warnings mandated by the regulatory bodies in the jurisdictions you are targeting (e.g., ESMA, ASIC, FCA). Failure to display mandatory risk warnings may result in immediate termination of your affiliate account and forfeiture of commissions.
        </p>

        <h2>No Guarantees of Profit</h2>
        <p>
          There are no guarantees of profit or freedom from loss in Forex/CFD trading. You should only trade with money you can afford to lose. Past performance of any trading system or methodology is not necessarily indicative of future results.
        </p>
      </div>
    </div>
  );
}
