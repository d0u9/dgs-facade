// Exchange-rate data for the currency converter.
//
// The site is a static build with no backend, so rates are fetched at runtime
// from a CORS-enabled source and cached in localStorage. A build-time snapshot
// was deliberately rejected: deploys are slow, so the rates would lag.
//
// Several sources are offered because none of them is right everywhere: the
// jsDelivr copy of @fawazahmed0/currency-api has mainland-China points of
// presence, Frankfurter serves the European Central Bank's own daily reference
// rates but is hosted outside China, and open.er-api.com is a third opinion
// with its own update clock. The picker defaults to the jsDelivr copy; the
// reading the numbers came from is always named in the toolbar.

const FALLBACK_URL = 'https://api.frankfurter.dev/v1/latest?base=USD';
const NAME_HOSTS = [
  'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1',
  'https://latest.currency-api.pages.dev/v1'
];

export const RATES_CACHE_PREFIX = 'd0u9-fx-rates';
export const SOURCE_CACHE_KEY = 'd0u9-fx-source';
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


function cacheKeyFor(sourceId) {
  return `${RATES_CACHE_PREFIX}:${sourceId}`;
}

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

// Every source below is quoted against USD, so the app only ever stores one
// USD-based table per source and cross-rates are computed from it.
function fromCurrencyApi(payload) {
  const table = payload.usd || {};
  const rates = { USD: 1 };
  for (const [code, value] of Object.entries(table)) {
    const upper = code.toUpperCase();
    if (ISO_SET.has(upper) && Number.isFinite(value) && value > 0) rates[upper] = value;
  }
  return { rates, date: payload.date };
}

function fromFrankfurter(payload) {
  const rates = { USD: 1 };
  for (const [code, value] of Object.entries(payload.rates || {})) {
    if (Number.isFinite(value) && value > 0) rates[code.toUpperCase()] = value;
  }
  return { rates, date: payload.date };
}

function fromErApi(payload) {
  const rates = { USD: 1 };
  for (const [code, value] of Object.entries(payload.rates || {})) {
    if (Number.isFinite(value) && value > 0) rates[code.toUpperCase()] = value;
  }
  // This source dates a reading by the moment it was published, not by the
  // trading day, so the timestamp is trimmed back to a plain date.
  const stamp = payload.time_last_update_utc ? new Date(payload.time_last_update_utc) : null;
  const date = stamp && !Number.isNaN(stamp.getTime()) ? stamp.toISOString().slice(0, 10) : '';
  return { rates, date, updatedAt: payload.time_last_update_utc || '' };
}

export const SOURCES = [
  {
    id: 'currency-api',
    label: 'currency-api',
    description: 'Community mirror of ECB and other feeds, on the jsDelivr CDN. Reachable from mainland China.',
    load: () => getJson('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json').then(fromCurrencyApi)
  },
  {
    id: 'currency-api-pages',
    label: 'currency-api (mirror)',
    description: 'The same data served from Cloudflare Pages, for when jsDelivr is blocked.',
    load: () => getJson('https://latest.currency-api.pages.dev/v1/currencies/usd.json').then(fromCurrencyApi)
  },
  {
    id: 'frankfurter',
    label: 'ECB / frankfurter',
    description: "The European Central Bank's daily reference rates, published on working days around 16:00 CET.",
    load: () => getJson(FALLBACK_URL).then(fromFrankfurter)
  },
  {
    id: 'erapi',
    label: 'open.er-api.com',
    description: 'Open Exchange Rates API, refreshed once a day at 00:00 UTC.',
    load: () => getJson('https://open.er-api.com/v6/latest/USD').then(fromErApi)
  }
];

export const DEFAULT_SOURCE_ID = SOURCES[0].id;

export function sourceById(id) {
  return SOURCES.find(source => source.id === id) || SOURCES[0];
}

export function readStoredSourceId() {
  try {
    const stored = localStorage.getItem(SOURCE_CACHE_KEY);
    return SOURCES.some(source => source.id === stored) ? stored : DEFAULT_SOURCE_ID;
  } catch { return DEFAULT_SOURCE_ID; }
}

export function storeSourceId(id) {
  try { localStorage.setItem(SOURCE_CACHE_KEY, id); } catch {}
}

// A source the user picked is used as asked: no silent failover, because a
// reading from a source they did not choose would be labelled wrongly.
export async function fetchRates(sourceId = DEFAULT_SOURCE_ID) {
  const source = sourceById(sourceId);
  const parsed = await source.load();
  if (Object.keys(parsed.rates).length <= 1) throw new Error(`${source.label} returned no usable rates.`);
  const entry = { ...parsed, sourceId: source.id, source: source.label, fetchedAt: Date.now() };
  writeCache(cacheKeyFor(source.id), entry);
  return entry;
}

export function cachedRates(sourceId = DEFAULT_SOURCE_ID) {
  const entry = readCache(cacheKeyFor(sourceId));
  return entry && entry.rates && entry.rates.USD ? entry : null;
}

export async function fetchNames() {
  for (const host of NAME_HOSTS) {
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
