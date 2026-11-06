import { useEffect, useState } from 'react'

export default function InstallAppButton({ variant = 'default', className = '' }) {
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
      setShowInstallModal(true)
      return
    }
    executeAutoInstall()
  }

  const phoneIcon = (
    <svg className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
      <line x1="12" y1="18" x2="12.01" y2="18" />
    </svg>
  )

  return (
    <>
      {variant === 'auth-top' ? (
        <div className={`w-full mb-5 rounded-2xl bg-gradient-to-r from-[#0b192c] via-[#0f243c] to-[#0b192c] border border-sky-500/30 p-3.5 sm:p-4 shadow-[0_0_25px_rgba(14,165,233,0.15)] flex flex-col sm:flex-row items-center justify-between gap-3 ${className}`}>
          <div className="flex items-center gap-3 text-center sm:text-left">
            <div className="hidden sm:flex w-10 h-10 rounded-xl bg-gradient-to-br from-brand via-emerald-400 to-sky-500 items-center justify-center font-black text-black text-xs shadow-md flex-shrink-0">
              AP
            </div>
            <div>
              <div className="text-xs sm:text-sm font-bold text-white flex items-center justify-center sm:justify-start gap-1.5">
                <span>AvaPartner Official Mobile App</span>
                <span className="inline-block w-2 h-2 rounded-full bg-brand animate-pulse"></span>
              </div>
              <div className="text-[11px] text-white/60">
                Install the native mobile app for 1-tap access &amp; instant notifications
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleInstallClick}
            className="btn bg-gradient-to-r from-sky-400 via-sky-500 to-blue-600 hover:from-sky-300 hover:to-blue-500 text-slate-950 font-extrabold px-5 py-2.5 rounded-full text-xs sm:text-sm shadow-[0_0_20px_rgba(14,165,233,0.4)] hover:shadow-[0_0_30px_rgba(14,165,233,0.6)] transition-all duration-300 w-full sm:w-auto flex items-center justify-center gap-2 whitespace-nowrap flex-shrink-0"
          >
            {phoneIcon}
            <span>{isInstalled ? 'App Installed' : 'Install Mobile App'}</span>
          </button>
        </div>
      ) : variant === 'dashboard-pill' ? (
        <button
          type="button"
          onClick={handleInstallClick}
          className={`inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-sky-400 via-sky-500 to-blue-600 hover:from-sky-300 hover:to-blue-500 text-slate-950 font-extrabold px-4 py-1.5 text-xs tracking-normal normal-case shadow-[0_0_20px_rgba(14,165,233,0.35)] hover:shadow-[0_0_30px_rgba(14,165,233,0.55)] transition-all duration-200 whitespace-nowrap ${className}`}
        >
          <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
            <line x1="12" y1="18" x2="12.01" y2="18" />
          </svg>
          <span>{isInstalled ? 'App Installed' : 'Install Mobile App'}</span>
        </button>
      ) : variant === 'nav' ? (
        <button
          type="button"
          onClick={handleInstallClick}
          className={`inline-flex items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-sky-400 via-sky-500 to-blue-600 hover:from-sky-300 hover:to-blue-500 text-slate-950 font-extrabold px-3 sm:px-3.5 py-1.5 text-[11px] sm:text-xs shadow-md shadow-sky-500/25 transition-all whitespace-nowrap ${className}`}
          title="Install AvaPartner Mobile App"
        >
          <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
            <line x1="12" y1="18" x2="12.01" y2="18" />
          </svg>
          <span className="hidden md:inline">{isInstalled ? 'App Installed' : 'Install Mobile App'}</span>
          <span className="md:hidden">App</span>
        </button>
      ) : variant === 'menu' ? (
        <button
          type="button"
          onClick={handleInstallClick}
          className={`w-full text-left px-3 py-2 rounded-lg bg-gradient-to-r from-sky-500/20 to-blue-600/20 hover:from-sky-500/30 hover:to-blue-600/30 border border-sky-500/30 text-sky-300 font-bold flex items-center gap-2 transition-colors ${className}`}
        >
          <svg className="w-4 h-4 text-sky-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
            <line x1="12" y1="18" x2="12.01" y2="18" />
          </svg>
          <span>{isInstalled ? 'App Installed' : 'Install Mobile App'}</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={handleInstallClick}
          className={`btn bg-gradient-to-r from-sky-400 via-sky-500 to-blue-600 hover:from-sky-300 hover:to-blue-500 text-slate-950 px-6 sm:px-8 py-3.5 text-base sm:text-lg font-extrabold rounded-full shadow-[0_0_25px_rgba(14,165,233,0.35)] hover:shadow-[0_0_40px_rgba(14,165,233,0.55)] hover:-translate-y-0.5 transition-all duration-300 flex items-center justify-center gap-2 ${className}`}
        >
          {phoneIcon}
          <span>{isInstalled ? 'App Installed' : 'Install Mobile App'}</span>
        </button>
      )}

      {showInstallModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/85 backdrop-blur-lg">
          <div className="relative w-full max-w-md bg-gradient-to-b from-[#0d1522] to-[#080d16] border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl text-white">
            <button
              type="button"
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
                type="button"
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

              <div className="p-3.5 rounded-xl bg-sky-500/10 border border-sky-500/20 text-xs text-sky-200 space-y-1.5">
                <div>📱 <strong className="text-white">Android Chrome / Edge:</strong> Tap <strong className="text-white">Install App</strong> or browser menu (⋮) ➔ <strong className="text-white">Install app / Add to Home screen</strong>.</div>
                <div>🍎 <strong className="text-white">iPhone / iPad Safari:</strong> Tap <strong className="text-white">Share</strong> ➔ <strong className="text-white">Add to Home Screen</strong>.</div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-white/10 text-center">
              <button
                type="button"
                onClick={() => setShowInstallModal(false)}
                className="text-xs text-white/40 hover:text-white/70 transition-colors"
              >
                Close Window
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
