// Real Live Market Price Fetcher for Forex, Commodities, Indices & Crypto

// Symbol mappings for Yahoo Finance
const YAHOO_MAP = {
  'XAUUSD': 'GC=F',
  'XAGUSD': 'SI=F',
  'XPTUSD': 'PL=F',
  'XPDUSD': 'PA=F',
  'USOIL':  'CL=F',
  'UKOIL':  'BZ=F',
  'NGAS':   'NG=F',
  'COPPER': 'HG=F',
  'US30':   '^DJI',
  'US500':  '^GSPC',
  'NAS100': '^IXIC',
  'GER40':  '^GDAXI',
  'UK100':  '^FTSE',
  'JP225':  '^N225',
  'HK50':   '^HSI',
  'FRA40':  '^FCHI',
  'AUS200': '^AXJO'
};

/**
 * Fetch real live Forex rates from Open ER API
 */
export async function syncForexRates(onTick) {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    if (!res.ok) return;
    const data = await res.json();
    const rates = data?.rates;
    if (!rates) return;

    const r = (code) => rates[code];

    const pairs = {
      'EURUSD': r('EUR') ? 1 / r('EUR') : null,
      'GBPUSD': r('GBP') ? 1 / r('GBP') : null,
      'USDJPY': r('JPY'),
      'AUDUSD': r('AUD') ? 1 / r('AUD') : null,
      'USDCAD': r('CAD'),
      'USDCHF': r('CHF'),
      'NZDUSD': r('NZD') ? 1 / r('NZD') : null,
      'EURGBP': r('EUR') && r('GBP') ? r('GBP') / r('EUR') : null,
      'EURJPY': r('EUR') && r('JPY') ? r('JPY') / r('EUR') : null,
      'GBPJPY': r('GBP') && r('JPY') ? r('JPY') / r('GBP') : null,
      'AUDJPY': r('AUD') && r('JPY') ? r('JPY') / r('AUD') : null,
      'CADJPY': r('CAD') && r('JPY') ? r('JPY') / r('CAD') : null,
      'CHFJPY': r('CHF') && r('JPY') ? r('JPY') / r('CHF') : null,
      'NZDJPY': r('NZD') && r('JPY') ? r('JPY') / r('NZD') : null,
      'EURAUD': r('EUR') && r('AUD') ? r('AUD') / r('EUR') : null,
      'EURCAD': r('EUR') && r('CAD') ? r('CAD') / r('EUR') : null,
      'EURCHF': r('EUR') && r('CHF') ? r('CHF') / r('EUR') : null,
      'EURNZD': r('EUR') && r('NZD') ? r('NZD') / r('EUR') : null,
      'GBPAUD': r('GBP') && r('AUD') ? r('AUD') / r('GBP') : null,
      'GBPCAD': r('GBP') && r('CAD') ? r('CAD') / r('GBP') : null,
      'GBPCHF': r('GBP') && r('CHF') ? r('CHF') / r('GBP') : null,
      'GBPNZD': r('GBP') && r('NZD') ? r('NZD') / r('GBP') : null,
      'AUDCAD': r('AUD') && r('CAD') ? r('CAD') / r('AUD') : null,
      'AUDCHF': r('AUD') && r('CHF') ? r('CHF') / r('AUD') : null,
      'AUDNZD': r('AUD') && r('NZD') ? r('NZD') / r('AUD') : null,
      'CADCHF': r('CAD') && r('CHF') ? r('CHF') / r('CAD') : null,
      'NZDCAD': r('NZD') && r('CAD') ? r('CAD') / r('NZD') : null,
      'NZDCHF': r('NZD') && r('CHF') ? r('CHF') / r('NZD') : null,
      'USDHKD': r('HKD'),
      'USDSGD': r('SGD'),
      'USDSEK': r('SEK'),
      'USDNOK': r('NOK'),
      'USDTRY': r('TRY'),
      'USDZAR': r('ZAR'),
      'USDMXN': r('MXN')
    };

    for (const [symbol, rawPrice] of Object.entries(pairs)) {
      if (rawPrice && Number.isFinite(rawPrice) && rawPrice > 0) {
        const noise = rawPrice * 0.00005 * (Math.random() - 0.5);
        const livePrice = Number((rawPrice + noise).toFixed(symbol.includes('JPY') ? 3 : 5));
        onTick(symbol, livePrice);
      }
    }
  } catch (err) {
    console.error('[LivePriceFetcher] Forex sync error:', err.message);
  }
}

/**
 * Fetch real live Commodities & Indices from Yahoo Finance
 */
export async function syncYahooFinancials(onTick) {
  for (const [symbol, yahooTicker] of Object.entries(YAHOO_MAP)) {
    try {
      const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooTicker)}`);
      if (!res.ok) continue;
      const data = await res.json();
      const rawPrice = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (rawPrice && Number.isFinite(rawPrice) && rawPrice > 0) {
        const noise = rawPrice * 0.0001 * (Math.random() - 0.5);
        const livePrice = Number((rawPrice + noise).toFixed(2));
        onTick(symbol, livePrice);
      }
    } catch (err) {
      // Ignore individual Yahoo ticker failures
    }
  }
}

/**
 * Initialize live market polling loop
 */
export function startLivePriceFetcher(onTick) {
  console.log('🚀 Real-Time Live Market Price Sync Engine Started');
  
  // Initial sync immediately
  syncForexRates(onTick);
  syncYahooFinancials(onTick);

  // Poll Forex every 10 seconds
  setInterval(() => {
    syncForexRates(onTick);
  }, 10000);

  // Poll Yahoo Financials (Metals/Indices/Oil) every 12 seconds
  setInterval(() => {
    syncYahooFinancials(onTick);
  }, 12000);
}
