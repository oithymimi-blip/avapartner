export const BD_TIME_ZONE = 'Asia/Dhaka'
const BD_OFFSET_MS = 6 * 60 * 60 * 1000

/**
 * Parse SQLite UTC timestamps ("YYYY-MM-DD HH:MM:SS"), ISO strings, or Unix epoch (s/ms) into epoch ms.
 */
export function parseTimestampMs(value) {
  if (value == null || value === '') return 0
  if (value instanceof Date) {
    const ms = value.getTime()
    return Number.isFinite(ms) ? ms : 0
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 0
    return value < 1e12 ? value * 1000 : value
  }
  const str = String(value).trim()
  if (!str) return 0
  if (/^\d+(\.\d+)?$/.test(str)) {
    const num = Number(str)
    return num < 1e12 ? num * 1000 : num
  }
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/.test(str)) {
    const ms = new Date(str.replace(' ', 'T') + 'Z').getTime()
    return Number.isFinite(ms) ? ms : 0
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(str)) {
    const ms = new Date(str + 'Z').getTime()
    return Number.isFinite(ms) ? ms : 0
  }
  const ms = new Date(str).getTime()
  return Number.isFinite(ms) ? ms : 0
}

/**
 * Format full date + time in Bangladesh Standard Time (Asia/Dhaka, UTC+6).
 */
export function formatBdDateTime(value, { includeSeconds = false, showZone = false } = {}) {
  const ms = parseTimestampMs(value)
  if (!ms) return ''
  const formatted = new Date(ms).toLocaleString('en-US', {
    timeZone: BD_TIME_ZONE,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...(includeSeconds ? { second: '2-digit' } : {}),
    hour12: true
  })
  return showZone ? `${formatted} (BDT)` : formatted
}

/**
 * Format date only in Bangladesh Time (Asia/Dhaka).
 */
export function formatBdDate(value, options = { year: 'numeric', month: 'short', day: 'numeric' }) {
  const ms = parseTimestampMs(value)
  if (!ms) return ''
  return new Date(ms).toLocaleDateString('en-US', {
    timeZone: BD_TIME_ZONE,
    ...options
  })
}

/**
 * Format time only in Bangladesh Time (Asia/Dhaka).
 */
export function formatBdTime(value, { includeSeconds = false, showZone = false } = {}) {
  const ms = parseTimestampMs(value)
  if (!ms) return ''
  const formatted = new Date(ms).toLocaleTimeString('en-US', {
    timeZone: BD_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    ...(includeSeconds ? { second: '2-digit' } : {}),
    hour12: true
  })
  return showZone ? `${formatted} BDT` : formatted
}

/**
 * Return YYYY-MM-DD in Asia/Dhaka for date inputs & backup filenames.
 */
export function getBdIsoDate(value = Date.now()) {
  const ms = parseTimestampMs(value) || Date.now()
  return new Date(ms + BD_OFFSET_MS).toISOString().slice(0, 10)
}

export function getBdYear() {
  return Number(getBdIsoDate().slice(0, 4))
}

/**
 * Convert timestamp into YYYY-MM-DDTHH:mm string represented in Bangladesh Time (+06:00).
 */
export function toBdDatetimeLocalValue(value) {
  const ms = parseTimestampMs(value)
  if (!ms) return ''
  return new Date(ms + BD_OFFSET_MS).toISOString().slice(0, 16)
}

/**
 * Convert a datetime-local value entered in Bangladesh Time (+06:00) into UTC ISO string.
 */
export function bdDatetimeLocalToIso(localStr) {
  if (!localStr) return new Date().toISOString()
  const str = String(localStr).trim()
  const withSec = str.length === 16 ? `${str}:00` : str
  const ms = new Date(`${withSec}+06:00`).getTime()
  return Number.isFinite(ms) ? new Date(ms).toISOString() : new Date().toISOString()
}

export function sortByTimestampDesc(list = [], field = 'created_at') {
  return [...list].sort((a, b) => parseTimestampMs(b?.[field]) - parseTimestampMs(a?.[field]))
}

/**
 * Crosshair & tick formatters for TradingView lightweight-charts in Asia/Dhaka.
 */
export function formatBdChartCrosshair(time) {
  if (typeof time === 'number') {
    return formatBdDateTime(time, { showZone: true })
  }
  if (time && typeof time === 'object' && time.year) {
    return `${time.year}-${String(time.month).padStart(2, '0')}-${String(time.day).padStart(2, '0')}`
  }
  return ''
}

export function formatBdChartTick(time, tickMarkType) {
  if (typeof time !== 'number') return ''
  const ms = parseTimestampMs(time)
  if (!ms) return ''
  // TickMarkType: 0=Year, 1=Month, 2=DayOfMonth, 3=Time, 4=TimeWithSeconds
  if (tickMarkType === 0) {
    return new Date(ms).toLocaleDateString('en-US', { timeZone: BD_TIME_ZONE, year: 'numeric' })
  }
  if (tickMarkType === 1 || tickMarkType === 2) {
    return new Date(ms).toLocaleDateString('en-US', { timeZone: BD_TIME_ZONE, month: 'short', day: 'numeric' })
  }
  return new Date(ms).toLocaleTimeString('en-US', {
    timeZone: BD_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    ...(tickMarkType === 4 ? { second: '2-digit' } : {}),
    hour12: false
  })
}
