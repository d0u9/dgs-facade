// Exchange-rate data for the currency converter.
//
// The site is a static build with no backend, so rates are fetched at runtime
// from a CORS-enabled source and cached in localStorage. A build-time snapshot
// was deliberately rejected: deploys are slow, so the rates would lag.
//
// Primary source is @fawazahmed0/currency-api served over the jsDelivr CDN,
// which has mainland-China points of presence and needs no API key. Fallback
// is Frankfurter, which serves the European Central Bank's daily reference
// rates directly but is hosted outside China.

const PRIMARY_HOSTS = [
  'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1',
  'https://latest.currency-api.pages.dev/v1'
];
const FALLBACK_URL = 'https://api.frankfurter.dev/v1/latest?base=USD';

export const RATES_CACHE_KEY = 'd0u9-fx-rates';
export const NAMES_CACHE_KEY = 'd0u9-fx-names';
export const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

// ISO 4217 codes. The primary source also carries crypto and metals; this set
// keeps the picker to real currencies.
export const ISO_CODES = ['AED','AFN','ALL','AMD','ANG','AOA','ARS','AUD','AWG','AZN','BAM','BBD','BDT','BGN','BHD','BIF','BMD','BND','BOB','BRL','BSD','BTN','BWP','BYN','BZD','CAD','CDF','CHF','CLP','CNY','COP','CRC','CUP','CVE','CZK','DJF','DKK','DOP','DZD','EGP','ERN','ETB','EUR','FJD','FKP','GBP','GEL','GHS','GIP','GMD','GNF','GTQ','GYD','HKD','HNL','HRK','HTG','HUF','IDR','ILS','INR','IQD','IRR','ISK','JMD','JOD','JPY','KES','KGS','KHR','KMF','KPW','KRW','KWD','KYD','KZT','LAK','LBP','LKR','LRD','LSL','LYD','MAD','MDL','MGA','MKD','MMK','MNT','MOP','MRU','MUR','MVR','MWK','MXN','MYR','MZN','NAD','NGN','NIO','NOK','NPR','NZD','OMR','PAB','PEN','PGK','PHP','PKR','PLN','PYG','QAR','RON','RSD','RUB','RWF','SAR','SBD','SCR','SDG','SEK','SGD','SHP','SLE','SOS','SRD','SSP','STN','SVC','SYP','SZL','THB','TJS','TMT','TND','TOP','TRY','TTD','TWD','TZS','UAH','UGX','USD','UYU','UZS','VES','VND','VUV','WST','XAF','XCD','XCG','XOF','XPF','YER','ZAR','ZMW','ZWL'];

const ISO_SET = new Set(ISO_CODES);

// Enough names to stay readable when the name list itself fails to load.
export const FALLBACK_NAMES = {
  AUD: 'Australian Dollar', BRL: 'Brazilian Real', CAD: 'Canadian Dollar', CHF: 'Swiss Franc',
  CNY: 'Chinese Yuan Renminbi', EUR: 'Euro', GBP: 'British Pound', HKD: 'Hong Kong Dollar',
  IDR: 'Indonesian Rupiah', INR: 'Indian Rupee', JPY: 'Japanese Yen', KRW: 'South Korean Won',
  MOP: 'Macanese Pataca', MYR: 'Malaysian Ringgit', NZD: 'New Zealand Dollar', PHP: 'Philippine Peso',
  RUB: 'Russian Ruble', SEK: 'Swedish Krona', SGD: 'Singapore Dollar', THB: 'Thai Baht',
  TWD: 'New Taiwan Dollar', USD: 'US Dollar', VND: 'Vietnamese Dong'
};

function readCache(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function writeCache(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

export function isStale(entry) {
  return !entry || !entry.fetchedAt || Date.now() - entry.fetchedAt > CACHE_TTL_MS;
}

async function getJson(url) {
  const response = await fetch(url, { referrerPolicy: 'no-referrer' });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}

function fromPrimary(payload) {
  const table = payload.usd || {};
  const rates = { USD: 1 };
  for (const [code, value] of Object.entries(table)) {
    const upper = code.toUpperCase();
    if (ISO_SET.has(upper) && Number.isFinite(value) && value > 0) rates[upper] = value;
  }
  return { rates, date: payload.date, source: 'currency-api' };
}

function fromFallback(payload) {
  const rates = { USD: 1 };
  for (const [code, value] of Object.entries(payload.rates || {})) {
    if (Number.isFinite(value) && value > 0) rates[code.toUpperCase()] = value;
  }
  return { rates, date: payload.date, source: 'ECB / frankfurter' };
}

// Every source below is quoted against USD, so the app only ever stores one
// USD-based table and cross-rates are computed from it.
export async function fetchRates() {
  const errors = [];
  for (const host of PRIMARY_HOSTS) {
    try {
      const parsed = fromPrimary(await getJson(`${host}/currencies/usd.json`));
      if (Object.keys(parsed.rates).length > 1) {
        const entry = { ...parsed, fetchedAt: Date.now() };
        writeCache(RATES_CACHE_KEY, entry);
        return entry;
      }
    } catch (error) { errors.push(error); }
  }
  try {
    const entry = { ...fromFallback(await getJson(FALLBACK_URL)), fetchedAt: Date.now() };
    writeCache(RATES_CACHE_KEY, entry);
    return entry;
  } catch (error) { errors.push(error); }
  throw new Error(errors.length ? String(errors[errors.length - 1].message) : 'No rate source responded.');
}

export function cachedRates() {
  const entry = readCache(RATES_CACHE_KEY);
  return entry && entry.rates && entry.rates.USD ? entry : null;
}

export async function fetchNames() {
  for (const host of PRIMARY_HOSTS) {
    try {
      const payload = await getJson(`${host}/currencies.json`);
      const names = {};
      for (const [code, name] of Object.entries(payload)) {
        const upper = code.toUpperCase();
        if (ISO_SET.has(upper) && typeof name === 'string' && name) names[upper] = name;
      }
      if (Object.keys(names).length) {
        const entry = { names, fetchedAt: Date.now() };
        writeCache(NAMES_CACHE_KEY, entry);
        return entry;
      }
    } catch {}
  }
  return null;
}

export function cachedNames() {
  const entry = readCache(NAMES_CACHE_KEY);
  return entry && entry.names ? entry : null;
}
