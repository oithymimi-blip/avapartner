import { Award, Clock, AlertCircle, Shield } from 'lucide-react'

export default function VerifiedBadge({
  status = 'not_started',
  goldVerified = false,
  label = 'Verified Strong',
  compact = false
}) {
  if (goldVerified || status === 'approved') {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 text-slate-950 border border-yellow-200/90 shadow-[0_0_20px_rgba(251,191,36,0.45)] font-extrabold tracking-wide ${
          compact ? 'px-2 py-0.5 text-[10px]' : 'px-3 py-1 text-[11px]'
        }`}
        title="Identity verified by Admin"
      >
        <Award className={compact ? 'w-3 h-3 text-amber-950' : 'w-3.5 h-3.5 text-amber-950'} />
        <span>{label || 'Verified Strong'}</span>
      </span>
    )
  }

  if (compact) return null

  if (status === 'awaiting_approval') {
    return (
      <span className="inline-flex items-center gap-1 self-center sm:self-auto px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-400/35 text-amber-300 text-[11px] font-semibold">
        <Clock className="w-3.5 h-3.5" />
        <span>NID Under Review</span>
      </span>
    )
  }

  if (status === 'rejected') {
    return (
      <span className="inline-flex items-center gap-1 self-center sm:self-auto px-2.5 py-0.5 rounded-full bg-rose-500/15 border border-rose-400/35 text-rose-300 text-[11px] font-semibold">
        <AlertCircle className="w-3.5 h-3.5" />
        <span>Verification Declined</span>
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1 self-center sm:self-auto px-2.5 py-0.5 rounded-full bg-white/10 border border-white/15 text-white/75 text-[11px] font-semibold">
      <Shield className="w-3.5 h-3.5 text-brand" />
      <span>{status === 'pending' ? 'Identity Draft Saved' : 'Unverified Account'}</span>
    </span>
  )
}
