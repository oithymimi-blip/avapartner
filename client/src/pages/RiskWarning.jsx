import React from 'react';

export default function RiskWarning() {
  return (
    <div className="max-w-4xl mx-auto py-16 px-4">
      <div className="text-center mb-12">
        <div className="w-16 h-16 bg-rose-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-rose-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
        </div>
        <h1 className="text-4xl md:text-5xl font-extrabold mb-4">Official Risk Warning &amp; Regulatory Disclosures</h1>
        <p className="text-white/60 text-lg">Important regulatory information regarding leveraged trading risks and global licensing.</p>
      </div>

      <div className="bg-[#0d1421] border border-rose-500/20 rounded-3xl p-8 md:p-12 shadow-2xl prose prose-invert prose-brand max-w-none">
        
        <div className="bg-rose-500/10 border border-rose-500/30 p-6 rounded-2xl mb-8">
          <p className="text-rose-400 font-bold m-0 text-lg">
            CFDs, Forex, and Options are complex instruments and come with a high risk of losing money rapidly due to leverage. Between 71% and 76% of retail investor accounts lose money when trading CFDs. You should consider whether you understand how CFDs work and whether you can afford to take the high risk of losing your money.
          </p>
        </div>

        <h2>Official Regulated Entities</h2>
        <ul>
          <li><strong>European Union (Ireland HQ):</strong> AVA Trade EU Ltd is regulated by the Central Bank of Ireland (No. C53877), Five Lamps Place, Amiens Street, Dublin 1, Ireland.</li>
          <li><strong>Australia:</strong> Ava Capital Markets Australia Pty Ltd is regulated by the ASIC (No. 406684).</li>
          <li><strong>Japan:</strong> Ava Trade Japan K.K. is licensed and regulated in Japan by the Financial Services Agency (License No. 1662) and the Financial Futures Association of Japan (License No. 1574).</li>
          <li><strong>United Arab Emirates (Middle East):</strong> Ava Trade Middle East Ltd is regulated by the Abu Dhabi Global Market (ADGM) Financial Regulatory Services Authority (FRSA) (No. 190018).</li>
          <li><strong>South Africa:</strong> Ava Capital Markets Pty Ltd is regulated by the South African Financial Sector Conduct Authority (FSCA No. 45984).</li>
          <li><strong>Cyprus:</strong> DT Direct Investment Hub Ltd is regulated by the Cyprus Securities and Exchange Commission (No. 347/17).</li>
          <li><strong>British Virgin Islands:</strong> Ava Trade Markets Ltd is regulated by the BVI Financial Services Commission (No. SIBA/L/13/1049).</li>
          <li><strong>Israel:</strong> AvaTrade Ltd is regulated by the Israel Securities Authority (No. 514666577).</li>
        </ul>

        <h2>General Risk Disclosure</h2>
        <p>
          Trading in Forex, Commodities, Cryptocurrencies, and Contracts for Difference (CFDs) is speculative and involves a substantial risk of loss. Before deciding to trade, clients should carefully consider their investment objectives, level of experience, and risk appetite.
        </p>

        <h2>Affiliate &amp; Introducing Broker Disclaimer</h2>
        <p>
          <strong>AvaPartner (avapartner.com)</strong> is the official partner marketing network of the AvaTrade Group. The materials and information provided on this site are for marketing and partnership purposes only and should not be construed as investment advice, financial advice, or trading recommendations.
        </p>
        <p>
          As an authorized AvaPartner affiliate or Introducing Broker, it is your strict legal obligation to ensure that all promotional materials you distribute display the mandatory risk warnings required by the regulatory authorities in the jurisdictions you target (including CBI, ESMA, ASIC, FSA, ADGM, and FSCA).
        </p>
      </div>
    </div>
  );
}
