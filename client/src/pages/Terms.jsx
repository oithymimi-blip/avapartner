import React from 'react';

export default function Terms() {
  return (
    <div className="max-w-4xl mx-auto py-16 px-4">
      <div className="text-center mb-12">
        <h1 className="text-4xl md:text-5xl font-extrabold mb-4">Terms and Conditions</h1>
        <p className="text-white/60 text-lg">Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
      </div>

      <div className="bg-[#0d1421] border border-white/10 rounded-3xl p-8 md:p-12 shadow-2xl prose prose-invert prose-brand max-w-none">
        
        <h2>1. Introduction and Acceptance</h2>
        <p>
          Welcome to the <strong>AvaPartner Affiliate &amp; Introducing Broker Program</strong>. These Terms and Conditions ("Agreement") govern your participation in the partner marketing program operated by <strong>AvaPartner / AVA Trade EU Ltd</strong> ("Company", "we", "us", or "our"), headquartered at Five Lamps Place, Amiens Street, Dublin 1, Ireland. By registering for a partner account at <strong>avapartner.com</strong>, you ("Partner", "Affiliate", "IB", or "you") expressly agree to be bound by the terms outlined herein.
        </p>

        <h2>2. Enrollment in the Affiliate Program</h2>
        <p>
          To enroll, you must submit a complete partner application via our website. We evaluate all applications in good faith and reserve the right to reject any application at our sole discretion. Your website or promotional methods must comply with financial promotions regulations in the jurisdictions you target.
        </p>

        <h2>3. Partner Obligations and Regulatory Marketing Guidelines</h2>
        <p>
          As an official Partner, you agree to promote AvaPartner, AvaTrade, and associated platforms ethically and in strict compliance with regulatory standards (including CBI, ESMA, ASIC, FSA, ADGM, and FSCA rules). You must:
        </p>
        <ul>
          <li>Use only approved marketing materials or compliant educational content.</li>
          <li>Ensure that all claims regarding potential profits or risks are accurate, balanced, and accompanied by mandatory regulatory risk disclosures.</li>
          <li>Not engage in unsolicited commercial email (SPAM) or misleading promises of guaranteed returns.</li>
          <li>Not bid on restricted brand keywords (e.g., "AvaPartner", "AvaTrade") in Pay-Per-Click (PPC) search campaigns without prior written authorization.</li>
          <li>Clearly disclose your affiliate/IB relationship where required by applicable laws.</li>
        </ul>

        <h2>4. Commission Plans and Settlements</h2>
        <p>
          Commissions are awarded based on the structure applicable to your account (CPA, Lifetime Revenue Share, Multi-Stream IB, or Hybrid).
        </p>
        <ul>
          <li><strong>CPA (Cost Per Acquisition):</strong> A CPA commission is triggered when a referred client opens a verified account, deposits the minimum required funds, and meets the minimum trading activity criteria for their country tier.</li>
          <li><strong>Revenue Share &amp; Multi-Stream IB:</strong> Commissions are calculated automatically on net spread, Forex/Gold lot volume, AI Trade performance, and Binary Options turnover, including eligible Level-2 Sub-IB overrides.</li>
          <li><strong>Payments:</strong> Real-time IB rebates credit directly to your partner wallet, and monthly CPA/bonus settlements are processed automatically via Bank Wire, USDT/USDC crypto rails, or trading account transfer.</li>
        </ul>

        <h2>5. Intellectual Property</h2>
        <p>
          We grant you a non-exclusive, non-transferable, revocable license to use our trademarks, logos, and provided marketing materials solely for the purpose of promoting our services under this Agreement. All intellectual property rights remain the exclusive property of AvaPartner and the AvaTrade Group.
        </p>

        <h2>6. Tracking and Attribution</h2>
        <p>
          We provide you with unique referral codes, tracking links, and a real-time partner dashboard. It is your responsibility to ensure your referral links are properly formatted when distributed across your channels.
        </p>

        <h2>7. Termination of Agreement</h2>
        <p>
          This Agreement may be terminated by either party at any time by giving written notice. Upon termination, you must cease using our tracking links and remove brand materials from your properties. We reserve the right to withhold commissions generated through fraudulent traffic, self-referral abuse, or regulatory violations.
        </p>

        <h2>8. Limitation of Liability</h2>
        <p>
          AvaPartner, its parent entities, directors, employees, and affiliates will not be liable for any indirect, special, or consequential damages arising in connection with this Agreement or the affiliate program.
        </p>

        <h2>9. Governing Law &amp; Regulatory Jurisdiction</h2>
        <p>
          This Agreement shall be governed by and construed in accordance with the laws of <strong>Ireland</strong> and the applicable regulatory jurisdiction in which the relevant AvaTrade Group entity operates (CBI Ireland #C53877, ASIC Australia #406684, FSA Japan #1662, ADGM UAE #190018, FSCA South Africa #45984, CySEC Cyprus #347/17, BVI FSC #SIBA/L/13/1049).
        </p>

        <div className="mt-12 pt-8 border-t border-white/10 text-center">
          <p className="text-white/50 text-sm">
            Questions regarding these Terms? Contact our Legal &amp; Partner Compliance Desk at <a href="mailto:compliance@avapartner.com" className="text-brand hover:underline">compliance@avapartner.com</a>.
          </p>
        </div>
      </div>
    </div>
  );
}
