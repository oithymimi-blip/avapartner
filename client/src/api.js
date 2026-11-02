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
  const instance = axios.create({
    baseURL: API_BASE,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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

  instance.interceptors.response.use(
    (res) => res,
    (error) => {
      const status = error?.response?.status
      const message = error?.response?.data?.error || ''
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
