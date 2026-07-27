import { create } from 'zustand'

export const useAccount = create(set => ({
  summary: null,
  balance: { available: 0, locked: 0, total: 0 },
  setSummary: summary => set({ summary }),
  setBalance: balance => set({ balance }),
  clear: () => set({ summary: null, balance: { available: 0, locked: 0, total: 0 } })
}))
