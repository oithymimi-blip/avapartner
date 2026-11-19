import { api } from '../api'

let countriesCache = null
let countriesPromise = null
export const statesCache = new Map()
export const citiesCache = new Map()

export function normalizeDialCode(rawPhoneCode) {
  if (!rawPhoneCode) return '+1'
  const firstSegment = String(rawPhoneCode).split(/\s+and\s+/i)[0].trim()
  const cleaned = firstSegment.replace(/[^0-9+]/g, '')
  if (!cleaned) return '+1'
  return cleaned.startsWith('+') ? cleaned : `+${cleaned}`
}

export async function fetchCountriesCached() {
  if (countriesCache) return countriesCache
  if (!countriesPromise) {
    countriesPromise = api()
      .get('/api/locations/countries')
      .then(res => {
        const list = Array.isArray(res.data?.countries) ? res.data.countries : []
        countriesCache = list.map(c => ({
          ...c,
          dialCode: normalizeDialCode(c.phonecode)
        }))
        return countriesCache
      })
      .catch(() => {
        countriesPromise = null
        return []
      })
  }
  return countriesPromise
}
