import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../store'

export default function Signup() {
  const [qp] = useSearchParams()
  const ref = qp.get('ref') || ''
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [emailExists, setEmailExists] = useState(false)
  const [emailChecking, setEmailChecking] = useState(false)
  const { login } = useAuth()
  const nav = useNavigate()

  useEffect(() => {
    if (!email || !email.includes('@')) {
      setEmailExists(false)
      return
    }
    const delay = setTimeout(async () => {
      setEmailChecking(true)
      try {
        const res = await api().post('/api/auth/check-email', { email })
        setEmailExists(res.data.exists)
      } catch (err) {
        // ignore errors silently for typing checks
      } finally {
        setEmailChecking(false)
      }
    }, 500)
    return () => clearTimeout(delay)
  }, [email])

  async function onSubmit(e) {
    e.preventDefault()
    if (emailExists) {
      setErr('This email is already registered. Please sign in.')
      return
    }
    setLoading(true); setErr('')
    try {
      const res = await api().post('/api/auth/signup', { email, password, name, ref })
      login(res.data.token, res.data.user)
      nav('/dashboard')
    } catch (e) {
      setErr(e?.response?.data?.error || 'Signup failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-md mx-auto card">
      <h2 className="text-xl font-bold mb-4">Create account</h2>
      {ref && <div className="text-xs text-white/60 mb-4 pb-2 border-b border-white/5">Referred by code: <span className="text-brand font-mono">{ref}</span></div>}
      
      {err && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded text-red-400 text-sm mb-4">
          {err}
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <div className="label">Email</div>
          <input 
            type="email"
            required
            className={`input ${emailExists ? 'border-red-500/50 focus:border-red-500 focus:ring-red-500/20' : ''}`} 
            value={email} 
            onChange={e=>setEmail(e.target.value)} 
            placeholder="you@example.com" 
          />
          {emailChecking && <div className="text-xs text-white/40 mt-1.5 animate-pulse">Checking email...</div>}
          {!emailChecking && emailExists && (
            <div className="text-sm text-red-400 mt-1.5 flex items-start gap-1.5">
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              <span>This email is already registered. <Link to="/login" className="underline hover:text-red-300">Sign in instead</Link></span>
            </div>
          )}
        </div>
        <div>
          <div className="label">Password</div>
          <input type="password" required minLength={6} className="input" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" />
        </div>
        <div>
          <div className="label">Full name</div>
          <input className="input" required value={name} onChange={e=>setName(e.target.value)} placeholder="Your name" />
        </div>
        <button className="btn w-full mt-2" disabled={loading || emailExists}>
          {loading ? 'Creating account...' : 'Create account'}
        </button>
      </form>
      <div className="mt-4 text-sm text-center text-white/60">
        Have an account? <Link className="text-brand hover:underline" to="/login">Sign in</Link>
      </div>
    </div>
  )
}
