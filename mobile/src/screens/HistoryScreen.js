import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { api } from '../api'
import { useAuth } from '../stores/authStore'
import { useAccount } from '../stores/accountStore'
import { formatCurrency } from '../utils/format'

function TradeRow({ trade, compact }) {
  const qty = Number(trade.qty || 0)
  const amount = Number(trade.stake_amount ?? trade.notional ?? trade.price * qty)
  const pnlUsd = Number(trade.pnl ?? 0)
  const pair = (trade.symbol || '—').toUpperCase().replace(/([A-Z]{3})([A-Z]{3})/, '$1/$2')
  const qtyLabel = Number.isFinite(qty) ? qty.toFixed(2) : '—'
  const entry = Number(trade.price ?? 0)
  const exit = Number(trade.exit_price ?? entry)

  const sideColor = trade.side === 'buy' ? '#1e90ff' : '#ef4444'

  return (
    <View style={[styles.rowLine, compact && styles.rowLineCompact]}>
      <View style={[styles.sideStrip, { backgroundColor: sideColor }]} />
      <View style={styles.rowContent}>
        <View style={styles.rowLeft}>
          <Text style={styles.rowPair}>{pair}</Text>
          <Text style={[styles.sideQty, trade.side === 'buy' ? styles.sideQtyBuy : styles.sideQtySell]}>
            {trade.side} {qtyLabel} | {formatCurrency(amount)}
          </Text>
          <Text style={styles.priceLine}>{entry.toFixed(2)} → {exit.toFixed(2)}</Text>
        </View>
        <View style={styles.rowRight}>
          <Text style={styles.rowTime}>{new Date(trade.created_at).toLocaleString()}</Text>
          <Text style={[styles.rowPnl, pnlUsd >= 0 ? styles.pnlPositive : styles.pnlNegative]}>
            {formatCurrency(pnlUsd)}
          </Text>
        </View>
      </View>
    </View>
  )
}

