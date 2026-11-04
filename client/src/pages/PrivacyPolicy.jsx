import React from 'react';

export default function PrivacyPolicy() {
  return (
    <div className="max-w-4xl mx-auto py-16 px-4">
      <div className="text-center mb-12">
        <h1 className="text-4xl md:text-5xl font-extrabold mb-4">Privacy Policy</h1>
        <p className="text-white/60 text-lg">Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
      </div>

      <div className="bg-[#0d1421] border border-white/10 rounded-3xl p-8 md:p-12 shadow-2xl prose prose-invert prose-brand max-w-none">
        <p>
          <strong>AvaPartner</strong> ("we", "us", or "our"), operating as the official partner network of the AvaTrade Group (headquartered at Five Lamps Place, Amiens Street, Dublin 1, Ireland), respects your privacy and is committed to protecting your personal data in accordance with the EU General Data Protection Regulation (GDPR) and international data protection laws. This Privacy Policy informs you about how we look after your personal data when you visit our website (<strong>avapartner.com</strong>) or use our affiliate services.
        </p>

        <h2>1. Important Information and Who We Are</h2>
        <p>
          This Privacy Policy aims to give you information on how AvaPartner collects and processes your personal data through your use of this website and our affiliate tracking network, including any data you may provide when you sign up to our affiliate or Introducing Broker program.
        </p>

        <h2>2. The Data We Collect About You</h2>
        <p>
          We may collect, use, store and transfer different kinds of personal data about you which we have grouped together as follows:
        </p>
        <ul>
          <li><strong>Identity Data:</strong> includes first name, last name, username or similar identifier, country of residence, and KYC verification documents.</li>
          <li><strong>Contact Data:</strong> includes billing address, email address, and telephone numbers.</li>
          <li><strong>Financial Data:</strong> includes bank account, crypto wallet addresses, and payment details required for commission payouts.</li>
          <li><strong>Transaction Data:</strong> includes details about commission settlements to you and referral performance metrics.</li>
          <li><strong>Technical Data:</strong> includes internet protocol (IP) address, login data, browser type and version, time zone setting and location, and platform telemetry.</li>
          <li><strong>Tracking Data:</strong> includes affiliate cookies and attribution parameters used to track referred clients and calculate commissions.</li>
        </ul>

        <h2>3. How We Use Your Personal Data</h2>
        <p>
          We will only use your personal data when the law allows us to. Most commonly, we will use your personal data in the following circumstances:
        </p>
        <ul>
          <li>Where we need to perform the contract we are about to enter into or have entered into with you (i.e., the AvaPartner Affiliate &amp; IB Agreement).</li>
          <li>Where it is necessary for our legitimate interests and your interests and fundamental rights do not override those interests.</li>
          <li>Where we need to comply with a legal or regulatory obligation under CBI, ASIC, FSA, ADGM, FSCA, or CySEC rules.</li>
        </ul>

        <h2>4. Data Security</h2>
        <p>
          We have put in place institutional-grade security measures to prevent your personal data from being accidentally lost, used or accessed in an unauthorised way, altered or disclosed. Access to your personal data is strictly limited to authorized employees, compliance officers, and contractors bound by confidentiality.
        </p>

        <h2>5. Cookies and Tracking</h2>
        <p>
          As an affiliate network, cookie and referral parameter tracking is fundamental to our attribution model. We use first-party cookies to attribute the referrals you send to our regulated brokerage platforms.
        </p>

        <h2>6. Your Legal Rights</h2>
        <p>
          Under GDPR and applicable international data protection laws, you have the right to request access, correction, erasure, restriction, or transfer of your personal data, and the right to withdraw consent at any time.
        </p>

        <div className="mt-12 pt-8 border-t border-white/10 text-center">
          <p className="text-white/50 text-sm">
            For any privacy-related inquiries or to exercise your legal rights, please contact our Data Protection Officer in Dublin at <a href="mailto:privacy@avapartner.com" className="text-brand hover:underline">privacy@avapartner.com</a>.
          </p>
        </div>
      </div>
    </div>
  );
}
