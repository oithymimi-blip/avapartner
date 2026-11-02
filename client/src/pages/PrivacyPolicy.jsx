import React from 'react';

export default function PrivacyPolicy() {
  return (
    <div className="max-w-4xl mx-auto py-16 px-4">
      <div className="text-center mb-12">
        <h1 className="text-4xl md:text-5xl font-extrabold mb-4">Privacy Policy</h1>
        <p className="text-white/60 text-lg">Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
      </div>

      <div className="bg-[#11161d] border border-white/10 rounded-3xl p-8 md:p-12 shadow-2xl prose prose-invert prose-brand max-w-none">
        <p>
          Fexova ("we", "us", or "our") respects your privacy and is committed to protecting your personal data. This Privacy Policy informs you about how we look after your personal data when you visit our website (<strong>fexova.com</strong>) or use our affiliate services, and tells you about your privacy rights and how the law protects you.
        </p>

        <h2>1. Important Information and Who We Are</h2>
        <p>
          This Privacy Policy aims to give you information on how Fexova collects and processes your personal data through your use of this website and our affiliate tracking network, including any data you may provide when you sign up to our affiliate program. It is important that you read this Privacy Policy together with any other privacy notice or fair processing notice we may provide on specific occasions.
        </p>

        <h2>2. The Data We Collect About You</h2>
        <p>
          We may collect, use, store and transfer different kinds of personal data about you which we have grouped together as follows:
        </p>
        <ul>
          <li><strong>Identity Data:</strong> includes first name, last name, username or similar identifier, and title.</li>
          <li><strong>Contact Data:</strong> includes billing address, email address, and telephone numbers.</li>
          <li><strong>Financial Data:</strong> includes bank account and payment card details required for commission payouts.</li>
          <li><strong>Transaction Data:</strong> includes details about payments to you and other details of products and services you have purchased from or promoted for us.</li>
          <li><strong>Technical Data:</strong> includes internet protocol (IP) address, your login data, browser type and version, time zone setting and location, browser plug-in types and versions, operating system and platform.</li>
          <li><strong>Tracking Data:</strong> includes cookies and tracking pixels used to attribute referrals and calculate affiliate commissions.</li>
        </ul>

        <h2>3. How We Use Your Personal Data</h2>
        <p>
          We will only use your personal data when the law allows us to. Most commonly, we will use your personal data in the following circumstances:
        </p>
        <ul>
          <li>Where we need to perform the contract we are about to enter into or have entered into with you (i.e., the Affiliate Agreement).</li>
          <li>Where it is necessary for our legitimate interests (or those of a third party) and your interests and fundamental rights do not override those interests.</li>
          <li>Where we need to comply with a legal or regulatory obligation.</li>
        </ul>

        <h2>4. Data Security</h2>
        <p>
          We have put in place appropriate security measures to prevent your personal data from being accidentally lost, used or accessed in an unauthorised way, altered or disclosed. In addition, we limit access to your personal data to those employees, agents, contractors and other third parties who have a business need to know. They will only process your personal data on our instructions and they are subject to a duty of confidentiality.
        </p>

        <h2>5. Cookies and Tracking</h2>
        <p>
          As an affiliate network, cookie tracking is fundamental to our business model. We use cookies to track the referrals you send to our brokerage platforms. You can set your browser to refuse all or some browser cookies, or to alert you when websites set or access cookies. If you disable or refuse cookies, please note that some parts of this website may become inaccessible or not function properly, and we may not be able to accurately track your referrals or pay your commissions.
        </p>

        <h2>6. Your Legal Rights</h2>
        <p>
          Under certain circumstances, you have rights under data protection laws in relation to your personal data, including the right to:
        </p>
        <ul>
          <li>Request access to your personal data.</li>
          <li>Request correction of your personal data.</li>
          <li>Request erasure of your personal data.</li>
          <li>Object to processing of your personal data.</li>
          <li>Request restriction of processing your personal data.</li>
          <li>Request transfer of your personal data.</li>
          <li>Right to withdraw consent.</li>
        </ul>

        <div className="mt-12 pt-8 border-t border-white/10 text-center">
          <p className="text-white/50 text-sm">
            For any privacy-related inquiries or to exercise your legal rights, please contact our Data Protection Officer at <a href="mailto:privacy@fexova.com" className="text-brand hover:underline">privacy@fexova.com</a>.
          </p>
        </div>
      </div>
    </div>
  );
}