export function HistoryScreen() {
  const { width } = useWindowDimensions()
  const { token } = useAuth()
  const { balance, setBalance } = useAccount()
  const [trades, setTrades] = useState([])
  const [loading, setLoading] = useState(false)
  const [sideFilter, setSideFilter] = useState('all')
  const [datePreset, setDatePreset] = useState('all')
  const [sortDir, setSortDir] = useState('desc')
  const [showDateModal, setShowDateModal] = useState(false)
  const isCompact = width < 360

  const fetchTrades = useCallback(async () => {
    if (!token) {
      setTrades([])
      setBalance({ available: 0, locked: 0, total: 0 })
      return
    }
    setLoading(true)
    try {
      const response = await api(token).get('/api/trades')
      setTrades(response.data || [])
      try {
        const overview = await api(token).get('/api/trades/overview', { params: { limit: 10 } })
        const balanceData = overview.data?.balance || {}
        setBalance({
          available: Number(balanceData.available ?? 0),
          locked: Number(balanceData.locked ?? 0),
          total: Number(balanceData.total ?? Number(balanceData.available ?? 0) + Number(balanceData.locked ?? 0))
        })
      } catch (err) {
        console.warn('history overview fetch error', err?.message ?? err)
      }
    } catch (err) {
      console.error('Failed to load trade history', err)
    } finally {
      setLoading(false)
    }
  }, [token, setBalance])

  useEffect(() => {
    fetchTrades()
  }, [fetchTrades])
  useFocusEffect(
    useCallback(() => {
      fetchTrades()
    }, [fetchTrades])
  )

  const filteredTrades = useMemo(() => {
    const now = new Date()
    let minDate = null
    if (datePreset === 'today') {
      const d = new Date(now)
      d.setHours(0, 0, 0, 0)
      minDate = d
    } else if (datePreset === '7d') {
      const d = new Date(now)
      d.setDate(d.getDate() - 7)
      minDate = d
    } else if (datePreset === '30d') {
      const d = new Date(now)
      d.setDate(d.getDate() - 30)
      minDate = d
    }

    return trades
      .filter(t => {
        if (sideFilter !== 'all' && t.side !== sideFilter) return false
        if (minDate) {
          const stamp = t.created_at || t.closed_at || t.time || null
          const created = stamp ? new Date(stamp) : null
          const createdTime = created && Number.isFinite(created.getTime()) ? created : null
          if (createdTime && createdTime < minDate) return false
        }
        return true
      })
      .sort((a, b) => {
        const da = new Date(a.created_at || a.closed_at || 0).getTime()
        const db = new Date(b.created_at || b.closed_at || 0).getTime()
        return sortDir === 'asc' ? da - db : db - da
      })
  }, [trades, sideFilter, datePreset, sortDir])

  const summary = useMemo(() => {
    if (!filteredTrades.length) return { pnl: 0, winRate: 0 }
    const pnl = filteredTrades.reduce((sum, t) => sum + Number(t.pnl ?? 0), 0)
    const wins = filteredTrades.filter(t => Number(t.pnl ?? 0) > 0).length
    return {
      pnl,
      winRate: (wins / filteredTrades.length) * 100
    }
  }, [filteredTrades])

  return (
    <SafeAreaView style={styles.container}>
      <View style={[styles.topBar, isCompact && styles.topBarCompact]}>
        <View style={styles.segmentRow}>
          {['all', 'buy', 'sell'].map(key => (
            <Pressable
              key={key}
              onPress={() => setSideFilter(key)}
              style={[styles.segment, sideFilter === key && styles.segmentActive]}
            >
              <Text style={[styles.segmentText, sideFilter === key && styles.segmentTextActive]}>
                {key === 'all' ? 'All' : key === 'buy' ? 'Buy' : 'Sell'}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.topActions}>
          <Pressable onPress={() => fetchTrades()} style={styles.iconButton} hitSlop={8}>
            <Feather name="refresh-ccw" size={18} color="#0f172a" />
          </Pressable>
          <Pressable
            onPress={() => setSortDir(prev => (prev === 'desc' ? 'asc' : 'desc'))}
            style={styles.iconButton}
            hitSlop={8}
          >
            <Feather name={sortDir === 'desc' ? 'arrow-down' : 'arrow-up'} size={18} color="#0f172a" />
          </Pressable>
          <Pressable onPress={() => setShowDateModal(true)} style={styles.iconButton} hitSlop={8}>
            <Feather name="calendar" size={18} color="#0f172a" />
          </Pressable>
        </View>
      </View>

      <View style={styles.summaryPanel}>
        <View style={styles.summaryRowInline}>
          <Text style={styles.summaryLabelLine}>Profit:</Text>
          <Text style={styles.summaryValueLine}>{formatCurrency(summary.pnl)}</Text>
        </View>
        <View style={styles.summaryRowInline}>
          <Text style={styles.summaryLabelLine}>Deposit:</Text>
          <Text style={styles.summaryValueLine}>{formatCurrency(0)}</Text>
        </View>
        <View style={styles.summaryRowInline}>
          <Text style={styles.summaryLabelLine}>Swap:</Text>
          <Text style={styles.summaryValueLine}>{formatCurrency(0)}</Text>
        </View>
        <View style={styles.summaryRowInline}>
          <Text style={styles.summaryLabelLine}>Balance:</Text>
          <Text style={styles.summaryValueLine}>{formatCurrency(balance.total)}</Text>
        </View>
      </View>

      <FlatList
        data={filteredTrades}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => <TradeRow trade={item} compact={isCompact} />}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        contentContainerStyle={[styles.listContent, isCompact && styles.listContentCompact]}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchTrades} tintColor="#1d4ed8" />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              {token ? 'No trades recorded yet.' : 'Sign in to view your trading history.'}
            </Text>
          </View>
        }
      />
      <Modal
        transparent
        visible={showDateModal}
        animationType="fade"
        onRequestClose={() => setShowDateModal(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setShowDateModal(false)}>
          <View style={styles.dateModal}>
            <Text style={styles.modalTitle}>Filter by date</Text>
            {[
              { key: 'all', label: 'All time' },
              { key: 'today', label: 'Today' },
              { key: '7d', label: 'Last 7 days' },
              { key: '30d', label: 'Last 30 days' }
            ].map(option => (
              <Pressable
                key={option.key}
                onPress={() => {
                  setDatePreset(option.key)
                  setShowDateModal(false)
                }}
                style={[
                  styles.dateOption,
                  datePreset === option.key && styles.dateOptionActive
                ]}
              >
                <Text style={[
                  styles.dateOptionText,
                  datePreset === option.key && styles.dateOptionTextActive
                ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff'
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 30,
    paddingBottom: 8,
    gap: 12
  },
  topBarCompact: {
    paddingHorizontal: 16
  },
  topTitles: {
    gap: 2
  },
  topActions: {
    flexDirection: 'row',
    gap: 10
  },
  iconButton: {
    height: 34,
    width: 34,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  listContent: {
    padding: 14,
    paddingBottom: 32
  },
  listContentCompact: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 28
  },
  header: {
    marginBottom: 16,
    gap: 4
  },
  headerCompact: {
    marginBottom: 12
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0f172a'
  },
  titleCompact: {
    fontSize: 20
  },
  subtitle: {
    fontSize: 14,
    color: '#64748b'
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 8,
    flexShrink: 1
  },
  segment: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc'
  },
  segmentActive: {
    backgroundColor: '#e0f2fe',
    borderColor: '#38bdf8'
  },
  segmentText: {
    fontSize: 13,
    color: '#0f172a',
    fontWeight: '600'
  },
  segmentTextActive: {
    color: '#0ea5e9'
  },
  searchInput: {
    height: 42,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 14,
    backgroundColor: '#f8fafc',
    color: '#0f172a'
  },
  searchInputCompact: {
    height: 40
  },
  summaryPanel: {
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 6
  },
  summaryRowInline: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  summaryLabelLine: {
    fontSize: 12,
    color: '#6b7280'
  },
  summaryValueLine: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a'
  },
  empty: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    marginTop: 24
  },
  emptyText: {
    color: '#475569',
    fontSize: 13
  },
  rowLine: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9'
  },
  rowLineCompact: {
    paddingVertical: 10,
    paddingHorizontal: 8
  },
  sideStrip: {
    width: 4,
    height: '100%',
    marginRight: 10,
    borderRadius: 2
  },
  rowContent: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  rowLeft: {
    flex: 1
  },
  rowRight: {
    alignItems: 'flex-end',
    gap: 4,
    marginLeft: 10,
    minWidth: 140
  },
  rowPair: {
    fontSize: 14,
    color: '#0f172a',
    fontWeight: '700'
  },
  sideQty: {
    fontSize: 13,
    fontWeight: '700'
  },
  sideQtyBuy: {
    color: '#1e90ff'
  },
  sideQtySell: {
    color: '#dc2626'
  },
  priceLine: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2
  },
  amountLine: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 1
  },
  rowTime: {
    fontSize: 11,
    color: '#6b7280'
  },
  rowPnl: {
    fontSize: 14,
    fontWeight: '700'
  },
  pnlPositive: {
    color: '#1e90ff'
  },
  pnlNegative: {
    color: '#dc2626'
  },
  rowPips: {
    fontSize: 13,
    color: '#64748b'
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24
  },
  dateModal: {
    backgroundColor: '#fff',
    borderRadius: 16,
    width: '100%',
    maxWidth: 360,
    padding: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 4
  },
  dateOption: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  dateOptionActive: {
    borderColor: '#38bdf8',
    backgroundColor: '#e0f2fe'
  },
  dateOptionText: {
    fontSize: 14,
    color: '#0f172a'
  },
  dateOptionTextActive: {
    color: '#0284c7',
    fontWeight: '700'
  }
})
