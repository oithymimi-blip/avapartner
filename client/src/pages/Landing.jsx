import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../store'

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
    <div className="flex flex-col gap-20 md:gap-32 py-10 overflow-x-hidden w-full max-w-full">
      {/* Hero Section */}
      <section className="relative grid md:grid-cols-2 gap-12 items-center min-h-[70vh] w-full max-w-full overflow-x-hidden">
        {/* Background Decorative Elements */}
        <div className="absolute top-0 right-0 -mr-32 -mt-32 w-[50rem] h-[50rem] bg-brand/10 rounded-full blur-[120px] pointer-events-none opacity-60"></div>
        <div className="absolute bottom-0 left-0 -ml-32 -mb-32 w-[40rem] h-[40rem] bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none opacity-60"></div>

        <div className="space-y-8 relative z-10">
          <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full bg-brand/10 border border-brand/20 text-brand text-xs font-bold uppercase tracking-widest shadow-[0_0_15px_rgba(0,223,154,0.15)]">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-brand"></span>
            </span>
            AvaPartner 2.0
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-7xl font-extrabold leading-[1.05] tracking-tight break-words hyphens-auto w-full">
            The Official <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand to-emerald-300 inline-block">AvaTrade</span> <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand to-emerald-300 inline-block">Affiliate</span> Network
          </h1>
          <p className="text-xl text-white/70 leading-relaxed max-w-lg">
            Welcome to the official partner marketing portal for <a href="https://www.avatrade.com/" target="_blank" rel="noopener noreferrer" className="text-white hover:text-brand underline decoration-brand/50 underline-offset-4 font-medium transition-colors">AvaTrade</a> and <a href="https://www.avapartner.com/" target="_blank" rel="noopener noreferrer" className="text-white hover:text-brand underline decoration-brand/50 underline-offset-4 font-medium transition-colors">AvaPartner</a>. Join over 70,000 partners worldwide and earn premium CPA and RevShare commissions by promoting a globally regulated, industry-leading broker.
          </p>
          <div className="flex flex-col sm:flex-row flex-wrap gap-4 pt-4">
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
              className="btn bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white px-8 sm:px-10 py-4 text-lg font-bold shadow-[0_0_25px_rgba(14,165,233,0.3)] hover:shadow-[0_0_40px_rgba(14,165,233,0.5)] hover:-translate-y-1 transition-all duration-300 w-full sm:w-auto text-center flex items-center justify-center gap-2"
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
          {/* Futuristic Card UI Showcase */}
          <div className="relative rounded-3xl bg-gradient-to-b from-[#11161d] to-[#0b0f13] border border-white/10 p-5 sm:p-8 shadow-2xl backdrop-blur-xl transform transition-all hover:scale-[1.03] hover:rotate-y-2 duration-500">
            <div className="absolute top-0 right-12 w-40 h-1.5 bg-gradient-to-r from-brand to-emerald-400 rounded-b-full shadow-[0_0_20px_rgba(0,223,154,0.6)]"></div>
            
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-0 mb-8 sm:mb-10">
              <div>
                <p className="text-xs sm:text-sm text-white/50 font-mono mb-1 sm:mb-2 uppercase tracking-wider">Live Commissions</p>
                <h3 className="text-3xl sm:text-4xl font-black font-mono tracking-tighter text-white break-all sm:break-normal">$2,845,902.50</h3>
              </div>
              <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-2xl bg-brand/10 flex items-center justify-center border border-brand/20 shadow-[0_0_15px_rgba(0,223,154,0.2)] flex-shrink-0">
                <svg className="w-6 h-6 sm:w-8 sm:h-8 text-brand" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline>
                </svg>
              </div>
            </div>
            
            <div className="space-y-5">
              <div className="group flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-brand/30 transition-all cursor-pointer">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-indigo-500/20 flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-transform">
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                  </div>
                  <div>
                    <p className="text-base font-bold text-white">CPA Program</p>
                    <p className="text-xs text-white/50 mt-0.5">High Conversion Rates</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-base font-black text-brand">Up to $1000</p>
                </div>
              </div>

              <div className="group flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-brand/30 transition-all cursor-pointer">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-orange-500/20 flex items-center justify-center text-orange-400 group-hover:scale-110 transition-transform">
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"></path><path d="M12 18V6"></path></svg>
                  </div>
                  <div>
                    <p className="text-base font-bold text-white">RevShare</p>
                    <p className="text-xs text-white/50 mt-0.5">Lifetime Profitability</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-base font-black text-brand">Up to 50%</p>
                </div>
              </div>
            </div>
            
            <div className="mt-8 pt-8 border-t border-white/10">
              <div className="flex justify-between text-xs text-white/50 mb-3 font-mono uppercase">
                <span>Global Reach</span>
                <span className="text-brand font-bold">150+ Countries</span>
              </div>
              <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-brand via-emerald-400 to-indigo-500 w-[85%] rounded-full animate-pulse shadow-[0_0_10px_rgba(0,223,154,0.5)]"></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Reputation Section */}
      <section className="text-center max-w-4xl mx-auto space-y-8">
        <h2 className="text-3xl md:text-5xl font-bold leading-tight">Promote a Highly Regulated Brokerage with an <span className="text-brand">Excellent Reputation.</span></h2>
        <p className="text-lg text-white/60 leading-relaxed">
          As an official AvaPartner representative, you'll promote an established, highly regulated brokerage with a strong international presence. AvaTrade holds regulatory licenses across 9 jurisdictions worldwide, including the <strong>Central Bank of Ireland (CBI)</strong>, <strong>ASIC (Australia)</strong>, <strong>FSA (Japan)</strong>, and the <strong>FSCA (South Africa)</strong>. AvaTrade has built a global reputation for trust and excellence over the last two decades.
        </p>
      </section>

      {/* Commission Plans Grid Section */}
      <section className="relative">
        <div className="absolute inset-0 bg-brand/5 blur-3xl rounded-[100px] pointer-events-none -z-10"></div>
        <div className="text-center space-y-4 max-w-3xl mx-auto mb-16">
          <h2 className="text-4xl font-bold">Tailor-Made <span className="text-brand">Commission Plans</span></h2>
          <p className="text-lg text-white/60">Your success is our success. AvaPartner is here to help you every step of the way. Choose a commission plan that suits your affiliate business model and allows for rapid future growth.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          <div className="p-6 sm:p-10 rounded-3xl bg-gradient-to-b from-[#11161d] to-[#0b0f13] border border-white/5 hover:border-brand/40 hover:-translate-y-2 transition-all duration-300 relative group overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-brand/20 group-hover:bg-brand transition-colors"></div>
            <div className="w-16 h-16 rounded-2xl bg-brand/10 flex items-center justify-center mb-8 group-hover:scale-110 transition-transform">
              <span className="text-2xl font-black text-brand">CPA</span>
            </div>
            <h3 className="text-2xl font-bold mb-4">Cost Per Acquisition</h3>
            <p className="text-base text-white/60 leading-relaxed">
              Get a fixed, highly competitive commission for every qualified client you refer. Ideal for affiliates driving high-volume traffic who prefer immediate payouts.
            </p>
          </div>

          <div className="p-6 sm:p-10 rounded-3xl bg-gradient-to-b from-[#11161d] to-[#0b0f13] border border-white/5 hover:border-indigo-500/40 hover:-translate-y-2 transition-all duration-300 relative group overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-indigo-500/20 group-hover:bg-indigo-500 transition-colors"></div>
            <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 flex items-center justify-center mb-8 group-hover:scale-110 transition-transform">
              <svg className="w-8 h-8 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
            </div>
            <h3 className="text-2xl font-bold mb-4">Revenue Share</h3>
            <p className="text-base text-white/60 leading-relaxed">
              Earn an ongoing percentage of the spread from your referrals' trading volume. Build a long-term, passive income stream that grows over time.
            </p>
          </div>

          <div className="p-6 sm:p-10 rounded-3xl bg-gradient-to-b from-[#11161d] to-[#0b0f13] border border-white/5 hover:border-purple-500/40 hover:-translate-y-2 transition-all duration-300 relative group overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-purple-500/20 group-hover:bg-purple-500 transition-colors"></div>
            <div className="w-16 h-16 rounded-2xl bg-purple-500/10 flex items-center justify-center mb-8 group-hover:scale-110 transition-transform">
              <svg className="w-8 h-8 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
            </div>
            <h3 className="text-2xl font-bold mb-4">Hybrid Model</h3>
            <p className="text-base text-white/60 leading-relaxed">
              Combine the best of both worlds. Get an upfront CPA payment combined with an ongoing RevShare. Maximum flexibility and profitability.
            </p>
          </div>
        </div>
      </section>

      {/* Two Column Feature Sets */}
      <section className="space-y-24">
        {/* Grow Your Business */}
        <div className="grid md:grid-cols-2 gap-16 items-center">
          <div className="order-2 md:order-1 relative">
            <div className="absolute inset-0 bg-brand/10 blur-3xl rounded-full"></div>
            <div className="relative bg-[#11161d] border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl">
              <div className="space-y-6">
                {[
                  { title: "High converting marketing materials", icon: "megaphone" },
                  { title: "Cutting edge reporting dashboard", icon: "activity" },
                  { title: "Full transparency & fast payments", icon: "shield" },
                  { title: "Expert advice in your language", icon: "globe" }
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-4 bg-black/40 p-4 rounded-2xl border border-white/5">
                    <div className="w-12 h-12 rounded-xl bg-brand/10 flex items-center justify-center text-brand flex-shrink-0">
                      {item.icon === 'megaphone' && <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 11l18-5v12L3 14v-3z"></path><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"></path></svg>}
                      {item.icon === 'activity' && <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>}
                      {item.icon === 'shield' && <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>}
                      {item.icon === 'globe' && <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>}
                    </div>
                    <h4 className="text-lg font-semibold text-white/90">{item.title}</h4>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="order-1 md:order-2 space-y-6">
            <h2 className="text-4xl font-bold leading-tight">Grow Your Business with <span className="text-brand">AvaPartner!</span></h2>
            <p className="text-lg text-white/60 leading-relaxed">
              AvaPartner wants to build profitable long term partnerships with its affiliates. We’ll work with you to help build and grow your business. Receive access to our highly sophisticated dashboard and personalized support.
            </p>
          </div>
        </div>

        {/* More Than Forex */}
        <div className="grid md:grid-cols-2 gap-16 items-center">
          <div className="space-y-6">
            <h2 className="text-4xl font-bold leading-tight">Promote more than just <span className="text-emerald-400">Forex</span> and increase commissions!</h2>
            <p className="text-lg text-white/60 leading-relaxed">
              Increase your revenues by promoting AvaTrade’s complete asset index. You can trade the latest stocks, bonds, ETFs and indices, and more – and you can promote options too! AvaTrade is opening the global markets and creating endless trading possibilities.
            </p>
            <ul className="grid grid-cols-2 gap-4 pt-4">
              {['Global Stocks', 'Cryptocurrencies', 'Commodities', 'Bonds & ETFs', 'Stock Indices', 'Vanilla Options'].map((asset, i) => (
                <li key={i} className="flex items-center gap-3 text-white/80 font-medium">
                  <div className="w-2 h-2 rounded-full bg-brand"></div>
                  {asset}
                </li>
              ))}
            </ul>
          </div>
          <div className="relative">
            <div className="absolute inset-0 bg-emerald-500/10 blur-3xl rounded-full"></div>
            <div className="relative bg-[#11161d] border border-white/10 rounded-3xl p-6 sm:p-10 shadow-2xl overflow-hidden group">
              <div className="absolute -right-10 -top-10 w-40 h-40 bg-emerald-500/20 rounded-full blur-2xl group-hover:bg-brand/30 transition-colors"></div>
              <h3 className="text-3xl font-black mb-2 text-white">Endless Possibilities</h3>
              <p className="text-white/50 mb-8">Offer your referrals the ultimate trading experience.</p>
              
              <div className="space-y-4">
                <div className="h-16 rounded-xl bg-gradient-to-r from-emerald-500/20 to-transparent flex items-center px-6 border-l-4 border-emerald-500">
                  <span className="font-bold text-lg text-emerald-400">Forex Majors & Minors</span>
                </div>
                <div className="h-16 rounded-xl bg-gradient-to-r from-blue-500/20 to-transparent flex items-center px-6 border-l-4 border-blue-500">
                  <span className="font-bold text-lg text-blue-400">Top Tech Stocks</span>
                </div>
                <div className="h-16 rounded-xl bg-gradient-to-r from-orange-500/20 to-transparent flex items-center px-6 border-l-4 border-orange-500">
                  <span className="font-bold text-lg text-orange-400">Crypto Assets</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Innovative Brokerage */}
        <div className="grid md:grid-cols-2 gap-16 items-center">
          <div className="order-2 md:order-1 relative">
            <div className="absolute inset-0 bg-indigo-500/10 blur-3xl rounded-full"></div>
            <div className="relative bg-[#11161d] border border-white/10 rounded-3xl p-6 sm:p-10 shadow-2xl">
              <div className="grid grid-cols-2 gap-4 sm:gap-6">
                <div className="bg-black/50 p-6 rounded-2xl border border-white/5 flex flex-col items-center justify-center text-center hover:bg-white/5 transition-colors">
                  <div className="text-2xl font-black text-indigo-400 mb-2">MT4</div>
                  <div className="text-xs text-white/50">MetaTrader 4</div>
                </div>
                <div className="bg-black/50 p-6 rounded-2xl border border-white/5 flex flex-col items-center justify-center text-center hover:bg-white/5 transition-colors">
                  <div className="text-2xl font-black text-indigo-400 mb-2">MT5</div>
                  <div className="text-xs text-white/50">MetaTrader 5</div>
                </div>
                <div className="bg-black/50 p-6 rounded-2xl border border-white/5 flex flex-col items-center justify-center text-center hover:bg-white/5 transition-colors col-span-2">
                  <div className="text-xl font-bold text-white mb-2">9 Trading Platforms</div>
                  <div className="text-sm text-white/50">Web, Desktop & Mobile Apps</div>
                </div>
              </div>
            </div>
          </div>
          <div className="order-1 md:order-2 space-y-6">
            <h2 className="text-4xl font-bold leading-tight">Promote a leading <span className="text-indigo-400">innovative brokerage</span> that offers more.</h2>
            <p className="text-lg text-white/60 leading-relaxed">
              AvaTrade invests heavily in the latest trading technology. We currently offer 9 world-class trading platforms, including the prestigious <strong>MetaTrader 4 (MT4)</strong>, <strong>MetaTrader 5 (MT5)</strong>, the award-winning proprietary <strong>AvaTradeGO</strong> mobile app, and <strong>WebTrader</strong>. Our innovative trading tools and integrations like AvaProtect™ are incredibly strong selling points when you officially promote the AvaTrade brand.
            </p>
          </div>
        </div>
      </section>

      {/* 6 Grid "Why Partner With Us?" */}
      <section className="bg-[#11161d] rounded-[40px] p-6 sm:p-10 md:p-16 border border-white/5">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold">Why Partner with Us?</h2>
        </div>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {[
            { title: "High commissions", subtitle: "and flexible payment structure" },
            { title: "Reliable & fast payments", subtitle: "with transparent reporting" },
            { title: "Full creative support", subtitle: "with an abundance of marketing materials" },
            { title: "Personal service", subtitle: "from a dedicated AvaTrade affiliate manager" },
            { title: "High converting", subtitle: "and multilingual sales & retention teams" },
            { title: "Sophisticated dashboard", subtitle: "to track your performance & commissions" }
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
      <section className="relative overflow-hidden rounded-[40px] bg-gradient-to-br from-brand/20 via-[#11161d] to-[#0b0f13] border border-white/10 p-8 sm:p-12 md:p-20 text-center">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 mix-blend-overlay"></div>
        <div className="relative z-10 max-w-3xl mx-auto space-y-8">
          <div className="w-20 h-20 mx-auto bg-brand/20 rounded-full flex items-center justify-center mb-6">
            <svg className="w-10 h-10 text-brand" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
          </div>
          <h2 className="text-3xl md:text-5xl font-bold leading-tight text-white">Global Financial Conferences</h2>
          <p className="text-xl text-white/70 leading-relaxed">
            AvaPartner’s representatives participate in many financial conferences around the world. Check back soon to see where we’ll visit next and how you can be a part of one of the world’s leading broker affiliate programmes.
          </p>
        </div>
      </section>
      {/* Official Partnership Statement Section */}
      <section className="max-w-4xl mx-auto pt-8 w-full px-4 md:px-0">
        <div className="bg-[#11161d] border border-white/10 p-8 md:p-10 rounded-3xl text-center shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-brand/5 rounded-full blur-2xl"></div>
          <h2 className="text-2xl md:text-3xl font-bold mb-4 text-white">Official Partner Declaration</h2>
          <p className="text-white/70 leading-relaxed text-base relative z-10">
            <strong>avapartner.marketing</strong> serves as an official affiliate marketing and sub-platform portal for <a href="https://www.avatrade.com/" target="_blank" rel="noopener noreferrer" className="text-brand font-semibold hover:underline">AvaTrade</a> and <a href="https://www.avapartner.com/" target="_blank" rel="noopener noreferrer" className="text-brand font-semibold hover:underline">AvaPartner</a>. We provide authorized partners with a dedicated environment offering highly competitive CPA and Revenue Share models to promote AvaTrade's globally regulated, multi-asset brokerage services. This site is 100% authentic and fully integrated with AvaPartner's marketing infrastructure to help you expand your business, access cutting-edge promotional tools, and maximize your revenue through a trusted, international financial brand.
          </p>
        </div>
      </section>
      {/* Final Huge CTA Section */}
      <section className="text-center max-w-4xl mx-auto space-y-10 pt-10 pb-20">
        <h2 className="text-5xl md:text-7xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-white to-white/50">
          Ready to Start Earning?
        </h2>
        <p className="text-xl text-white/60 max-w-2xl mx-auto">
          Join the most rewarding partnership program today and gain access to unparalleled commissions, cutting-edge technology, and a dedicated team.
        </p>
        <div className="pt-8 w-full max-w-sm mx-auto sm:max-w-none">
          {!token ? (
            <Link to="/signup" className="group relative flex sm:inline-flex items-center justify-center px-6 py-4 sm:px-12 sm:py-5 text-lg sm:text-xl font-bold text-black transition-all duration-300 bg-brand rounded-full hover:bg-brand-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand shadow-[0_0_40px_rgba(0,223,154,0.4)] hover:shadow-[0_0_60px_rgba(0,223,154,0.6)] hover:-translate-y-2 w-full sm:w-auto text-center">
              <span className="absolute inset-0 w-full h-full -mt-1 rounded-lg opacity-30 bg-gradient-to-b from-transparent via-transparent to-black"></span>
              <span className="relative flex items-center gap-2">
                Join Now
                <svg className="w-6 h-6 group-hover:translate-x-1 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
              </span>
            </Link>
          ) : (
            <Link to="/dashboard" className="group relative flex sm:inline-flex items-center justify-center px-6 py-4 sm:px-12 sm:py-5 text-lg sm:text-xl font-bold text-black transition-all duration-300 bg-brand rounded-full hover:bg-brand-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand shadow-[0_0_40px_rgba(0,223,154,0.4)] hover:shadow-[0_0_60px_rgba(0,223,154,0.6)] hover:-translate-y-2 w-full sm:w-auto text-center">
              <span className="absolute inset-0 w-full h-full -mt-1 rounded-lg opacity-30 bg-gradient-to-b from-transparent via-transparent to-black"></span>
              <span className="relative flex items-center gap-2">
                Go to Dashboard
                <svg className="w-6 h-6 group-hover:translate-x-1 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
              </span>
            </Link>
          )}
        </div>
        <p className="text-sm text-white/40 pt-6 font-mono uppercase tracking-widest">Setup takes less than 60 seconds</p>
      </section>

      {showInstallModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/85 backdrop-blur-lg">
          <div className="relative w-full max-w-md bg-gradient-to-b from-[#11161d] to-[#0b0f13] border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl text-white">
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
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand to-sky-400 flex items-center justify-center text-black font-black text-xl shadow-md">
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
                <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-center text-xs text-indigo-300">
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
