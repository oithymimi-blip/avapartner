import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { FileText, Download, ExternalLink, Eye, X, ShieldCheck } from 'lucide-react'

export const COMPANY_PROFILE_PDF_URL = '/AvaPartner_Company_Profile.pdf?v=20261120b'
export const COMPANY_PROFILE_PDF_FILENAME = 'AvaPartner_Company_Profile.pdf'

export default function CompanyProfileButton({
  variant = 'hero',
  className = '',
  onOpenModal,
  open: controlledOpen,
  onOpenChange,
  hideTrigger = false
}) {
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen
  const setOpen = (next) => {
    if (controlledOpen === undefined) {
      setInternalOpen(next)
    }
    if (typeof onOpenChange === 'function') {
      onOpenChange(next)
    }
  }

  useEffect(() => {
    if (!open) return undefined
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  const handleOpen = () => {
    if (typeof onOpenModal === 'function') {
      onOpenModal()
    }
    setOpen(true)
  }

  const renderTrigger = () => {
    if (variant === 'hero') {
      return (
        <div
          className={`inline-flex items-stretch rounded-2xl border border-brand/45 bg-gradient-to-r from-[#0d1724] via-[#0b1b20] to-[#0d1724] shadow-[0_0_24px_rgba(0,223,154,0.22)] hover:shadow-[0_0_34px_rgba(0,223,154,0.4)] hover:-translate-y-1 transition-all duration-300 overflow-hidden w-full sm:w-auto ${className}`}
        >
          <button
            type="button"
            onClick={handleOpen}
            className="flex-1 inline-flex items-center justify-center gap-2.5 px-5 sm:px-6 py-4 text-base sm:text-lg font-bold text-white hover:text-brand transition-colors cursor-pointer whitespace-nowrap"
            title="Read AvaPartner Company Profile (19-Page PDF)"
          >
            <FileText className="w-5 h-5 text-brand flex-shrink-0" />
            <span>Company Profile</span>
            <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand/20 text-brand border border-brand/35">
              PDF
            </span>
          </button>
          <a
            href={COMPANY_PROFILE_PDF_URL}
            download={COMPANY_PROFILE_PDF_FILENAME}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-4 bg-brand hover:bg-emerald-300 text-slate-950 font-extrabold text-sm sm:text-base border-l border-brand/40 transition-colors whitespace-nowrap"
            title="Download AvaPartner Company Profile PDF"
            aria-label="Download Company Profile PDF"
          >
            <Download className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
            <span className="sm:hidden">Save</span>
          </a>
        </div>
      )
    }

    if (variant === 'showcase') {
      return (
        <div
          className={`profile-pdf-showcase rounded-3xl bg-gradient-to-r from-[#0c1623] via-[#091c1a] to-[#0c1623] border border-brand/35 p-6 sm:p-8 shadow-[0_0_35px_rgba(0,223,154,0.12)] relative overflow-hidden ${className}`}
        >
          <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-brand/10 blur-3xl pointer-events-none" />
          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2.5 max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand/15 border border-brand/30 text-brand text-[11px] font-bold uppercase tracking-widest">
                <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0" />
                <span>Official 2026 Corporate Dossier · 19-Page PDF</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                Read or Download the Full <span className="text-brand">AvaPartner Company Profile</span>
              </h2>
              <p className="text-sm sm:text-base text-white/70 leading-relaxed">
                Explore our complete global overview, 9 regulated licenses, 340+ international specialists across 8 offices, 5-layer security &amp; KYC verification, Quantum AI Trade slots, Forex &amp; Binary specs, CPA/RevShare/IB profit ratios, Privacy Policy, and Terms anytime.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-shrink-0">
              <button
                type="button"
                onClick={handleOpen}
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/20 hover:border-brand/50 text-white font-bold text-sm sm:text-base backdrop-blur-md transition-all duration-200 whitespace-nowrap"
              >
                <Eye className="w-4 h-4 text-brand flex-shrink-0" />
                <span>Read Online</span>
              </button>
              <a
                href={COMPANY_PROFILE_PDF_URL}
                download={COMPANY_PROFILE_PDF_FILENAME}
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-gradient-to-r from-brand via-emerald-400 to-teal-400 hover:opacity-95 text-slate-950 font-extrabold text-sm sm:text-base shadow-[0_0_24px_rgba(0,223,154,0.35)] hover:shadow-[0_0_34px_rgba(0,223,154,0.55)] hover:-translate-y-0.5 transition-all duration-200 whitespace-nowrap"
              >
                <Download className="w-4 h-4 flex-shrink-0" />
                <span>Download PDF (1.0 MB)</span>
              </a>
            </div>
          </div>
        </div>
      )
    }

    if (variant === 'dashboard-pill') {
      return (
        <div
          className={`profile-pdf-pill inline-flex items-stretch rounded-full bg-gradient-to-r from-brand via-emerald-400 to-teal-400 text-slate-950 font-extrabold text-xs tracking-normal normal-case shadow-[0_0_20px_rgba(0,223,154,0.32)] hover:shadow-[0_0_28px_rgba(0,223,154,0.52)] transition-all duration-200 overflow-hidden whitespace-nowrap ${className}`}
        >
          <button
            type="button"
            onClick={handleOpen}
            className="inline-flex items-center gap-1.5 pl-3.5 pr-2.5 py-1.5 hover:bg-black/10 transition-colors cursor-pointer"
            title="Read Official AvaPartner Company Profile PDF"
          >
            <FileText className="w-3.5 h-3.5 flex-shrink-0" />
            <span>Company Profile PDF</span>
          </button>
          <a
            href={COMPANY_PROFILE_PDF_URL}
            download={COMPANY_PROFILE_PDF_FILENAME}
            className="inline-flex items-center justify-center pl-2 pr-3 py-1.5 bg-black/10 hover:bg-black/20 border-l border-slate-950/15 transition-colors"
            title="Download Company Profile PDF"
            aria-label="Download Company Profile PDF"
          >
            <Download className="w-3.5 h-3.5 flex-shrink-0" />
          </a>
        </div>
      )
    }

    if (variant === 'nav') {
      return (
        <button
          type="button"
          onClick={handleOpen}
          className={`nav-pdf-btn inline-flex items-center justify-center gap-1.5 rounded-full border border-brand/45 bg-brand/15 hover:bg-brand/25 text-brand font-bold px-2.5 sm:px-3.5 py-1.5 text-[11px] sm:text-xs transition-all whitespace-nowrap ${className}`}
          title="Read or Download AvaPartner Official Company Profile (PDF)"
        >
          <FileText className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="hidden sm:inline">Company PDF</span>
          <span className="sm:hidden">PDF</span>
        </button>
      )
    }

    if (variant === 'menu') {
      return (
        <button
          type="button"
          onClick={handleOpen}
          className={`user-menu-card-btn user-menu-pdf-btn w-full text-left px-2.5 py-2 rounded-xl bg-gradient-to-r from-emerald-500/20 via-brand/15 to-teal-500/20 hover:from-emerald-500/30 hover:to-teal-500/30 border border-brand/40 text-emerald-200 font-semibold flex items-center justify-between gap-2.5 transition-all duration-150 group ${className}`}
        >
          <span className="flex items-center gap-2.5 min-w-0">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-white text-emerald-600 shadow-sm ring-1 ring-slate-900/10 flex-shrink-0">
              <FileText className="w-4 h-4" />
            </span>
            <span className="truncate text-[13px]">Company Profile (PDF)</span>
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-brand/20 text-brand border border-brand/35 flex-shrink-0">
            19p PDF
          </span>
        </button>
      )
    }

    if (variant === 'auth-top') {
      return (
        <div
          className={`w-full mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-brand/35 bg-gradient-to-r from-emerald-500/10 via-[#0d1522] to-teal-500/10 px-4 py-2.5 ${className}`}
        >
          <button
            type="button"
            onClick={handleOpen}
            className="inline-flex items-center gap-2 text-xs sm:text-sm font-bold text-brand hover:underline text-left"
          >
            <FileText className="w-4 h-4 flex-shrink-0" />
            <span>Read Company Profile (19-Page PDF)</span>
          </button>
          <a
            href={COMPANY_PROFILE_PDF_URL}
            download={COMPANY_PROFILE_PDF_FILENAME}
            className="inline-flex items-center gap-1 rounded-full bg-brand hover:bg-emerald-300 text-slate-950 font-extrabold px-3 py-1 text-[11px] transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5 flex-shrink-0" />
            <span>Download</span>
          </a>
        </div>
      )
    }

    if (variant === 'footer-link') {
      return (
        <button
          type="button"
          onClick={handleOpen}
          className={`inline-flex items-center gap-1.5 text-brand font-semibold hover:underline transition-colors text-left whitespace-nowrap text-[13px] ${className}`}
        >
          <FileText className="w-3.5 h-3.5 flex-shrink-0" />
          <span>Company Profile (PDF)</span>
        </button>
      )
    }

    return null
  }

  const modal = open && typeof document !== 'undefined'
    ? createPortal(
        <div
          className="fixed inset-0 z-[220] flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-label="AvaPartner Official Company Profile PDF Reader"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false)
          }}
        >
          <div className="relative w-full max-w-5xl h-[92vh] flex flex-col rounded-2xl sm:rounded-3xl bg-[#0b111b] border border-white/15 shadow-2xl overflow-hidden text-white">
            {/* Sticky Modal Header */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 px-4 sm:px-5 py-3 bg-[#070b12] border-b border-white/10 flex-shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand via-emerald-400 to-sky-500 flex items-center justify-center text-black font-black text-xs flex-shrink-0">
                  AP
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-sm sm:text-base text-white truncate">
                    AvaPartner Official Company Profile
                  </div>
                  <div className="text-[11px] text-white/55 truncate">
                    19-Page A4 Dossier · avapartner.app · avapartner.up.railway.app · avapartner.vercel.app
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <a
                  href={COMPANY_PROFILE_PDF_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-semibold text-white transition-colors whitespace-nowrap"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
                  <span>Open Full Tab</span>
                </a>
                <a
                  href={COMPANY_PROFILE_PDF_URL}
                  download={COMPANY_PROFILE_PDF_FILENAME}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-brand via-emerald-400 to-teal-400 hover:opacity-95 text-slate-950 text-xs font-extrabold shadow-md shadow-brand/25 transition-all whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>Download PDF</span>
                </a>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 text-white/70 hover:text-white transition-colors"
                  aria-label="Close PDF Reader"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Mobile / PWA Tip Strip */}
            <div className="sm:hidden px-4 py-2 bg-brand/10 border-b border-brand/20 text-[11px] text-emerald-200 flex items-center justify-between gap-2 flex-shrink-0">
              <span>On phone or installed app, tap <strong>Download PDF</strong> or <strong>Open Full Tab</strong> for full scrolling.</span>
            </div>

            {/* Embedded PDF Canvas */}
            <div className="flex-1 min-h-0 bg-[#111827] relative">
              <object
                data={`${COMPANY_PROFILE_PDF_URL}#toolbar=1&navpanes=0&view=FitH`}
                type="application/pdf"
                className="w-full h-full block"
              >
                <iframe
                  src={`${COMPANY_PROFILE_PDF_URL}#view=FitH`}
                  title="AvaPartner Company Profile PDF"
                  className="w-full h-full border-0 block"
                />
                <div className="p-6 text-center space-y-4 text-white/80">
                  <p className="text-sm">
                    Inline PDF preview is unavailable on this browser. Use the buttons below to read or save the full 19-page corporate dossier.
                  </p>
                  <div className="flex flex-wrap justify-center gap-3">
                    <a
                      href={COMPANY_PROFILE_PDF_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/10 border border-white/20 font-semibold text-sm text-white"
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span>Open Full Tab</span>
                    </a>
                    <a
                      href={COMPANY_PROFILE_PDF_URL}
                      download={COMPANY_PROFILE_PDF_FILENAME}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand text-slate-950 font-bold text-sm"
                    >
                      <Download className="w-4 h-4" />
                      <span>Download PDF (1.0 MB)</span>
                    </a>
                  </div>
                </div>
              </object>
            </div>
          </div>
        </div>,
        document.body
      )
    : null

  return (
    <>
      {!hideTrigger && renderTrigger()}
      {modal}
    </>
  )
}
