import { create } from 'zustand'
import { useAccount } from './accountStore'
import { api } from './api'

export const useAuth = create((set, get) => ({
  token: localStorage.getItem('token') || '',
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  login: (token, user) => {
    localStorage.setItem('token', token)
    localStorage.setItem('user', JSON.stringify(user))
    useAccount.getState().clear()
    set({ token, user })
  },
  updateUser: (partial) => set((state) => {
    const nextUser = { ...(state.user || {}), ...(partial || {}) }
    localStorage.setItem('user', JSON.stringify(nextUser))
    return { user: nextUser }
  }),
  syncProfile: async () => {
    const { token, updateUser } = get()
    if (!token) return null
    try {
      const res = await api(token).get('/api/me')
      const serverUser = res?.data
      if (!serverUser) return null

      const localUser = get().user
      const removedKey = serverUser.id ? `avatar_removed_${serverUser.id}` : 'avatar_removed'
      if (!serverUser.avatar && localUser?.avatar && localStorage.getItem(removedKey) !== '1') {
        api(token).put('/api/me', { avatar: localUser.avatar }).catch(() => {})
        const merged = { ...serverUser, avatar: localUser.avatar }
        updateUser(merged)
        return merged
      }

      updateUser(serverUser)
      return serverUser
    } catch (_) {
      return null
    }
  },
  logout: () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    useAccount.getState().clear()
    set({ token: '', user: null })
  }
}))
