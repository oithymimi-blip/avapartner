import { useEffect, useMemo, useState } from 'react'
import { fetchCountriesCached } from '../utils/locationsCache'

function parsePhoneValue(rawValue, countries, preferredCountryName) {
  const raw = String(rawValue || '').trim()
  const findByCountryName = () => {
    if (!preferredCountryName) return null
    const lower = preferredCountryName.trim().toLowerCase()
    return countries.find(c => c.name.toLowerCase() === lower) || null
  }
  const defaultCountry =
    findByCountryName() ||
    countries.find(c => c.isoCode === 'US') ||
    countries[0] ||
    { isoCode: 'US', name: 'United States', flag: '🇺🇸', dialCode: '+1' }

  if (!raw) {
    return { isoCode: defaultCountry.isoCode, dialCode: defaultCountry.dialCode, local: '' }
  }

  if (raw.startsWith('+')) {
    const spaceIdx = raw.indexOf(' ')
    const prefixToken = spaceIdx > 0 ? raw.slice(0, spaceIdx) : raw
    const sortedByLen = [...countries].sort((a, b) => b.dialCode.length - a.dialCode.length)
    const preferredMatch = preferredCountryName
      ? sortedByLen.find(
          c =>
            c.name.toLowerCase() === preferredCountryName.trim().toLowerCase() &&
            prefixToken === c.dialCode
        )
      : null
    const exactMatch =
      preferredMatch ||
      sortedByLen.find(c => prefixToken === c.dialCode) ||
      sortedByLen.find(c => raw.startsWith(`${c.dialCode} `) || raw.startsWith(c.dialCode))

    if (exactMatch) {
      const rest = raw.slice(exactMatch.dialCode.length).trim()
      return { isoCode: exactMatch.isoCode, dialCode: exactMatch.dialCode, local: rest }
    }
  }

  return { isoCode: defaultCountry.isoCode, dialCode: defaultCountry.dialCode, local: raw }
}

export default function GlobalPhoneInput({
  value = '',
  onChange,
  selectedCountryName = '',
  dark = false,
  inputClassName = '',
  placeholder = '(555) 234-5678'
}) {
  const [countries, setCountries] = useState([])
  const [selectedIso, setSelectedIso] = useState('US')
  const [localNumber, setLocalNumber] = useState('')

  useEffect(() => {
    let active = true
    fetchCountriesCached().then(list => {
      if (active && list.length > 0) {
        setCountries(list)
      }
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (countries.length === 0) {
      setLocalNumber(String(value || ''))
      return
    }
    const parsed = parsePhoneValue(value, countries, selectedCountryName)
    setSelectedIso(parsed.isoCode)
    setLocalNumber(parsed.local)
  }, [value, countries, selectedCountryName])

  const selectedCountry = useMemo(() => {
    return (
      countries.find(c => c.isoCode === selectedIso) ||
      countries.find(c => c.isoCode === 'US') ||
      { isoCode: 'US', name: 'United States', flag: '🇺🇸', dialCode: '+1' }
    )
  }, [countries, selectedIso])

  const optionStyle = dark
    ? { backgroundColor: '#0d1522', color: '#ffffff' }
    : { backgroundColor: '#ffffff', color: '#0f172a' }

  const emitChange = (dialCode, local) => {
    const trimmedLocal = local.trimStart()
    if (!trimmedLocal.trim()) {
      onChange('')
    } else {
      onChange(`${dialCode} ${trimmedLocal.trim()}`)
    }
  }

  return (
    <div className="flex items-stretch gap-2">
      <select
        aria-label="Phone country code"
        value={selectedCountry.isoCode}
        onChange={e => {
          const nextIso = e.target.value
          setSelectedIso(nextIso)
          const nextCountry = countries.find(c => c.isoCode === nextIso)
          if (nextCountry) {
            emitChange(nextCountry.dialCode, localNumber)
          }
        }}
        className={`${inputClassName} w-[124px] sm:w-[136px] shrink-0 font-mono text-xs px-2`}
      >
        {countries.length === 0 ? (
          <option value="US" style={optionStyle}>🇺🇸 US (+1)</option>
        ) : (
          countries.map(c => (
            <option key={c.isoCode} value={c.isoCode} style={optionStyle}>
              {c.flag ? `${c.flag} ` : ''}{c.isoCode} ({c.dialCode})
            </option>
          ))
        )}
      </select>

      <input
        type="tel"
        value={localNumber}
        onChange={e => {
          const nextLocal = e.target.value
          setLocalNumber(nextLocal)
          emitChange(selectedCountry.dialCode, nextLocal)
        }}
        placeholder={placeholder}
        className={`${inputClassName} flex-1 min-w-0 font-mono`}
      />
    </div>
  )
}
