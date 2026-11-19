import axios from 'axios'

const defaultBase = (() => {
  if (typeof window !== 'undefined') {
    const { protocol, hostname } = window.location
    if (import.meta.env.DEV) {
      return `${protocol}//${hostname}:4000`
    }
    return ''
  }
  return 'http://localhost:4000'
})()

const API_BASE = import.meta.env.VITE_API_BASE || defaultBase

export function api(token) {
  let profileHeader = ''
  if (typeof window !== 'undefined' && token) {
    try {
      const rawUser = localStorage.getItem('user')
      if (rawUser) {
        const parsed = JSON.parse(rawUser)
        const compactProfile = {
          id: parsed.id,
          email: parsed.email,
          name: parsed.name,
          handle: parsed.handle,
          role: parsed.role,
          referral_code: parsed.referral_code
        }
        profileHeader = window.btoa(unescape(encodeURIComponent(JSON.stringify(compactProfile))))
      }
    } catch (_) {}
  }

  const instance = axios.create({
    baseURL: API_BASE,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(profileHeader ? { 'X-User-Profile': profileHeader } : {}),
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    },
  })

  // Append timestamp to GET requests to force fresh data from backend
  instance.interceptors.request.use((config) => {
    if (config.method === 'get') {
      config.params = {
        ...config.params,
        _t: Date.now()
      }
    }
    return config
  })

  const notifyConnectivity = (offline, status = null) => {
    if (typeof window === 'undefined') return
    try {
      window.dispatchEvent(new CustomEvent('api:connectivity', { detail: { offline, status } }))
    } catch (_) {}
  }

  instance.interceptors.response.use(
    (res) => {
      notifyConnectivity(false, res.status)
      return res
    },
    (error) => {
      const status = error?.response?.status
      const message = error?.response?.data?.error || ''
      if (!error?.response || status === 502 || status === 503 || status === 504) {
        notifyConnectivity(true, status || 0)
      }
      if (typeof window !== 'undefined') {
        const path = window.location.pathname || ''
        const publicPaths = ['/login', '/signup', '/admin/login', '/reset-password']
        if (!publicPaths.includes(path) && (status === 401 || message.toLowerCase?.().includes('invalid token'))) {
          localStorage.removeItem('token')
          localStorage.removeItem('user')
          localStorage.removeItem('admin_token')
          localStorage.removeItem('admin_user')
          if (path.startsWith('/admin')) {
            window.location.replace('/admin/login')
          } else {
            window.location.replace('/login')
          }
        }
      }
      return Promise.reject(error)
    }
  )
  return instance
}
