import { useEffect, useState } from 'react'
import { api } from '../api'
import { fetchCountriesCached, statesCache, citiesCache } from '../utils/locationsCache'

const OTHER_VALUE = '__CUSTOM_OTHER__'

export default function CountryStateCitySelects({
  country = '',
  state = '',
  city = '',
  onChange,
  required = false,
  dark = false,
  inputClassName = '',
  labelClassName = '',
  countryLabel = 'Country',
  stateLabel = 'State / Division / Province',
  cityLabel = 'City / Town / District'
}) {
  const [countries, setCountries] = useState([])
  const [states, setStates] = useState([])
  const [cities, setCities] = useState([])
  const [loadingCountries, setLoadingCountries] = useState(true)
  const [loadingStates, setLoadingStates] = useState(false)
  const [loadingCities, setLoadingCities] = useState(false)
  const [customStateMode, setCustomStateMode] = useState(false)
  const [customCityMode, setCustomCityMode] = useState(false)

  useEffect(() => {
    let active = true
    setLoadingCountries(true)
    fetchCountriesCached()
      .then(list => {
        if (active) setCountries(list)
      })
      .finally(() => {
        if (active) setLoadingCountries(false)
      })
    return () => { active = false }
  }, [])

  useEffect(() => {
    const cleanCountry = String(country || '').trim()
    if (!cleanCountry) {
      setStates([])
      setCities([])
      setCustomStateMode(false)
      setCustomCityMode(false)
      return
    }
    const cacheKey = cleanCountry.toLowerCase()
    if (statesCache.has(cacheKey)) {
      const list = statesCache.get(cacheKey)
      setStates(list)
      setLoadingStates(false)
      return
    }
    let active = true
    setLoadingStates(true)
    api()
      .get('/api/locations/states', { params: { country: cleanCountry } })
      .then(res => {
        const list = Array.isArray(res.data?.states) ? res.data.states : []
        statesCache.set(cacheKey, list)
        if (active) setStates(list)
      })
      .catch(() => {
        if (active) setStates([])
      })
      .finally(() => {
        if (active) setLoadingStates(false)
      })
    return () => { active = false }
  }, [country])

  useEffect(() => {
    const cleanCountry = String(country || '').trim()
    const cleanState = String(state || '').trim()
    if (!cleanCountry) {
      setCities([])
      return
    }
    const cacheKey = `${cleanCountry.toLowerCase()}::${cleanState.toLowerCase()}`
    if (citiesCache.has(cacheKey)) {
      setCities(citiesCache.get(cacheKey))
      setLoadingCities(false)
      return
    }
    let active = true
    setLoadingCities(true)
    api()
      .get('/api/locations/cities', {
        params: { country: cleanCountry, state: cleanState || undefined }
      })
      .then(res => {
        const list = Array.isArray(res.data?.cities) ? res.data.cities : []
        citiesCache.set(cacheKey, list)
        if (active) setCities(list)
      })
      .catch(() => {
        if (active) setCities([])
      })
      .finally(() => {
        if (active) setLoadingCities(false)
      })
    return () => { active = false }
  }, [country, state])

  const optionStyle = dark
    ? { backgroundColor: '#0d1522', color: '#ffffff' }
    : { backgroundColor: '#ffffff', color: '#0f172a' }

  const hasSavedCustomCountry =
    Boolean(country) &&
    countries.length > 0 &&
    !countries.some(c => c.name.toLowerCase() === String(country).trim().toLowerCase() || c.isoCode.toLowerCase() === String(country).trim().toLowerCase())

  const matchedCountryName =
    countries.find(c => c.isoCode.toLowerCase() === String(country || '').trim().toLowerCase() || c.name.toLowerCase() === String(country || '').trim().toLowerCase())?.name ||
    country

  const hasSavedCustomState =
    Boolean(state) &&
    states.length > 0 &&
    !states.some(s => s.name.toLowerCase() === String(state).trim().toLowerCase())

  const hasSavedCustomCity =
    Boolean(city) &&
    cities.length > 0 &&
    !cities.some(c => c.name.toLowerCase() === String(city).trim().toLowerCase())

  const noStatesListed = Boolean(country) && !loadingStates && states.length === 0
  const noCitiesListed = Boolean(country) && !loadingCities && cities.length === 0

  return (
    <>
      <div>
        <label className={labelClassName}>{countryLabel}{required ? ' *' : ''}</label>
        <select
          value={matchedCountryName || ''}
          onChange={e => {
            const nextCountry = e.target.value
            setCustomStateMode(false)
            setCustomCityMode(false)
            onChange({ country: nextCountry, state: '', city: '' })
          }}
          className={inputClassName}
        >
          <option value="" style={optionStyle}>
            {loadingCountries ? 'Loading countries...' : '-- Select Country --'}
          </option>
          {hasSavedCustomCountry && (
            <option value={country} style={optionStyle}>{country}</option>
          )}
          {countries.map(c => (
            <option key={c.isoCode} value={c.name} style={optionStyle}>
              {c.flag ? `${c.flag} ` : ''}{c.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <div className="flex items-center justify-between gap-2">
          <label className={labelClassName}>{stateLabel}{required ? ' *' : ''}</label>
          {customStateMode && states.length > 0 && (
            <button
              type="button"
              onClick={() => setCustomStateMode(false)}
              className="text-[11px] font-semibold text-indigo-400 hover:underline mb-1"
            >
              Use list
            </button>
          )}
        </div>
        {customStateMode || noStatesListed ? (
          <input
            type="text"
            value={state}
            onChange={e => onChange({ country, state: e.target.value, city: '' })}
            placeholder={!country ? 'Select country first' : 'Enter State / Division / Province'}
            disabled={!country}
            className={inputClassName}
          />
        ) : (
          <select
            value={state || ''}
            disabled={!country || loadingStates}
            onChange={e => {
              const val = e.target.value
              if (val === OTHER_VALUE) {
                setCustomStateMode(true)
                onChange({ country, state: '', city: '' })
                return
              }
              setCustomCityMode(false)
              onChange({ country, state: val, city: '' })
            }}
            className={inputClassName}
          >
            <option value="" style={optionStyle}>
              {!country
                ? '-- Select Country First --'
                : loadingStates
                  ? 'Loading states...'
                  : '-- Select State / Division --'}
            </option>
            {hasSavedCustomState && (
              <option value={state} style={optionStyle}>{state}</option>
            )}
            {states.map(s => (
              <option key={`${s.isoCode}-${s.name}`} value={s.name} style={optionStyle}>
                {s.name}
              </option>
            ))}
            {country && states.length > 0 && (
              <option value={OTHER_VALUE} style={optionStyle}>Other (Type manually)</option>
            )}
          </select>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between gap-2">
          <label className={labelClassName}>{cityLabel}{required ? ' *' : ''}</label>
          {customCityMode && cities.length > 0 && (
            <button
              type="button"
              onClick={() => setCustomCityMode(false)}
              className="text-[11px] font-semibold text-indigo-400 hover:underline mb-1"
            >
              Use list
            </button>
          )}
        </div>
        {customCityMode || noCitiesListed ? (
          <input
            type="text"
            value={city}
            onChange={e => onChange({ country, state, city: e.target.value })}
            placeholder={!country ? 'Select country first' : 'Enter City / Town / District'}
            disabled={!country}
            className={inputClassName}
          />
        ) : (
          <select
            value={city || ''}
            disabled={!country || loadingCities}
            onChange={e => {
              const val = e.target.value
              if (val === OTHER_VALUE) {
                setCustomCityMode(true)
                onChange({ country, state, city: '' })
                return
              }
              onChange({ country, state, city: val })
            }}
            className={inputClassName}
          >
            <option value="" style={optionStyle}>
              {!country
                ? '-- Select Country First --'
                : loadingCities
                  ? 'Loading cities...'
                  : '-- Select City / District --'}
            </option>
            {hasSavedCustomCity && (
              <option value={city} style={optionStyle}>{city}</option>
            )}
            {cities.map(c => (
              <option key={c.name} value={c.name} style={optionStyle}>
                {c.name}
              </option>
            ))}
            {country && cities.length > 0 && (
              <option value={OTHER_VALUE} style={optionStyle}>Other (Type manually)</option>
            )}
          </select>
        )}
      </div>
    </>
  )
}
