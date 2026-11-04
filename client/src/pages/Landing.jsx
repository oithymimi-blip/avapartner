import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../store'

const OFFICIAL_REGULATIONS = [
  {
    country: 'Ireland (Global & EU HQ)',
    flag: '🇮🇪',
    authority: 'Central Bank of Ireland (CBI)',
    entity: 'AVA Trade EU Ltd',
    license: 'Ref No. C53877',
    region: 'European Union (MiFID II)',
  },
  {
    country: 'Australia',
    flag: '🇦🇺',
    authority: 'ASIC',
    entity: 'Ava Capital Markets Australia Pty Ltd',
    license: 'AFSL No. 406684',
    region: 'Asia-Pacific (APAC)',
  },
  {
    country: 'Japan',
    flag: '🇯🇵',
    authority: 'FSA & FFAJ',
    entity: 'Ava Trade Japan K.K.',
    license: 'FSA #1662 / FFAJ #1574',
    region: 'East Asia',
  },
  {
    country: 'United Arab Emirates',
    flag: '🇦🇪',
    authority: 'ADGM Financial Services (FSRA)',
    entity: 'Ava Trade Middle East Ltd',
    license: 'FSP No. 190018',
    region: 'Middle East & North Africa',
  },
  {
    country: 'South Africa',
    flag: '🇿🇦',
    authority: 'FSCA',
    entity: 'Ava Capital Markets Pty Ltd',
    license: 'FSP No. 45984',
    region: 'Africa Region',
  },
  {
    country: 'Cyprus (EU)',
    flag: '🇨🇾',
    authority: 'CySEC',
    entity: 'DT Direct Investment Hub Ltd',
    license: 'License No. 347/17',
    region: 'European Economic Area',
  },
  {
    country: 'British Virgin Islands',
    flag: '🇻🇬',
    authority: 'BVI Financial Services Commission',
    entity: 'Ava Trade Markets Ltd',
    license: 'No. SIBA/L/13/1049',
    region: 'International Global',
  },
  {
    country: 'Israel',
    flag: '🇮🇱',
    authority: 'Israel Securities Authority (ISA)',
    entity: 'AvaTrade Ltd',
    license: 'No. 514666577',
    region: 'Middle East Tech Hub',
  },
  {
    country: 'Poland',
    flag: '🇵🇱',
    authority: 'KNF (Polish Financial Supervision)',
    entity: 'AVA Trade EU Ltd (Branch)',
    license: 'EU Passported Supervision',
    region: 'Central & Eastern Europe',
  },
]

const EXECUTIVE_HIGHLIGHTS = [
  {
    name: 'Dáire Ferguson',
    role: 'Chief Executive Officer',
    location: '🇮🇪 Dublin, Ireland',
    bio: 'Spearheading global strategy, regulatory expansion, and institutional partnerships across 5 continents since 2008.',
    initials: 'DF',
  },
  {
    name: 'Victoria Sterling',
    role: 'VP of Global Partnerships',
    location: '🇬🇧 London & 🇮🇪 Dublin',
    bio: 'Architect of the AvaPartner CPA & Master IB network, overseeing $300M+ in partner commission distributions.',
    initials: 'VS',
  },
  {
    name: 'Kenji Takahashi',
    role: 'Managing Director, APAC',
    location: '🇯🇵 Tokyo & 🇦🇺 Sydney',
    bio: 'Leading institutional IB relations and localized fintech growth across Japan, Australia, and Southeast Asia.',
    initials: 'KT',
  },
  {
    name: 'Tariq Al-Mansoor',
    role: 'Regional Director, MENA & GCC',
    location: '🇦🇪 Abu Dhabi, UAE',
    bio: 'Driving high-net-worth Introducing Broker networks and ADGM-compliant partnership operations across the Gulf.',
    initials: 'TM',
  },
]

