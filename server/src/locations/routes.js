import express from 'express';
import { Country, State, City } from 'country-state-city';

const router = express.Router();

let cachedCountries = null;
function getCountries() {
  if (!cachedCountries) {
    cachedCountries = Country.getAllCountries()
      .map(c => ({
        isoCode: c.isoCode,
        name: c.name,
        flag: c.flag || '',
        phonecode: c.phonecode || ''
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  return cachedCountries;
}

function resolveCountry(countryQuery) {
  const raw = String(countryQuery || '').trim();
  if (!raw) return null;
  const upper = raw.toUpperCase();
  const lower = raw.toLowerCase();
  const countries = getCountries();
  return (
    countries.find(c => c.isoCode === upper) ||
    countries.find(c => c.name.toLowerCase() === lower) ||
    null
  );
}

function resolveState(countryCode, stateQuery) {
  const raw = String(stateQuery || '').trim();
  if (!raw || !countryCode) return null;
  const upper = raw.toUpperCase();
  const lower = raw.toLowerCase();
  const states = State.getStatesOfCountry(countryCode);
  return (
    states.find(s => s.isoCode.toUpperCase() === upper) ||
    states.find(s => s.name.toLowerCase() === lower) ||
    null
  );
}

router.get('/countries', (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.json({ countries: getCountries() });
});

router.get('/states', (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=86400');
  const country = resolveCountry(req.query.countryCode || req.query.country);
  if (!country) {
    return res.json({ countryCode: '', countryName: '', states: [] });
  }
  const states = State.getStatesOfCountry(country.isoCode)
    .map(s => ({ isoCode: s.isoCode, name: s.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  res.json({
    countryCode: country.isoCode,
    countryName: country.name,
    states
  });
});

router.get('/cities', (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=86400');
  const country = resolveCountry(req.query.countryCode || req.query.country);
  if (!country) {
    return res.json({ countryCode: '', stateCode: '', cities: [] });
  }
  const state = resolveState(country.isoCode, req.query.stateCode || req.query.state);
  let rawCities = state
    ? City.getCitiesOfState(country.isoCode, state.isoCode)
    : City.getCitiesOfCountry(country.isoCode);

  // Some regions (e.g. Bangladesh Divisions) attach cities to District states rather than the Division ISO code
  if (state && (!rawCities || rawCities.length === 0)) {
    rawCities = City.getCitiesOfCountry(country.isoCode) || [];
  }

  const seen = new Set();
  const cities = [];
  for (const c of rawCities || []) {
    if (!c?.name || seen.has(c.name)) continue;
    seen.add(c.name);
    cities.push({ name: c.name });
  }
  cities.sort((a, b) => a.name.localeCompare(b.name));

  res.json({
    countryCode: country.isoCode,
    stateCode: state?.isoCode || '',
    cities
  });
});

export default router;