export default function Landing() {
  const { token } = useAuth()

  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [showInstallModal, setShowInstallModal] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)
  const [isInstalling, setIsInstalling] = useState(false)

  useEffect(() => {
    const checkInstalled = () => {
      if (
        window.matchMedia('(display-mode: standalone)').matches ||
        window.matchMedia('(display-mode: minimal-ui)').matches ||
        window.navigator.standalone === true ||
        document.referrer.includes('android-app://') ||
        window.isAppInstalled === true
      ) {
        setIsInstalled(true)
      }
    }
    checkInstalled()

    if (window.deferredInstallPrompt) {
      setDeferredPrompt(window.deferredInstallPrompt)
    }

    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault()
      window.deferredInstallPrompt = e
      setDeferredPrompt(e)
    }

    const handleAppInstalled = () => {
      setIsInstalled(true)
      setIsInstalling(false)
      setShowInstallModal(false)
      setDeferredPrompt(null)
      window.deferredInstallPrompt = null
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    window.onPwaPromptReady = (e) => {
      setDeferredPrompt(e)
    }
    window.onPwaInstalled = handleAppInstalled

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  const executeAutoInstall = async () => {
    setIsInstalling(true)
    const promptEvent = deferredPrompt || window.deferredInstallPrompt

    if (promptEvent) {
      try {
        await promptEvent.prompt()
        const choice = await promptEvent.userChoice
        if (choice && choice.outcome === 'accepted') {
          setIsInstalled(true)
          setShowInstallModal(false)
        }
        setDeferredPrompt(null)
        window.deferredInstallPrompt = null
        setIsInstalling(false)
        return
      } catch (err) {
        console.warn('Native install prompt error:', err)
      }
    }

    setIsInstalling(false)
    setShowInstallModal(true)
  }

  const handleInstallClick = () => {
    if (isInstalled) {
      alert('AvaPartner Mobile App is already installed on your device!')
      return
    }
    executeAutoInstall()
  }

  return (
    <div className="flex flex-col gap-20 md:gap-28 py-10 overflow-x-hidden w-full max-w-full">
      {/* Hero Section */}
      <section className="relative grid md:grid-cols-2 gap-12 items-center min-h-[70vh] w-full max-w-full overflow-x-hidden">
        {/* Background Decorative Elements */}
        <div className="absolute top-0 right-0 -mr-32 -mt-32 w-[50rem] h-[50rem] bg-brand/10 rounded-full blur-[120px] pointer-events-none opacity-60"></div>
        <div className="absolute bottom-0 left-0 -ml-32 -mb-32 w-[40rem] h-[40rem] bg-sky-500/10 rounded-full blur-[100px] pointer-events-none opacity-60"></div>

        <div className="space-y-7 relative z-10">
          <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full bg-brand/10 border border-brand/25 text-brand text-xs font-bold uppercase tracking-widest shadow-[0_0_15px_rgba(0,223,154,0.15)]">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-brand"></span>
            </span>
            🇮🇪 Official AvaPartner Global Network · Est. 2006
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold leading-[1.06] tracking-tight break-words hyphens-auto w-full">
            The Official <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand via-emerald-300 to-sky-400 inline-block">AvaPartner</span> Global Affiliate Network
          </h1>
          <p className="text-lg sm:text-xl text-white/70 leading-relaxed max-w-xl">
            Welcome to the official partner marketing portal for <a href="https://www.avapartner.com/" target="_blank" rel="noopener noreferrer" className="text-white hover:text-brand underline decoration-brand/50 underline-offset-4 font-semibold transition-colors">AvaPartner</a> &amp; <a href="https://www.avatrade.com/" target="_blank" rel="noopener noreferrer" className="text-white hover:text-brand underline decoration-brand/50 underline-offset-4 font-semibold transition-colors">AvaTrade</a>. Join over <strong>150,000+ partners</strong> across <strong>150+ countries</strong> and earn industry-leading CPA, RevShare, and Master IB commissions backed by 9 global regulatory licenses.
          </p>
          <div className="flex flex-col sm:flex-row flex-wrap gap-4 pt-2">
            {!token ? (
              <>
                <Link to="/signup" className="btn px-8 sm:px-10 py-4 text-lg font-bold shadow-[0_0_25px_rgba(0,223,154,0.4)] hover:shadow-[0_0_40px_rgba(0,223,154,0.6)] hover:-translate-y-1 transition-all duration-300 w-full sm:w-auto text-center">
                  Become A Partner
                </Link>
                <Link to="/login" className="btn bg-white/5 hover:bg-white/10 border border-white/10 text-white px-8 sm:px-10 py-4 text-lg font-bold backdrop-blur-md hover:-translate-y-1 transition-all duration-300 w-full sm:w-auto text-center">
                  Partner Login
                </Link>
              </>
            ) : (
              <Link to="/dashboard" className="btn px-8 sm:px-10 py-4 text-lg font-bold shadow-[0_0_25px_rgba(0,223,154,0.4)] hover:shadow-[0_0_40px_rgba(0,223,154,0.6)] hover:-translate-y-1 transition-all duration-300 w-full sm:w-auto text-center">
                Go to Dashboard
              </Link>
            )}
            <button
              onClick={handleInstallClick}
              className="btn bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white px-8 sm:px-10 py-4 text-lg font-bold shadow-[0_0_25px_rgba(14,165,233,0.3)] hover:shadow-[0_0_40px_rgba(14,165,233,0.5)] hover:-translate-y-1 transition-all duration-300 w-full sm:w-auto text-center flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                <line x1="12" y1="18" x2="12.01" y2="18" />
              </svg>
              {isInstalled ? 'App Installed' : 'Install Mobile App'}
            </button>
          </div>
        </div>

        <div className="relative z-10 w-full max-w-md mx-auto md:max-w-none perspective-1000">
          {/* Institutional Partner Card UI Showcase */}
          <div className="relative rounded-3xl bg-gradient-to-b from-[#0d1522] to-[#080d16] border border-white/10 p-5 sm:p-8 shadow-2xl backdrop-blur-xl transform transition-all hover:scale-[1.02] duration-500">
            <div className="absolute top-0 right-12 w-40 h-1.5 bg-gradient-to-r from-brand via-emerald-400 to-sky-400 rounded-b-full shadow-[0_0_20px_rgba(0,223,154,0.6)]"></div>
            
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-0 mb-8">
              <div>
                <p className="text-xs sm:text-sm text-white/50 font-mono mb-1 uppercase tracking-wider">Total Partner Payouts</p>
                <h3 className="text-3xl sm:text-4xl font-black font-mono tracking-tighter text-white">$314,845,900+</h3>
                <p className="text-[11px] text-brand font-semibold mt-1">✓ Verified On-Time Monthly Settlements</p>
              </div>
              <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-2xl bg-brand/10 flex items-center justify-center border border-brand/25 shadow-[0_0_15px_rgba(0,223,154,0.2)] flex-shrink-0">
                <svg className="w-6 h-6 sm:w-8 sm:h-8 text-brand" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline>
                </svg>
              </div>
            </div>
            
            <div className="space-y-4">
              <div className="group flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-brand/30 transition-all cursor-pointer">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-brand/15 flex items-center justify-center text-brand group-hover:scale-110 transition-transform">
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                  </div>
                  <div>
                    <p className="text-base font-bold text-white">CPA Affiliate Program</p>
                    <p className="text-xs text-white/50 mt-0.5">Tier-1 Country Conversion</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-base font-black text-brand">Up to $1,000</p>
                  <p className="text-[10px] text-white/40">Per Qualified Trader</p>
                </div>
              </div>

              <div className="group flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-brand/30 transition-all cursor-pointer">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-sky-500/20 flex items-center justify-center text-sky-400 group-hover:scale-110 transition-transform">
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"></path><path d="M12 18V6"></path></svg>
                  </div>
                  <div>
                    <p className="text-base font-bold text-white">Lifetime RevShare &amp; IB</p>
                    <p className="text-xs text-white/50 mt-0.5">Ongoing Spread Rebates</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-base font-black text-sky-400">Up to 50%</p>
                  <p className="text-[10px] text-white/40">+ Multi-Tier Sub-IB</p>
                </div>
              </div>
            </div>
            
            <div className="mt-7 pt-6 border-t border-white/10">
              <div className="flex justify-between text-xs text-white/50 mb-3 font-mono uppercase">
                <span>Official Regulated Footprint</span>
                <span className="text-brand font-bold">9 Jurisdictions · 150+ Countries</span>
              </div>
              <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-brand via-emerald-400 to-sky-500 w-[92%] rounded-full animate-pulse shadow-[0_0_10px_rgba(0,223,154,0.5)]"></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Institutional Metrics Strip */}
      <section className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { value: '$300M+', label: 'Paid to Partners', sub: 'Zero missed payouts since 2006' },
          { value: '150,000+', label: 'Registered Partners', sub: 'Affiliates, IBs & Institutions' },
          { value: '9', label: 'Regulatory Licenses', sub: 'CBI, ASIC, FSA, ADGM, FSCA & more' },
          { value: '150+', label: 'Official Countries', sub: 'Localized in 20+ languages' },
          { value: '1,250+', label: 'Tradable Instruments', sub: 'Forex, Stocks, Crypto, Commodities' },
        ].map((stat, i) => (
          <div key={i} className="rounded-2xl bg-[#0d1421] border border-white/10 p-5 text-center hover:border-brand/40 transition-colors">
            <div className="text-2xl sm:text-3xl font-black text-brand mb-1">{stat.value}</div>
            <div className="text-xs font-bold text-white uppercase tracking-wider">{stat.label}</div>
            <div className="text-[11px] text-white/45 mt-1">{stat.sub}</div>
          </div>
        ))}
      </section>

      {/* Official Countries & Global Regulation Section */}
      <section className="space-y-10">
        <div className="text-center max-w-4xl mx-auto space-y-4">
          <div className="inline-block px-3.5 py-1 rounded-full bg-brand/10 border border-brand/20 text-brand text-xs font-bold uppercase tracking-widest">
            Official Jurisdictions &amp; Licensing
          </div>
          <h2 className="text-3xl md:text-5xl font-bold leading-tight">
            Promote a Globally Regulated Brokerage Across <span className="text-brand">9 Official Jurisdictions</span>
          </h2>
          <p className="text-lg text-white/60 leading-relaxed">
            As an official AvaPartner representative, you promote <strong>AvaTrade</strong> — a powerhouse international brokerage headquartered in <strong>Dublin, Ireland</strong> and licensed by the world's most stringent financial authorities across 5 continents.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {OFFICIAL_REGULATIONS.map((reg, idx) => (
            <div key={idx} className="rounded-2xl bg-gradient-to-b from-[#0d1522] to-[#080d16] border border-white/10 p-6 hover:border-brand/40 transition-all duration-300 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-2 mb-4">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{reg.flag}</span>
                    <div>
                      <h3 className="font-bold text-white text-base leading-snug">{reg.country}</h3>
                      <span className="text-[11px] text-brand font-semibold">{reg.region}</span>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-white/75 font-semibold mb-1">{reg.authority}</p>
                <p className="text-xs text-white/50 mb-4">{reg.entity}</p>
              </div>
              <div className="pt-3 border-t border-white/10 flex items-center justify-between text-[11px]">
                <span className="text-white/40 uppercase tracking-wider">Official License</span>
                <span className="font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                  {reg.license}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Commission Plans Grid Section */}
      <section className="relative">
        <div className="absolute inset-0 bg-brand/5 blur-3xl rounded-[100px] pointer-events-none -z-10"></div>
        <div className="text-center space-y-4 max-w-3xl mx-auto mb-16">
          <h2 className="text-4xl font-bold">Tailor-Made <span className="text-brand">Commission Plans</span></h2>
          <p className="text-lg text-white/60">Your success is our success. AvaPartner is here to help you every step of the way. Choose a flexible commission structure tailored to your traffic profile and growth goals.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          <div className="p-6 sm:p-10 rounded-3xl bg-gradient-to-b from-[#0d1522] to-[#080d16] border border-white/10 hover:border-brand/40 hover:-translate-y-2 transition-all duration-300 relative group overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-brand/30 group-hover:bg-brand transition-colors"></div>
            <div className="w-16 h-16 rounded-2xl bg-brand/10 flex items-center justify-center mb-8 group-hover:scale-110 transition-transform">
              <span className="text-2xl font-black text-brand">CPA</span>
            </div>
            <h3 className="text-2xl font-bold mb-4">Cost Per Acquisition</h3>
            <p className="text-base text-white/60 leading-relaxed mb-6">
              Earn up to <strong>$1,000 per qualified trader</strong>. Ideal for digital marketers, media buyers, and SEO affiliates driving high-converting traffic from Tier-1 &amp; Tier-2 countries.
            </p>
            <Link to="/cpa" className="text-brand font-bold text-sm hover:underline inline-flex items-center gap-1">
              Explore CPA Tiers &rarr;
            </Link>
          </div>

          <div className="p-6 sm:p-10 rounded-3xl bg-gradient-to-b from-[#0d1522] to-[#080d16] border border-white/10 hover:border-sky-500/40 hover:-translate-y-2 transition-all duration-300 relative group overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-sky-500/30 group-hover:bg-sky-400 transition-colors"></div>
            <div className="w-16 h-16 rounded-2xl bg-sky-500/10 flex items-center justify-center mb-8 group-hover:scale-110 transition-transform">
              <svg className="w-8 h-8 text-sky-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
            </div>
            <h3 className="text-2xl font-bold mb-4">Revenue Share (IB)</h3>
            <p className="text-base text-white/60 leading-relaxed mb-6">
              Earn up to <strong>50% lifetime revenue share</strong> and continuous spread rebates across Forex, Gold, AI Trade, and Binary turnover for the life of every client account.
            </p>
            <Link to="/revshare" className="text-sky-400 font-bold text-sm hover:underline inline-flex items-center gap-1">
              Explore RevShare &rarr;
            </Link>
          </div>

          <div className="p-6 sm:p-10 rounded-3xl bg-gradient-to-b from-[#0d1522] to-[#080d16] border border-white/10 hover:border-amber-500/40 hover:-translate-y-2 transition-all duration-300 relative group overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-amber-500/30 group-hover:bg-amber-400 transition-colors"></div>
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center mb-8 group-hover:scale-110 transition-transform">
              <svg className="w-8 h-8 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
            </div>
            <h3 className="text-2xl font-bold mb-4">Hybrid &amp; Master IB</h3>
            <p className="text-base text-white/60 leading-relaxed mb-6">
              Combine upfront CPA payouts with ongoing lifetime RevShare, plus earn multi-tier Sub-IB overrides when you recruit other Introducing Brokers under your network.
            </p>
            <Link to="/master-ib" className="text-amber-400 font-bold text-sm hover:underline inline-flex items-center gap-1">
              Explore Master IB &rarr;
            </Link>
          </div>
        </div>
      </section>

      {/* Two Column Feature Sets */}
      <section className="space-y-24">
        {/* Grow Your Business */}
        <div className="grid md:grid-cols-2 gap-16 items-center">
          <div className="order-2 md:order-1 relative">
            <div className="absolute inset-0 bg-brand/10 blur-3xl rounded-full"></div>
            <div className="relative bg-[#0d1421] border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl">
              <div className="space-y-5">
                {[
                  { title: "High-converting localized marketing creatives in 20+ languages", icon: "megaphone" },
                  { title: "Real-time attribution & multi-tier IB tracking dashboard", icon: "activity" },
                  { title: "Automated instant wallet rebates & guaranteed monthly settlements", icon: "shield" },
                  { title: "Dedicated native-speaking AvaPartner Affiliate Manager", icon: "globe" }
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-4 bg-black/40 p-4 rounded-2xl border border-white/5">
                    <div className="w-12 h-12 rounded-xl bg-brand/10 flex items-center justify-center text-brand flex-shrink-0">
                      {item.icon === 'megaphone' && <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 11l18-5v12L3 14v-3z"></path><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"></path></svg>}
                      {item.icon === 'activity' && <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>}
                      {item.icon === 'shield' && <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>}
                      {item.icon === 'globe' && <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>}
                    </div>
                    <h4 className="text-base sm:text-lg font-semibold text-white/90">{item.title}</h4>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="order-1 md:order-2 space-y-6">
            <h2 className="text-4xl font-bold leading-tight">Grow Your Business with <span className="text-brand">AvaPartner!</span></h2>
            <p className="text-lg text-white/60 leading-relaxed">
              AvaPartner builds profitable, long-term institutional and affiliate partnerships worldwide. Whether you operate a financial comparison portal, trading academy, signal community, or algorithmic trading network, our team provides bespoke conversion funnels and dedicated account management.
            </p>
          </div>
        </div>

        {/* More Than Forex */}
        <div className="grid md:grid-cols-2 gap-16 items-center">
          <div className="space-y-6">
            <h2 className="text-4xl font-bold leading-tight">Promote more than just <span className="text-brand">Forex</span> and maximize commissions!</h2>
            <p className="text-lg text-white/60 leading-relaxed">
              Increase your revenues by promoting AvaTrade’s complete multi-asset index of over 1,250+ instruments. Referrals can trade Forex majors &amp; exotics, global equities, precious metals, energies, cryptocurrencies, ETFs, and vanilla options — all from a single unified platform.
            </p>
            <ul className="grid grid-cols-2 gap-4 pt-4">
              {['60+ Forex Pairs', 'Global Tech Stocks', 'Cryptocurrencies', 'Precious Metals & Oil', 'Global Stock Indices', 'Vanilla Options & ETFs'].map((asset, i) => (
                <li key={i} className="flex items-center gap-3 text-white/80 font-medium">
                  <div className="w-2 h-2 rounded-full bg-brand"></div>
                  {asset}
                </li>
              ))}
            </ul>
          </div>
          <div className="relative">
            <div className="absolute inset-0 bg-brand/10 blur-3xl rounded-full"></div>
            <div className="relative bg-[#0d1421] border border-white/10 rounded-3xl p-6 sm:p-10 shadow-2xl overflow-hidden group">
              <div className="absolute -right-10 -top-10 w-40 h-40 bg-brand/20 rounded-full blur-2xl group-hover:bg-brand/30 transition-colors"></div>
              <h3 className="text-3xl font-black mb-2 text-white">Multi-Asset Liquidity</h3>
              <p className="text-white/50 mb-8">Offer your referrals institutional-grade execution across every market.</p>
              
              <div className="space-y-4">
                <div className="h-16 rounded-xl bg-gradient-to-r from-brand/20 to-transparent flex items-center justify-between px-6 border-l-4 border-brand">
                  <span className="font-bold text-lg text-brand">Forex Majors, Minors &amp; Metals</span>
                  <span className="text-xs font-mono text-white/60">0.8 Pip Spreads</span>
                </div>
                <div className="h-16 rounded-xl bg-gradient-to-r from-sky-500/20 to-transparent flex items-center justify-between px-6 border-l-4 border-sky-400">
                  <span className="font-bold text-lg text-sky-400">US, EU &amp; Asian Equities</span>
                  <span className="text-xs font-mono text-white/60">NYSE / NASDAQ</span>
                </div>
                <div className="h-16 rounded-xl bg-gradient-to-r from-amber-500/20 to-transparent flex items-center justify-between px-6 border-l-4 border-amber-400">
                  <span className="font-bold text-lg text-amber-400">24/7 Crypto &amp; AI Automated Trading</span>
                  <span className="text-xs font-mono text-white/60">Instant Execution</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Innovative Brokerage */}
        <div className="grid md:grid-cols-2 gap-16 items-center">
          <div className="order-2 md:order-1 relative">
            <div className="absolute inset-0 bg-sky-500/10 blur-3xl rounded-full"></div>
            <div className="relative bg-[#0d1421] border border-white/10 rounded-3xl p-6 sm:p-10 shadow-2xl">
              <div className="grid grid-cols-2 gap-4 sm:gap-6">
                <div className="bg-black/50 p-6 rounded-2xl border border-white/5 flex flex-col items-center justify-center text-center hover:border-brand/30 transition-colors">
                  <div className="text-2xl font-black text-brand mb-2">MT4 &amp; MT5</div>
                  <div className="text-xs text-white/50">MetaTrader Suite</div>
                </div>
                <div className="bg-black/50 p-6 rounded-2xl border border-white/5 flex flex-col items-center justify-center text-center hover:border-brand/30 transition-colors">
                  <div className="text-2xl font-black text-sky-400 mb-2">AvaTradeGO</div>
                  <div className="text-xs text-white/50">Award-Winning App</div>
                </div>
                <div className="bg-black/50 p-6 rounded-2xl border border-white/5 flex flex-col items-center justify-center text-center hover:border-brand/30 transition-colors col-span-2">
                  <div className="text-xl font-bold text-white mb-2">9 World-Class Trading Platforms</div>
                  <div className="text-sm text-white/50">WebTrader, AvaOptions, AvaSocial, DupliTrade &amp; AI Trade</div>
                </div>
              </div>
            </div>
          </div>
          <div className="order-1 md:order-2 space-y-6">
            <h2 className="text-4xl font-bold leading-tight">Promote a leading <span className="text-sky-400">innovative brokerage</span> that offers more.</h2>
            <p className="text-lg text-white/60 leading-relaxed">
              AvaTrade invests heavily in cutting-edge trading technology. We offer 9 world-class trading platforms, including <strong>MetaTrader 4 (MT4)</strong>, <strong>MetaTrader 5 (MT5)</strong>, the award-winning proprietary <strong>AvaTradeGO</strong> mobile app, <strong>AvaOptions</strong>, <strong>AvaSocial</strong>, and <strong>WebTrader</strong>. Innovative risk-management integrations like <strong>AvaProtect™</strong> give you unmatched selling points when promoting the AvaPartner brand.
            </p>
          </div>
        </div>
      </section>

      {/* Executive Leadership & Global Team Section */}
      <section className="bg-[#0d1421] rounded-[40px] p-6 sm:p-10 md:p-14 border border-white/10 space-y-10">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="inline-block px-3 py-1 rounded-full bg-brand/10 border border-brand/20 text-brand text-xs font-bold uppercase tracking-widest">
              Global Leadership &amp; Team
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-white">Guided by Industry Veterans Across 5 Continents</h2>
            <p className="text-white/60 text-base">
              Headquartered in Dublin, Ireland with regional hubs in Sydney, Tokyo, Abu Dhabi, Milan, and Johannesburg, our leadership team brings decades of fintech and affiliate marketing expertise.
            </p>
          </div>
          <Link to="/who-we-are" className="btn bg-white/10 hover:bg-brand text-white hover:text-black font-bold px-6 py-3 rounded-full text-sm transition-colors self-start md:self-auto flex-shrink-0">
            Meet Our Full Team &rarr;
          </Link>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {EXECUTIVE_HIGHLIGHTS.map((exec, i) => (
            <div key={i} className="rounded-3xl bg-black/40 border border-white/10 p-6 hover:border-brand/40 transition-all flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-3.5 mb-4">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand via-emerald-400 to-sky-500 flex items-center justify-center text-black font-black text-base shadow-md flex-shrink-0">
                    {exec.initials}
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-base leading-tight">{exec.name}</h4>
                    <div className="text-xs text-brand font-semibold mt-0.5">{exec.role}</div>
                  </div>
                </div>
                <p className="text-xs text-white/60 leading-relaxed mb-4">{exec.bio}</p>
              </div>
              <div className="pt-3 border-t border-white/10 text-[11px] text-white/50 font-medium">
                {exec.location}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 6 Grid "Why Partner With Us?" */}
      <section className="bg-[#0d1421] rounded-[40px] p-6 sm:p-10 md:p-16 border border-white/10">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold">Why Partner with AvaPartner?</h2>
        </div>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {[
            { title: "High commissions", subtitle: "Flexible CPA up to $1,000 & RevShare up to 50%" },
            { title: "Reliable & fast payments", subtitle: "$300M+ paid out with transparent reporting" },
            { title: "Full creative support", subtitle: "Localized landing pages, banners & widgets" },
            { title: "Personal service", subtitle: "From a dedicated AvaPartner affiliate manager" },
            { title: "High converting", subtitle: "Multilingual sales & retention desks in 20+ languages" },
            { title: "Sophisticated dashboard", subtitle: "Real-time tracking of clicks, lots & commissions" }
          ].map((item, i) => (
            <div key={i} className="flex flex-col items-center text-center p-8 rounded-3xl bg-black/30 border border-white/5 hover:bg-white/5 hover:border-brand/30 transition-all duration-300">
              <div className="w-14 h-14 rounded-2xl bg-brand/10 flex items-center justify-center text-brand mb-6">
                <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
              </div>
              <h4 className="text-xl font-bold text-white mb-2">{item.title}</h4>
              <p className="text-sm text-white/50">{item.subtitle}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Global Presence Banner */}
      <section className="relative overflow-hidden rounded-[40px] bg-gradient-to-br from-brand/20 via-[#0d1421] to-[#070b12] border border-white/10 p-8 sm:p-12 md:p-20 text-center">
        <div className="relative z-10 max-w-3xl mx-auto space-y-8">
          <div className="w-20 h-20 mx-auto bg-brand/20 rounded-full flex items-center justify-center mb-6">
            <svg className="w-10 h-10 text-brand" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
          </div>
          <h2 className="text-3xl md:text-5xl font-bold leading-tight text-white">Global Financial Conferences &amp; Awards</h2>
          <p className="text-xl text-white/70 leading-relaxed">
            AvaPartner’s executive team participates in major iFX EXPO, Finance Magnates, and Affiliate World summits across Dubai, Limassol, London, Bangkok, and Mexico City. Connect with us to scale your business with the world’s leading broker affiliate program.
          </p>
        </div>
      </section>

      {/* Official Partnership Statement Section */}
      <section className="max-w-4xl mx-auto pt-4 w-full px-4 md:px-0">
        <div className="bg-[#0d1421] border border-white/10 p-8 md:p-10 rounded-3xl text-center shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-brand/5 rounded-full blur-2xl"></div>
          <h2 className="text-2xl md:text-3xl font-bold mb-4 text-white">Official Partner Declaration</h2>
          <p className="text-white/70 leading-relaxed text-base relative z-10">
            <strong>AvaPartner</strong> serves as the official affiliate marketing and Introducing Broker portal for <a href="https://www.avatrade.com/" target="_blank" rel="noopener noreferrer" className="text-brand font-semibold hover:underline">AvaTrade</a> and <a href="https://www.avapartner.com/" target="_blank" rel="noopener noreferrer" className="text-brand font-semibold hover:underline">AvaPartner</a>. Headquartered in Dublin, Ireland (regulated by the Central Bank of Ireland, C53877), we provide authorized partners with a dedicated environment offering competitive CPA, Revenue Share, and Master IB models to promote AvaTrade's globally regulated, multi-asset brokerage services across 150+ countries.
          </p>
        </div>
      </section>

      {/* Final Huge CTA Section */}
      <section className="text-center max-w-4xl mx-auto space-y-10 pt-6 pb-16">
        <h2 className="text-5xl md:text-7xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-white to-white/50">
          Ready to Start Earning?
        </h2>
        <p className="text-xl text-white/60 max-w-2xl mx-auto">
          Join the most rewarding financial partnership program today and gain access to institutional commissions, cutting-edge attribution technology, and our global team.
        </p>
        <div className="pt-4 w-full max-w-sm mx-auto sm:max-w-none">
          {!token ? (
            <Link to="/signup" className="group relative flex sm:inline-flex items-center justify-center px-6 py-4 sm:px-12 sm:py-5 text-lg sm:text-xl font-bold text-black transition-all duration-300 bg-brand rounded-full hover:bg-brand-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand shadow-[0_0_40px_rgba(0,223,154,0.4)] hover:shadow-[0_0_60px_rgba(0,223,154,0.6)] hover:-translate-y-2 w-full sm:w-auto text-center">
              <span className="relative flex items-center gap-2">
                Join AvaPartner Now
                <svg className="w-6 h-6 group-hover:translate-x-1 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
              </span>
            </Link>
          ) : (
            <Link to="/dashboard" className="group relative flex sm:inline-flex items-center justify-center px-6 py-4 sm:px-12 sm:py-5 text-lg sm:text-xl font-bold text-black transition-all duration-300 bg-brand rounded-full hover:bg-brand-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand shadow-[0_0_40px_rgba(0,223,154,0.4)] hover:shadow-[0_0_60px_rgba(0,223,154,0.6)] hover:-translate-y-2 w-full sm:w-auto text-center">
              <span className="relative flex items-center gap-2">
                Go to Dashboard
                <svg className="w-6 h-6 group-hover:translate-x-1 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
              </span>
            </Link>
          )}
        </div>
        <p className="text-sm text-white/40 pt-4 font-mono uppercase tracking-widest">Setup takes less than 60 seconds</p>
      </section>

      {showInstallModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/85 backdrop-blur-lg">
          <div className="relative w-full max-w-md bg-gradient-to-b from-[#0d1522] to-[#080d16] border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl text-white">
            <button 
              onClick={() => setShowInstallModal(false)}
              className="absolute top-4 right-4 text-white/50 hover:text-white transition-colors p-1"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <div className="text-center mb-6">
              <div className="w-20 h-20 mx-auto bg-gradient-to-br from-brand/20 to-sky-500/20 rounded-3xl flex items-center justify-center border border-brand/30 shadow-[0_0_25px_rgba(0,223,154,0.3)] mb-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand via-emerald-400 to-sky-500 flex items-center justify-center text-black font-black text-xl shadow-md">
                  AP
                </div>
              </div>
              <h3 className="text-2xl font-bold text-white">AvaPartner Mobile App</h3>
              <p className="text-sm text-white/60 mt-1">Automatic 1-Tap App Installation</p>
            </div>

            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse flex-shrink-0"></div>
                <div className="text-xs text-white/80 font-medium">
                  Optimized for Android (Samsung, Xiaomi, Huawei, Vivo, Oppo) &amp; iOS
                </div>
              </div>

              <button
                onClick={executeAutoInstall}
                disabled={isInstalling}
                className="w-full btn py-4 text-lg font-black bg-gradient-to-r from-brand via-emerald-400 to-sky-400 hover:opacity-90 text-black rounded-2xl transition-all shadow-[0_0_30px_rgba(0,223,154,0.4)] flex items-center justify-center gap-2"
              >
                {isInstalling ? (
                  <>
                    <svg className="animate-spin w-5 h-5 text-black" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
                    </svg>
                    <span>Installing App...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="8 17 12 21 16 17"></polyline>
                      <line x1="12" y1="3" x2="12" y2="21"></line>
                    </svg>
                    <span>INSTALL APP NOW</span>
                  </>
                )}
              </button>

              {/iPhone|iPad|iPod/i.test(navigator.userAgent) && (
                <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/20 text-center text-xs text-sky-300">
                  💡 On iOS Safari: Tap <strong className="text-white">Share</strong> ➔ <strong className="text-white">Add to Home Screen</strong>
                </div>
              )}
            </div>

            <div className="mt-6 pt-4 border-t border-white/10 text-center">
              <button
                onClick={() => setShowInstallModal(false)}
                className="text-xs text-white/40 hover:text-white/70 transition-colors"
              >
                Close Window
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
